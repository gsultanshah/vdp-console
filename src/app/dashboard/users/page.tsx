'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChartBarIcon,
  DevicePhoneMobileIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { MobileAccessCodesPanel } from '@/components/users/MobileAccessCodesPanel';
import { MobileUsageLogPanel } from '@/components/users/MobileUsageLogPanel';
import { SelectionActionBar } from '@/components/users/SelectionActionBar';
import { UserDeleteDialog } from '@/components/users/UserDeleteDialog';
import { UserFormDialog } from '@/components/users/UserFormDialog';
import { UserImportDialog } from '@/components/users/UserImportDialog';
import { UsersList } from '@/components/users/UsersList';
import { UsersStatsBar } from '@/components/users/UsersStatsBar';
import { UsersToolbar } from '@/components/users/UsersToolbar';
import type {
  ConstituencyOption,
  ImportSummary,
  RoleFilter,
  UserFormState,
  UserRecord,
  UsersPageTab,
} from '@/components/users/types';
import { isDeletable } from '@/components/users/user-utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canManageUsers } from '@/lib/utils';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';
import { cn } from '@/lib/utils';

const emptyForm: UserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'user',
  constituencyAccess: ALL_CONSTITUENCIES,
};

const pageTabs: Array<{ id: UsersPageTab; label: string; icon: typeof UsersIcon; description: string }> = [
  {
    id: 'users',
    label: 'Web users',
    icon: UsersIcon,
    description: 'Campaign managers & data team logins',
  },
  {
    id: 'mobile',
    label: 'Mobile logins',
    icon: DevicePhoneMobileIcon,
    description: '6-digit codes for field workers',
  },
  {
    id: 'mobile-usage',
    label: 'Field activity',
    icon: ChartBarIcon,
    description: 'Searches, prints, and downloads',
  },
];

