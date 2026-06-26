import axios from 'axios';
import { detectTextInImage } from '@/lib/google-vision-client';

export async function extractTextFromImageUrl(imageUrl: string): Promise<string> {
  const response = await axios.get(imageUrl, {
    responseType: 'arraybuffer',
    headers: { Accept: 'image/*' },
  });
  const imageBuffer = Buffer.from(response.data);

  if (!imageBuffer.length) {
    throw new Error('Invalid image data received');
  }

  const result = await detectTextInImage(imageBuffer.toString('base64'));

  return result.textAnnotations?.[0]?.description ?? '';
}
