'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ConstituencyOption {
  _id: string;
  halkaName: string;
  label?: string;
  blockCodes?: string[];
}

interface BrandingTemplate {
  _id: string;
  name: string;
  isDefault: boolean;
}

interface MobileAccessCode {
  _id: string;
  code: string;
  label: string;
  name?: string;
  phone?: string;
  address?: string;
  comments?: string;
  halkaName: string;
  active: boolean;
  selectAllBlockCodes?: boolean;
  blockCodes?: string[];
  branding?: {
    templateId?: string | null;
    appTitle?: string;
  };
  createdByName?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
}

interface ImportSummary {
  totalRows: number;
  created: number;
  errors: number;
}

interface MobileAccessCodesPanelProps {
  constituencies: ConstituencyOption[];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function displayName(code: MobileAccessCode) {
  return code.name?.trim() || code.label?.trim() || '—';
}

function formatBlockAccess(code: MobileAccessCode) {
  if (code.selectAllBlockCodes !== false) {
    return 'All block codes';
  }
  const codes = code.blockCodes ?? [];
  if (codes.length === 0) return 'No block codes';
  if (codes.length <= 3) return codes.join(', ');
  return `${codes.slice(0, 3).join(', ')} +${codes.length - 3}`;
}

export function MobileAccessCodesPanel({ constituencies }: MobileAccessCodesPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [codes, setCodes] = useState<MobileAccessCode[]>([]);
  const [templates, setTemplates] = useState<BrandingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [filterHalka, setFilterHalka] = useState<string>('all');
  const [halkaName, setHalkaName] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [comments, setComments] = useState('');
  const [label, setLabel] = useState('');
  const [appTitle, setAppTitle] = useState('');
  const [templateId, setTemplateId] = useState<string>('default');
  const [selectAllBlockCodes, setSelectAllBlockCodes] = useState(true);
  const [selectedBlockCodes, setSelectedBlockCodes] = useState<string[]>([]);
  const [availableBlockCodes, setAvailableBlockCodes] = useState<string[]>([]);
  const [isLoadingBlocks, setIsLoadingBlocks] = useState(false);
  const [editingCode, setEditingCode] = useState<MobileAccessCode | null>(null);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [codesRes, templatesRes] = await Promise.all([
        fetch('/api/mobile/admin/access-codes', { credentials: 'include' }),
        fetch('/api/mobile/admin/branding-templates', { credentials: 'include' }),
      ]);

      if (!codesRes.ok) {
        const data = await codesRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load mobile access codes');
      }

      const codesData = (await codesRes.json()) as { codes: MobileAccessCode[] };
      setCodes(codesData.codes ?? []);

      if (templatesRes.ok) {
        const templatesData = (await templatesRes.json()) as { templates: BrandingTemplate[] };
        const list = templatesData.templates ?? [];
        setTemplates(list);
        const defaultTemplate = list.find((item) => item.isDefault) ?? list[0];
        if (defaultTemplate) {
          setTemplateId((current) => (current === 'default' ? defaultTemplate._id : current));
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load mobile logins');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!halkaName && constituencies.length > 0) {
      setHalkaName(constituencies[0].halkaName);
    }
  }, [constituencies, halkaName]);

  useEffect(() => {
    if (!halkaName) {
      setAvailableBlockCodes([]);
      return;
    }

    let cancelled = false;
    const loadBlocks = async () => {
      setIsLoadingBlocks(true);
      try {
        const fromConstituency = constituencies.find((item) => item.halkaName === halkaName)?.blockCodes;
        if (fromConstituency && fromConstituency.length > 0) {
          if (!cancelled) {
            setAvailableBlockCodes([...fromConstituency].map(String).sort());
          }
          return;
        }

        const response = await fetch(
          `/api/constituency/overview?halkaName=${encodeURIComponent(halkaName)}`,
          { credentials: 'include' }
        );
        if (!response.ok) {
          if (!cancelled) setAvailableBlockCodes([]);
          return;
        }
        const data = (await response.json()) as { blockCodes?: string[] };
        if (!cancelled) {
          setAvailableBlockCodes((data.blockCodes ?? []).map(String).sort());
        }
      } catch {
        if (!cancelled) setAvailableBlockCodes([]);
      } finally {
        if (!cancelled) setIsLoadingBlocks(false);
      }
    };

    void loadBlocks();
    return () => {
      cancelled = true;
    };
  }, [constituencies, halkaName]);

