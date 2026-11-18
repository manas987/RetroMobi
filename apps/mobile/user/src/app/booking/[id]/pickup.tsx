import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { ImageUp, Info, UploadCloud, Video } from "lucide-react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useKeepAwake } from "expo-keep-awake";
import { useVideoPlayer, VideoView } from "expo-video";
import { Button, ErrorNote, Text, UploadFailedError, colors, space, uploadFile, type PickedFile, type Row } from "@retromobi/mobile-shared";
import { EmptyState, Headline, PillCTA } from "../../../features/RiderSurface";
import { trail } from "../../../ui/trail";
import { BookingPage } from "../../../features/bookings/BookingPage";
import { isPast } from "../../../features/bookings/bookings";
import { useDiscardChanges } from "../../../state/discard";
import { refreshRiderData, useWrite } from "../../../state/private";

const instructions = [
  { title: "Licence check", text: "Show your original driving licence to shop staff and wait for their identity check." },
  { title: "Walk around the vehicle", text: "Before riding away, record one clear video walking around the entire vehicle. Show the front, rear, both sides, mirrors, wheels, and body panels." },
  { title: "Close-ups", text: "Get close-ups of any existing scratches, dents, or broken parts. Turn on the display and show the odometer and fuel or battery level." },
  { title: "Upload", text: "Review the video, then upload it to confirm pickup." },
];

export default function Pickup() {
  return <BookingPage title="">{(row) => row.status === "CONFIRMED" && !row.actual_pickup_at && !isPast(row)
    ? <Capture row={row} /> : <EmptyState title={row.actual_pickup_at ? "Pickup already confirmed" : "Pickup is unavailable"} />}</BookingPage>;
}

function Capture({ row }: { row: Row }) {
  useKeepAwake();
  const router = useRouter();
  const [file, setFile] = useState<PickedFile>();
  const [progress, setProgress] = useState<number>();
  const [settings, setSettings] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const w = useWrite();
  const discard = useDiscardChanges(!!file, progress !== undefined);
  useEffect(() => () => abort.current?.abort(), []);
  function pick(camera: boolean) {
    void w.run(async () => {
      setSettings(false);
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setSettings(true);
        throw new Error("Allow camera access to record, or choose a video you already took.");
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["videos"] };
      const r = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (r.canceled) return;
      const asset = r.assets[0];
      const mimeType = asset?.mimeType ?? (/\.mov$/i.test(asset?.fileName ?? asset?.uri ?? "") ? "video/quicktime" : "video/mp4");
      if (!asset?.uri || !mimeType.startsWith("video/")) throw new Error("Choose a video file.");
      setFile({ uri: asset.uri, mimeType, name: asset.fileName ?? undefined, size: asset.fileSize });
    }, (err) => err instanceof Error ? err.message : "Couldn't open your videos.");
  }
  function upload() {
    if (!file) return;
    void w.run(async () => {
      const controller = new AbortController();
      abort.current = controller;
      setProgress(0);
      try {
        const path = `/bookings/${encodeURIComponent(String(row.id))}/inspection`;
        await uploadFile({ file, presignPath: `${path}/upload`, confirmPath: `${path}/confirm`,
          onProgress: setProgress, signal: controller.signal });
        await refreshRiderData("/bookings");
        discard.leave();
        if (router.canGoBack()) router.back(); else router.replace("/bookings");
      } finally { abort.current = null; setProgress(undefined); }
    }, (err) => err instanceof UploadFailedError || err instanceof Error ? err.message : "Couldn't confirm pickup.");
  }
  return <>
    <Headline kicker="Pickup" title="Record your walk-around" />
    <Text color="ink2">A short video documents the vehicle’s condition before you ride.</Text>
    <View style={styles.steps}>
      {instructions.map(({ title, text }, i) => <View key={text} style={styles.step}>
        <View style={{ alignItems: "center" }}>
          <View style={styles.num}><Text size="sm" weight="bold" color="onAmber">{i + 1}</Text></View>
          {i < instructions.length - 1 && <View style={styles.rail} />}
        </View>
        <View style={{ flex: 1, gap: 2, paddingBottom: space[4], paddingTop: 4 }}>
          <Text weight="bold">{title}</Text>
          <Text size="sm" color="ink2">{text}</Text>
        </View>
      </View>)}
    </View>
    {file ? <View style={styles.preview}><Preview key={file.uri} uri={file.uri} /></View> : null}
    <View style={styles.choices}>
      <Choice icon={Video} label={file ? "Record again" : "Record video"} dark disabled={w.busy} onPress={() => pick(true)} />
      <Choice icon={ImageUp} label="From gallery" disabled={w.busy} onPress={() => pick(false)} />
    </View>
    {settings && <Button label="Open settings" onPress={() => void w.run(() => Linking.openSettings())} />}
    {file && <PillCTA label="Upload and confirm pickup" icon={UploadCloud} tone="amber" busy={w.busy} onPress={upload} />}
    {progress !== undefined && <View style={{ gap: space[2] }} accessibilityLiveRegion="polite">
      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.max(4, Math.floor(progress * 100))}%` }]} /></View>
      <Text size="sm" color="ink2">{progress >= 1 ? "Confirming pickup…" : `Uploading · ${Math.floor(progress * 100)}%`} Keep this screen open.</Text>
    </View>}
    <View style={styles.tip}>
      <Info size={16} color={colors.ink2} />
      <Text size="sm" color="ink2" style={{ flex: 1 }}>Keep a copy of the video. Pickup footage helps us review pre-existing damage if there’s a deposit dispute.</Text>
    </View>
    {w.error && <ErrorNote text={w.error} />}
    {discard.dialog}
  </>;
}

function Choice({ icon: Icon, label, dark, disabled, onPress }: { icon: typeof Video; label: string; dark?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.choice, dark && { backgroundColor: trail.forest }, { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 }]}>
    <View style={[styles.choiceIcon, dark && { backgroundColor: colors.amber }]}><Icon size={22} color={dark ? colors.onAmber : trail.forest} /></View>
    <Text weight="bold" color={dark ? "white" : "ink"}>{label}</Text>
  </Pressable>;
}

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width: "100%", aspectRatio: 16 / 9 }} nativeControls />;
}

const styles = StyleSheet.create({
  steps: { backgroundColor: colors.surface2, borderRadius: 28, padding: space[4], paddingBottom: 0, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  step: { flexDirection: "row", gap: space[3] },
  num: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.amber, alignItems: "center", justifyContent: "center" },
  rail: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 4 },
  preview: { borderRadius: 24, overflow: "hidden", backgroundColor: colors.ink },
  choices: { flexDirection: "row", gap: space[3] },
  choice: { flex: 1, minHeight: 120, borderRadius: 26, padding: space[4], justifyContent: "space-between", backgroundColor: colors.surface3 },
  choiceIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: "hidden" },
  barFill: { height: 8, borderRadius: 4, backgroundColor: trail.forest },
  tip: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
});
