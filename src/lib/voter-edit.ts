import type { VoterBrowseRecord } from '@/lib/voter-browse-types';

export interface VoterEditPayload {
  silsilaNo?: string;
  blockCode?: string;
  gharanaNo?: string;
  name?: string;
  cnic?: string;
  fatherName?: string;
  profession?: string;
  age?: string | null;
  address?: string | null;
  previousAddress?: string;
  religion?: string;
  gender?: string;
  row?: number;
  rowY?: number;
  rowHeight?: number;
}

export interface VoterAddPayload {
  cnic: string;
  halkaName: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  name: string;
  fatherName?: string;
  profession?: string;
  age?: string;
  address?: string;
  religion?: string;
  gender?: string;
}

function parseVoterRecord(raw: Record<string, unknown>): VoterBrowseRecord {
  return {
    _id: String(raw._id ?? ''),
    cnic: String(raw.cnic ?? ''),
    halkaName: String(raw.halkaName ?? ''),
    blockCode: String(raw.blockCode ?? ''),
    silsilaNo: String(raw.silsilaNo ?? ''),
    gharanaNo: String(raw.gharanaNo ?? ''),
    name: String(raw.name ?? ''),
    row: typeof raw.row === 'number' ? raw.row : undefined,
    rowY: typeof raw.rowY === 'number' ? raw.rowY : undefined,
    rowHeight: typeof raw.rowHeight === 'number' ? raw.rowHeight : undefined,
    imageUrl: raw.imageUrl != null ? String(raw.imageUrl) : undefined,
    gender: raw.gender != null ? String(raw.gender) : undefined,
    religion: raw.religion != null ? String(raw.religion) : undefined,
    pageTag: raw.pageTag != null ? String(raw.pageTag) : undefined,
    fileName: raw.fileName != null ? String(raw.fileName) : undefined,
    fatherName: raw.fatherName != null ? String(raw.fatherName) : undefined,
    profession: raw.profession != null ? String(raw.profession) : undefined,
    age: raw.age != null ? String(raw.age) : null,
    address: raw.address != null ? String(raw.address) : null,
    previousAddress: raw.previousAddress != null ? String(raw.previousAddress) : undefined,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt.toISOString() : raw.createdAt != null ? String(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt.toISOString() : raw.updatedAt != null ? String(raw.updatedAt) : undefined,
  };
}

export async function fetchVoterById(voterId: string): Promise<VoterBrowseRecord> {
  const response = await fetch(`/api/voters/${encodeURIComponent(voterId)}/`);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to load voter');
  }
  const data = (await response.json()) as { voter: Record<string, unknown> };
  return parseVoterRecord(data.voter);
}

export async function updateVoter(voterId: string, payload: VoterEditPayload): Promise<VoterBrowseRecord> {
  const response = await fetch(`/api/voters/${encodeURIComponent(voterId)}/`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'Failed to update voter');
  }

  const data = (await response.json()) as { voter: Record<string, unknown> };
  return parseVoterRecord(data.voter);
}

export async function addVoterManual(payload: VoterAddPayload): Promise<{ voterId: string; message: string }> {
  const response = await fetch('/api/voters/add/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    voterId?: string;
    fields?: string[];
  };

  if (!response.ok) {
    if (data.fields?.length) {
      throw new Error(`Missing required fields: ${data.fields.join(', ')}`);
    }
    throw new Error(data.error || 'Failed to add voter');
  }

  return {
    message: data.message || 'Voter added successfully',
    voterId: String(data.voterId ?? ''),
  };
}

export function voterToEditForm(voter: VoterBrowseRecord): VoterEditPayload {
  return {
    silsilaNo: voter.silsilaNo,
    blockCode: voter.blockCode,
    gharanaNo: voter.gharanaNo,
    name: voter.name,
    cnic: voter.cnic,
    fatherName: voter.fatherName ?? '',
    profession: voter.profession ?? '',
    age: voter.age ?? '',
    address: voter.address ?? '',
    previousAddress: voter.previousAddress ?? '',
    religion: voter.religion ?? '',
    gender: voter.gender ?? '',
    row: voter.row,
    rowY: voter.rowY,
    rowHeight: voter.rowHeight,
  };
}
