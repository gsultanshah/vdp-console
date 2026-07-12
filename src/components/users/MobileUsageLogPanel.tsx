'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

interface UsageClientContext {
  platform?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  deviceModel?: string | null;
  osVersion?: string | null;
  workMode?: string | null;
  isOnline?: boolean | null;
  selectedBlock?: string | null;
}

interface UsageRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface UsageEvent {
  _id: string;
  accessCode?: string | null;
  accessLabel?: string | null;
  halkaName?: string | null;
  eventType: string;
  timestamp: string;
  clientTimestamp?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationAccuracy?: number | null;
  locationAltitude?: number | null;
  client?: UsageClientContext | null;
  request?: UsageRequestContext | null;
  metadata: Record<string, unknown>;
}

interface UsageSummary {
  totalEvents: number;
  uniqueAccessCodes: number;
  byEventType: Record<string, number>;
  latestEventAt?: string | null;
}

interface MobileUsageLogPanelProps {
  constituencies: ConstituencyOption[];
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatEventLabel(value: string) {
  return value.replace(/_/g, ' ');
}

function formatMetadataPreview(metadata: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof metadata.query === 'string' && metadata.query) parts.push(`query: ${metadata.query}`);
  if (metadata.resultCount != null) parts.push(`results: ${String(metadata.resultCount)}`);
  if (typeof metadata.workMode === 'string' && metadata.workMode) parts.push(`mode: ${metadata.workMode}`);
  if (typeof metadata.blockCode === 'string' && metadata.blockCode) parts.push(`block: ${metadata.blockCode}`);
  if (typeof metadata.voterName === 'string' && metadata.voterName) parts.push(`voter: ${metadata.voterName}`);
  if (typeof metadata.voterCnic === 'string' && metadata.voterCnic) parts.push(`cnic: ${metadata.voterCnic}`);
  if (typeof metadata.tab === 'string' && metadata.tab) parts.push(`tab: ${metadata.tab}`);
  if (typeof metadata.errorMessage === 'string' && metadata.errorMessage) {
    parts.push(`error: ${metadata.errorMessage}`);
  }
  if (Array.isArray(metadata.results)) {
    parts.push(`matched: ${metadata.results.length}`);
  }
  if (parts.length > 0) return parts.join(' · ');

  const keys = Object.keys(metadata);
  if (keys.length === 0) return '—';
  return keys
    .slice(0, 5)
    .map((key) => `${key}: ${String(metadata[key])}`)
    .join(' · ');
}

