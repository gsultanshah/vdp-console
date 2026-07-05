import sharp from 'sharp';

export function normalizeRotationDegrees(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export async function rotateImageBuffer(buffer: Buffer, degrees: number): Promise<{
  buffer: Buffer;
  contentType: string;
}> {
  const normalized = normalizeRotationDegrees(degrees);
  if (normalized === 0) {
    const meta = await sharp(buffer).metadata();
    const format = meta.format ?? 'jpeg';
    return {
      buffer,
      contentType: format === 'png' ? 'image/png' : 'image/jpeg',
    };
  }

  const meta = await sharp(buffer).metadata();
  const format = meta.format ?? 'jpeg';
  const pipeline = sharp(buffer).rotate(normalized, {
    background: { r: 255, g: 255, b: 255, alpha: 1 },
  });

  if (format === 'png') {
    return {
      buffer: await pipeline.png().toBuffer(),
      contentType: 'image/png',
    };
  }

  return {
    buffer: await pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer(),
    contentType: 'image/jpeg',
  };
}

export async function fetchImageBufferFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to download page image (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}
