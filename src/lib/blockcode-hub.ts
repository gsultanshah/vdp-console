export const BLOCKCODE_TABS = [
  'overview',
  'search',
  'pages',
  'voters',
  'upload',
  'process',
  'export',
  'parchi',
] as const;

export type BlockCodeTab = (typeof BLOCKCODE_TABS)[number];

export const VOTER_SUB_TABS = ['browse', 'edit', 'spreadsheet', 'add'] as const;

export type VoterSubTab = (typeof VOTER_SUB_TABS)[number];

export interface BlockCodeContext {
  blockCode: string;
  halkaName: string;
  constituencyLabel?: string;
  constituencyStatus?: 'active' | 'inactive';
  blockCodes?: string[];
}

export function sortBlockCodes(blockCodes: string[]): string[] {
  return [...blockCodes].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export function parseBlockCodeTab(value: string | null): BlockCodeTab {
  if (value && BLOCKCODE_TABS.includes(value as BlockCodeTab)) {
    return value as BlockCodeTab;
  }
  return 'overview';
}

export function parseVoterSubTab(value: string | null): VoterSubTab {
  if (value && VOTER_SUB_TABS.includes(value as VoterSubTab)) {
    return value as VoterSubTab;
  }
  return 'browse';
}

export function blockCodeHubPath(
  blockCode: string,
  halkaName?: string,
  tab?: BlockCodeTab,
  extra?: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();
  if (halkaName) params.set('halkaName', halkaName);
  if (tab && tab !== 'overview') params.set('tab', tab);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) {
        params.set(key, value);
      }
    }
  }
  const query = params.toString();
  return `/dashboard/blockcodes/code/${encodeURIComponent(blockCode)}/${query ? `?${query}` : ''}`;
}

export function blockCodeSpreadsheetPath(
  blockCode: string,
  halkaName: string,
  options?: { fullscreen?: boolean }
): string {
  return blockCodeHubPath(blockCode, halkaName, 'voters', {
    voterMode: 'spreadsheet',
    ...(options?.fullscreen ? { spreadsheetFullscreen: '1' } : {}),
  });
}
