import { readFileSync } from 'fs';
import { extractPdfPages } from '../src/lib/pdf-extract';

async function main() {
  const pdfPath = process.argv[2] || '/Users/sultanshah/Downloads/1854001.pdf';
  const buffer = readFileSync(pdfPath);
  const pages = await extractPdfPages(buffer, '1854001');
  console.log(`Extracted ${pages.length} pages from ${pdfPath}`);
  pages.forEach((page) => {
    console.log(`  page ${page.pageNumber}: ${page.fileName} (${page.buffer.length} bytes)`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
