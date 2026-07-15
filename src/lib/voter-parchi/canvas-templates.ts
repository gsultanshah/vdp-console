import type { ParchiCanvasConfig, ParchiCanvasElement, ParchiFieldId, VoterParchiDesign } from '@/lib/voter-parchi/types';
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
  fontFamily: 'nastaliq' as const,
  textAlign: 'right' as const,
  padding: 4,
};

const labelOnlyStyle = {
  color: GREEN,
  fontSize: 9,
  fontFamily: 'nastaliq' as const,
  textAlign: 'right' as const,
  fontWeight: 'bold' as const,
  padding: 2,
};

function labelFieldPair(
  fieldId: ParchiFieldId,
  labelUrdu: string,
  layout: { x: number; y: number; valueW: number; labelW: number; h: number; zIndex?: number },
  opts?: { valueStyle?: typeof fieldRowStyle; labelStyle?: typeof labelOnlyStyle }
): ParchiCanvasElement[] {
  const z = layout.zIndex ?? 2;
  const valueStyle = opts?.valueStyle ?? fieldRowStyle;
  const lblStyle = opts?.labelStyle ?? labelOnlyStyle;
  return [
    el({
      type: 'field',
      x: layout.x,
      y: layout.y,
      w: layout.valueW,
      h: layout.h,
      zIndex: z,
      fieldId,
      style: valueStyle,
    }),
    el({
      type: 'label',
      x: layout.x + layout.valueW,
      y: layout.y,
      w: layout.labelW,
      h: layout.h,
      zIndex: z + 1,
      fieldId,
      labelUrdu,
      text: labelUrdu,
      style: lblStyle,
    }),
  ];
}

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
    el({ type: 'image', x: 0, y: 0, w: 50, h: 9, zIndex: 1, imageFieldId: 'rowCrop', style: { borderColor: '#111', borderWidth: 1, backgroundColor: '#f8fafc' } }),
    ...labelFieldPair('name', 'نام', { x: 2, y: 10, valueW: 34, labelW: 12, h: 7 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    ...labelFieldPair('fatherName', 'والد / رشتہ', { x: 2, y: 18, valueW: 34, labelW: 12, h: 7 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    ...labelFieldPair('statisticalCode', 'بلاک کوڈ', { x: 2, y: 26, valueW: 34, labelW: 12, h: 7 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    ...labelFieldPair('silsilaNo', 'سلسلہ نمبر', { x: 2, y: 34, valueW: 34, labelW: 12, h: 7 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    ...labelFieldPair('cnic', 'شناختی کارڈ نمبر', { x: 2, y: 42, valueW: 34, labelW: 12, h: 7 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB' } }),
    ...labelFieldPair('pollingStation', 'پولنگ اسٹیشن', { x: 2, y: 50, valueW: 34, labelW: 12, h: 8 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB', fontSize: 8 } }),
    ...labelFieldPair('address', 'پتہ', { x: 2, y: 59, valueW: 34, labelW: 12, h: 8 }, { valueStyle: { ...fieldRowStyle, borderColor: '#D1D5DB', fontSize: 8 } }),
    el({ type: 'rect', x: 2, y: 69, w: 46, h: 17, zIndex: 1, style: { backgroundColor: GREEN, borderRadius: 3 } }),
    el({
      type: 'text',
      x: 3,
      y: 70,
      w: 44,
      h: 15,
      zIndex: 2,
      text: 'اہم ہدایات برائے ووٹرز: اصل شناختی کارڈ ساتھ لائیں۔ ووٹنگ 8:00 صبح تا 5:00 شام۔',
      style: { color: WHITE, fontSize: 7, textAlign: 'right', fontFamily: 'nastaliq' },
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
      style: { color: WHITE, fontSize: 7, textAlign: 'center', fontFamily: 'nastaliq' },
    }),
    el({
      type: 'text',
      x: 52,
      y: 2,
      w: 46,
      h: 6,
      zIndex: 2,
      text: 'اپنا ووٹ استعمال کریں — تبدیلی کا پیغام',
      style: { color: GREEN, fontSize: 10, fontWeight: 'bold', textAlign: 'center', fontFamily: 'nastaliq' },
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
      style: { color: '#B00000', fontSize: 11, fontWeight: 'bold', textAlign: 'right', fontFamily: 'nastaliq' },
    }),
    el({ type: 'image', x: 76, y: 26, w: 20, h: 18, zIndex: 2, imageFieldId: 'symbol', style: { borderColor: GREEN, borderWidth: 1 } }),
    el({ type: 'text', x: 76, y: 45, w: 20, h: 5, zIndex: 2, text: 'انتخابی نشان', style: { color: GREEN, fontSize: 8, textAlign: 'center', fontFamily: 'nastaliq' } }),
    el({ type: 'rect', x: 52, y: 76, w: 46, h: 11, zIndex: 1, style: { backgroundColor: GREEN, borderRadius: 3 } }),
    el({ type: 'text', x: 53, y: 77, w: 44, h: 9, zIndex: 2, text: 'امیدوار کا نام', style: { color: WHITE, fontSize: 13, fontWeight: 'bold', textAlign: 'center', fontFamily: 'nastaliq' } }),
    el({ type: 'text', x: 52, y: 90, w: 46, h: 6, zIndex: 2, text: 'انصاف | انسانیت | خود داری', style: { color: GREEN, fontSize: 7, textAlign: 'center', fontFamily: 'nastaliq' } }),
  ];

  return withSize({ backgroundColor: WHITE, backgroundAssetId: null, elements }, widthMm, heightMm);
}

/** Template 2 — bordered roll box (reference image 2, bottom box). */
export function createRollBoxTemplate(_halkaName: string, widthMm: number, heightMm: number): ParchiCanvasConfig {
  const elements: ParchiCanvasElement[] = [
    el({ type: 'image', x: 0, y: 0, w: 100, h: 14, zIndex: 1, imageFieldId: 'rowCrop', style: { borderColor: '#111', borderWidth: 1, backgroundColor: '#f8fafc' } }),
    el({ type: 'rect', x: 0, y: 14, w: 100, h: 86, zIndex: 0, style: { backgroundColor: WHITE, borderColor: '#111', borderWidth: 2 } }),
    ...labelFieldPair('statisticalCode', 'شماریاتی کوڈ نمبر', { x: 1, y: 15, valueW: 36, labelW: 13, h: 28 }),
    ...labelFieldPair('cnic', 'شناختی کارڈ نمبر', { x: 50, y: 15, valueW: 36, labelW: 13, h: 28 }),
    el({ type: 'rect', x: 50, y: 15, w: 0.5, h: 28, zIndex: 3, style: { backgroundColor: '#111' } }),
    el({ type: 'rect', x: 1, y: 43, w: 98, h: 0.8, zIndex: 3, style: { backgroundColor: '#111' } }),
    ...labelFieldPair('address', 'پتہ', { x: 1, y: 44, valueW: 86, labelW: 12, h: 28 }, { valueStyle: { ...fieldRowStyle, fontSize: 8 } }),
    el({ type: 'rect', x: 1, y: 72, w: 98, h: 0.8, zIndex: 3, style: { backgroundColor: '#111' } }),
    ...labelFieldPair('pollingStation', 'پولنگ اسٹیشن', { x: 1, y: 73, valueW: 86, labelW: 12, h: 27 }, { valueStyle: { ...fieldRowStyle, fontSize: 8 } }),
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
