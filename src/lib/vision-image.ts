import sharp from 'sharp';

const MAX_DIMENSION = 2400;
const TARGET_MAX_BYTES = 1_500_000;

/**
 * Downscale and compress voter-page images before sending to Google Vision.
 * Large full-resolution scans (~3MB+) often cause REST API timeouts.
 */
export async function prepareImageForVision(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer).rotate();
  const meta = await image.metadata();
  const maxSide = Math.max(meta.width ?? 0, meta.height ?? 0);

  let pipeline = image;
  if (maxSide > MAX_DIMENSION) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  for (const quality of [85, 75, 65, 55, 45]) {
    const output = await pipeline.clone().jpeg({ quality, mozjpeg: true }).toBuffer();
    if (output.length <= TARGET_MAX_BYTES || quality === 45) {
      return output;
    }
  }

  return pipeline.jpeg({ quality: 45, mozjpeg: true }).toBuffer();
}
