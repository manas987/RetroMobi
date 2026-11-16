import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Linking from "expo-linking";
import { useKeepAwake } from "expo-keep-awake";
import { useVideoPlayer, VideoView } from "expo-video";
import { Button, ErrorNote, Text, UploadFailedError, space, uploadFile, type PickedFile, type Row } from "@retromobi/mobile-shared";
import { Card, EmptyState } from "../../../features/RiderSurface";
import { BookingPage } from "../../../features/bookings/BookingPage";
import { isPast } from "../../../features/bookings/bookings";
import { useDiscardChanges } from "../../../state/discard";
import { refreshRiderData, useWrite } from "../../../state/private";

const instructions = [
  "Show your original driving licence to shop staff and wait for their identity check.",
  "Before riding away, record one clear video walking around the entire vehicle. Show the front, rear, both sides, mirrors, wheels, and body panels.",
  "Get close-ups of any existing scratches, dents, or broken parts. Turn on the display and show the odometer and fuel or battery level.",
  "Review the video, then upload it to confirm pickup.",
];

export default function Pickup() {
  return <BookingPage title="Confirm pickup">{(row) => row.status === "CONFIRMED" && !row.actual_pickup_at && !isPast(row)
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
    <Card title="Before you ride"><View style={{ gap: space[2] }}>
      {instructions.map((line, i) => <Text key={line}>{i + 1}. {line}</Text>)}
    </View></Card>
    <Text weight="bold">Keep a copy of the video. Without pickup footage, RetroMobi can’t verify pre-existing damage or guarantee a deposit refund if there’s a dispute.</Text>
    {file && <Preview key={file.uri} uri={file.uri} />}
    <Button label="Record walk-around video" variant="primary" disabled={w.busy} onPress={() => pick(true)} />
    <Button label="Choose from gallery" disabled={w.busy} onPress={() => pick(false)} />
    {settings && <Button label="Open settings" onPress={() => void w.run(() => Linking.openSettings())} />}
    {file && <Button label="Upload and confirm pickup" variant="primary" busy={w.busy} onPress={upload} />}
    {progress !== undefined && <Text accessibilityLiveRegion="polite">{progress >= 1 ? "Confirming pickup…" : `Uploading · ${Math.floor(progress * 100)}%`} Keep this screen open.</Text>}
    {w.error && <ErrorNote text={w.error} />}
    {discard.dialog}
  </>;
}

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} style={{ width: "100%", aspectRatio: 16 / 9 }} nativeControls />;
}
