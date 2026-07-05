export interface PageStats {
  total: number;
  completed: number;
  processing: number;
  error: number;
  uploaded: number;
  byStatus: Record<string, number>;
  byTag: Record<string, number>;
}

export interface VoterStats {
  count: number;
  male: number;
  female: number;
}

export interface ConstituencyHomeData {
  _id: string;
  halkaName: string;
  status: 'active' | 'inactive';
  totalVoters: number;
  muslimFemale: number;
  muslimMale: number;
  qadianiFemale: number;
  qadianiMale: number;
  blockCodeCount: number;
  blockCodes: string[];
  lastUpdated: string | null;
  voters: VoterStats;
  pages: PageStats;
}
