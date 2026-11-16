import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as ImagePicker from "expo-image-picker";
import {
  ApiError, Button, DateField, ErrorNote, Field, Input, LoadingRows, Screen, Text, UploadFailedError,
  api, errorMessage, istDay, space, uploadFile, useSession, type Row,
} from "@retromobi/mobile-shared";
import { Card } from "../../../features/RiderSurface";
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
  return <Screen edges={["left", "right", "bottom"]} contentStyle={{ gap: space[3] }}>
    <Stack.Screen options={{ title: "Driving licence check" }} />
    {!session ? <Button label="Sign in" onPress={() => router.push("/login")} />
      : q.isPending ? <LoadingRows label="Loading rider" />
      : q.isError ? <ErrorNote text={errorMessage(q.error)} onRetry={() => void q.refetch()} />
      : rider ? <Verification key={riderId} id={riderId} name={String(rider.name)} pickupAvailable={rider.pickup_licence_available === true} /> : <Text>Rider not found.</Text>}
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
  const done = () => { if (router.canGoBack()) router.back(); else router.replace("/profile"); };

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
  return <>
    <Text weight="bold" size="xl" accessibilityRole="header">Verify {name}’s licence</Text>
    {w.error && <ErrorNote text={w.error} />}
    {!live ? agreed ? <>
      <Text>How would you like to verify?</Text>
      <Button label="Use DigiLocker" variant="primary" busy={w.busy} onPress={() => start("DIGILOCKER")} />
      <Button label="Enter licence number" disabled={w.busy} onPress={() => start("DL_NUMBER")} />
    </> : <>
      <Text>Before {name} can ride, we check their driving licence with the issuing authority.</Text>
      {consentQ.isPending ? <LoadingRows label="Loading consent wording" /> : consentQ.data?.consentText ? <>
        <Card title="Consent"><Text>{consentQ.data.consentText}</Text></Card>
        <Button label="I agree" variant="primary" onPress={() => setAgreed(true)} />
      </> : <ErrorNote text="Couldn't load the consent wording." onRetry={() => void consentQ.refetch()} />}
      <Button label="Not now" onPress={done} />
    </> : pending ? <>
      {live.method === "DIGILOCKER" ? <>
        <Text>Finish the consent in DigiLocker, then come back here.</Text>
        {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
        <Button label="I've finished in DigiLocker" variant="primary" busy={w.busy} onPress={() => { setNotice(""); void w.run(() => complete(live.id)); }} />
      </> : <>
        <Field label="Licence number"><Input accessibilityLabel="Licence number" value={number} onChangeText={setNumber} autoCapitalize="characters" maxLength={32} /></Field>
        <DateField label="Date of birth" value={dob} onChange={setDob} min="1920-01-01" max={istDay(new Date())} />
        <Button label="Check my licence" variant="primary" disabled={!dob || number.trim().length < 6} busy={w.busy} onPress={() => void w.run(async () => {
          const reply = await api<Reply>(`${base}/${live.id}/dl-number`, { method: "POST", body: { licenceNumber: number.trim(), dob } });
          await accept(reply, live.id, live.method);
        })} />
      </>}
      <Button label="Cancel check" disabled={w.busy} onPress={() => restart(true)} />
    </> : live.state === "PHOTO_PENDING" ? <>
      <Text>The authority didn’t send a photo. Add a clear photo of {name}’s face so shop staff can confirm them at pickup.</Text>
      <Text>Someone from RetroMobi will check the photo before it’s approved.</Text>
      <Button label="Take a photo" variant="primary" busy={w.busy} onPress={() => photo(true)} />
      <Button label="Choose a photo" disabled={w.busy} onPress={() => photo(false)} />
      {settings && <Button label="Open settings" onPress={() => void w.run(() => Linking.openSettings())} />}
      <Button label="Cancel check" disabled={w.busy} onPress={() => restart(true)} />
    </> : <>
      <Card title={live.state === "VERIFIED" ? "Verified" : "Licence check status"}>
        <Text>{live.state === "VERIFIED" ? "Shop staff will check the licence itself when you collect the vehicle."
          : live.state === "MANUAL_REVIEW_REQUIRED" && pickupAvailable ? "The online check is unavailable. Bring your original licence for the shop to check at pickup."
          : live.state === "MANUAL_REVIEW_REQUIRED" ? copyFor(live.code, "Someone from RetroMobi needs to look at this before it's approved. We'll let you know — usually within a day.")
          : live.state === "EXPIRED" || live.state === "REVOKED" ? "This check is no longer current and needs doing again."
          : live.state === "DOCUMENT_VERIFIED" ? "Your document was verified. The check is still being finalised."
          : copyFor(live.code, "That licence couldn't be verified.")}</Text>
      </Card>
      {["EXPIRED", "REVOKED", "REJECTED", "DOCUMENT_FAILED"].includes(live.state) && <Button label="Start again" busy={w.busy} onPress={() => restart()} />}
      <Button label="Done" variant="primary" disabled={w.busy} onPress={done} />
    </>}
  </>;
}
