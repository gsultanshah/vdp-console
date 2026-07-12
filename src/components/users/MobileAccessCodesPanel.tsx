'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  halkaName: string;
  active: boolean;
  branding?: {
    templateId?: string | null;
    appTitle?: string;
  };
  createdByName?: string;
  createdAt?: string;
  lastUsedAt?: string | null;
}

interface MobileAccessCodesPanelProps {
  constituencies: ConstituencyOption[];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

export function MobileAccessCodesPanel({ constituencies }: MobileAccessCodesPanelProps) {
  const [codes, setCodes] = useState<MobileAccessCode[]>([]);
  const [templates, setTemplates] = useState<BrandingTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [filterHalka, setFilterHalka] = useState<string>('all');
  const [halkaName, setHalkaName] = useState('');
  const [label, setLabel] = useState('');
  const [appTitle, setAppTitle] = useState('');
  const [templateId, setTemplateId] = useState<string>('default');

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

  const filteredCodes = useMemo(() => {
    if (filterHalka === 'all') return codes;
    return codes.filter((code) => code.halkaName === filterHalka);
  }, [codes, filterHalka]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!halkaName) {
      toast.error('Select a constituency');
      return;
    }

    setIsCreating(true);
    try {
      const branding: Record<string, string> = {};
      if (appTitle.trim()) branding.appTitle = appTitle.trim();
      if (templateId && templateId !== 'default') branding.templateId = templateId;

      const response = await fetch('/api/mobile/admin/access-codes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          halkaName,
          label: label.trim() || 'Field access',
          branding: Object.keys(branding).length > 0 ? branding : undefined,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create mobile login code');
      }

      setCodes((current) => [data.code as MobileAccessCode, ...current]);
      setLabel('');
      setAppTitle('');
      toast.success(`Created mobile login ${data.code.code} for ${data.code.halkaName}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create mobile login');
    } finally {
      setIsCreating(false);
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
        current.map((item) => (item._id === code._id ? (data.code as MobileAccessCode) : item))
      );
      toast.success(active ? `Login ${code.code} enabled` : `Login ${code.code} disabled`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update mobile login');
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create mobile field login</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            Generate a 6-digit code for the VDP mobile field app. Each code is linked to one
            constituency so field users only see voters for that area.
          </p>
          <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="mobile-halka">Constituency</Label>
              <Select value={halkaName} onValueChange={setHalkaName}>
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

            <div className="grid gap-2">
              <Label htmlFor="mobile-label">Login label</Label>
              <Input
                id="mobile-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. LA39 field team"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="mobile-app-title">App title (optional)</Label>
              <Input
                id="mobile-app-title"
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                placeholder="e.g. LA39 Voters"
              />
            </div>

            <div className="md:col-span-2">
              <Button type="submit" disabled={isCreating || constituencies.length === 0}>
                {isCreating ? 'Generating...' : 'Generate 6-digit login code'}
              </Button>
            </div>
          </form>
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
              No mobile login codes yet. Create one above and share it with your field team.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Constituency</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>App title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodes.map((code) => (
                  <TableRow key={code._id}>
                    <TableCell className="font-mono text-lg tracking-[0.3em]">{code.code}</TableCell>
                    <TableCell>{code.halkaName}</TableCell>
                    <TableCell>{code.label}</TableCell>
                    <TableCell>
                      {code.branding?.appTitle?.trim() || `${code.halkaName} Voters`}
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
                    <TableCell>{formatDate(code.lastUsedAt)}</TableCell>
                    <TableCell>{formatDate(code.createdAt)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => void copyCode(code.code)}>
                        Copy
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
