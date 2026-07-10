export type ParchiFieldId =
  | 'rowCrop'
  | 'name'
  | 'cnic'
  | 'fatherName'
  | 'age'
  | 'address'
  | 'previousAddress'
  | 'blockCode'
  | 'silsilaNo'
  | 'gharanaNo'
  | 'gender'
  | 'profession'
  | 'religion'
  | 'pollingStation'
  | 'statisticalCode'
  | 'symbol'
  | 'photo'
  | 'customText';

export type ParchiSlotId =
  | 'headerRow'
  | 'leftVisual'
  | 'topRight'
  | 'topLeft'
  | 'middleRow'
  | 'bottomRow';

export interface ParchiFieldDefinition {
  id: ParchiFieldId;
  label: string;
  labelUrdu?: string;
  description: string;
}

export interface ParchiSlotConfig {
  slotId: ParchiSlotId;
  enabled: boolean;
  fieldId: ParchiFieldId;
  label: string;
  labelUrdu?: string;
  showLabel: boolean;
}

export interface ParchiAsset {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  contentType: string;
  role: 'symbol' | 'photo' | 'header' | 'other';
  uploadedAt: string;
}

export interface VoterParchiDesign {
  _id?: string;
  halkaName: string;
  name: string;
  description?: string;
  isDefault: boolean;
  parchiPerPage: number;
  slots: ParchiSlotConfig[];
  assets: ParchiAsset[];
  symbolAssetId?: string | null;
  photoAssetId?: string | null;
  headerAssetId?: string | null;
  customHeaderText?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type ParchiJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ParchiOutputFile {
  partIndex: number;
  fileName: string;
  storagePath: string;
  downloadUrl: string;
  voterCount: number;
  pageCount: number;
  sizeBytes: number;
}

export interface VoterParchiJob {
  _id?: string;
  halkaName: string;
  designId: string;
  designName: string;
  blockCodes: string[];
  selectAllBlockCodes: boolean;
  genderFilter: 'both' | 'male' | 'female';
  status: ParchiJobStatus;
  totalVoters: number;
  processedVoters: number;
  lastVoterId: string | null;
  outputFiles: ParchiOutputFile[];
  currentPartIndex: number;
  currentPartVoterCount: number;
  error: string | null;
  createdBy: string;
  createdByName: string;
  createdAt?: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
}

export interface ParchiVoterRecord {
  _id: string;
  cnic: string;
  name: string;
  fatherName: string;
  age: string;
  address: string;
  previousAddress: string;
  blockCode: string;
  silsilaNo: string;
  gharanaNo: string;
  gender: string;
  profession: string;
  religion: string;
  imageUrl: string;
  rowY: number;
  rowHeight: number;
  pollingStation: string;
  statisticalCode: string;
  rowCropUrl: string | null;
  rowCropHeight: number;
}

export interface ResolvedParchiSlot {
  slotId: ParchiSlotId;
  label: string;
  labelUrdu?: string;
  showLabel: boolean;
  text: string;
  imageUrl?: string | null;
  imageBuffer?: Buffer | null;
  cropHeight?: number;
}

export interface ResolvedParchi {
  voter: ParchiVoterRecord;
  slots: ResolvedParchiSlot[];
}

export const PARCHI_FIELD_DEFINITIONS: ParchiFieldDefinition[] = [
  { id: 'rowCrop', label: 'Row scan (cutting)', labelUrdu: 'قطعہ', description: 'OCR row image from voter list scan' },
  { id: 'statisticalCode', label: 'Statistical code', labelUrdu: 'شماریاتی کوڈ نمبر', description: 'Block code + silsila number' },
  { id: 'cnic', label: 'CNIC', labelUrdu: 'شناختی کارڈ نمبر', description: 'National identity card number' },
  { id: 'address', label: 'Address', labelUrdu: 'پتہ', description: 'Residential address' },
  { id: 'pollingStation', label: 'Polling station', labelUrdu: 'پولنگ اسٹیشن', description: 'Assigned polling booth' },
  { id: 'name', label: 'Name', labelUrdu: 'نام', description: 'Voter name' },
  { id: 'fatherName', label: 'Father / relation', labelUrdu: 'والد / رشتہ', description: 'Father or guardian name' },
  { id: 'age', label: 'Age', labelUrdu: 'عمر', description: 'Voter age' },
  { id: 'blockCode', label: 'Block code', description: 'Electoral block code' },
  { id: 'silsilaNo', label: 'Silsila no', description: 'Serial in block' },
  { id: 'gharanaNo', label: 'Gharana no', description: 'Family number' },
  { id: 'gender', label: 'Gender', description: 'Male / female' },
  { id: 'profession', label: 'Profession', description: 'Occupation' },
  { id: 'religion', label: 'Religion', description: 'Religion' },
  { id: 'previousAddress', label: 'Previous address', description: 'Previous residential address' },
  { id: 'symbol', label: 'Symbol image', description: 'Uploaded candidate symbol' },
  { id: 'photo', label: 'Photo', description: 'Uploaded photo visual' },
  { id: 'customText', label: 'Custom text', description: 'Fixed custom text from design' },
];

/** Voters per process API call — keep small so PDF + images finish within maxDuration. */
export const PARCHI_BATCH_SIZE = 30;
/** Soft target for combining into one downloadable part (still one PDF per batch for reliability). */
export const PARCHI_VOTERS_PER_PART = 300;
export const PARCHI_PER_PAGE_DEFAULT = 3;
