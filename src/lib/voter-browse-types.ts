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
  address?: string;
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
