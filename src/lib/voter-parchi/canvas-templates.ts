import type { ParchiCanvasConfig, ParchiCanvasElement, VoterParchiDesign } from '@/lib/voter-parchi/types';
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  DEFAULT_SLIP_HEIGHT_MM,
  DEFAULT_SLIP_WIDTH_MM,
} from '@/lib/voter-parchi/canvas-layout';

const GREEN = '#00401A';
const WHITE = '#FFFFFF';

export type ParchiTemplateId = 'campaign-two-panel' | 'roll-box' | 'blank';

export interface ParchiTemplateDefinition {
  id: ParchiTemplateId;
  name: string;
  description: string;
  defaultWidthMm: number;
  defaultHeightMm: number;
  defaultParchiPerPage: number;
  accentClass: string;
}

export const PARCHI_TEMPLATE_CATALOG: ParchiTemplateDefinition[] = [
  {
    id: 'campaign-two-panel',
    name: 'Campaign two-panel',
    description:
      'ECP voter details on the left and campaign photo, symbol, and constituency on the right — like a full campaign parchi.',
    defaultWidthMm: DEFAULT_SLIP_WIDTH_MM,
    defaultHeightMm: DEFAULT_SLIP_HEIGHT_MM,
    defaultParchiPerPage: 4,
    accentClass: 'from-emerald-600 to-teal-700',
  },
  {
    id: 'roll-box',
    name: 'Voter roll box',
    description:
      'Compact bordered box with statistical code, CNIC, address, and polling station — ideal for classic roll-style slips.',
    defaultWidthMm: 190,
    defaultHeightMm: 48,
    defaultParchiPerPage: 5,
    accentClass: 'from-slate-600 to-slate-800',
  },
  {
    id: 'blank',
    name: 'Blank canvas',
    description: 'Start empty with your own width and height. Add fields, images, and text from scratch.',
    defaultWidthMm: DEFAULT_SLIP_WIDTH_MM,
    defaultHeightMm: DEFAULT_SLIP_HEIGHT_MM,
    defaultParchiPerPage: 4,
    accentClass: 'from-indigo-500 to-violet-600',
  },
];

function newElementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function el(partial: Omit<ParchiCanvasElement, 'id' | 'zIndex'> & { zIndex?: number }): ParchiCanvasElement {
  return {
    id: newElementId(),
    zIndex: partial.zIndex ?? 1,
    ...partial,
  };
}

const fieldRowStyle = {
  backgroundColor: WHITE,
  borderColor: '#111',
  borderWidth: 1,
  fontSize: 9,
  textAlign: 'right' as const,
  padding: 4,
};

function withSize(
  config: Omit<ParchiCanvasConfig, 'slipWidthMm' | 'slipHeightMm' | 'slipAspectRatio'>,
  widthMm: number,
  heightMm: number
): ParchiCanvasConfig {
  return {
    ...config,
    slipWidthMm: widthMm,
    slipHeightMm: heightMm,
    slipAspectRatio: widthMm / heightMm,
  };
}

