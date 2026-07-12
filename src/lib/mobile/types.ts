export interface MobileBrandingColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  onPrimary: string;
  onSurface: string;
}

export interface MobileBrandingTemplate {
  _id?: string;
  name: string;
  description?: string;
  isDefault: boolean;
  logoUrl: string | null;
  colors: MobileBrandingColors;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface MobileAccessCodeBranding {
  templateId?: string | null;
  logoUrl?: string | null;
  colors?: Partial<MobileBrandingColors>;
  appTitle?: string;
}

export interface MobileAccessCode {
  _id?: string;
  code: string;
  label: string;
  halkaName: string;
  active: boolean;
  branding: MobileAccessCodeBranding;
  createdBy: string;
  createdByName: string;
  createdAt?: Date;
  updatedAt?: Date;
  lastUsedAt?: Date | null;
}

export interface MobileSession {
  _id?: string;
  token: string;
  type: 'user' | 'admin';
  accessCode?: string;
  halkaName?: string;
  userId?: string;
  userEmail?: string;
  userName?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface ResolvedMobileBranding {
  templateId: string | null;
  templateName: string;
  logoUrl: string | null;
  appTitle: string;
  colors: MobileBrandingColors;
}

export interface MobileSyncVoter {
  _id: string;
  cnic: string;
  name: string;
  fatherName: string;
  age: string;
  address: string;
  previousAddress: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  gender: string;
  religion: string;
  profession: string;
  halkaName: string;
  imageUrl: string;
  rowY: number;
  rowHeight: number;
  pollingStation: string;
  statisticalCode: string;
  rowCropUrl: string | null;
}

export interface MobileSyncBundle {
  version: number;
  type: 'block' | 'constituency';
  halkaName: string;
  blockCode: string | null;
  syncedAt: string;
  voterCount: number;
  blockCodes: string[];
  voters: MobileSyncVoter[];
  pollingScheme: Record<string, unknown>[];
  parchiDesign: Record<string, unknown> | null;
  branding: ResolvedMobileBranding;
}

export const DEFAULT_MOBILE_BRANDING: MobileBrandingColors = {
  primary: '#6D28D9',
  secondary: '#C026D3',
  accent: '#F59E0B',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  onPrimary: '#FFFFFF',
  onSurface: '#0F172A',
};

export const MOBILE_SYNC_CHUNK_SIZE = 200;

export const MOBILE_SYNC_PROJECTION = {
  _id: 1,
  cnic: 1,
  name: 1,
  fatherName: 1,
  age: 1,
  address: 1,
  previousAddress: 1,
  blockCode: 1,
  silsilaNo: 1,
  gharanaNo: 1,
  gender: 1,
  religion: 1,
  profession: 1,
  halkaName: 1,
  imageUrl: 1,
  rowY: 1,
  rowHeight: 1,
  reproduction: 1,
} as const;
