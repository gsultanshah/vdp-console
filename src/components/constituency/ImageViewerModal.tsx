'use client';

import { useCallback, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface UploadImage {
  _id: string;
  blockCode: string;
  fileName: string;
  url: string;
  tag?: string;
  halkaName: string;
  gender: string;
  religion: string;
  status: string;
  uploadedAt: string;
}

interface ImageViewerModalProps {
  images: UploadImage[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export default function ImageViewerModal({
  images,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
}: ImageViewerModalProps) {
  const current = images[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < images.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(currentIndex - 1);
  }, [currentIndex, hasPrev, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(currentIndex + 1);
  }, [currentIndex, hasNext, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, goPrev, goNext, onClose]);

  if (!isOpen || !current) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        aria-label="Close"
      >
        <XMarkIcon className="h-6 w-6" />
      </button>

      <div
        className="relative flex h-full w-full max-w-6xl flex-col items-center justify-center px-16 py-12"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={goPrev}
          disabled={!hasPrev}
          className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous image"
        >
          <ChevronLeftIcon className="h-8 w-8" />
        </button>

        <div className="flex max-h-[75vh] max-w-full flex-col items-center">
          <img
            src={current.url}
            alt={current.fileName}
            className="max-h-[65vh] max-w-full object-contain"
          />
          <div className="mt-4 w-full max-w-2xl rounded-lg bg-white/10 px-4 py-3 text-center text-white">
            <p className="text-sm font-medium">
              {currentIndex + 1} / {images.length}
            </p>
            <p className="mt-1 text-sm text-white/80">{current.fileName}</p>
            <p className="mt-1 text-xs text-white/60">
              Block {current.blockCode} · {current.gender} · {current.religion} · {current.status}
            </p>
          </div>
        </div>

        <button
          onClick={goNext}
          disabled={!hasNext}
          className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Next image"
        >
          <ChevronRightIcon className="h-8 w-8" />
        </button>

        <div className="absolute bottom-6 flex items-center gap-3">
          <button
            onClick={goPrev}
            disabled={!hasPrev}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Previous
          </button>
          <button
            onClick={goNext}
            disabled={!hasNext}
            className="inline-flex items-center gap-1 rounded-md bg-white/10 px-4 py-2 text-sm font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Next
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
