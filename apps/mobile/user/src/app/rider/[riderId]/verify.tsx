// ponytail: unlinked for the beta (no KYC provider yet; riders declare at checkout and the shop
// checks the original). Link it again from checkout and the riders screens when ONLINE_LICENCE_CHECK returns.
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AlertTriangle, Camera, Check, ChevronRight, Clock3, FileCheck2, IdCard, Keyboard, Landmark, ShieldCheck, type LucideIcon } from "lucide-react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import {
  ApiError, Button, DateField, ErrorNote, Field, Input, LoadingRows, Screen, Text, UploadFailedError,
  api, colors, errorMessage, istDay, radius, space, uploadFile, useSession, type Row,
} from "@retromobi/mobile-shared";
import { Headline, PillCTA } from "../../../features/RiderSurface";
import { trail } from "../../../ui/trail";
import { ProfileAvatar, profileStyles } from "../../../features/profile/ProfileSurface";
import { refreshRiderData, usePrivate, useWrite } from "../../../state/private";
import { copyFor, verificationState, type SessionState } from "../../../features/riders/verification";

type Method = "DIGILOCKER" | "DL_NUMBER";
type Reply = { state: unknown; sessionId?: string; method?: Method; consentUrl?: string; rejectionCode?: string; rejection_code?: string };

export default function VerifyPage() {
  const { riderId } = useLocalSearchParams<{ riderId: string }>();
  const session = useSession();
  const router = useRouter();
  const q = usePrivate<{ riders: Row[] }>(riderId ? "/riders" : null);
  const rider = q.data?.riders.find((r) => r.id === riderId);
  return <Screen edges={["left", "right", "bottom"]}>
    <Stack.Screen options={{ title: "" }} />
    <View style={profileStyles.page}>
      {!session ? <Button label="Sign in" onPress={() => router.push("/login")} />
        : q.isPending ? <LoadingRows label="Loading rider" />
        : q.isError ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        : rider ? <Verification key={riderId} id={riderId} name={String(rider.name)} pickupAvailable={rider.pickup_licence_available === true} /> : <Text>Rider not found.</Text>}
    </View>
  </Screen>;
}

