import { useState } from "react";
import { FlatList, View } from "react-native";
import { History, Plus, UserRound } from "lucide-react-native";
import { Stack, useRouter } from "expo-router";
import {
  Button, Card, ConfirmSheet, EmptyState, ErrorNote, Line, Screen, SelectField, SelectOptions, Sheet, Tabs, Text, api,
  colors, dateLabel, decodeJwtSubject, COUNTRIES, DEFAULT_COUNTRY, phoneLabel, radius, space, useSession, useT, validPhone, type Row, type ShopRole,
} from "@retromobi/mobile-shared";
import { CounterRowLink, IconAction, PageTitle, StatusBadge, counter, counterStyles } from "../../ui/Counter";
import { Disclosure } from "../../ui/Disclosure";
import { useMerchantShop } from "../../state/shop";
import { useMerchantQuery } from "../../state/query";
import { useCounterWrite } from "../../features/bookings/common";
import { Fields, FormButtons, LabelInput, Pending } from "../../features/fleet/tabs/Fields";
import { InvitesForYou } from "../../features/shop/InvitesForYou";

const roles = ["OWNER", "MANAGER", "STAFF"] as const;
const roleDescription = { OWNER: "staff.roleOwnerDesc", MANAGER: "staff.roleManagerDesc", STAFF: "staff.roleStaffDesc" } as const;

export default function Staff() {
  const { t, lang } = useT();
  const router = useRouter();
  const session = useSession();
  const me = session ? decodeJwtSubject(session.accessToken) : null;
  const { shopId, can, reloadShops } = useMerchantShop();
  const canRead = can("members:read");
  const canWrite = can("members:write");
  const base = `/shops/${shopId}`;
  const members = useMerchantQuery<{ members: Row[] }>(canRead ? `${base}/members` : null);
  const invites = useMerchantQuery<{ invites: Row[] }>(canRead ? `${base}/invites` : null);
  const [add, setAdd] = useState(false);
  const [cancel, setCancel] = useState<Row | null>(null);
  const cancelWrite = useCounterWrite();
  const list = members.data?.members ?? [];
  const reload = () => { void Promise.all([members.refetch(), invites.refetch()]); };

  return <Screen scroll={false} padded={false} background="canvas" edges={["bottom", "left", "right"]}>
    <Stack.Screen options={{ title: t("staff.title"), headerTitle: "" }} />
    {!canRead || !shopId ? <EmptyState text={t("staff.noAccess")} /> : <FlatList showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false} data={list} keyExtractor={(row) => String(row.id)}
      contentContainerStyle={{ gap: space[3], padding: space[4] }}
      refreshing={members.isRefetching || invites.isRefetching} onRefresh={reload}
      ListHeaderComponent={<Fields>
        <PageTitle title={t("staff.title")} subtitle={t("staff.subtitle")}
          action={canWrite && <IconAction icon={Plus} label={t("staff.addStaff")} primary onPress={() => setAdd(true)} />} />
        <InvitesForYou onAccepted={reloadShops} />
        <View style={counterStyles.group}>
          <CounterRowLink icon={History} title={t("staff.seeActivity")} onPress={() => router.push("/activity")} />
        </View>
        <Text size="lg" weight="bold" accessibilityRole="header">{t("staff.members")}</Text>
        {list.length === 1 && canWrite && <Text color="ink2">{t("staff.onlyYou")}</Text>}
      </Fields>}
      ListEmptyComponent={!members.isSuccess ? <Pending error={members.error} retry={members.refetch} /> : <EmptyState text={t("staff.onlyYou")} />}
      ListFooterComponent={<Fields>
        {!invites.isSuccess ? <Pending error={invites.error} retry={invites.refetch} /> : invites.data.invites.map((item) => <Card key={String(item.id)} style={counterStyles.panel} title={phoneLabel(String(item.phone))}>
          <Fields>
            <StatusBadge tone="attention" label={t("staff.waiting")} />
            <Text size="sm" color="ink2">{t("staff.invitedOn", { date: dateLabel(item.created_at, lang) })}</Text>
            {canWrite && <Button variant="ghost" label={t("staff.cancelInvite")} onPress={() => setCancel(item)} />}
          </Fields>
        </Card>)}
        <Disclosure label={t("staff.role")}>
          {roles.map((role) => {
            const n = list.filter((m) => m.role === role).length;
            return <Card key={role} style={counterStyles.panel} title={t(`common.role_${role}`)}
              action={<Text size="sm" color="ink2">{t(n === 1 ? "staff.people_one" : "staff.people_other", { n })}</Text>}>
              <Text size="sm" color="ink2">{t(roleDescription[role])}</Text>
            </Card>;
          })}
        </Disclosure>
      </Fields>}
      renderItem={({ item }) => <Member item={item} shopId={shopId} isSelf={item.merchant_user_id === me} editable={canWrite} />} />}
    {canWrite && add && shopId && <InviteForm shopId={shopId} onClose={() => setAdd(false)} />}
    <ConfirmSheet open={!!cancel} onClose={() => setCancel(null)} title={t("staff.cancelInvite")} body={phoneLabel(String(cancel?.phone ?? ""))}
      confirmLabel={t("staff.cancelInvite")} cancelLabel={t("common.back")} danger busy={cancelWrite.busy} error={cancelWrite.error}
      onConfirm={() => {
        if (cancel) void cancelWrite.run(async () => { await api(`${base}/invites/${cancel.id}`, { method: "DELETE" }); setCancel(null); });
      }} />
  </Screen>;
}

