import fs from 'fs/promises';
import { downloadBufferFromFirebaseStorage } from '@/lib/firebase-storage';

async function readLocalFileIfExists(filePath: string | null | undefined): Promise<Buffer | null> {
  if (!filePath) return null;
  try {
    const buffer = await fs.readFile(filePath);
    return buffer.length > 0 ? buffer : null;
  } catch {
    return null;
  }
}

/** Resolve a generated parchi PDF from local disk, Firebase Storage, or a signed URL. */
export async function readStorageBackedPdfBuffer(input: {
  localPath?: string | null;
  storagePath?: string | null;
  downloadUrl?: string | null;
  fallbackLocalPath?: string | null;
}): Promise<Buffer | null> {
  for (const filePath of [input.localPath, input.fallbackLocalPath]) {
    const local = await readLocalFileIfExists(filePath);
    if (local) return local;
  }

  const storagePath =
    input.storagePath && !input.storagePath.startsWith('local:') ? input.storagePath : null;
  if (storagePath) {
    try {
      return await downloadBufferFromFirebaseStorage(storagePath);
    } catch (error) {
      console.warn(
        'Firebase storage download failed:',
        error instanceof Error ? error.message : error
      );
    }
  }

  if (input.downloadUrl?.startsWith('http')) {
    try {
      const response = await fetch(input.downloadUrl);
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer());
      }
    } catch (error) {
      console.warn('Remote PDF download failed:', error instanceof Error ? error.message : error);
    }
  }

  return null;
}
