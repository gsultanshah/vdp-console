import { execFile } from 'child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { promisify } from 'util';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

export interface ExtractedPdfPage {
  pageNumber: number;
  fileName: string;
  buffer: Buffer;
}

function pageFileName(blockCode: string, pageNumber: number): string {
  return `${blockCode}-page-${String(pageNumber).padStart(3, '0')}.jpg`;
}

async function extractWithPdftoppm(
  pdfBuffer: Buffer,
  blockCode: string,
  dpi = 150
): Promise<ExtractedPdfPage[] | null> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'vdp-pdf-'));
  const tempPdfPath = path.join(tempDir, `${blockCode}.pdf`);
  const outputPrefix = path.join(tempDir, 'page');

  try {
    await writeFile(tempPdfPath, pdfBuffer);
    await execFileAsync('pdftoppm', ['-jpeg', '-r', String(dpi), tempPdfPath, outputPrefix], {
      maxBuffer: 100 * 1024 * 1024,
    });

    const outputFiles = (await readdir(tempDir))
      .filter((name) => name.startsWith('page-') && name.endsWith('.jpg'))
      .sort((a, b) => {
        const pageA = Number(a.match(/page-(\d+)\.jpg$/)?.[1] ?? 0);
        const pageB = Number(b.match(/page-(\d+)\.jpg$/)?.[1] ?? 0);
        return pageA - pageB;
      });

    const pages: ExtractedPdfPage[] = [];
    for (let index = 0; index < outputFiles.length; index += 1) {
      const pageNumber = index + 1;
      const rawBuffer = await readFile(path.join(tempDir, outputFiles[index]));
      const buffer = await sharp(rawBuffer).jpeg({ quality: 90 }).toBuffer();
      pages.push({
        pageNumber,
        fileName: pageFileName(blockCode, pageNumber),
        buffer,
      });
    }

    return pages.length > 0 ? pages : null;
  } catch {
    return null;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractWithPdfToImg(
  pdfBuffer: Buffer,
  blockCode: string,
  scale = 2
): Promise<ExtractedPdfPage[]> {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'vdp-pdf-'));
  const tempPdfPath = path.join(tempDir, `${blockCode}.pdf`);

  try {
    await writeFile(tempPdfPath, pdfBuffer);
    const { pdf } = await import('pdf-to-img');
    const document = await pdf(tempPdfPath, { scale });
    const pages: ExtractedPdfPage[] = [];
    let pageNumber = 1;

    for await (const pngBuffer of document) {
      const jpegBuffer = await sharp(pngBuffer).jpeg({ quality: 90 }).toBuffer();
      pages.push({
        pageNumber,
        fileName: pageFileName(blockCode, pageNumber),
        buffer: jpegBuffer,
      });
      pageNumber += 1;
    }

    if (pages.length === 0) {
      throw new Error('PDF contains no pages');
    }

    return pages;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractPdfPages(
  pdfBuffer: Buffer,
  blockCode: string,
  scale = 2
): Promise<ExtractedPdfPage[]> {
  const popplerPages = await extractWithPdftoppm(pdfBuffer, blockCode);
  if (popplerPages) {
    return popplerPages;
  }

  return extractWithPdfToImg(pdfBuffer, blockCode, scale);
}

export { blockCodeFromPdfFileName } from '@/lib/pdf-utils';
