import { v2 as cloudinary } from 'cloudinary';
import { publicIdFromCloudinaryUrl } from '@/lib/cloudinary-url';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? 'dvbbb3ai1',
  api_key: process.env.CLOUDINARY_API_KEY ?? '265681177578961',
  api_secret: process.env.CLOUDINARY_API_SECRET ?? 'ksZQcGQK5ic14v2Cs-cdLDBTLgg',
});

export async function resolveCloudinaryPublicIdServer(imageUrl: string): Promise<string> {
  const existing = publicIdFromCloudinaryUrl(imageUrl);
  if (existing) {
    return existing;
  }

  const result = await cloudinary.uploader.upload(imageUrl, {
    resource_type: 'auto',
    fetch_format: 'auto',
    quality: 'auto',
  });

  if (!result.public_id) {
    throw new Error('Server upload did not return an image reference');
  }

  return result.public_id;
}
