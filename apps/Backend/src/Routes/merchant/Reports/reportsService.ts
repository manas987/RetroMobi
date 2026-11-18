import type { Pool } from "pg";

/**
 * One shop's numbers over a range of IST calendar days, inclusive.
 *
 * Everything is keyed on the IST day a rental *starts*, so a day's bar means
 * "rides that went out that day" -- the thing a shop owner can check against
 * their own memory. Only CONFIRMED and COMPLETED bookings count; a HOLD is a
 * customer still at checkout, not a rental.
 *
 * Money is optional because only an OWNER may see it (`payouts:read`). Online
 * money is the merchant's share as recorded in `payouts` (not the customer's
 * gross); walk-in money is the cash the shop said it charged.
 */
const RENTALS = `
  with rentals as (
    select b.id, b.vehicle_id, b.source, coalesce(b.rental_amount, 0) as rental_amount,
           (b.scheduled_pickup_at at time zone 'Asia/Kolkata')::date as start_day,
           (b.scheduled_return_at at time zone 'Asia/Kolkata')::date as end_day
      from bookings b
      join vehicles v on v.id = b.vehicle_id
     where v.shop_id = $1 and b.deleted_at is null
       and b.status in ('CONFIRMED', 'COMPLETED')
       and (b.scheduled_pickup_at at time zone 'Asia/Kolkata')::date <= $3::date
       and (b.scheduled_return_at at time zone 'Asia/Kolkata')::date >= $2::date
  ),
  days as (
    select d::date as day from generate_series($2::date, $3::date, interval '1 day') d
  )`;

export async function shopSummary(
  pool: Pool,
  shopId: string,
  range: { from: string; to: string },
  withMoney: boolean,
) {
  const args = [shopId, range.from, range.to];

  const { rows: dayRows } = await pool.query(
    `${RENTALS}
     select to_char(d.day, 'YYYY-MM-DD') as date,
            count(r.id) filter (where r.source = 'ONLINE')::int as online,
            count(r.id) filter (where r.source = 'OFFLINE')::int as walkin,
            coalesce(sum(r.rental_amount) filter (where r.source = 'OFFLINE'), 0)::bigint as walkin_cash,
            coalesce((select sum(p.amount) from payouts p
                       join rentals r2 on r2.id = p.booking_id
                      where r2.start_day = d.day and p.status <> 'FAILED'), 0)::bigint as online_earnings
       from days d
       left join rentals r on r.start_day = d.day
      group by d.day
      order by d.day`,
    args,
  );

  const { rows: vehicleRows } = await pool.query(
    `${RENTALS}
     select v.id, v.registration_number, m.make, m.model,
            (select count(*) from days d
              where exists (select 1 from rentals r
                             where r.vehicle_id = v.id and d.day between r.start_day and r.end_day))::int as busy_days
       from vehicles v
       join vehicle_models m on m.id = v.model_id
      where v.shop_id = $1 and v.deleted_at is null
      order by busy_days desc, v.registration_number`,
    args,
  );

  const days = dayRows.map((d) => ({
    date: d.date as string,
    online: d.online as number,
    walkin: d.walkin as number,
    ...(withMoney
      ? { onlineEarnings: Number(d.online_earnings), walkinCash: Number(d.walkin_cash) }
      : {}),
  }));

  let money: { paid: number; pending: number; walkinCash: number } | undefined;
  if (withMoney) {
    const { rows } = await pool.query(
      `${RENTALS}
       -- paid = earned: credited to the shop wallet (0021), or paid by the old
       -- per-booking transfers that came before it.
       select coalesce(sum(p.amount) filter (where p.status in ('PAID', 'CREDITED')), 0)::bigint as paid,
              coalesce(sum(p.amount) filter (where p.status = 'PENDING'), 0)::bigint as pending,
              (select coalesce(sum(rental_amount), 0) from rentals
                where source = 'OFFLINE' and start_day between $2::date and $3::date)::bigint as walkin_cash
         from rentals r
         left join payouts p on p.booking_id = r.id
        where r.start_day between $2::date and $3::date`,
      args,
    );
    money = {
      paid: Number(rows[0].paid),
      pending: Number(rows[0].pending),
      walkinCash: Number(rows[0].walkin_cash),
    };
  }

  return {
    from: range.from,
    to: range.to,
    rangeDays: days.length,
    days,
    totals: {
      online: days.reduce((n, d) => n + d.online, 0),
      walkin: days.reduce((n, d) => n + d.walkin, 0),
    },
    vehicles: vehicleRows.map((v) => ({
      id: v.id as string,
      registrationNumber: v.registration_number as string,
      make: v.make as string,
      model: v.model as string,
      busyDays: v.busy_days as number,
    })),
    ...(money ? { money } : {}),
  };
}
