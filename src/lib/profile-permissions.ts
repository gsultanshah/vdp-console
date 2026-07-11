import type { SessionUser } from '@/lib/auth';
import { canManageUsers, canSeeProcessButtons } from '@/lib/utils';
import { ALL_CONSTITUENCIES, isAdminRole } from '@/lib/user-management';

export interface ProfilePermissions {
  isAdmin: boolean;
  canManageUsers: boolean;
  canSeeDataProcessing: boolean;
  canAccessAllConstituencies: boolean;
  canExportData: boolean;
  canManagePipeline: boolean;
}

export function buildProfilePermissions(user: SessionUser): ProfilePermissions {
  const isAdmin = isAdminRole(user.role);
  return {
    isAdmin,
    canManageUsers: canManageUsers(user.role),
    canSeeDataProcessing: canSeeProcessButtons(user.email),
    canAccessAllConstituencies: isAdmin || user.constituencyAccess === ALL_CONSTITUENCIES,
    canExportData: isAdmin,
    canManagePipeline: isAdmin,
  };
}
