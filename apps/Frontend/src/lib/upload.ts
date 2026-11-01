import { portalFetch, type Portal } from "./portal";

interface PresignResult {
  uploadUrl: string;
  storageKey: string;
  /** Set by the server only when no storage provider is configured. */
  devFallback?: true;
}

export class UploadFailedError extends Error {}

/**
 * The presign → PUT → confirm dance, which every file-upload site in both
 * portals needs.
 *
 * The important part is what happens when the PUT fails. Every call site used
 * to wrap it in `catch {}` and confirm anyway, because the dev-fallback
 * presign hands back a URL that points nowhere and a hard failure would have
 * made local development impossible. The cost was that a genuinely failed
 * upload reported success and left a `storage_key` referring to nothing.
 *
 * The server now says which case it is (`devFallback`), so the PUT is skipped
 * entirely when there is no storage, and a failed PUT against real storage is
 * fatal — `confirm` is not called and the caller sees an error.
 */
export async function uploadFile<T>(opts: {
  portal: Portal;
  token: string;
  file: File;
  /** Path that returns a presigned upload URL. */
  presignPath: string;
  /** Path that records the stored object. */
  confirmPath: string;
  /** Extra fields the confirm endpoint needs beyond `storageKey`. */
  confirmBody?: Record<string, unknown>;
}): Promise<T> {
  const contentType = opts.file.type || "application/octet-stream";

  const presigned = await portalFetch<PresignResult>(opts.portal, opts.presignPath, {
    method: "POST",
    token: opts.token,
    body: { contentType },
  });

  if (!presigned.devFallback) {
    let res: Response;
    try {
      res = await fetch(presigned.uploadUrl, {
        method: "PUT",
        body: opts.file,
        headers: { "content-type": contentType },
      });
    } catch {
      throw new UploadFailedError("Couldn't reach file storage. Check your connection and try again.");
    }
    if (!res.ok) {
      throw new UploadFailedError(`File storage rejected the upload (${res.status}).`);
    }
  }

  return portalFetch<T>(opts.portal, opts.confirmPath, {
    method: "POST",
    token: opts.token,
    body: { storageKey: presigned.storageKey, ...opts.confirmBody },
  });
}
