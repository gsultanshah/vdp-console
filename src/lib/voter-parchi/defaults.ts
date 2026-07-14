import type { ParchiSlotConfig, VoterParchiDesign } from '@/lib/voter-parchi/types';
import { PARCHI_PER_PAGE_DEFAULT } from '@/lib/voter-parchi/types';

export const DEFAULT_PARCHI_SLOTS: ParchiSlotConfig[] = [
  {
    slotId: 'headerRow',
    enabled: true,
    fieldId: 'rowCrop',
    label: '',
    showLabel: false,
  },
  {
    slotId: 'leftVisual',
    enabled: true,
    fieldId: 'symbol',
    label: '',
    showLabel: false,
  },
  {
    slotId: 'topRight',
    enabled: true,
    fieldId: 'blockCode',
    label: 'Statistical Code',
    labelUrdu: 'شماریاتی کوڈ نمبر',
    showLabel: true,
  },
  {
    slotId: 'topLeft',
    enabled: true,
    fieldId: 'cnic',
    label: 'CNIC',
    labelUrdu: 'شناختی کارڈ نمبر',
    showLabel: true,
  },
  {
    slotId: 'middleRow',
    enabled: true,
    fieldId: 'address',
    label: 'Address',
    labelUrdu: 'پتہ',
    showLabel: true,
  },
  {
    slotId: 'bottomRow',
    enabled: true,
    fieldId: 'pollingStation',
    label: 'Polling Station',
    labelUrdu: 'پولنگ اسٹیشن',
    showLabel: true,
  },
];

export function createDefaultDesign(halkaName: string): Omit<VoterParchiDesign, '_id'> {
  return {
    halkaName: halkaName.replace(/\s+/g, '').toUpperCase(),
    name: 'Default voter parchi',
    description: 'Three parchi per page with row scan header, symbol area, and voter details.',
    isDefault: true,
    parchiPerPage: PARCHI_PER_PAGE_DEFAULT,
    slots: DEFAULT_PARCHI_SLOTS.map((slot) => ({ ...slot })),
    assets: [],
    symbolAssetId: null,
    photoAssetId: null,
    headerAssetId: null,
    customHeaderText: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