export default function UserManagementPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<UsersPageTab>('users');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [constituencies, setConstituencies] = useState<ConstituencyOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [importConstituencyAccess, setImportConstituencyAccess] = useState(ALL_CONSTITUENCIES);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const loadConstituencies = useCallback(async () => {
    const response = await fetch('/api/constituency?activeOnly=true');
    if (!response.ok) return;
    const data = (await response.json()) as ConstituencyOption[];
    setConstituencies(data);
  }, []);

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/users', { credentials: 'include' });
      const data = await response.json();

      if (response.status === 403) {
        toast.error('You do not have permission to manage users');
        router.replace('/dashboard');
        return;
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load users');
      }

      setUsers(data);
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.replace('/signin');
      return;
    }

    try {
      const currentUser = JSON.parse(userStr) as { role?: string };
      if (!canManageUsers(currentUser.role)) {
        toast.error('You do not have permission to manage users');
        router.replace('/dashboard');
        return;
      }
    } catch {
      router.replace('/signin');
      return;
    }

    void loadConstituencies();
    void loadUsers();
  }, [loadConstituencies, loadUsers, router]);

  const filteredUsers = useMemo(() => {
    let list = users;

    if (roleFilter === 'admin') {
      list = list.filter((user) => user.role === 'admin');
    } else if (roleFilter === 'user') {
      list = list.filter((user) => user.role === 'user');
    }

    const query = searchQuery.trim().toLowerCase();
    if (!query) return list;

    return list.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query) ||
        user.constituencyAccess.toLowerCase().includes(query)
    );
  }, [roleFilter, searchQuery, users]);

  const adminCount = useMemo(() => users.filter((user) => user.role === 'admin').length, [users]);
  const regularCount = users.length - adminCount;

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedIds.has(user._id)),
    [selectedIds, users]
  );

  const selectedDeletableUsers = useMemo(
    () => selectedUsers.filter((user) => isDeletable(user)),
    [selectedUsers]
  );

  const handleTabChange = (value: string) => {
    setActiveTab(value as UsersPageTab);
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
  };

  const handleRowSelect = (user: UserRecord, index: number, shiftKey: boolean) => {
    if (!isDeletable(user)) {
      if (!shiftKey) toast.error('Admin users cannot be selected for deletion');
      return;
    }

    if (shiftKey && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      setSelectedIds((current) => {
        const next = new Set(current);
        for (let i = start; i <= end; i += 1) {
          const rowUser = filteredUsers[i];
          if (rowUser && isDeletable(rowUser)) next.add(rowUser._id);
        }
        return next;
      });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(user._id)) next.delete(user._id);
      else next.add(user._id);
      return next;
    });
    lastSelectedIndexRef.current = index;
  };

  const openCreateDialog = () => {
    setForm(emptyForm);
    setIsAddOpen(true);
  };

  const openEditDialog = (user: UserRecord) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      password: user.password,
      role: user.role,
      constituencyAccess: user.constituencyAccess || ALL_CONSTITUENCIES,
    });
  };

  const closeFormDialog = () => {
    setIsAddOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  };

  const closeImportDialog = () => {
    setIsImportOpen(false);
    setImportSummary(null);
    setImportErrors([]);
    setImportConstituencyAccess(ALL_CONSTITUENCIES);
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Name, email, and password are required');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create user');

      setUsers((current) => [data.user, ...current]);
      toast.success(`${form.name} added`);
      closeFormDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      toast.error('Name, email, and password are required');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/users/${editingUser._id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update user');

      setUsers((current) => current.map((user) => (user._id === editingUser._id ? data.user : user)));
      toast.success('Changes saved');
      closeFormDialog();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedDeletableUsers.length) {
      toast.error('Select at least one team member to delete');
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch('/api/users/bulk-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedDeletableUsers.map((user) => user._id) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete users');

      const deletedIds = new Set(selectedDeletableUsers.map((user) => user._id));
      setUsers((current) => current.filter((user) => !deletedIds.has(user._id)));
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
      setIsDeleteConfirmOpen(false);

      toast.success(`Removed ${data.deleted} user(s)`);
      if (Array.isArray(data.blocked) && data.blocked.length > 0) {
        toast.error(`${data.blocked.length} selected user(s) could not be deleted`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete users');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = importInputRef.current?.files?.[0];
    if (!file) {
      toast.error('Choose a spreadsheet file first');
      return;
    }

    setIsImporting(true);
    setImportSummary(null);
    setImportErrors([]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('constituencyAccess', importConstituencyAccess);

      const response = await fetch('/api/users/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.details || data.error || 'Import failed');

      setImportSummary(data.summary as ImportSummary);
      setImportErrors(Array.isArray(data.errors) ? data.errors : []);

      if (Array.isArray(data.created) && data.created.length > 0) {
        setUsers((current) => [...data.created, ...current]);
      }

      toast.success(`Imported ${data.summary.created} user(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const openDeleteForUser = (user: UserRecord) => {
    setSelectedIds(new Set([user._id]));
    setIsDeleteConfirmOpen(true);
  };

  return (
    <div className="min-h-screen bg-gray-50/80 pb-24">
      <div className="border-b border-gray-100 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">People & access</h1>
            <p className="mt-2 text-base text-gray-600">
              Manage who can sign into the web console and who gets mobile field access. Everything
              your campaign team needs in one place.
            </p>
          </div>

          <div className="mt-8">
            <UsersStatsBar
              totalUsers={users.length}
              adminCount={adminCount}
              regularCount={regularCount}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-6 flex h-auto w-full flex-col gap-2 bg-transparent p-0 sm:flex-row sm:items-stretch">
            {pageTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className={cn(
                    'flex flex-1 items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm',
                    'data-[state=active]:border-indigo-300 data-[state=active]:bg-indigo-50 data-[state=active]:shadow-md',
                    'data-[state=inactive]:hover:border-gray-300'
                  )}
                >
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{tab.label}</span>
                    <span className="block text-xs text-gray-500">{tab.description}</span>
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value="users" className="mt-0 space-y-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6">
              <UsersToolbar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                resultCount={filteredUsers.length}
                onAddUser={openCreateDialog}
                onImport={() => setIsImportOpen(true)}
              />

              <div className="mt-6">
                <UsersList
                  users={filteredUsers}
                  selectedIds={selectedIds}
                  isLoading={isLoading}
                  searchQuery={searchQuery}
                  onSelect={handleRowSelect}
                  onEdit={openEditDialog}
                  onDelete={openDeleteForUser}
                  onAddUser={openCreateDialog}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="mobile" className="mt-0">
            <MobileAccessCodesPanel constituencies={constituencies} />
          </TabsContent>

          <TabsContent value="mobile-usage" className="mt-0">
            <MobileUsageLogPanel constituencies={constituencies} />
          </TabsContent>
        </Tabs>
      </div>

      <SelectionActionBar
        count={selectedDeletableUsers.length}
        onClear={() => {
          setSelectedIds(new Set());
          lastSelectedIndexRef.current = null;
        }}
        onDelete={() => setIsDeleteConfirmOpen(true)}
      />

      <UserFormDialog
        open={isAddOpen}
        mode="create"
        form={form}
        constituencies={constituencies}
        isSaving={isSaving}
        onOpenChange={(open) => !open && closeFormDialog()}
        onChange={setForm}
        onSubmit={handleCreate}
      />

      <UserFormDialog
        open={Boolean(editingUser)}
        mode="edit"
        form={form}
        constituencies={constituencies}
        isSaving={isSaving}
        onOpenChange={(open) => !open && closeFormDialog()}
        onChange={setForm}
        onSubmit={handleUpdate}
      />

      <UserDeleteDialog
        open={isDeleteConfirmOpen}
        users={selectedDeletableUsers}
        isDeleting={isDeleting}
        onOpenChange={setIsDeleteConfirmOpen}
        onConfirm={handleBulkDelete}
      />

      <UserImportDialog
        open={isImportOpen}
        constituencies={constituencies}
        importConstituencyAccess={importConstituencyAccess}
        importSummary={importSummary}
        importErrors={importErrors}
        isImporting={isImporting}
        fileInputRef={importInputRef}
        onOpenChange={(open) => !open && closeImportDialog()}
        onConstituencyChange={setImportConstituencyAccess}
        onSubmit={handleImport}
      />
    </div>
  );
}
