import { NextResponse } from 'next/server';
import { runOcrPipeline } from '@/lib/ocr-pipeline';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('imageurl');

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageurl query param is required' }, { status: 400 });
    }

    const { ocr_data, finalJson } = await runOcrPipeline(imageUrl);

    return NextResponse.json({
      finalJson,
      ocr_data,
    });
  } catch (error) {
    console.error('Error in public-final-json:', error);
    return NextResponse.json(
      {
        error: 'Failed to process image and generate final JSON.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