/** "Ramesh Kumar" → "RK"; phone-only names get the person icon instead. */
const initials = (name: string) => /\d/.test(name) ? "" : name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();

function Member({ item, isSelf, editable, shopId }: { item: Row; isSelf: boolean; editable: boolean; shopId: string }) {
  const { t, lang, tMaybe } = useT();
  const name = String(item.name || phoneLabel(String(item.phone ?? "")));
  const phone = item.phone ? phoneLabel(String(item.phone)) : "";
  const role = String(item.role);
  const base = `/shops/${shopId}/members/${item.id}`;
  const [remove, setRemove] = useState(false);
  const w = useCounterWrite();
  return <Card style={counterStyles.panel}>
    <View style={counterStyles.row}>
      <View style={{ width: 48, height: 48, borderRadius: radius.full, backgroundColor: role === "OWNER" ? colors.amber : counter.pale, alignItems: "center", justifyContent: "center" }} accessible={false}>
        {initials(name) ? <Text weight="bold" color={role === "OWNER" ? "onAmber" : "ink"}>{initials(name)}</Text> : <UserRound size={22} color={counter.navy} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text weight="bold">{name}</Text>
        {phone && <Text size="sm" color="ink2">{phone}</Text>}
      </View>
      {isSelf && <Text size="sm" color="ink2">{t("common.you")}</Text>}
    </View>
    <Fields>
      <StatusBadge tone={role === "OWNER" ? "good" : "muted"} label={tMaybe(`common.role_${role}`) ?? role} />
      {item.joined_at != null && <Text size="sm" color="ink2">{t("staff.joined", { date: dateLabel(item.joined_at, lang) })}</Text>}
      {editable && !isSelf && <>
        <Line />
        <SelectField compact label={t("staff.changeRole", { name })} value={role} disabled={w.busy} closeLabel={t("common.close")}
          options={roles.map((value) => ({ value, label: t(`common.role_${value}`) }))}
          onChange={(value) => { if (value !== role) void w.run(async () => { await api(base, { method: "PATCH", body: { role: value } }); }); }} />
        <Button variant="ghost" label={t("common.remove")} disabled={w.busy} onPress={() => setRemove(true)} />
      </>}
      {!remove && w.error && <ErrorNote text={w.error} />}
      <ConfirmSheet open={remove} onClose={() => setRemove(false)} title={t("staff.removeTitle", { name })} body={t("staff.removeBody", { name })}
        confirmLabel={t("staff.removeConfirm")} cancelLabel={t("common.cancel")} danger busy={w.busy} error={w.error}
        onConfirm={() => void w.run(async () => { await api(base, { method: "DELETE" }); setRemove(false); })} />
    </Fields>
  </Card>;
}

function InviteForm({ shopId, onClose }: { shopId: string; onClose: () => void }) {
  const { t } = useT();
  const [digits, setDigits] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [role, setRole] = useState<ShopRole>("STAFF");
  const [pickingCountry, setPickingCountry] = useState(false);
  const w = useCounterWrite();
  const phone = country.dial + digits;
  const valid = validPhone(phone);
  return <Sheet open title={t(pickingCountry ? "staff.phone" : "staff.addTitle")} onClose={pickingCountry ? () => setPickingCountry(false) : onClose} scroll={!pickingCountry} busy={w.busy} closeLabel={t("common.close")}
    footer={!pickingCountry && <FormButtons label={t("staff.sendInvite")} valid={valid} busy={w.busy} error={w.error} save={() => {
      if (valid) void w.run(async () => {
        await api(`/shops/${shopId}/invites`, { method: "POST", body: { phone, role } }); onClose();
      });
    }} />}>
    {pickingCountry ? <SelectOptions value={country.code} options={COUNTRIES.map((item) => ({ value: item.code, label: `${item.flag} ${item.dial} · ${item.name}` }))}
      onChange={(code) => { setCountry(COUNTRIES.find((item) => item.code === code) ?? DEFAULT_COUNTRY); setPickingCountry(false); }} />
      : <Fields>
        <Text color="ink2">{t("staff.addHelper")}</Text>
        <View style={{ flexDirection: "row", gap: space[2], alignItems: "center" }}>
          <Button label={`${country.flag} ${country.dial}`} accessibilityLabel={`${t("staff.phone")} · ${country.name} ${country.dial}`} onPress={() => setPickingCountry(true)} />
          <View style={{ flex: 1 }}><LabelInput label={t("staff.phone")} keyboardType="phone-pad" textContentType="telephoneNumber" autoComplete="tel-national"
            maxLength={12} value={digits} onChangeText={(value) => setDigits(value.replace(/\D/g, ""))} /></View>
        </View>
        <Text weight="bold" accessibilityRole="header">{t("staff.role")}</Text>
        <Tabs pill wrap value={role} options={roles.map((value) => ({ value, label: t(`common.role_${value}`) }))} onChange={setRole} />
        <Text color="ink2">{t(roleDescription[role])}</Text>
      </Fields>}
  </Sheet>;
}
