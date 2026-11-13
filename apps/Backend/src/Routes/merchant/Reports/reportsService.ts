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

/** IST day of the shop's first real rental, for an "all time" range. */
async function firstRentalDay(pool: Pool, shopId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `select to_char(min((b.scheduled_pickup_at at time zone 'Asia/Kolkata')::date), 'YYYY-MM-DD') as day
       from bookings b
       join vehicles v on v.id = b.vehicle_id
      where v.shop_id = $1 and b.deleted_at is null and b.status in ('CONFIRMED', 'COMPLETED')`,
    [shopId],
  );
  return rows[0]?.day ?? null;
}

// The merchant's share per booking, failed payouts excluded. Appended to
// RENTALS so per-day and per-vehicle money are one join each, not a subquery
// per day.
const PAID = `,
  paid as (
    select p.booking_id, sum(p.amount) as amount
      from payouts p
      join rentals r on r.id = p.booking_id
     where p.status <> 'FAILED'
     group by p.booking_id
  )`;

export async function shopSummary(
  pool: Pool,
  shopId: string,
  range: { from?: string; to: string },
  withMoney: boolean,
) {
  let from = range.from;
  if (!from) {
    const first = await firstRentalDay(pool, shopId);
    from = first && first < range.to ? first : range.to;
  }
  const args = [shopId, from, range.to];

  const { rows: dayRows } = await pool.query(
    `${RENTALS}${PAID},
     online_by_day as (
       select r.start_day, sum(pd.amount) as amount
         from rentals r join paid pd on pd.booking_id = r.id
        group by r.start_day
     )
     select to_char(d.day, 'YYYY-MM-DD') as date,
            count(r.id) filter (where r.source = 'ONLINE')::int as online,
            count(r.id) filter (where r.source = 'OFFLINE')::int as walkin,
            coalesce(sum(r.rental_amount) filter (where r.source = 'OFFLINE'), 0)::bigint as walkin_cash,
            coalesce(max(o.amount), 0)::bigint as online_earnings
       from days d
       left join rentals r on r.start_day = d.day
       left join online_by_day o on o.start_day = d.day
      group by d.day
      order by d.day`,
    args,
  );

  // Busy days walk each rental's own days (clipped to the range) instead of
  // testing every day against every rental, which got slow on all-time ranges.
  const { rows: vehicleRows } = await pool.query(
    `${RENTALS}${PAID},
     busy as (
       select r.vehicle_id, count(distinct d.day)::int as busy_days
         from rentals r
         cross join lateral generate_series(greatest(r.start_day, $2::date), least(r.end_day, $3::date), interval '1 day') as d(day)
        group by r.vehicle_id
     ),
     started as (
       select r.vehicle_id, count(*)::int as rides,
              coalesce(sum(r.rental_amount) filter (where r.source = 'OFFLINE'), 0)
                + coalesce(sum(pd.amount), 0) as earnings
         from rentals r
         left join paid pd on pd.booking_id = r.id
        where r.start_day between $2::date and $3::date
        group by r.vehicle_id
     )
     select v.id, v.registration_number, m.make, m.model,
            coalesce(b.busy_days, 0)::int as busy_days,
            coalesce(st.rides, 0)::int as rides,
            coalesce(st.earnings, 0)::bigint as earnings
       from vehicles v
       join vehicle_models m on m.id = v.model_id
       left join busy b on b.vehicle_id = v.id
       left join started st on st.vehicle_id = v.id
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
       select coalesce(sum(p.amount) filter (where p.status = 'PAID'), 0)::bigint as paid,
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
    from,
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
      rides: v.rides as number,
      ...(withMoney ? { earnings: Number(v.earnings) } : {}),
    })),
    ...(money ? { money } : {}),
  };
}
