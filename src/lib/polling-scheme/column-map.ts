const COLUMN_ALIASES: Record<string, string[]> = {
  page: ['page', 'pg', 'صفحہ', 'صفحه'],
  district: ['district', 'ضلع', 'zila'],
  slNo: ['sl no', 'slno', 'sl_no', 'sn', 'serial', 'serial no', 's.no', 's no', 'نمبر'],
  pollingStation: [
    'polling station',
    'polling_station',
    'polling_station_name',
    'station',
    'station name',
    'پولنگ اسٹیشن',
    'پولنگ سٹیشن',
  ],
  areaType: ['area type', 'area_type', 'قسم', 'علاقے کی قسم'],
  areaName: ['area name', 'area', 'area_name', 'علاقہ', 'علاقے کا نام', 'وارڈ'],
  electoralRollCode: [
    'electoral roll code',
    'electoral_roll_code',
    'roll code',
    'blockcode',
    'block code',
    'block_code',
    'بلاک کوڈ',
    'الیکٹورل رول کوڈ',
  ],
  maleVoters: ['male voters', 'male', 'مرد ووٹر', 'مرد'],
  femaleVoters: ['female voters', 'female', 'خواتین ووٹر', 'عورتیں', 'خواتین'],
  totalVoters: ['total voters', 'total', 'کل ووٹر', 'کل'],
  maleBooths: ['male booths', 'male_booth', 'male booth', 'مرد بوتھ'],
  femaleBooths: ['female booths', 'female_booth', 'female booth', 'خواتین بوتھ'],
  totalBooths: ['total booths', 'total_booth', 'total booth', 'کل بوتھ'],
  rowType: ['row type', 'row_type', 'قسم قطار'],
  sourceRawText: ['source raw text', 'source_raw_text', 'raw text', 'source'],
};

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
}

export function mapHeaders(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  const normalizedHeaders = headers.map((header) => normalizeHeader(header));

  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    const aliasSet = new Set(aliases.map((alias) => normalizeHeader(alias)));
    for (let index = 0; index < headers.length; index += 1) {
      const header = normalizedHeaders[index];
      if (!header || mapping[canonical]) continue;
      if (aliasSet.has(header) || aliases.some((alias) => header.includes(normalizeHeader(alias)))) {
        mapping[canonical] = headers[index];
      }
    }
  }

  return mapping;
}

export function hasRequiredColumns(mapping: Record<string, string>): string[] {
  const required = ['pollingStation', 'electoralRollCode', 'maleVoters', 'femaleVoters'];
  return required.filter((key) => !mapping[key]);
}