  useEffect(() => {
    if (editingCode) {
      return;
    }
    setSelectedBlockCodes([]);
    setSelectAllBlockCodes(true);
  }, [halkaName, editingCode]);

  const filteredCodes = useMemo(() => {
    if (filterHalka === 'all') return codes;
    return codes.filter((code) => code.halkaName === filterHalka);
  }, [codes, filterHalka]);

  const resetCreateForm = () => {
    setName('');
    setPhone('');
    setAddress('');
    setComments('');
    setLabel('');
    setAppTitle('');
    setSelectAllBlockCodes(true);
    setSelectedBlockCodes([]);
    setEditingCode(null);
  };

  const toggleBlockCode = (blockCode: string) => {
    setSelectedBlockCodes((current) =>
      current.includes(blockCode)
        ? current.filter((code) => code !== blockCode)
        : [...current, blockCode].sort()
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!halkaName) {
      toast.error('Select a constituency');
      return;
    }
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!selectAllBlockCodes && selectedBlockCodes.length === 0) {
      toast.error('Select at least one block code, or allow all block codes');
      return;
    }

    setIsCreating(true);
    try {
      const branding: Record<string, string> = {};
      if (appTitle.trim()) branding.appTitle = appTitle.trim();
      if (templateId && templateId !== 'default') branding.templateId = templateId;

      const payload = {
        halkaName,
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        comments: comments.trim() || undefined,
        label: label.trim() || name.trim(),
        branding: Object.keys(branding).length > 0 ? branding : undefined,
        selectAllBlockCodes,
        blockCodes: selectAllBlockCodes ? [] : selectedBlockCodes,
      };

      const response = await fetch('/api/mobile/admin/access-codes', {
        method: editingCode ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          editingCode
            ? {
                id: editingCode._id,
                name: payload.name,
                phone: payload.phone,
                address: payload.address,
                comments: payload.comments,
                label: payload.label,
                branding: payload.branding,
                selectAllBlockCodes: payload.selectAllBlockCodes,
                blockCodes: payload.blockCodes,
              }
            : payload
        ),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${editingCode ? 'update' : 'create'} mobile login code`);
      }

      const saved = data.code as MobileAccessCode;
      setCodes((current) =>
        editingCode
          ? current.map((item) => (item._id === saved._id ? saved : item))
          : [saved, ...current]
      );
      resetCreateForm();
      toast.success(
        editingCode
          ? `Updated login ${saved.code}`
          : `Created login ${saved.code} for ${displayName(saved)}`
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save mobile login');
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (code: MobileAccessCode) => {
    setEditingCode(code);
    setHalkaName(code.halkaName);
    setName(code.name ?? '');
    setPhone(code.phone ?? '');
    setAddress(code.address ?? '');
    setComments(code.comments ?? '');
    setLabel(code.label ?? '');
    setAppTitle(code.branding?.appTitle ?? '');
    setTemplateId(code.branding?.templateId || 'default');
    setSelectAllBlockCodes(code.selectAllBlockCodes !== false);
    setSelectedBlockCodes(code.blockCodes ?? []);
  };

  const handleImport = async (file: File) => {
    if (!halkaName) {
      toast.error('Select a default constituency for rows without one');
      return;
    }

    setIsImporting(true);
    setImportSummary(null);
    setImportErrors([]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('halkaName', halkaName);

      const response = await fetch('/api/mobile/admin/access-codes/import', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Import failed');
      }

      const created = (data.created ?? []) as MobileAccessCode[];
      if (created.length > 0) {
        setCodes((current) => [...created, ...current]);
      }

      setImportSummary(data.summary as ImportSummary);
      setImportErrors((data.errors ?? []) as string[]);
      toast.success(`Imported ${data.summary?.created ?? 0} mobile login code(s)`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleToggleActive = async (code: MobileAccessCode, active: boolean) => {
    try {
      const response = await fetch('/api/mobile/admin/access-codes', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: code._id, active }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update mobile login');
      }

      setCodes((current) =>
        current.map((item) => (item._id === code._id ? (data.code as MobileAccessCode) : item)),
      );
      toast.success(active ? `Login ${code.code} enabled` : `Login ${code.code} disabled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update mobile login');
    }
  };

