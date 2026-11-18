import { Linking } from "react-native";
import { getDocumentAsync } from "expo-document-picker";
import { launchCameraAsync, launchImageLibraryAsync, requestCameraPermissionsAsync } from "expo-image-picker";
import { openBrowserAsync } from "expo-web-browser";
import { ApiError, type PickedFile } from "@retromobi/mobile-shared";

export class CameraDenied extends Error {
  constructor(readonly canAskAgain: boolean) { super("Camera permission was denied"); }
}
export const openSettings = () => Linking.openSettings();

export async function pickImages(camera: boolean): Promise<PickedFile[]> {
  if (camera) {
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) throw new CameraDenied(permission.canAskAgain);
  }
  const result = camera
    ? await launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 })
    : await launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: true });
  return result.canceled ? [] : result.assets.map((item) => ({
    uri: item.uri, mimeType: item.mimeType ?? "image/jpeg", name: item.fileName ?? undefined, size: item.fileSize,
  }));
}

export async function pickPaper(): Promise<PickedFile | null> {
  const result = await getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true, multiple: false });
  const item = result.assets?.[0];
  return item ? { uri: item.uri, mimeType: item.mimeType ?? "application/octet-stream", name: item.name, size: item.size } : null;
}

export function isDownloadable(url: string | undefined): url is string {
  return !!url && url.startsWith("https://") && !url.startsWith("https://dev-fallback.local/");
}

export async function openFile(url: string) {
  if (!isDownloadable(url)) throw new ApiError(503, "File storage is unavailable.", "storage_unconfigured");
  await openBrowserAsync(url);
}
