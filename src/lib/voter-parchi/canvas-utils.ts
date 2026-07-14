import type { ParchiVoterRecord, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { PARCHI_FIELD_DEFINITIONS } from '@/lib/voter-parchi/types';

/** Sample voter for live canvas preview in the designer. */
export const SAMPLE_PARCHI_VOTER: ParchiVoterRecord = {
  _id: 'sample',
  cnic: '37405-1234567-1',
  name: 'محمد یاسر',
  fatherName: 'ولد محمد اکرم',
  age: '35',
  address: 'گلی نمبر 2، محلہ سدرہ، جموں شہر',
  previousAddress: '',
  blockCode: '1234567890123',
  silsilaNo: '0156',
  gharanaNo: '42',
  gender: 'male',
  profession: 'کاروبار',
  religion: 'مسلم',
  imageUrl: '',
  rowY: 0,
  rowHeight: 0,
  pollingStation: 'گورنمنٹ ماڈل سکول، وارڈ نمبر 3',
  statisticalCode: '1234567890123',
  rowCropUrl: null,
  rowCropHeight: 0,
};

export function fieldLabel(fieldId: string, label?: string, labelUrdu?: string): string {
  if (labelUrdu) return `${labelUrdu}:`;
  if (label) return `${label}:`;
  const def = PARCHI_FIELD_DEFINITIONS.find((f) => f.id === fieldId);
  if (def?.labelUrdu) return `${def.labelUrdu}:`;
  if (def?.label) return `${def.label}:`;
  return '';
}

export function resolveCanvasAssetUrl(design: VoterParchiDesign, assetId: string | null | undefined): string | null {
  if (!assetId) return null;
  return design.assets.find((a) => a.id === assetId)?.url ?? null;
}

export function sortCanvasElements<T extends { zIndex: number }>(elements: T[]): T[] {
  return [...elements].sort((a, b) => a.zIndex - b.zIndex);
}

/** Client-safe field resolver for designer preview (no server imports). */
export function resolvePreviewFieldValue(
  fieldId: string,
  voter: ParchiVoterRecord,
  design: VoterParchiDesign
): string {
  switch (fieldId) {
    case 'rowCrop':
      return '';
    case 'name':
      return voter.name;
    case 'cnic':
      return voter.cnic;
    case 'fatherName':
      return voter.fatherName;
    case 'age':
      return voter.age ? `${voter.age} سال` : '';
    case 'address':
      return voter.address;
    case 'previousAddress':
      return voter.previousAddress;
    case 'blockCode':
      return voter.blockCode;
    case 'silsilaNo':
      return voter.silsilaNo;
    case 'gharanaNo':
      return voter.gharanaNo;
    case 'gender':
      return voter.gender;
    case 'profession':
      return voter.profession;
    case 'religion':
      return voter.religion;
    case 'pollingStation':
      return voter.pollingStation;
    case 'statisticalCode':
      return voter.statisticalCode;
    case 'customText':
      return design.customHeaderText ?? '';
    default:
      return '';
  }
}

export function resolvePreviewAssetUrl(design: VoterParchiDesign, fieldId: string): string | null {
  if (fieldId === 'symbol' && design.symbolAssetId) {
    return design.assets.find((a) => a.id === design.symbolAssetId)?.url ?? null;
  }
  if (fieldId === 'photo' && design.photoAssetId) {
    return design.assets.find((a) => a.id === design.photoAssetId)?.url ?? null;
  }
  return null;
}
