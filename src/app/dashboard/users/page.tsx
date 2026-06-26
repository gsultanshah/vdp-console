'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { canManageUsers } from '@/lib/utils';
import { ALL_CONSTITUENCIES } from '@/lib/user-management';

interface UserRecord {
  _id: string;
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  constituencyAccess: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ConstituencyOption {
  _id: string;
  halkaName: string;
}

interface UserFormState {
  name: string;
  email: string;
  password: string;
  role: 'user' | 'admin';
  constituencyAccess: string;
}

interface ImportSummary {
  totalRows: number;
  created: number;
  skipped: number;
  errors: number;
}

type UserTab = 'all' | 'admin';

const emptyForm: UserFormState = {
  name: '',
  email: '',
  password: '',
  role: 'user',
  constituencyAccess: ALL_CONSTITUENCIES,
};

function formatDate(value?: string) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleString();
}

function formatConstituencyAccess(value?: string) {
  if (!value || value === ALL_CONSTITUENCIES) {
    return 'All constituencies';
  }
  return value;
}

function isDeletable(user: UserRecord) {
  return user.role !== 'admin';
}

export default function UserManagementPage() {
  const router = useRouter();
  const importInputRef = useRef<HTMLInputElement>(null);
  const lastSelectedIndexRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<UserTab>('all');
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
    if (!response.ok) {
      return;
    }
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

  const searchedUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return users;
    }
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query) ||
        user.constituencyAccess.toLowerCase().includes(query)
    );
  }, [searchQuery, users]);

  const tabUsers = useMemo(() => {
    if (activeTab === 'admin') {
      return searchedUsers.filter((user) => user.role === 'admin');
    }
    return searchedUsers;
  }, [activeTab, searchedUsers]);

  const deletableInView = useMemo(
    () => tabUsers.filter((user) => isDeletable(user)),
    [tabUsers]
  );

  const selectedUsers = useMemo(
    () => users.filter((user) => selectedIds.has(user._id)),
    [selectedIds, users]
  );

  const selectedDeletableUsers = useMemo(
    () => selectedUsers.filter((user) => isDeletable(user)),
    [selectedUsers]
  );

  const allDeletableSelected =
    deletableInView.length > 0 &&
    deletableInView.every((user) => selectedIds.has(user._id));

  const adminCount = useMemo(() => users.filter((user) => user.role === 'admin').length, [users]);

  const handleTabChange = (value: string) => {
    setActiveTab(value as UserTab);
    setSelectedIds(new Set());
    lastSelectedIndexRef.current = null;
  };

  const toggleSelectAll = () => {
    if (allDeletableSelected) {
      setSelectedIds((current) => {
        const next = new Set(current);
        deletableInView.forEach((user) => next.delete(user._id));
        return next;
      });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      deletableInView.forEach((user) => next.add(user._id));
      return next;
    });
  };

  const handleRowSelect = (user: UserRecord, index: number, shiftKey: boolean) => {
    if (!isDeletable(user)) {
      if (shiftKey) {
        return;
      }
      toast.error('Admin users cannot be selected for deletion');
      return;
    }

    if (shiftKey && lastSelectedIndexRef.current !== null) {
      const start = Math.min(lastSelectedIndexRef.current, index);
      const end = Math.max(lastSelectedIndexRef.current, index);
      setSelectedIds((current) => {
        const next = new Set(current);
        for (let i = start; i <= end; i += 1) {
          const rowUser = tabUsers[i];
          if (rowUser && isDeletable(rowUser)) {
            next.add(rowUser._id);
          }
        }
        return next;
      });
      return;
    }

    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(user._id)) {
        next.delete(user._id);
      } else {
        next.add(user._id);
      }
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

  const closeDialogs = () => {
    setIsAddOpen(false);
    setEditingUser(null);
    setForm(emptyForm);
  };

  const closeImportDialog = () => {
    setIsImportOpen(false);
    setImportSummary(null);
    setImportErrors([]);
    setImportConstituencyAccess(ALL_CONSTITUENCIES);
    if (importInputRef.current) {
      importInputRef.current.value = '';
    }
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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      setUsers((current) => [data.user, ...current]);
      toast.success('User created');
      closeDialogs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingUser) {
      return;
    }

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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update user');
      }

      setUsers((current) =>
        current.map((user) => (user._id === editingUser._id ? data.user : user))
      );
      toast.success('User updated');
      closeDialogs();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update user');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedDeletableUsers.length) {
      toast.error('Select at least one non-admin user to delete');
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

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete users');
      }

      const deletedIds = new Set(selectedDeletableUsers.map((user) => user._id));
      setUsers((current) => current.filter((user) => !deletedIds.has(user._id)));
      setSelectedIds(new Set());
      lastSelectedIndexRef.current = null;
      setIsDeleteConfirmOpen(false);

      toast.success(`Permanently deleted ${data.deleted} user(s)`);
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
      toast.error('Choose an Excel or CSV file');
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

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Import failed');
      }

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

  const renderConstituencyField = (isEdit: boolean) => (
    <div className="grid gap-2">
      <Label htmlFor={`${isEdit ? 'edit' : 'add'}-constituency`}>Constituency access</Label>
      <Select
        value={form.role === 'admin' ? ALL_CONSTITUENCIES : form.constituencyAccess}
        disabled={form.role === 'admin'}
        onValueChange={(value) =>
          setForm((current) => ({ ...current, constituencyAccess: value }))
        }
      >
        <SelectTrigger id={`${isEdit ? 'edit' : 'add'}-constituency`}>
          <SelectValue placeholder="Select constituency access" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_CONSTITUENCIES}>All constituencies</SelectItem>
          {constituencies.map((constituency) => (
            <SelectItem key={constituency._id} value={constituency.halkaName}>
              {constituency.halkaName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {form.role === 'admin' && (
        <p className="text-xs text-gray-500">Admin users always have access to all constituencies.</p>
      )}
    </div>
  );

  const renderFormFields = (isEdit: boolean) => (
    <div className="grid gap-4 py-4">
      <div className="grid gap-2">
        <Label htmlFor={`${isEdit ? 'edit' : 'add'}-name`}>Name</Label>
        <Input
          id={`${isEdit ? 'edit' : 'add'}-name`}
          value={form.name}
          onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
          placeholder="Enter user name"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${isEdit ? 'edit' : 'add'}-email`}>Email</Label>
        <Input
          id={`${isEdit ? 'edit' : 'add'}-email`}
          type="email"
          value={form.email}
          onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
          placeholder="Enter user email"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${isEdit ? 'edit' : 'add'}-password`}>Password</Label>
        <Input
          id={`${isEdit ? 'edit' : 'add'}-password`}
          type="text"
          value={form.password}
          onChange={(e) => setForm((current) => ({ ...current, password: e.target.value }))}
          placeholder="Enter password"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${isEdit ? 'edit' : 'add'}-role`}>Role</Label>
        <Select
          value={form.role}
          onValueChange={(value: 'user' | 'admin') =>
            setForm((current) => ({
              ...current,
              role: value,
              constituencyAccess: value === 'admin' ? ALL_CONSTITUENCIES : current.constituencyAccess,
            }))
          }
        >
          <SelectTrigger id={`${isEdit ? 'edit' : 'add'}-role`}>
            <SelectValue placeholder="Select role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user">User</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {renderConstituencyField(isEdit)}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving...' : isEdit ? 'Update user' : 'Create user'}
      </Button>
    </div>
  );

  const renderUserTable = () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <input
              type="checkbox"
              checked={allDeletableSelected}
              disabled={deletableInView.length === 0}
              onChange={toggleSelectAll}
              aria-label="Select all deletable users"
            />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Password</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Constituency</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Updated</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tabUsers.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-gray-500">
              No users found.
            </TableCell>
          </TableRow>
        ) : (
          tabUsers.map((user, index) => {
            const selected = selectedIds.has(user._id);
            const deletable = isDeletable(user);

            return (
              <TableRow
                key={user._id}
                className={selected ? 'bg-indigo-50 cursor-pointer' : 'cursor-pointer'}
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('button, input, a')) {
                    return;
                  }
                  handleRowSelect(user, index, event.shiftKey);
                }}
              >
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!deletable}
                    onChange={() => handleRowSelect(user, index, false)}
                    aria-label={`Select ${user.name}`}
                  />
                </TableCell>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell className="font-mono text-sm">{user.password}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>{formatConstituencyAccess(user.constituencyAccess)}</TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell>{formatDate(user.updatedAt)}</TableCell>
                <TableCell onClick={(event) => event.stopPropagation()}>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(user)}>
                      Edit
                    </Button>
                    {!deletable && <span className="px-2 text-xs text-gray-400">Protected</span>}
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Click rows to select. Shift+click to select a range. Admin users cannot be deleted.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedDeletableUsers.length > 0 && (
            <Button variant="destructive" onClick={() => setIsDeleteConfirmOpen(true)}>
              Delete selected ({selectedDeletableUsers.length})
            </Button>
          )}
          <Button variant="outline" asChild>
            <a href="/dashboard/help/user-management">Import help</a>
          </Button>
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            Import from Excel
          </Button>
          <Button onClick={openCreateDialog}>Add New User</Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search by name, email, role, or constituency..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="all">All Users ({searchedUsers.length})</TabsTrigger>
          <TabsTrigger value="admin">Admin ({adminCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>All Users</CardTitle>
              {selectedIds.size > 0 && (
                <span className="text-sm text-gray-500">{selectedIds.size} selected</span>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading users...</p>
              ) : (
                renderUserTable()
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Admin Users</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-gray-500">Loading users...</p>
              ) : (
                renderUserTable()
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={(open) => !open && closeDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate}>{renderFormFields(false)}</form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingUser)} onOpenChange={(open) => !open && closeDialogs()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate}>{renderFormFields(true)}</form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm permanent deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              Permanently delete {selectedDeletableUsers.length} user(s)? This cannot be undone.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md bg-gray-50 p-3 text-sm">
              {selectedDeletableUsers.map((user) => (
                <li key={user._id}>
                  {user.name} ({user.email})
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" disabled={isDeleting} onClick={handleBulkDelete}>
                {isDeleting ? 'Deleting...' : 'Delete permanently'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isImportOpen} onOpenChange={(open) => !open && closeImportDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Users from Excel</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleImport} className="space-y-4 py-2">
            <p className="text-sm text-gray-500">
              Upload `.xls`, `.xlsx`, or `.csv` with columns:{' '}
              <code className="rounded bg-gray-100 px-1">name</code>,{' '}
              <code className="rounded bg-gray-100 px-1">email</code>,{' '}
              <code className="rounded bg-gray-100 px-1">password</code>. Optional:{' '}
              <code className="rounded bg-gray-100 px-1">role</code>,{' '}
              <code className="rounded bg-gray-100 px-1">constituency</code>.{' '}
              <a
                href="/dashboard/help/user-management"
                className="font-medium text-indigo-600 hover:text-indigo-800"
              >
                View import help
              </a>
            </p>

            <div className="flex flex-wrap gap-2">
              <a
                href="/api/users/import/sample"
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Download sample .xlsx
              </a>
              <a
                href="/samples/user-import-sample.csv"
                download
                className="inline-flex items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Download sample .csv
              </a>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="import-constituency">Default constituency (if row is blank)</Label>
              <Select
                value={importConstituencyAccess}
                onValueChange={setImportConstituencyAccess}
              >
                <SelectTrigger id="import-constituency">
                  <SelectValue placeholder="Select default constituency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CONSTITUENCIES}>All constituencies</SelectItem>
                  {constituencies.map((constituency) => (
                    <SelectItem key={constituency._id} value={constituency.halkaName}>
                      {constituency.halkaName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="import-file">Excel / CSV file</Label>
              <Input
                id="import-file"
                ref={importInputRef}
                type="file"
                accept=".xls,.xlsx,.csv"
              />
            </div>

            {importSummary && (
              <div className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
                <p>Total rows: {importSummary.totalRows}</p>
                <p>Created: {importSummary.created}</p>
                <p>Skipped: {importSummary.skipped}</p>
                <p>Errors: {importSummary.errors}</p>
              </div>
            )}

            {importErrors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
                {importErrors.map((error) => (
                  <p key={error}>{error}</p>
                ))}
              </div>
            )}

            <Button type="submit" disabled={isImporting}>
              {isImporting ? 'Importing...' : 'Import users'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