function formatClient(client?: UsageClientContext | null) {
  if (!client) return '—';
  const parts: string[] = [];
  if (client.platform) parts.push(client.platform);
  if (client.appVersion) parts.push(`v${client.appVersion}`);
  if (client.workMode) parts.push(client.workMode);
  if (client.isOnline != null) parts.push(client.isOnline ? 'online' : 'offline');
  if (client.selectedBlock) parts.push(`block ${client.selectedBlock}`);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function locationLink(latitude?: number | null, longitude?: number | null) {
  if (latitude == null || longitude == null) return null;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function MobileUsageLogPanel({ constituencies }: MobileUsageLogPanelProps) {
  const [events, setEvents] = useState<UsageEvent[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filterHalka, setFilterHalka] = useState('all');
  const [filterEventType, setFilterEventType] = useState('all');
  const [accessCodeFilter, setAccessCodeFilter] = useState('');
  const [sinceHours, setSinceHours] = useState('168');

  const loadEvents = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', '300');
      params.set('summary', 'true');
      if (filterHalka !== 'all') params.set('halkaName', filterHalka);
      if (filterEventType !== 'all') params.set('eventType', filterEventType);
      if (accessCodeFilter.trim()) params.set('accessCode', accessCodeFilter.trim());
      const hours = Number.parseInt(sinceHours, 10);
      if (Number.isFinite(hours) && hours > 0) {
        const since = new Date(Date.now() - hours * 60 * 60 * 1000);
        params.set('since', since.toISOString());
      }

      const response = await fetch(`/api/mobile/admin/usage?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to load usage log');
      }
      setEvents(data.events ?? []);
      setEventTypes(data.eventTypes ?? []);
      setSummary(data.summary ?? null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load usage log');
    } finally {
      setIsLoading(false);
    }
  }, [accessCodeFilter, filterEventType, filterHalka, sinceHours]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const pageSummary = useMemo(() => {
    const byType: Record<string, number> = {};
    for (const event of events) {
      byType[event.eventType] = (byType[event.eventType] ?? 0) + 1;
    }
    return byType;
  }, [events]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>Mobile usage log</CardTitle>
            <p className="mt-1 text-sm text-gray-500">
              Full audit trail: searches, voter views, sharing, parchi, block downloads, device and GPS context.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadEvents()} disabled={isLoading}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-gray-500">Total events</div>
                <div className="text-2xl font-semibold">{summary.totalEvents}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-gray-500">Active codes</div>
                <div className="text-2xl font-semibold">{summary.uniqueAccessCodes}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs uppercase text-gray-500">Latest event</div>
                <div className="text-sm font-medium">{formatDate(summary.latestEventAt)}</div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Constituency</Label>
              <Select value={filterHalka} onValueChange={setFilterHalka}>
                <SelectTrigger>
                  <SelectValue placeholder="All constituencies" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All constituencies</SelectItem>
                  {constituencies.map((item) => (
                    <SelectItem key={item._id} value={item.halkaName}>
                      {item.label ?? item.halkaName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event type</Label>
              <Select value={filterEventType} onValueChange={setFilterEventType}>
                <SelectTrigger>
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatEventLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Access code</Label>
              <Input
                value={accessCodeFilter}
                onChange={(event) => setAccessCodeFilter(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <Label>Time window</Label>
              <Select value={sinceHours} onValueChange={setSinceHours}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">Last 24 hours</SelectItem>
                  <SelectItem value="72">Last 3 days</SelectItem>
                  <SelectItem value="168">Last 7 days</SelectItem>
                  <SelectItem value="720">Last 30 days</SelectItem>
                  <SelectItem value="8760">Last 12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {Object.entries(pageSummary).map(([type, count]) => (
              <Badge key={type} variant="secondary">
                {formatEventLabel(type)}: {count}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <p className="text-sm text-gray-500">Loading usage events...</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-500">No usage events found for the selected filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Constituency</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => {
                    const mapsUrl = locationLink(event.latitude, event.longitude);
                    const isExpanded = expandedId === event._id;
                    return (
                      <Fragment key={event._id}>
                        <TableRow
                          className="cursor-pointer hover:bg-gray-50"
                          onClick={() => setExpandedId(isExpanded ? null : event._id)}
                        >
                          <TableCell className="whitespace-nowrap text-sm">
                            <div>{formatDate(event.timestamp)}</div>
                            {event.clientTimestamp ? (
                              <div className="text-xs text-gray-500">client {formatDate(event.clientTimestamp)}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="font-mono text-sm">{event.accessCode ?? '—'}</div>
                            {event.accessLabel ? (
                              <div className="text-xs text-gray-500">{event.accessLabel}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">{event.halkaName ?? '—'}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{formatEventLabel(event.eventType)}</Badge>
                          </TableCell>
                          <TableCell className="max-w-md text-sm text-gray-700">
                            {formatMetadataPreview(event.metadata)}
                          </TableCell>
                          <TableCell className="max-w-xs text-xs text-gray-600">
                            {formatClient(event.client)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {mapsUrl ? (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:underline"
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                              >
                                {event.latitude?.toFixed(5)}, {event.longitude?.toFixed(5)}
                                {event.locationAccuracy != null
                                  ? ` (±${Math.round(event.locationAccuracy)}m)`
                                  : ''}
                              </a>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        </TableRow>
                        {isExpanded ? (
                          <TableRow key={`${event._id}-details`}>
                            <TableCell colSpan={7} className="bg-gray-50">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <div className="mb-1 text-xs font-semibold uppercase text-gray-500">Metadata</div>
                                  <pre className="max-h-64 overflow-auto rounded border bg-white p-3 text-xs">
                                    {JSON.stringify(event.metadata, null, 2)}
                                  </pre>
                                </div>
                                <div className="space-y-3 text-xs">
                                  <div>
                                    <div className="mb-1 font-semibold uppercase text-gray-500">Client</div>
                                    <pre className="overflow-auto rounded border bg-white p-3">
                                      {JSON.stringify(event.client ?? {}, null, 2)}
                                    </pre>
                                  </div>
                                  <div>
                                    <div className="mb-1 font-semibold uppercase text-gray-500">Request</div>
                                    <pre className="overflow-auto rounded border bg-white p-3">
                                      {JSON.stringify(event.request ?? {}, null, 2)}
                                    </pre>
                                  </div>
                                  {event.locationAltitude != null ? (
                                    <div className="text-gray-600">Altitude: {event.locationAltitude.toFixed(1)} m</div>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