function Verification({ id, name, pickupAvailable }: { id: string; name: string; pickupAvailable: boolean }) {
  const router = useRouter();
  const key = `rm.verification.${id}`;
  const base = `/riders/${encodeURIComponent(id)}/verification`;
  const consentQ = usePrivate<{ consentText: string }>("/riders/verification/consent");
  const [agreed, setAgreed] = useState(false);
  const [live, setLive] = useState<{ id: string; method: Method; state: SessionState; code?: string }>();
  const [restoring, setRestoring] = useState(true);
  const [resumeError, setResumeError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  const [number, setNumber] = useState("");
  const [dob, setDob] = useState("");
  const [settings, setSettings] = useState(false);
  const w = useWrite();
  const done = () => { if (router.canGoBack()) router.back(); else router.replace("/account/riders"); };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function resume() {
      try {
        const saved = await AsyncStorage.getItem(key);
        if (!saved) return;
        const reply = await api<Reply>(`${base}/${encodeURIComponent(saved)}`, { signal: controller.signal });
        if (active) setLive({ id: saved, state: verificationState(reply.state), method: reply.method === "DIGILOCKER" ? "DIGILOCKER" : "DL_NUMBER", code: reply.rejection_code });
      } catch (err) {
        if (!active) return;
        if (err instanceof ApiError && err.status === 404) await AsyncStorage.removeItem(key).catch(() => {});
        else setResumeError(errorMessage(err, "Couldn't restore your licence check."));
      } finally {
        if (active) setRestoring(false);
      }
    }
    void resume();
    return () => { active = false; controller.abort(); };
  }, [base, key, attempt]);

  async function accept(reply: Reply, sessionId: string, method: Method) {
    const state = verificationState(reply.state);
    setLive({ id: sessionId, state, method, code: reply.rejectionCode ?? reply.rejection_code });
    if (state === "VERIFIED" || state === "MANUAL_REVIEW_REQUIRED") await refreshRiderData("/riders");
  }
  async function complete(sessionId: string) {
    const reply = await api<Reply>(`${base}/${sessionId}/digilocker/complete`, { method: "POST" });
    await accept(reply, sessionId, "DIGILOCKER");
    if (reply.state === "CONSENT_PENDING") setNotice("DigiLocker consent isn't finished yet. Complete it, then try again.");
  }
  function start(method: Method) {
    void w.run(async () => {
      const redirectUrl = Linking.createURL(`rider/${id}/verify`);
      const reply = await api<Reply>(base, { method: "POST", body: { method, consent: true, ...(method === "DIGILOCKER" ? { redirectUrl } : {}) } });
      if (!reply.sessionId) throw new ApiError(502, "The server didn't return a licence check session.");
      await accept(reply, reply.sessionId, method);
      await AsyncStorage.setItem(key, reply.sessionId).catch(() => {});
      if (method === "DIGILOCKER" && reply.consentUrl) {
        if (new URL(reply.consentUrl).protocol !== "https:") throw new ApiError(502, "DigiLocker did not provide a secure link.");
        const result = await WebBrowser.openAuthSessionAsync(reply.consentUrl, redirectUrl);
        if (result.type === "success") await complete(reply.sessionId);
      }
    });
  }
  function restart(cancel = false) {
    void w.run(async () => {
      if (cancel && live) await api(`${base}/${live.id}/cancel`, { method: "POST" });
      await AsyncStorage.removeItem(key).catch(() => {});
      setLive(undefined); setAgreed(false); setNotice(""); setNumber(""); setDob(""); setSettings(false);
      if (cancel) done();
    });
  }
  function photo(camera: boolean) {
    if (!live) return;
    void w.run(async () => {
      setSettings(false);
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setSettings(true);
        throw new ApiError(403, "Allow camera access to take a photo, or choose one from your library.");
      }
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.85, cameraType: ImagePicker.CameraType.front };
      const picked = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (!asset?.mimeType || !["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType)) throw new ApiError(400, "Choose a JPEG, PNG, or WebP photo.");
      const path = `${base}/${live.id}/photo`;
      const reply = await uploadFile<Reply>({ file: { uri: asset.uri, mimeType: asset.mimeType }, presignPath: path, confirmPath: `${path}/confirm`, confirmBody: { contentType: asset.mimeType } });
      await accept(reply, live.id, live.method);
    }, (err) => err instanceof UploadFailedError ? err.message : errorMessage(err, "Couldn’t upload the rider photo."));
  }

  if (restoring) return <LoadingRows label="Checking for an existing session" />;
  if (resumeError) return <ErrorNote text={resumeError} onRetry={() => { setResumeError(undefined); setRestoring(true); setAttempt(attempt + 1); }} />;
  const pending = live && ["CONSENT_PENDING", "DOCUMENT_PENDING"].includes(live.state);
  const step = !live ? (agreed ? 1 : 0) : pending || live.state === "PHOTO_PENDING" ? 1 : 2;
  return <>
    <Headline kicker="Driving licence check" title={step < 2 ? (step === 1 ? "Verify the licence" : "Quick check first")
      : live?.state === "VERIFIED" ? "All set" : live?.state === "MANUAL_REVIEW_REQUIRED" || live?.state === "DOCUMENT_VERIFIED" ? "Under review" : "Let’s try again"} />
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <ProfileAvatar name={name} compact />
        <View style={{ flex: 1 }}>
          <Text size="xs" weight="bold" style={{ color: colors.amber, letterSpacing: 0.8 }}>RIDER</Text>
          <Text size="lg" weight="bold" color="white" numberOfLines={1} accessibilityRole="header">{name}</Text>
        </View>
      </View>
      <View style={styles.progress} accessible accessibilityLabel={`Step ${step + 1} of 3`}>
        {["Consent", "Verify", "Done"].map((label, i) => <View key={label} style={{ flex: 1, gap: 6 }}>
          <View style={[styles.seg, i <= step && { backgroundColor: colors.amber }]} />
          <Text size="xs" weight={i === step ? "bold" : "regular"} style={{ color: i <= step ? colors.white : trail.mist }}>{label}</Text>
        </View>)}
      </View>
    </View>
    {w.error && <ErrorNote text={w.error} />}
    {!live ? agreed ? <>
      <Text size="lg" weight="bold">How would you like to verify?</Text>
      <Option icon={Landmark} title="Use DigiLocker" text="Share the licence straight from your DigiLocker account." badge="Recommended" disabled={w.busy} onPress={() => start("DIGILOCKER")} />
      <Option icon={Keyboard} title="Enter licence number" text="Type the licence number and date of birth." disabled={w.busy} onPress={() => start("DL_NUMBER")} />
    </> : <>
      <Text>Before {name} can ride, we check their driving licence with the issuing authority.</Text>
      {consentQ.isPending ? <LoadingRows label="Loading consent wording" /> : consentQ.data?.consentText ? <>
        <View style={styles.consent}>
          <View style={styles.row}><FileCheck2 size={18} color={trail.forest} /><Text weight="bold">Consent</Text></View>
          <Text size="sm">{consentQ.data.consentText}</Text>
        </View>
        <PillCTA label="I agree" onPress={() => setAgreed(true)} />
      </> : <ErrorNote text="Couldn't load the consent wording." onRetry={() => void consentQ.refetch()} />}
      <Button label="Not now" variant="ghost" onPress={done} />
    </> : pending ? <>
      {live.method === "DIGILOCKER" ? <>
        <Text>Finish the consent in DigiLocker, then come back here.</Text>
        {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
        <PillCTA label="I've finished in DigiLocker" busy={w.busy} onPress={() => { setNotice(""); void w.run(() => complete(live.id)); }} />
      </> : <>
        <View style={styles.hint}>
          <IdCard size={18} color={trail.forest} />
          <Text size="sm" style={{ flex: 1 }}>Find the number on the front of the licence card, or in the mParivahan app.</Text>
        </View>
        <Field label="Licence number"><Input accessibilityLabel="Licence number" value={number} onChangeText={setNumber} autoCapitalize="characters" maxLength={32}
          placeholder="e.g. UK07 20190001234" autoCorrect={false} /></Field>
        <DateField label="Date of birth" value={dob} onChange={setDob} min="1920-01-01" max={istDay(new Date())} />
        <PillCTA label="Check my licence" disabled={!dob || number.trim().length < 6} busy={w.busy} onPress={() => void w.run(async () => {
          const reply = await api<Reply>(`${base}/${live.id}/dl-number`, { method: "POST", body: { licenceNumber: number.trim(), dob } });
          await accept(reply, live.id, live.method);
        })} />
      </>}
      <Button label="Cancel check" variant="ghost" disabled={w.busy} onPress={() => restart(true)} />
    </> : live.state === "PHOTO_PENDING" ? <>
      <Text>The authority didn’t send a photo. Add a clear photo of {name}’s face so shop staff can confirm them at pickup.</Text>
      <Text>Someone from RetroMobi will check the photo before it’s approved.</Text>
      <PillCTA label="Take a photo" icon={Camera} busy={w.busy} onPress={() => photo(true)} />
      <Button label="Choose a photo" disabled={w.busy} onPress={() => photo(false)} />
      {settings && <Button label="Open settings" onPress={() => void w.run(() => Linking.openSettings())} />}
      <Button label="Cancel check" variant="ghost" disabled={w.busy} onPress={() => restart(true)} />
    </> : <>
      <View style={styles.result}>
        <View style={[styles.resultIcon, { backgroundColor: live.state === "VERIFIED" ? colors.verifiedSoft : live.state === "MANUAL_REVIEW_REQUIRED" || live.state === "DOCUMENT_VERIFIED" ? colors.warningSoft : colors.dangerSoft }]}>
          {live.state === "VERIFIED" ? <ShieldCheck size={30} color={colors.verified} /> : live.state === "MANUAL_REVIEW_REQUIRED" || live.state === "DOCUMENT_VERIFIED"
            ? <Clock3 size={30} color={colors.warning} /> : <AlertTriangle size={30} color={colors.danger} />}
        </View>
        <Text size="xl" weight="bold" center>{live.state === "VERIFIED" ? "Licence verified" : live.state === "MANUAL_REVIEW_REQUIRED" || live.state === "DOCUMENT_VERIFIED" ? "Almost there" : "Couldn’t verify"}</Text>
        <Text center color="ink2">{live.state === "VERIFIED" ? "Shop staff will check the licence itself when you collect the vehicle."
          : live.state === "MANUAL_REVIEW_REQUIRED" && pickupAvailable ? "The online check is unavailable. Bring your original licence for the shop to check at pickup."
          : live.state === "MANUAL_REVIEW_REQUIRED" ? copyFor(live.code, "Someone from RetroMobi needs to look at this before it's approved. We'll let you know — usually within a day.")
          : live.state === "EXPIRED" || live.state === "REVOKED" ? "This check is no longer current and needs doing again."
          : live.state === "DOCUMENT_VERIFIED" ? "Your document was verified. The check is still being finalised."
          : copyFor(live.code, "That licence couldn't be verified.")}</Text>
      </View>
      {["EXPIRED", "REVOKED", "REJECTED", "DOCUMENT_FAILED"].includes(live.state) && <Button label="Start again" busy={w.busy} onPress={() => restart()} />}
      <PillCTA label="Done" icon={Check} disabled={w.busy} onPress={done} />
    </>}
  </>;
}

