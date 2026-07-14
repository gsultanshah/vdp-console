export function normalizeHalkaName(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

export function normalizeConstituencySlug(slug: string): string {
  return normalizeHalkaName(decodeURIComponent(slug.trim()));
}

export function constituencyHomePath(halkaName: string): string {
  return `/dashboard/constituency/${encodeURIComponent(normalizeHalkaName(halkaName))}/`;
}

export function constituencyParchiDesignerPath(halkaName: string): string {
  return `${constituencyHomePath(halkaName)}parchi-designer/`;
}

export const CONSTITUENCY_INDEX_PATH = '/dashboard/constituency/';
