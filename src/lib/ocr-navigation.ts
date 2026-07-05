export function safeReturnTo(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    if (decoded.startsWith('/dashboard') && !decoded.startsWith('//')) {
      return decoded;
    }
  } catch {
    // ignore malformed values
  }
  return null;
}

export function ocrPageHref(pageId: string, returnTo?: string): string {
  const base = `/dashboard/blockcodes/${pageId}/ocr/`;
  if (!returnTo) return base;
  return `${base}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function currentLocation(
  pathname: string,
  searchParams: Pick<URLSearchParams, 'toString'> | null
): string {
  const query = searchParams?.toString();
  return query ? `${pathname}?${query}` : pathname;
}
