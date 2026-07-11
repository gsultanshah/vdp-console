import { NextResponse } from 'next/server';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';

export const dynamic = 'force-dynamic';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME ?? 'dvbbb3ai1',
  api_key: process.env.CLOUDINARY_API_KEY ?? '265681177578961',
  api_secret: process.env.CLOUDINARY_API_SECRET ?? 'ksZQcGQK5ic14v2Cs-cdLDBTLgg',
});

function formatUploadError(error: unknown): { message: string; status: number } {
  const err = error as { code?: string; errno?: number; message?: string; hostname?: string };
  const code = err.code ?? '';
  const message = err.message ?? '';

  if (code === 'ENOTFOUND' || message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return {
      message:
        'Cannot reach the server (network or DNS error). Check your internet connection and try again.',
      status: 503,
    };
  }

  if (code === 'ETIMEDOUT' || code === 'ECONNREFUSED') {
    return {
      message: 'Server upload timed out or was refused. Check your network connection.',
      status: 503,
    };
  }

  return {
    message: message || 'Failed to upload image to server',
    status: 500,
  };
}

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
    }

    const result: UploadApiResponse = await cloudinary.uploader.upload(imageUrl, {
      resource_type: 'auto',
      fetch_format: 'auto',
      quality: 'auto',
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const { message, status } = formatUploadError(error);
    console.error('Error uploading to Cloudinary:', error);
    return NextResponse.json({ error: message }, { status });
  }
}
