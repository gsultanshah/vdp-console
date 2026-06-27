'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

function elementTopInBand(element: OcrRowElement, bandY: number): number {
  if (element.vertices.length) {
    return Math.min(...element.vertices.map((v) => v.y ?? 0)) - bandY;
  }
  return 0;
}

const CNIC_TEXT_PATTERN = /^\d{5}-\d{7}-\d$/;
const ROW_VERTICAL_PADDING_RATIO = 0.18;

function elementFontSize(element: OcrRowElement, text: string): number {
  const base = Math.max(8, Math.min(element.height * 0.85, 28));
  return CNIC_TEXT_PATTERN.test(text) ? base * 1.3 : base;
}

export default function VoterRowPreview({
  imageUrl,
  rowY,
  rowHeight,
  reproduction,
  label = 'Voter row',
}: VoterRowPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [cloudinaryPublicId, setCloudinaryPublicId] = useState<string | null>(null);
  const [isResolvingCloudinary, setIsResolvingCloudinary] = useState(true);
  const [cloudinaryError, setCloudinaryError] = useState<string | null>(null);

  const band = reproduction?.band ?? { x: 0, y: rowY, width: 2480, height: rowHeight };
  const bandWidth = band.width || reproduction?.pageWidth || 2480;
  const bandX = band.x ?? 0;
  const rowPaddingY = Math.round(band.height * ROW_VERTICAL_PADDING_RATIO);
  const displayBandHeight = band.height + rowPaddingY * 2;
  const elements = reproduction?.elements ?? [];
  const cropY = Math.round(band.y);
  const cropHeight = Math.round(band.height);

  const updateScale = useCallback(() => {
    const container = containerRef.current;
    if (!container || bandWidth <= 0) return;
    setScale(container.clientWidth / bandWidth);
  }, [bandWidth]);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

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
            ref={containerRef}
            className="relative w-full overflow-x-hidden overflow-y-visible rounded-md border border-gray-200 bg-white py-1"
            style={{ height: Math.max(Math.ceil(displayBandHeight * scale), 40) }}
          >
            <div
              className="absolute left-0 top-0"
              style={{
                width: bandWidth,
                height: displayBandHeight,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
              {elements.map((element, index) => {
                const text = (element.text || element.printableText).trim();
                if (!text) return null;
                const fontSize = elementFontSize(element, text);
                const isCnic = CNIC_TEXT_PATTERN.test(text);

                return (
                  <span
                    key={`${element.x}-${index}`}
                    className="absolute text-gray-900"
                    style={{
                      left: element.x - bandX,
                      top: elementTopInBand(element, band.y) + rowPaddingY,
                      width: Math.max(element.width, 4),
                      minHeight: Math.max(element.height, 4),
                      fontSize,
                      lineHeight: isCnic ? 1.2 : 1.35,
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
