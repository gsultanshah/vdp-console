import admin from 'firebase-admin';
import { firebaseConfig } from '@/config/firebase';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

const SIGNED_URL_EXPIRY = '03-01-2500';

export function blockcodeStorageDestination(
  halkaName: string,
  blockCode: string,
  fileName: string
): string {
  return `${halkaName}/${blockCode}/${fileName}`;
}

function getStorageBucket() {
  const app = getFirebaseAdminApp();
  if (!app) {
    throw new Error('Server storage is not configured');
  }
  const bucketName = firebaseConfig.storageBucket;
  return bucketName ? admin.storage(app).bucket(bucketName) : admin.storage(app).bucket();
}

export async function uploadBufferToFirebaseStorage(
  buffer: Buffer,
  destination: string,
  contentType = 'image/jpeg'
): Promise<string> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: SIGNED_URL_EXPIRY,
  });

  return url;
}

export async function createResumableUploadSession(
  destination: string,
  contentType: string,
  origin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || '*'
): Promise<string> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);
  const [uri] = await file.createResumableUpload({
    metadata: { contentType },
    origin,
  });
  return uri;
}

export async function getSignedReadUrl(destination: string): Promise<string> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: SIGNED_URL_EXPIRY,
  });
  return url;
}

export async function getSignedWriteUrl(
  destination: string,
  contentType: string
): Promise<string> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);
  const [url] = await file.getSignedUrl({
    action: 'write',
    expires: SIGNED_URL_EXPIRY,
    contentType,
  });
  return url;
}

export async function verifyStorageObject(
  destination: string,
  expectedSizeBytes?: number
): Promise<{ exists: boolean; sizeBytes: number; contentType?: string }> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);
  const [exists] = await file.exists();
  if (!exists) {
    return { exists: false, sizeBytes: 0 };
  }

  const [metadata] = await file.getMetadata();
  const sizeBytes = Number(metadata.size ?? 0);
  if (expectedSizeBytes && sizeBytes !== expectedSizeBytes) {
    throw new Error(`Uploaded file size mismatch (expected ${expectedSizeBytes}, got ${sizeBytes})`);
  }

  return {
    exists: true,
    sizeBytes,
    contentType: metadata.contentType,
  };
}

export async function isPdfSignatureValid(destination: string): Promise<boolean> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);
  const [buffer] = await file.download({ start: 0, end: 4 });
  return buffer.toString('utf8').startsWith('%PDF');
}

export async function downloadBufferFromFirebaseStorage(destination: string): Promise<Buffer> {
  const bucket = getStorageBucket();
  const file = bucket.file(destination);
  const [buffer] = await file.download();
  return buffer;
}
