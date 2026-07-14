export const PARCHI_ELEMENT_IMAGE_MAX_BYTES = 1024 * 1024;
export const PARCHI_ELEMENT_IMAGE_MAX_DIMENSION = 1200;

export type ParchiElementImageUploadPhase = 'preparing' | 'uploading';

export interface ParchiElementImageUploadState {
  phase: ParchiElementImageUploadPhase;
  progress: number;
  previewUrl?: string;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))),
      type,
      quality
    );
  });
}

async function encodeUnderLimit(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob> {
  let w = width;
  let h = height;
  const qualities = [0.9, 0.82, 0.74, 0.66, 0.58, 0.5, 0.42];

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(source, 0, 0, w, h);

    for (const quality of qualities) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (blob.size <= PARCHI_ELEMENT_IMAGE_MAX_BYTES) {
        canvas.width = 0;
        canvas.height = 0;
        return blob;
      }
    }

    w = Math.max(120, Math.round(w * 0.82));
    h = Math.max(120, Math.round(h * 0.82));
    canvas.width = 0;
    canvas.height = 0;
  }

  throw new Error('Image is too large. Use a smaller photo (max 1 MB after resize).');
}

/** Resize and compress an image for a parchi canvas element (max 1 MB). */
export async function prepareParchiElementImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, or WebP).');
  }

  const bitmap = await createImageBitmap(file);
  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const maxDim = PARCHI_ELEMENT_IMAGE_MAX_DIMENSION;
    if (width > maxDim || height > maxDim) {
      const scale = maxDim / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const blob = await encodeUnderLimit(bitmap, width, height);
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export interface UploadDesignAssetResult {
  design: {
    _id?: string;
    assets: { id: string; url: string; name: string }[];
    canvas?: unknown;
    symbolAssetId?: string | null;
    photoAssetId?: string | null;
    [key: string]: unknown;
  };
  asset: { id: string; url: string; name: string };
}

export function uploadDesignAssetWithProgress(
  designId: string,
  file: File,
  options?: {
    role?: string;
    name?: string;
    onProgress?: (progress: number) => void;
  }
): Promise<UploadDesignAssetResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    form.append('role', options?.role ?? 'other');
    form.append('name', options?.name ?? file.name);

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable || !options?.onProgress) return;
      options.onProgress(Math.round((event.loaded / event.total) * 100));
    });

    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as UploadDesignAssetResult & { error?: string };
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(data.error ?? 'Upload failed'));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

    xhr.open('POST', `/api/voter-parchi/designs/${designId}/assets`);
    xhr.send(form);
  });
}
