'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { buildCloudinaryRowCropUrl, resolveCloudinaryPublicId } from '@/lib/cloudinary-url';
import type { OcrRowElement } from '@/lib/ocr-types';
import type { VoterReproductionData } from '@/lib/voter-document';

export interface VoterRowPreviewProps {
  imageUrl: string;
  rowY: number;
  rowHeight: number;
  reproduction?: VoterReproductionData | null;
  label?: string;
}

function elementTop(element: OcrRowElement): number {
  if (element.vertices.length) {
    return Math.min(...element.vertices.map((v) => v.y ?? 0));
  }
  return 0;
}

export default function VoterRowPreview({
  imageUrl,
  rowY,
  rowHeight,
  reproduction,
  label = 'Voter row',
}: VoterRowPreviewProps) {
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string | null>(null);
  const [isResolvingCloudinary, setIsResolvingCloudinary] = useState(true);
  const [cloudinaryError, setCloudinaryError] = useState<string | null>(null);

  const band = reproduction?.band ?? { x: 0, y: rowY, width: 2480, height: rowHeight };
  const pageWidth = reproduction?.pageWidth ?? band.width ?? 2480;
  const elements = useMemo(
    () =>
      [...(reproduction?.elements ?? [])].sort((a, b) => b.x - a.x),
    [reproduction?.elements]
  );
  const cropY = Math.round(band.y);
  const cropHeight = Math.round(band.height);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      setIsResolvingCloudinary(true);
      setCloudinaryError(null);
      try {
        const publicId = await resolveCloudinaryPublicId(imageUrl);
        if (!cancelled) {
          setCloudinaryPublicId(publicId);
        }
      } catch (error) {
        if (!cancelled) {
          setCloudinaryPublicId(null);
          setCloudinaryError(error instanceof Error ? error.message : 'Unable to load row image');
        }
      } finally {
        if (!cancelled) {
          setIsResolvingCloudinary(false);
        }
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const cropUrl = cloudinaryPublicId
    ? buildCloudinaryRowCropUrl(cloudinaryPublicId, cropY, cropHeight)
    : null;

  return (
    <div className="w-full space-y-4">
      <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="mb-3 text-sm font-semibold text-gray-900">Reproduced row</h4>
        {elements.length > 0 ? (
          <div
            className="relative w-full overflow-hidden rounded-md border border-gray-200 bg-white"
            style={{ aspectRatio: `${pageWidth} / ${Math.max(band.height, 60)}` }}
          >
            {elements.map((element, index) => {
              const text = (element.printableText || element.text).trim();
              if (!text) return null;

              const topInBand = elementTop(element) - band.y;
              const leftPercent = (element.x / pageWidth) * 100;
              const topPercent = (topInBand / band.height) * 100;

              return (
                <span
                  key={`${element.x}-${index}`}
                  className="absolute whitespace-nowrap leading-none text-gray-900"
                  style={{
                    left: `${leftPercent}%`,
                    top: `${topPercent}%`,
                    fontSize: 'clamp(0.625rem, 1.4vw, 1rem)',
                    direction: 'rtl',
                    unicodeBidi: 'plaintext',
                    fontFamily: "'Noto Nastaliq Urdu', 'Arial Unicode MS', Arial, sans-serif",
                  }}
                >
                  {text}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No reproduction text stored for this voter.</p>
        )}
      </div>

      <div className="w-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-900">Row scan</h4>
          {cropUrl ? (
            <a
              href={cropUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md p-1.5 text-indigo-600 hover:bg-indigo-50"
              title="Open row scan"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              <span className="text-xs font-medium">Open</span>
            </a>
          ) : null}
        </div>
        {isResolvingCloudinary ? (
          <div className="flex h-24 items-center justify-center text-sm text-gray-500">
            Loading row scan…
          </div>
        ) : cropUrl ? (
          <div className="overflow-hidden rounded-md border border-gray-200 bg-gray-50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cropUrl} alt={`${label} row scan`} className="h-auto w-full" />
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {cloudinaryError ?? 'Unable to load row scan.'}
          </p>
        )}
      </div>
    </div>
  );
}
