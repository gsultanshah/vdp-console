export interface UserRecord {
  _id: string;
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  constituencyAccess: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ConstituencyOption {
  _id: string;
  halkaName: string;
  label?: string;
  blockCodes?: string[];
}

export interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  constituencyAccess: string;
}

export interface ImportSummary {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
}

export type UsersPageTab = 'users' | 'mobile' | 'mobile-usage';
export type RoleFilter = 'all' | 'user' | 'admin';
