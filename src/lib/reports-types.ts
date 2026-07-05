export interface ReportsPageStats {
  total: number;
  completed: number;
  processing: number;
  error: number;
  uploaded: number;
  pending: number;
}

export interface ReportsVoterStats {
  count: number;
  male: number;
  female: number;
}

export interface ReportsSummary {
  constituencies: number;
  activeConstituencies: number;
  blockCodes: number;
  pages: ReportsPageStats;
  voters: ReportsVoterStats;
  workProgress: {
    tracked: number;
    completionPercent: number;
    byStatus: Record<string, number>;
  };
}

export interface ReportsConstituencyRow {
  halkaName: string;
  status: string;
  blockCodeCount: number;
  estimatedVoters: number;
  muslimMale: number;
  muslimFemale: number;
  qadianiMale: number;
  qadianiFemale: number;
  voters: ReportsVoterStats;
  pages: ReportsPageStats;
  pagesByStatus: Record<string, number>;
  pagesByTag: Record<string, number>;
  workProgress: Record<string, number>;
  lastUpdated: string | null;
}

export interface ReportsBlockCodeRow {
  halkaName: string;
  blockCode: string;
  pages: number;
  pagesCompleted: number;
  pagesProcessing: number;
  pagesError: number;
  voters: ReportsVoterStats;
  workStatus: string;
  pageTags: Record<string, number>;
}

export interface ReportsOverviewResponse {
  generatedAt: string;
  scope: ReportsScope;
  summary: ReportsSummary;
  global: ReportsGlobalStats;
  constituencies: ReportsConstituencyRow[];
  blockCodes: ReportsBlockCodeRow[];
}

export interface ReportsScope {
  isAdmin: boolean;
  hasAllAccess: boolean;
  allowedHalkaName: string | null;
  userName: string;
}

export interface ReportsGlobalStats {
  pagesByStatus: Record<string, number>;
  pagesByTag: Record<string, number>;
  votersByGender: ReportsVoterStats;
  workByStatus: Record<string, number>;
}

export type ReportsStreamEvent =
  | {
      type: 'meta';
      generatedAt: string;
      scope: ReportsScope;
      availableConstituencies: string[];
      selectedConstituency: string | null;
    }
  | { type: 'summary'; summary: ReportsSummary; global: ReportsGlobalStats }
  | { type: 'voters'; voters: ReportsVoterStats; workByStatus: Record<string, number> }
  | { type: 'constituency'; row: ReportsConstituencyRow }
  | { type: 'progress'; phase: string; message: string; current?: number; total?: number }
  | { type: 'done'; phase: 'overview' | 'blocks' }
  | { type: 'error'; error: string };

export type ReportsBlockStreamEvent =
  | { type: 'meta'; totalBlocks: number }
  | { type: 'progress'; phase: string; message: string; current?: number; total?: number }
  | { type: 'blockCode'; row: ReportsBlockCodeRow }
  | { type: 'done' }
  | { type: 'error'; error: string };

export type ReportsTabId =
  | 'overview'
  | 'constituencies'
  | 'block-codes'
  | 'voters'
  | 'pages'
  | 'work-progress';

export const REPORTS_TABS: { id: ReportsTabId; label: string; description: string }[] = [
  { id: 'overview', label: 'Overview', description: 'High-level KPIs and cross-cutting charts' },
  { id: 'constituencies', label: 'Constituencies', description: 'Per-halka breakdown' },
  { id: 'block-codes', label: 'Block codes', description: 'Every block with voters, pages & work status' },
  { id: 'voters', label: 'Voters', description: 'Gender and constituency voter analytics' },
  { id: 'pages', label: 'Pages', description: 'Upload and processing pipeline stats' },
  { id: 'work-progress', label: 'Work progress', description: 'Manual QA status tracking' },
];

export const PAGE_STATUS_COLORS: Record<string, string> = {
  completed: '#10b981',
  processing: '#f59e0b',
  uploaded: '#0ea5e9',
  error: '#ef4444',
  pending: '#94a3b8',
  failed: '#dc2626',
};

export const WORK_STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  processing: '#f59e0b',
  completed: '#10b981',
  verified: '#06b6d4',
  invalid: '#ef4444',
  incomplete: '#f97316',
};

export const GENDER_COLORS = {
  male: '#6366f1',
  female: '#a855f7',
};
