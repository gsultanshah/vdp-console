const CLOUD_NAME = 'dvbbb3ai1';

export const CLOUDINARY_CROP_WIDTH = 3000;

export function buildCloudinaryRowCropUrl(
  publicId: string,
  y: number,
  height: number,
  width = CLOUDINARY_CROP_WIDTH
): string {
  return `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/c_crop,y_${Math.round(y)},h_${Math.round(height)},w_${width}/${publicId}`;
}

/** Extract public ID from a Cloudinary secure URL (same approach as search-voters). */
export function publicIdFromCloudinaryUrl(cloudinaryUrl: string): string | null {
  if (!cloudinaryUrl.includes(`res.cloudinary.com/${CLOUD_NAME}`)) {
    return null;
  }
  const parts = cloudinaryUrl.split('/');
  const last = parts[parts.length - 1] ?? '';
  const publicId = last.split('.')[0];
  return publicId || null;
}

export async function uploadImageAndGetPublicId(imageUrl: string): Promise<string> {
  const response = await fetch('/api/cloudinary/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });

  if (!response.ok) {
    throw new Error('Failed to upload image to Cloudinary');
  }

  const data = await response.json();
  const publicId = data.data?.public_id as string | undefined;
  if (!publicId) {
    throw new Error('Cloudinary upload did not return a public ID');
  }
  return publicId;
}

export async function resolveCloudinaryPublicId(imageUrl: string): Promise<string> {
  const existing = publicIdFromCloudinaryUrl(imageUrl);
  if (existing) {
    return existing;
  }
  return uploadImageAndGetPublicId(imageUrl);
}
