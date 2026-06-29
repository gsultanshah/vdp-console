import admin from 'firebase-admin';
import { firebaseConfig } from '@/config/firebase';
import { getFirebaseAdminApp } from '@/lib/firebase-admin';

export async function uploadBufferToFirebaseStorage(
  buffer: Buffer,
  destination: string,
  contentType = 'image/jpeg'
): Promise<string> {
  const app = getFirebaseAdminApp();
  if (!app) {
    throw new Error('Firebase is not configured');
  }

  const bucketName = firebaseConfig.storageBucket;
  const bucket = bucketName ? admin.storage(app).bucket(bucketName) : admin.storage(app).bucket();
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: { contentType },
    resumable: false,
  });

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: '03-01-2500',
  });

  return url;
}