/** Template 1 — campaign two-panel slip (reference image 1). */
export function createCampaignTwoPanelTemplate(halkaName: string, widthMm: number, heightMm: number): ParchiCanvasConfig {
  const constituency = halkaName.replace(/\s+/g, '').toUpperCase();
  const elements: ParchiCanvasElement[] = [
    el({ type: 'rect', x: 0, y: 0, w: 50, h: 100, zIndex: 0, style: { backgroundColor: WHITE, borderColor: GREEN, borderWidth: 1 } }),
    el({ type: 'rect', x: 50, y: 0, w: 50, h: 100, zIndex: 0, style: { backgroundColor: WHITE, borderColor: GREEN, borderWidth: 1 } }),
    el({ type: 'rect', x: 0, y: 0, w: 50, h: 9, zIndex: 1, style: { backgroundColor: GREEN } }),
    el({
      type: 'text',
      x: 2,
      y: 1.2,
      w: 46,
      h: 6,
      zIndex: 2,
      text: 'نمونہ ووٹر پرچی (صرف آپ کے لیے)',
      style: { color: WHITE, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
    }),
    el({ type: 'labelValue', x: 2, y: 10, w: 46, h: 7, zIndex: 2, fieldId: 'name', labelUrdu: 'نام', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    el({ type: 'labelValue', x: 2, y: 18, w: 46, h: 7, zIndex: 2, fieldId: 'fatherName', labelUrdu: 'والد / رشتہ', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    el({ type: 'labelValue', x: 2, y: 26, w: 46, h: 7, zIndex: 2, fieldId: 'statisticalCode', labelUrdu: 'بلاک کوڈ', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    el({ type: 'labelValue', x: 2, y: 34, w: 46, h: 7, zIndex: 2, fieldId: 'silsilaNo', labelUrdu: 'سلسلہ نمبر', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    el({ type: 'labelValue', x: 2, y: 42, w: 46, h: 7, zIndex: 2, fieldId: 'cnic', labelUrdu: 'شناختی کارڈ نمبر', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    el({ type: 'labelValue', x: 2, y: 50, w: 46, h: 8, zIndex: 2, fieldId: 'pollingStation', labelUrdu: 'پولنگ اسٹیشن', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB', fontSize: 8 } }),
    el({ type: 'labelValue', x: 2, y: 59, w: 46, h: 8, zIndex: 2, fieldId: 'address', labelUrdu: 'پتہ', showLabel: true, style: { ...fieldRowStyle, borderColor: '#D1D5DB', fontSize: 8 } }),
    el({ type: 'rect', x: 2, y: 69, w: 46, h: 17, zIndex: 1, style: { backgroundColor: GREEN, borderRadius: 3 } }),
    el({
      type: 'text',
      x: 3,
      y: 70,
      w: 44,
      h: 15,
      zIndex: 2,
      text: 'اہم ہدایات برائے ووٹرز: اصل شناختی کارڈ ساتھ لائیں۔ ووٹنگ 8:00 صبح تا 5:00 شام۔',
      style: { color: WHITE, fontSize: 7, textAlign: 'right' },
    }),
    el({ type: 'rect', x: 0, y: 88, w: 50, h: 10, zIndex: 1, style: { backgroundColor: GREEN } }),
    el({
      type: 'text',
      x: 2,
      y: 89,
      w: 46,
      h: 8,
      zIndex: 2,
      text: 'ووٹر پرچی سنبھال کر رکھیں اور پولنگ کے دن ساتھ لائیں',
      style: { color: WHITE, fontSize: 7, textAlign: 'center' },
    }),
    el({
      type: 'text',
      x: 52,
      y: 2,
      w: 46,
      h: 6,
      zIndex: 2,
      text: 'اپنا ووٹ استعمال کریں — تبدیلی کا پیغام',
      style: { color: GREEN, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
    }),
    el({ type: 'image', x: 52, y: 9, w: 22, h: 36, zIndex: 2, imageFieldId: 'photo', style: { borderColor: '#D1D5DB', borderWidth: 1 } }),
    el({
      type: 'text',
      x: 75,
      y: 10,
      w: 22,
      h: 12,
      zIndex: 2,
      text: `حلقہ انتخاب:\n${constituency}`,
      style: { color: '#B00000', fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
    }),
    el({ type: 'image', x: 76, y: 26, w: 20, h: 18, zIndex: 2, imageFieldId: 'symbol', style: { borderColor: GREEN, borderWidth: 1 } }),
    el({ type: 'text', x: 76, y: 45, w: 20, h: 5, zIndex: 2, text: 'انتخابی نشان', style: { color: GREEN, fontSize: 8, textAlign: 'center' } }),
    el({ type: 'rect', x: 52, y: 76, w: 46, h: 11, zIndex: 1, style: { backgroundColor: GREEN, borderRadius: 3 } }),
    el({ type: 'text', x: 53, y: 77, w: 44, h: 9, zIndex: 2, text: 'امیدوار کا نام', style: { color: WHITE, fontSize: 13, fontWeight: 'bold', textAlign: 'center' } }),
    el({ type: 'text', x: 52, y: 90, w: 46, h: 6, zIndex: 2, text: 'انصاف | انسانیت | خود داری', style: { color: GREEN, fontSize: 7, textAlign: 'center' } }),
  ];

  return withSize({ backgroundColor: WHITE, backgroundAssetId: null, elements }, widthMm, heightMm);
}

/** Template 2 — bordered roll box (reference image 2, bottom box). */
export function createRollBoxTemplate(_halkaName: string, widthMm: number, heightMm: number): ParchiCanvasConfig {
  const elements: ParchiCanvasElement[] = [
    el({ type: 'rect', x: 0, y: 0, w: 100, h: 100, zIndex: 0, style: { backgroundColor: WHITE, borderColor: '#111', borderWidth: 2 } }),
    el({ type: 'labelValue', x: 1, y: 1, w: 49, h: 30, zIndex: 2, fieldId: 'statisticalCode', labelUrdu: 'شماریاتی کوڈ نمبر', showLabel: true, style: fieldRowStyle }),
    el({ type: 'labelValue', x: 50, y: 1, w: 49, h: 30, zIndex: 2, fieldId: 'cnic', labelUrdu: 'شناختی کارڈ نمبر', showLabel: true, style: fieldRowStyle }),
    el({ type: 'rect', x: 50, y: 1, w: 0.5, h: 30, zIndex: 3, style: { backgroundColor: '#111' } }),
    el({ type: 'rect', x: 1, y: 31, w: 98, h: 0.8, zIndex: 3, style: { backgroundColor: '#111' } }),
    el({ type: 'labelValue', x: 1, y: 32, w: 98, h: 33, zIndex: 2, fieldId: 'address', labelUrdu: 'پتہ', showLabel: true, style: { ...fieldRowStyle, fontSize: 8 } }),
    el({ type: 'rect', x: 1, y: 65, w: 98, h: 0.8, zIndex: 3, style: { backgroundColor: '#111' } }),
    el({ type: 'labelValue', x: 1, y: 66, w: 98, h: 33, zIndex: 2, fieldId: 'pollingStation', labelUrdu: 'پولنگ اسٹیشن', showLabel: true, style: { ...fieldRowStyle, fontSize: 8 } }),
  ];

  return withSize({ backgroundColor: WHITE, backgroundAssetId: null, elements }, widthMm, heightMm);
}

export function createBlankCanvasTemplate(widthMm: number, heightMm: number): ParchiCanvasConfig {
  return withSize(
    {
      backgroundColor: WHITE,
      backgroundAssetId: null,
      elements: [
        el({
          type: 'text',
          x: 10,
          y: 42,
          w: 80,
          h: 16,
          zIndex: 1,
          text: 'کھالی ڈیزائن — بائیں سے عناصر شامل کریں',
          style: { color: '#94A3B8', fontSize: 11, textAlign: 'center' },
        }),
      ],
    },
    widthMm,
    heightMm
  );
}

export function buildCanvasFromTemplate(
  templateId: ParchiTemplateId,
  halkaName: string,
  size: { widthMm: number; heightMm: number }
): ParchiCanvasConfig {
  const w = Math.max(20, Math.min(A4_WIDTH_MM, size.widthMm));
  const h = Math.max(20, Math.min(A4_HEIGHT_MM, size.heightMm));

  switch (templateId) {
    case 'campaign-two-panel':
      return createCampaignTwoPanelTemplate(halkaName, w, h);
    case 'roll-box':
      return createRollBoxTemplate(halkaName, w, h);
    case 'blank':
    default:
      return createBlankCanvasTemplate(w, h);
  }
}

export function getTemplateDefinition(templateId: ParchiTemplateId): ParchiTemplateDefinition {
  return PARCHI_TEMPLATE_CATALOG.find((t) => t.id === templateId) ?? PARCHI_TEMPLATE_CATALOG[0];
}

export function createCanvasDesignFromTemplate(input: {
  halkaName: string;
  name: string;
  templateId: ParchiTemplateId;
  widthMm: number;
  heightMm: number;
  parchiPerPage?: number;
}): Omit<VoterParchiDesign, '_id'> {
  const normalized = input.halkaName.replace(/\s+/g, '').toUpperCase();
  const template = getTemplateDefinition(input.templateId);
  const canvas = buildCanvasFromTemplate(input.templateId, normalized, {
    widthMm: input.widthMm,
    heightMm: input.heightMm,
  });

  return {
    halkaName: normalized,
    name: input.name,
    description: `Canvas design from ${template.name} template.`,
    isDefault: false,
    layoutMode: 'canvas',
    parchiPerPage: input.parchiPerPage ?? template.defaultParchiPerPage,
    slots: [],
    canvas,
    assets: [],
    symbolAssetId: null,
    photoAssetId: null,
    headerAssetId: null,
    customHeaderText: '',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
