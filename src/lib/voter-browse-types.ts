export interface VoterBrowseRecord {
  _id: string;
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  row?: number;
  rowY?: number;
  rowHeight?: number;
  imageUrl?: string;
  gender?: string;
  religion?: string;
  pageTag?: string;
  fileName?: string;
  fatherName?: string;
  profession?: string;
  age?: string | null;
  address?: string | null;
  previousAddress?: string;
  cells?: import('@/lib/voter-cells').VoterTableCell[];
  reproduction?: import('@/lib/voter-document').VoterReproductionData;
  createdAt?: string;
  updatedAt?: string;
}

export interface VoterBrowseQueryParams {
  halkaName?: string;
  blockCode?: string;
}

export interface PaginatedVotersResponse {
  voters: VoterBrowseRecord[];
  currentPage: number;
  totalPages: number;
  total: number;
  pageSize: number;
}

export interface VoterPageMeta {
  currentPage: number;
  pageSize: number;
}

export interface VoterPageResult extends VoterPageMeta {
  voters: VoterBrowseRecord[];
  total: number;
  totalPages: number;
}

export type VoterStreamEvent =
  | { type: 'meta'; currentPage: number; pageSize: number; previewCount: number }
  | { type: 'preview'; count: number }
  | { type: 'voter'; voter: VoterBrowseRecord }
  | { type: 'done'; total: number; totalPages: number; currentPage: number; pageSize: number }
  | { type: 'error'; error: string };
