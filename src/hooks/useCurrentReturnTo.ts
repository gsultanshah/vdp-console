'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { currentLocation } from '@/lib/ocr-navigation';

export function useCurrentReturnTo(): string {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return currentLocation(pathname, searchParams);
}
