'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ArrowTopRightOnSquareIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/24/outline';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';

interface PublicUserProfile {
  _id: string;
  name: string;
  email: string;
  role: string;
  constituencyAccess: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ProfilePermissions {
  isAdmin: boolean;
  canManageUsers: boolean;
  canSeeDataProcessing: boolean;
  canAccessAllConstituencies: boolean;
  canExportData: boolean;
  canManagePipeline: boolean;
}

interface AdminStats {
  totalUsers: number;
  adminUsers: number;
}

interface ProfileResponse {
  user: PublicUserProfile;
  permissions: ProfilePermissions;
  adminStats: AdminStats | null;
}

function formatDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatConstituencyAccess(value?: string) {
  if (!value || value === ALL_CONSTITUENCIES) {
    return 'All constituencies';
  }
  return value;
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (role === 'admin') return 'default';
  return 'secondary';
}

function syncLocalUser(user: PublicUserProfile) {
  localStorage.setItem('user', JSON.stringify(user));
}

const ADMIN_LINKS = [
  { href: '/dashboard/billing', label: 'Billing & usage', description: 'Server usage, invoices, and payments' },
  { href: '/dashboard/users', label: 'User management', description: 'Create, edit, import, and delete users' },
  { href: '/dashboard/audit', label: 'Audit log', description: 'Review system activity and changes' },
  { href: '/dashboard/settings', label: 'System settings', description: 'Configure console preferences' },
  { href: '/dashboard/reports', label: 'Reports', description: 'Constituency and voter analytics' },
];

export default function ProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [permissions, setPermissions] = useState<ProfilePermissions | null>(null);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const loadProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/me', { credentials: 'include' });
      if (response.status === 401) {
        router.replace('/signin');
        return;
      }
      const data = (await response.json()) as ProfileResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load profile');
      }

      setProfile(data.user);
      setPermissions(data.permissions);
      setAdminStats(data.adminStats);
      setName(data.user.name);
      setEmail(data.user.email);
      syncLocalUser(data.user);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load profile');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const isProfileDirty = useMemo(() => {
    if (!profile) return false;
    return name.trim() !== profile.name || email.trim().toLowerCase() !== profile.email;
  }, [profile, name, email]);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isProfileDirty) return;

    setIsSavingProfile(true);
    try {
      const response = await fetch('/api/me', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      setProfile(data.user);
      setPermissions(data.permissions);
      syncLocalUser(data.user);
      toast.success('Profile updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSavingPassword(true);
    try {
      const response = await fetch('/api/me/password', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password');
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update password');
    } finally {
      setIsSavingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (!profile || !permissions) {
    return (
      <div className="container mx-auto p-6">
        <p className="text-gray-500">Unable to load your profile.</p>
        <Button className="mt-4" onClick={() => void loadProfile()}>
          Retry
        </Button>
      </div>
    );
  }

  const showAdminTab = permissions.isAdmin || permissions.canManageUsers;

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Your Profile</h1>
          <p className="text-sm text-gray-500">Manage your account details and security settings.</p>
        </div>
        <div className="flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-semibold text-white">
            {profile.name?.[0]?.toUpperCase() || profile.email[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <p className="font-medium text-gray-900">{profile.name}</p>
            <p className="text-sm text-gray-500">{profile.email}</p>
          </div>
          <Badge variant={roleBadgeVariant(profile.role)} className="ml-2 capitalize">
            {profile.role}
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="account" className="space-y-6">
        <TabsList>
          <TabsTrigger value="account">Account</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          {showAdminTab ? <TabsTrigger value="admin">Admin controls</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="account">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserCircleIcon className="h-5 w-5" />
                  Account information
                </CardTitle>
                <CardDescription>Update your display name and email address.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="profile-name">Full name</Label>
                    <Input
                      id="profile-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="profile-email">Email address</Label>
                    <Input
                      id="profile-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={!isProfileDirty || isSavingProfile}>
                      {isSavingProfile ? 'Saving...' : 'Save changes'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!isProfileDirty || isSavingProfile}
                      onClick={() => {
                        setName(profile.name);
                        setEmail(profile.email);
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Access</CardTitle>
                <CardDescription>Assigned by an administrator.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-gray-500">Role</p>
                  <p className="mt-1 capitalize text-gray-900">{profile.role}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500">Constituency access</p>
                  <p className="mt-1 text-gray-900">{formatConstituencyAccess(profile.constituencyAccess)}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500">Member since</p>
                  <p className="mt-1 text-gray-900">{formatDate(profile.createdAt)}</p>
                </div>
                <div>
                  <p className="font-medium text-gray-500">Last updated</p>
                  <p className="mt-1 text-gray-900">{formatDate(profile.updatedAt)}</p>
                </div>
                {!permissions.isAdmin ? (
                  <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                    Role and constituency access can only be changed by an administrator in User Management.
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Change password</CardTitle>
                <CardDescription>Use a strong password that you do not use elsewhere.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="grid gap-2">
                    <Label htmlFor="current-password">Current password</Label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={isSavingPassword}>
                    {isSavingPassword ? 'Updating...' : 'Update password'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account security</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-gray-600">
                <p>
                  If you forgot your password, use the{' '}
                  <Link href="/forgot-password" className="font-medium text-indigo-600 hover:text-indigo-500">
                    password reset
                  </Link>{' '}
                  flow.
                </p>
                <p>Sign out from shared devices after finishing your work.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    localStorage.removeItem('isAuthenticated');
                    localStorage.removeItem('user');
                    router.push('/signin');
                  }}
                >
                  Sign out on this device
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {showAdminTab ? (
          <TabsContent value="admin">
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheckIcon className="h-5 w-5" />
                    Administrator controls
                  </CardTitle>
                  <CardDescription>
                    {permissions.isAdmin
                      ? 'Full admin access to exports, pipeline tools, and user management.'
                      : 'Management access for users in your organization.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {ADMIN_LINKS.map((link) => {
                      if (link.href === '/dashboard/users' && !permissions.canManageUsers) {
                        return null;
                      }
                      if (link.href === '/dashboard/billing' && !permissions.isAdmin) {
                        return null;
                      }
                      return (
                        <Link
                          key={link.href}
                          href={link.href}
                          className="group rounded-lg border bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium text-gray-900 group-hover:text-indigo-700">{link.label}</p>
                              <p className="mt-1 text-xs text-gray-500">{link.description}</p>
                            </div>
                            <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                          </div>
                        </Link>
                      );
                    })}
                    {permissions.canSeeDataProcessing ? (
                      <Link
                        href="/dashboard/processing"
                        className="group rounded-lg border bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-gray-900 group-hover:text-indigo-700">Data processing</p>
                            <p className="mt-1 text-xs text-gray-500">OCR, imports, and constituency pipeline tools</p>
                          </div>
                          <ArrowTopRightOnSquareIcon className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" />
                        </div>
                      </Link>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                {permissions.isAdmin && adminStats ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>User overview</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                      <div className="rounded-lg bg-gray-50 p-4 text-center">
                        <p className="text-2xl font-bold text-gray-900">{adminStats.totalUsers}</p>
                        <p className="text-xs text-gray-500">Total users</p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-4 text-center">
                        <p className="text-2xl font-bold text-gray-900">{adminStats.adminUsers}</p>
                        <p className="text-xs text-gray-500">Administrators</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : null}

                <Card>
                  <CardHeader>
                    <CardTitle>Your permissions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {[
                      ['All constituencies', permissions.canAccessAllConstituencies],
                      ['Manage users', permissions.canManageUsers],
                      ['Export data', permissions.canExportData],
                      ['Pipeline & uploads', permissions.canManagePipeline],
                      ['Data processing tab', permissions.canSeeDataProcessing],
                    ].map(([label, enabled]) => (
                      <div key={String(label)} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <span className="text-gray-700">{label}</span>
                        <Badge variant={enabled ? 'default' : 'outline'}>{enabled ? 'Yes' : 'No'}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
