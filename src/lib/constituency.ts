import connectDB from '@/lib/mongodb';
import Constituency from '@/models/Constituency';

export async function findConstituencyByHalka(halkaName: string) {
  await connectDB();
  return Constituency.findOne({ halkaName, deletedAt: null });
}

export async function findConstituencyByBlockCode(blockCode: string) {
  await connectDB();
  return Constituency.findOne({ blockCodes: blockCode, deletedAt: null });
}

export async function assertHalkaIsActive(halkaName: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const constituency = await findConstituencyByHalka(halkaName);
  if (!constituency) {
    return { ok: true };
  }
  if (constituency.status === 'inactive') {
    return { ok: false, error: 'This constituency is inactive' };
  }
  return { ok: true };
}

export async function assertBlockCodeIsActive(blockCode: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const constituency = await findConstituencyByBlockCode(blockCode);
  if (!constituency) {
    return { ok: true };
  }
  if (constituency.status === 'inactive') {
    return { ok: false, error: 'This constituency is inactive' };
  }
  return { ok: true };
}

export async function getActiveHalkaNames(): Promise<string[]> {
  await connectDB();
  const constituencies = await Constituency.find({ deletedAt: null, status: 'active' }).select('halkaName');
  return constituencies.map((c) => c.halkaName);
}

export async function getInactiveHalkaNames(): Promise<string[]> {
  await connectDB();
  const constituencies = await Constituency.find({ deletedAt: null, status: 'inactive' }).select('halkaName');
  return constituencies.map((c) => c.halkaName);
}

export function normalizeHalkaName(name: string): string {
  return name.replace(/\s+/g, '').toUpperCase();
}

export async function activeConstituencyExists(halkaName: string): Promise<boolean> {
  await connectDB();
  const existing = await Constituency.findOne({ halkaName, deletedAt: null });
  return !!existing;
}

export async function getNextSuffixedHalkaName(baseName: string): Promise<string> {
  await connectDB();
  let count = 1;
  while (count < Number.MAX_SAFE_INTEGER) {
    const candidate = `${baseName}-${count}`;
    const taken = await Constituency.findOne({ halkaName: candidate, deletedAt: null });
    if (!taken) return candidate;
    count++;
  }
  throw new Error('Unable to allocate a unique constituency name');
}

/** If an active constituency already uses `baseName`, pick the next `-N` suffix for the restored record. */
export async function getRestoredHalkaName(baseName: string): Promise<{
  halkaName: string;
  renamed: boolean;
  originalName?: string;
}> {
  await connectDB();
  const conflict = await Constituency.findOne({ halkaName: baseName, deletedAt: null });
  if (!conflict) {
    return { halkaName: baseName, renamed: false };
  }
  const newName = await getNextSuffixedHalkaName(baseName);
  return { halkaName: newName, renamed: true, originalName: baseName };
}
