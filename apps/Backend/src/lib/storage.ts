import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
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

export async function presignUpload(
  key: string,
  contentType: string,
): Promise<{ uploadUrl: string; storageKey: string }> {
  const config = getClient();
  if (!config) {
    console.log(`[dev-fallback] storage.presignUpload not configured — faking an upload URL for ${key}`);
    return { uploadUrl: `https://dev-fallback.local/upload/${key}`, storageKey: key };
  }
  const { client, bucket } = config;
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return { uploadUrl, storageKey: key };
}

export async function presignDownload(key: string): Promise<string> {
  const config = getClient();
  if (!config) {
    console.log(`[dev-fallback] storage.presignDownload not configured — faking a download URL for ${key}`);
    return `https://dev-fallback.local/download/${key}`;
  }
  const { client, bucket } = config;
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 300 });
}
