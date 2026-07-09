export type PollingSchemeRowType = 'Detail' | 'Station Total' | 'Page Total' | 'Unknown';

export type PollingStationGenderType = 'male' | 'female' | 'combined';

export interface NormalizedPollingSchemeRow {
  page: number | null;
  district: string;
  slNo: string;
  pollingStation: string;
  areaType: string;
  areaName: string;
  electoralRollCode: string;
  maleVoters: number;
  femaleVoters: number;
  totalVoters: number;
  maleBooths: string;
  femaleBooths: string;
  totalBooths: string;
  rowType: PollingSchemeRowType;
  sourceRawText: string;
  stationType: PollingStationGenderType;
}

export interface PollingSchemeImportMeta {
  halkaName: string;
  district: string;
  source: string;
  sourceFileName: string;
  sourceFileUrl: string;
  sourceStoragePath: string;
  importedAt: Date;
  insertedRows: number;
  skippedRows: number;
  errorCount: number;
  status: 'processing' | 'completed' | 'failed';
  errorMessage?: string;
}