  const handleDeleteCode = async (code: MobileAccessCode) => {
    if (
      !confirm(
        `Delete mobile login ${code.code} (${displayName(code)})? The login will stop working and leave the active list. Data is kept.`
      )
    ) {
      return;
    }

    try {
      const response = await fetch(`/api/mobile/admin/access-codes?id=${encodeURIComponent(code._id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete mobile login');
      }

      setCodes((current) => current.filter((item) => item._id !== code._id));
      if (editingCode?._id === code._id) {
        resetCreateForm();
      }
      toast.success(`Deleted login ${code.code}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete mobile login');
    }
  };

  const copyCode = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Login code copied');
    } catch {
      toast.error('Could not copy code');
    }
  };

  const sampleUrl = halkaName
    ? `/api/mobile/admin/access-codes/import/sample?halkaName=${encodeURIComponent(halkaName)}`
    : '/api/mobile/admin/access-codes/import/sample';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{editingCode ? `Edit mobile login ${editingCode.code}` : 'Create mobile field login'}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            Generate a 6-digit code for the VDP mobile field app. Optionally limit which block codes
            the field worker can download and search.
          </p>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mobile-halka">Constituency</Label>
              <Select
                value={halkaName}
                onValueChange={setHalkaName}
                disabled={Boolean(editingCode)}
              >
                <SelectTrigger id="mobile-halka">
                  <SelectValue placeholder="Select constituency" />
                </SelectTrigger>
                <SelectContent>
                  {constituencies.map((constituency) => (
                    <SelectItem key={constituency._id} value={constituency.halkaName}>
                      {constituency.label && constituency.label !== constituency.halkaName
                        ? `${constituency.halkaName} · ${constituency.label}`
                        : constituency.halkaName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-name">Name</Label>
              <Input
                id="mobile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Field worker name"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-phone">Phone</Label>
              <Input
                id="mobile-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="03001234567"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-address">Address</Label>
              <Input
                id="mobile-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Area / ward / village"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="mobile-comments">Comments (optional)</Label>
              <Input
                id="mobile-comments"
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                placeholder="Shift, team notes, etc."
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-label">Login label (optional)</Label>
              <Input
                id="mobile-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Defaults to name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-template">Branding template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="mobile-template">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">VDP Default</SelectItem>
                  {templates.map((template) => (
                    <SelectItem key={template._id} value={template._id}>
                      {template.isDefault ? `${template.name} (default)` : template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="mobile-app-title">App title (optional)</Label>
              <Input
                id="mobile-app-title"
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                placeholder="e.g. LA39 Voters"
              />
            </div>

            <div className="md:col-span-2 space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Block code access</div>
                  <p className="text-xs text-gray-500">
                    Allow all block codes in this constituency, or only selected ones for download
                    and online/offline search.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">All</span>
                  <Switch
                    checked={selectAllBlockCodes}
                    onCheckedChange={(checked) => {
                      setSelectAllBlockCodes(checked);
                      if (checked) setSelectedBlockCodes([]);
                    }}
                    aria-label="Allow all block codes"
                  />
                </div>
              </div>

              {!selectAllBlockCodes ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>
                      {isLoadingBlocks
                        ? 'Loading block codes…'
                        : `${selectedBlockCodes.length} selected · ${availableBlockCodes.length} available`}
                    </span>
                    {availableBlockCodes.length > 0 ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedBlockCodes(availableBlockCodes)}
                        >
                          Select all listed
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedBlockCodes([])}
                        >
                          Clear
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {availableBlockCodes.length === 0 && !isLoadingBlocks ? (
                    <p className="text-sm text-amber-700">
                      No block codes found for this constituency. Add them on the Constituency page,
                      or paste codes below.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto rounded border bg-gray-50 p-2">
                      <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                        {availableBlockCodes.map((blockCode) => {
                          const checked = selectedBlockCodes.includes(blockCode);
                          return (
                            <label
                              key={blockCode}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-white"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleBlockCode(blockCode)}
                              />
                              <span className="font-mono">{blockCode}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid gap-2">
                    <Label htmlFor="mobile-block-codes-manual">Extra block codes (comma/newline separated)</Label>
                    <Input
                      id="mobile-block-codes-manual"
                      placeholder="1234567, 2345678"
                      onBlur={(event) => {
                        const extras = event.target.value
                          .split(/[\s,;]+/)
                          .map((value) => value.trim())
                          .filter(Boolean);
                        if (extras.length === 0) return;
                        setSelectedBlockCodes((current) =>
                          Array.from(new Set([...current, ...extras])).sort()
                        );
                        event.target.value = '';
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2">
              <Button type="submit" disabled={isCreating || constituencies.length === 0}>
                {isCreating
                  ? editingCode
                    ? 'Saving...'
                    : 'Generating...'
                  : editingCode
                    ? 'Save changes'
                    : 'Generate 6-digit login code'}
              </Button>
              {editingCode ? (
                <Button type="button" variant="outline" onClick={resetCreateForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk import from Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Upload <code className="rounded bg-gray-100 px-1">.xls</code>,{' '}
            <code className="rounded bg-gray-100 px-1">.xlsx</code>, or{' '}
            <code className="rounded bg-gray-100 px-1">.csv</code> with columns:{' '}
            <strong>name</strong>, <strong>phone</strong>, <strong>address</strong>,{' '}
            <strong>comments</strong>, <strong>constituency</strong> (optional if selected above),{' '}
            <strong>label</strong> (optional), and <strong>blockcodes</strong> — use{' '}
            <code className="rounded bg-gray-100 px-1">all</code> or{' '}
            <code className="rounded bg-gray-100 px-1">1</code> for every block, or a
            comma-separated list like <code className="rounded bg-gray-100 px-1">1234567,2345678</code>.
            Empty blockcodes also means all.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={sampleUrl}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Download sample .xlsx
            </a>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,.csv"
              className="text-sm"
              disabled={isImporting || constituencies.length === 0}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
              }}
            />
            {isImporting ? (
              <span className="text-sm text-gray-500">Importing...</span>
            ) : null}
          </div>
          {importSummary ? (
            <div className="rounded-lg border bg-gray-50 p-3 text-sm">
              <div className="font-medium">Import summary</div>
              <div className="mt-1 text-gray-600">
                {importSummary.totalRows} rows · {importSummary.created} created ·{' '}
                {importSummary.errors} errors
              </div>
              {importErrors.length > 0 ? (
                <ul className="mt-2 max-h-32 list-disc space-y-1 overflow-auto pl-5 text-red-600">
                  {importErrors.slice(0, 20).map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                  {importErrors.length > 20 ? (
                    <li>…and {importErrors.length - 20} more</li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Mobile login codes</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={filterHalka} onValueChange={setFilterHalka}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter constituency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All constituencies</SelectItem>
                {constituencies.map((constituency) => (
                  <SelectItem key={constituency._id} value={constituency.halkaName}>
                    {constituency.halkaName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadData()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading mobile logins...</p>
          ) : filteredCodes.length === 0 ? (
            <p className="text-sm text-gray-500">
              No mobile login codes yet. Create one above or import from Excel.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Comments</TableHead>
                    <TableHead>Constituency</TableHead>
                    <TableHead>Block access</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCodes.map((code) => (
                    <TableRow key={code._id}>
                      <TableCell className="font-mono text-lg tracking-[0.3em]">{code.code}</TableCell>
                      <TableCell>{displayName(code)}</TableCell>
                      <TableCell className="whitespace-nowrap">{code.phone || '—'}</TableCell>
                      <TableCell className="max-w-[180px] truncate" title={code.address || ''}>
                        {code.address || '—'}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate" title={code.comments || ''}>
                        {code.comments || '—'}
                      </TableCell>
                      <TableCell>{code.halkaName}</TableCell>
                      <TableCell className="max-w-[200px]" title={formatBlockAccess(code)}>
                        <Badge variant={code.selectAllBlockCodes !== false ? 'secondary' : 'default'}>
                          {formatBlockAccess(code)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={code.active}
                            onCheckedChange={(checked) => void handleToggleActive(code, checked)}
                            aria-label={`Toggle login ${code.code}`}
                          />
                          <Badge variant={code.active ? 'default' : 'secondary'}>
                            {code.active ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(code.lastUsedAt)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(code)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void copyCode(code.code)}>
                            Copy
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => void handleDeleteCode(code)}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