function Option({ icon: Icon, title, text, badge, disabled, onPress }: { icon: LucideIcon; title: string; text: string; badge?: string; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityHint={text} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.option, badge && styles.optionLead, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
    <View style={[styles.optionIcon, badge && { backgroundColor: colors.amber }]}><Icon size={22} color={badge ? colors.onAmber : trail.forest} /></View>
    <View style={{ flex: 1, gap: 2 }}>
      {badge && <Text size="xs" weight="bold" style={{ color: trail.forest, letterSpacing: 0.6 }}>{badge.toUpperCase()}</Text>}
      <Text weight="bold">{title}</Text>
      <Text size="sm" color="ink2">{text}</Text>
    </View>
    <ChevronRight size={18} color={colors.ink2} />
  </Pressable>;
}

const styles = StyleSheet.create({
  hero: { backgroundColor: trail.forest, borderRadius: 28, padding: space[4], gap: space[4] },
  heroTop: { flexDirection: "row", alignItems: "center", gap: space[3] },
  progress: { flexDirection: "row", gap: space[2] },
  seg: { height: 5, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.18)" },
  row: { flexDirection: "row", alignItems: "center", gap: space[2] },
  consent: { backgroundColor: colors.surface2, borderRadius: 24, padding: space[4], gap: space[2], borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  option: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], borderRadius: 24, backgroundColor: colors.surface2, borderWidth: 1.5, borderColor: colors.line },
  optionLead: { borderColor: trail.forest, backgroundColor: trail.forestSoft },
  optionIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  hint: { flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: trail.forestSoft, borderRadius: 20, padding: space[3] },
  result: { alignItems: "center", gap: space[2], paddingVertical: space[4] },
  resultIcon: { width: 72, height: 72, borderRadius: radius.full, alignItems: "center", justifyContent: "center", marginBottom: space[2] },
});
