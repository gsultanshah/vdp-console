import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { parsePollingSchemePdf } from '@/lib/polling-scheme/pdf-import';
import { parsePollingSchemeSpreadsheet } from '@/lib/polling-scheme/excel-import';
import { persistPollingSchemeRows } from '@/lib/polling-scheme/import-service';
import { uploadBufferToFirebaseStorage } from '@/lib/firebase-storage';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_FILE_BYTES = 100 * 1024 * 1024;

function sanitizeFileToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function contentTypeForExt(ext: string, fileType: string): string {
  if (fileType) return fileType;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'csv') return 'text/csv; charset=utf-8';
  if (ext === 'xls') return 'application/vnd.ms-excel';
  return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

export async function POST(req: Request) {
  let importId: import('mongodb').ObjectId | null = null;
  let importsCollection: import('mongodb').Collection | null = null;

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const halkaNameRaw = formData.get('halkaName');
    const districtRaw = formData.get('district');
    const replaceExisting = formData.get('replaceExisting') === 'true';

    if (!file || typeof halkaNameRaw !== 'string') {
      return NextResponse.json({ error: 'File and Halka Name are required.' }, { status: 400 });
    }

    const halkaName = halkaNameRaw.replace(/\s+/g, '').toUpperCase();
    const district = typeof districtRaw === 'string' ? districtRaw.trim() : '';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'File upload error. Please try again.' }, { status: 400 });
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'File exceeds 100 MB limit.' }, { status: 400 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['xls', 'xlsx', 'csv', 'pdf'].includes(ext)) {
      return NextResponse.json(
        { error: 'Invalid file format. Upload .xlsx, .xls, .csv, or .pdf.' },
        { status: 400 }
      );
    }

    await connectDB();
    const { default: mongoose } = await import('mongoose');
    const pollingScheme = mongoose.connection.collection('polling_scheme');
    importsCollection = mongoose.connection.collection('polling_scheme_imports');

    const now = new Date();
    const storagePath = `${halkaName}/polling-schemes/${Date.now()}-${sanitizeFileToken(file.name)}`;
    const sourceFileUrl = await uploadBufferToFirebaseStorage(
      fileBuffer,
      storagePath,
      contentTypeForExt(ext, file.type)
    );

    const importResult = await importsCollection.insertOne({
      halkaName,
      district,
      source: ext,
      sourceFileName: file.name,
      sourceFileUrl,
      sourceStoragePath: storagePath,
      importedAt: now,
      insertedRows: 0,
      skippedRows: 0,
      errorCount: 0,
      status: 'processing',
    });
    importId = importResult.insertedId;

    if (replaceExisting) {
      await pollingScheme.deleteMany({ halkaName });
      await importsCollection.updateMany(
        { halkaName, _id: { $ne: importId } },
        { $set: { status: 'replaced' } }
      );
    }

    const rows =
      ext === 'pdf'
        ? await parsePollingSchemePdf({
            pdfBuffer: fileBuffer,
            blockCodeHint: file.name.replace(/\.pdf$/i, ''),
            district,
          })
        : parsePollingSchemeSpreadsheet({
            fileBuffer,
            ext,
            district,
          });

    if (!rows.length) {
      throw new Error(
        ext === 'pdf'
          ? 'No readable polling scheme rows were detected in the PDF. Upload the structured Excel template instead.'
          : 'No importable rows found in the spreadsheet.'
      );
    }

    const { inserted, skipped, errors } = await persistPollingSchemeRows({
      rows,
      halkaName,
      source: ext,
      sourceFileName: file.name,
      sourceFileUrl,
      sourceStoragePath: storagePath,
      importId,
      importedAt: now,
      collection: pollingScheme,
    });

    await importsCollection.updateOne(
      { _id: importId },
      {
        $set: {
          insertedRows: inserted,
          skippedRows: skipped,
          errorCount: errors.length,
          status: errors.length > 0 && inserted === 0 ? 'failed' : 'completed',
          lastCompletedAt: new Date(),
          errorMessage: errors.length > 0 ? errors.slice(0, 5).join('; ') : '',
        },
      }
    );

    let message = `${inserted} rows imported. ${skipped} rows skipped.`;
    if (errors.length > 0) {
      message += ` Errors: ${errors.slice(0, 3).join('; ')}`;
    }

    return NextResponse.json({
      message,
      inserted,
      skipped,
      errors,
      sourceFileUrl,
      sourceStoragePath: storagePath,
      importId: String(importId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error.';
    if (importId && importsCollection) {
      await importsCollection.updateOne(
        { _id: importId },
        {
          $set: {
            status: 'failed',
            errorMessage: message,
            lastCompletedAt: new Date(),
          },
        }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
