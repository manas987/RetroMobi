import { File } from "expo-file-system";
import { api } from "./client";

interface PresignResult {
  uploadUrl: string;
  storageKey: string;
  /** Set by the server only when no storage provider is configured. */
  devFallback?: true;
}

/** A file the user picked: what expo-image-picker and expo-document-picker both give us. */
export interface PickedFile {
  uri: string;
  /** e.g. "image/jpeg". Pickers don't always know; pass your best value. */
  mimeType: string;
  name?: string;
  size?: number;
}

export class UploadFailedError extends Error {}

/**
 * Presign → PUT straight to storage → confirm. The app's own API never
 * carries file bytes (apps/Frontend/src/lib/upload.ts is the web twin).
 *
 * - `devFallback: true` means no storage is configured: skip the PUT entirely.
 * - A failed PUT against real storage is fatal: confirm is NOT called.
 * - The content type is signed into the URL, so the PUT header must match the
 *   presign request exactly.
 * - The URL lives 300 seconds. A 403 on a slow connection means it expired:
 *   presign again and retry once.
 */
export async function uploadFile<T>(opts: {
  file: PickedFile;
  /** Path that returns a presigned upload URL. */
  presignPath: string;
  /** Path that records the stored object. */
  confirmPath: string;
  /** Extra fields the confirm endpoint needs beyond `storageKey`. */
  confirmBody?: Record<string, unknown>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<T> {
  const contentType = opts.file.mimeType || "application/octet-stream";
  const presign = () => api<PresignResult>(opts.presignPath, { method: "POST", body: { contentType } });

  let presigned = await presign();
  if (!presigned.devFallback) {
    const put = async (url: string) => {
      try {
        return await new File(opts.file.uri).upload(url, {
          httpMethod: "PUT",
          headers: { "content-type": contentType },
          // Foreground: progress and the promise only live while the app is open anyway.
          sessionType: "foreground",
          signal: opts.signal,
          onProgress: opts.onProgress ? (p) => opts.onProgress!(p.totalBytes > 0 ? p.bytesSent / p.totalBytes : 0) : undefined,
        });
      } catch {
        throw new UploadFailedError("Couldn't reach file storage. Check your connection and try again.");
      }
    };
    let res = await put(presigned.uploadUrl);
    if (res.status === 403) {
      presigned = await presign();
      res = await put(presigned.uploadUrl);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new UploadFailedError(`File storage rejected the upload (${res.status}).`);
    }
  }

  return api<T>(opts.confirmPath, { method: "POST", body: { storageKey: presigned.storageKey, ...opts.confirmBody } });
}
