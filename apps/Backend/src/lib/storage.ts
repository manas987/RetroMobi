import {
  S3Client,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient(): { client: S3Client; bucket: string } | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

/**
 * `devFallback` is present only when no storage is configured, and it exists
 * for the client's benefit: the faked `uploadUrl` points nowhere, so a client
 * that PUTs to it gets a network error that is indistinguishable from a real
 * upload failure. Clients used to swallow that error and confirm anyway,
 * which reported success for a file that was never stored. With this flag the
 * client skips the PUT when it is set, and treats a failed PUT as fatal when
 * it is not.
 */
export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string; devFallback?: true }> {
  const config = getClient();
  if (!config) {
    console.log(`[dev-fallback] storage.presignUpload not configured — faking an upload URL for ${key}`);
    return { uploadUrl: `https://dev-fallback.local/upload/${key}`, storageKey: key, devFallback: true };
  }
  const { client, bucket } = config;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return { uploadUrl, storageKey: key };
}

export async function presignDownload(key: string, expiresIn = 300): Promise<string> {
  const config = getClient();
  if (!config) {
    console.log(`[dev-fallback] storage.presignDownload not configured — faking a download URL for ${key}`);
    return `https://dev-fallback.local/download/${key}`;
  }
  const { client, bucket } = config;
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn });
}

export async function storedContentType(key: string): Promise<string | null> {
  const config = getClient();
  if (!config) return null;
  const { client, bucket } = config;
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return object.ContentType ?? null;
  } catch (error) {
    if (error instanceof Error && error.name === "NotFound") return null;
    throw error;
  }
}

/**
 * Server-side upload, for bytes that never pass through a browser: the DL
 * holder's photograph, which arrives from the KYC vendor as base64 or behind a
 * 24-hour presigned URL and has to be stored before that expires.
 *
 * `presignUpload` + a PUT would also work, but that is a pointless round trip
 * when the backend already holds the bytes and the credentials.
 */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<{ storageKey: string; devFallback?: true }> {
  const config = getClient();
  if (!config) {
    console.log(
      `[dev-fallback] storage.putObject not configured — discarding ${body.byteLength} bytes for ${key}`,
    );
    return { storageKey: key, devFallback: true };
  }
  const { client, bucket } = config;
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
  );
  return { storageKey: key };
}

/**
 * Deletes a stored object. Needed because retention is a promise, not a
 * preference: the consent text tells the customer their licence photograph is
 * deleted after their last rental, so something has to actually delete it.
 *
 * An object that is already gone is not an error -- a retention sweep that
 * crashes on a missing key stops deleting everything after it.
 */
export async function deleteObject(key: string): Promise<{ devFallback?: true }> {
  const config = getClient();
  if (!config) {
    console.log(`[dev-fallback] storage.deleteObject not configured — nothing to delete for ${key}`);
    return { devFallback: true };
  }
  const { client, bucket } = config;
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  return {};
}
