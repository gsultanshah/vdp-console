import { NextResponse } from 'next/server';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

export const dynamic = 'force-dynamic';

// Configure Cloudinary
cloudinary.config({
  cloud_name: 'dvbbb3ai1',
  api_key: '265681177578961',
  api_secret: 'ksZQcGQK5ic14v2Cs-cdLDBTLgg'
});

export async function POST(request: Request) {
  try {
    const { imageUrl } = await request.json();

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'Image URL is required' },
        { status: 400 }
      );
    }

    // Upload the image to Cloudinary
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      cloudinary.uploader.upload(
        imageUrl,
        {
          resource_type: 'auto',
          fetch_format: 'auto',
          quality: 'auto'
        },
        (error: Error | undefined, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            reject(error || new Error('Upload failed'));
          } else {
            resolve(result);
          }
        }
      );
    });

    return NextResponse.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    return NextResponse.json(
      { error: 'Failed to upload image to Cloudinary' },
      { status: 500 }
    );
  }
} 