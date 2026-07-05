export const BLOCKCODE_TABS = [
  'overview',
  'search',
  'pages',
  'voters',
  'upload',
  'process',
  'export',
] as const;

export type BlockCodeTab = (typeof BLOCKCODE_TABS)[number];

export interface BlockCodeContext {
  blockCode: string;
  halkaName: string;
  constituencyLabel?: string;
  constituencyStatus?: 'active' | 'inactive';
}

export function blockCodeHubPath(blockCode: string, halkaName?: string, tab?: BlockCodeTab): string {
  const params = new URLSearchParams();
  if (halkaName) params.set('halkaName', halkaName);
  if (tab && tab !== 'overview') params.set('tab', tab);
  const query = params.toString();
  return `/dashboard/blockcodes/code/${encodeURIComponent(blockCode)}/${query ? `?${query}` : ''}`;
}

export function parseBlockCodeTab(value: string | null): BlockCodeTab {
  if (value && BLOCKCODE_TABS.includes(value as BlockCodeTab)) {
    return value as BlockCodeTab;
  }
  return 'overview';
}
