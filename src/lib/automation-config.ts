import { connectNativeMongoClient } from '@/lib/mongo-client';

export const AUTOMATION_SETTINGS_COLLECTION = 'automation_settings';
export const AUTOMATION_LOGS_COLLECTION = 'automation_logs';

export interface AutomationConfig {
  enabled: boolean;
  autoProcessPages: boolean;
  autoGenerateParchiOnVerified: boolean;
  autoGenerateParchiOnRequest: boolean;
  maxPageWorkersPerTick: number;
  maxParchiJobsPerTick: number;
  maxParchiBatchesPerJobPerTick: number;
  scope: 'global' | 'halka';
  halkaName?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export const DEFAULT_AUTOMATION_CONFIG: AutomationConfig = {
  enabled: true,
  autoProcessPages: true,
  autoGenerateParchiOnVerified: true,
  autoGenerateParchiOnRequest: true,
  maxPageWorkersPerTick: 40,
  maxParchiJobsPerTick: 10,
  maxParchiBatchesPerJobPerTick: 3,
  scope: 'global',
  halkaName: null,
  updatedAt: null,
  updatedBy: null,
};

function normalizeHalka(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

function toConfig(doc: Record<string, unknown> | null | undefined, scope: 'global' | 'halka'): AutomationConfig {
  if (!doc) {
    return { ...DEFAULT_AUTOMATION_CONFIG, scope };
  }
  return {
    enabled: doc.enabled !== false,
    autoProcessPages: doc.autoProcessPages !== false,
    autoGenerateParchiOnVerified: doc.autoGenerateParchiOnVerified !== false,
    autoGenerateParchiOnRequest: doc.autoGenerateParchiOnRequest !== false,
    maxPageWorkersPerTick: Number(doc.maxPageWorkersPerTick) || DEFAULT_AUTOMATION_CONFIG.maxPageWorkersPerTick,
    maxParchiJobsPerTick: Number(doc.maxParchiJobsPerTick) || DEFAULT_AUTOMATION_CONFIG.maxParchiJobsPerTick,
    maxParchiBatchesPerJobPerTick:
      Number(doc.maxParchiBatchesPerJobPerTick) || DEFAULT_AUTOMATION_CONFIG.maxParchiBatchesPerJobPerTick,
    scope,
    halkaName: doc.halkaName ? String(doc.halkaName) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as Date).toISOString() : null,
    updatedBy: doc.updatedBy ? String(doc.updatedBy) : null,
  };
}

export async function getEffectiveAutomationConfig(halkaName?: string | null): Promise<AutomationConfig> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const globalDoc = await db.collection(AUTOMATION_SETTINGS_COLLECTION).findOne({ scope: 'global' });

  if (!halkaName) {
    return toConfig(globalDoc as Record<string, unknown> | null, 'global');
  }

  const halka = normalizeHalka(halkaName);
  const halkaDoc = await db.collection(AUTOMATION_SETTINGS_COLLECTION).findOne({
    scope: 'halka',
    halkaName: halka,
  });

  return {
    ...toConfig(globalDoc as Record<string, unknown> | null, 'global'),
    ...toConfig(halkaDoc as Record<string, unknown> | null, halkaDoc ? 'halka' : 'global'),
    scope: halkaDoc ? 'halka' : 'global',
    halkaName: halka,
  };
}

export async function upsertAutomationConfig(input: {
  scope: 'global' | 'halka';
  halkaName?: string;
  patch: Partial<AutomationConfig>;
  updatedBy: string;
}): Promise<AutomationConfig> {
  const client = await connectNativeMongoClient();
  const db = client.db('vdp');
  const filter =
    input.scope === 'global'
      ? { scope: 'global' }
      : { scope: 'halka', halkaName: normalizeHalka(String(input.halkaName ?? '')) };

  if (input.scope === 'halka' && !input.halkaName) {
    throw new Error('halkaName is required for halka scope');
  }

  const $set: Record<string, unknown> = {
    scope: input.scope,
    updatedAt: new Date(),
    updatedBy: input.updatedBy,
  };
  if (input.scope === 'halka') {
    $set.halkaName = normalizeHalka(String(input.halkaName));
  }

  const fields: (keyof AutomationConfig)[] = [
    'enabled',
    'autoProcessPages',
    'autoGenerateParchiOnVerified',
    'autoGenerateParchiOnRequest',
    'maxPageWorkersPerTick',
    'maxParchiJobsPerTick',
    'maxParchiBatchesPerJobPerTick',
  ];
  for (const key of fields) {
    if (input.patch[key] !== undefined) {
      $set[key] = input.patch[key];
    }
  }

  await db.collection(AUTOMATION_SETTINGS_COLLECTION).updateOne(filter, { $set }, { upsert: true });
  return getEffectiveAutomationConfig(input.scope === 'halka' ? input.halkaName : null);
}
