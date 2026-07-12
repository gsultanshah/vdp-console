import { ObjectId, type Db } from 'mongodb';
import {
  DEFAULT_MOBILE_BRANDING,
  type MobileAccessCodeBranding,
  type MobileBrandingColors,
  type MobileBrandingTemplate,
  type ResolvedMobileBranding,
} from '@/lib/mobile/types';

const TEMPLATES_COLLECTION = 'mobile_branding_templates';

function normalizeHexColor(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  return fallback;
}

function mergeColors(
  base: MobileBrandingColors,
  override?: Partial<MobileBrandingColors>
): MobileBrandingColors {
  return {
    primary: normalizeHexColor(override?.primary, base.primary),
    secondary: normalizeHexColor(override?.secondary, base.secondary),
    accent: normalizeHexColor(override?.accent, base.accent),
    background: normalizeHexColor(override?.background, base.background),
    surface: normalizeHexColor(override?.surface, base.surface),
    onPrimary: normalizeHexColor(override?.onPrimary, base.onPrimary),
    onSurface: normalizeHexColor(override?.onSurface, base.onSurface),
  };
}

function toTemplate(doc: Record<string, unknown>): MobileBrandingTemplate {
  const colors = (doc.colors as Partial<MobileBrandingColors>) ?? {};
  return {
    _id: String(doc._id),
    name: String(doc.name ?? 'Template'),
    description: String(doc.description ?? ''),
    isDefault: Boolean(doc.isDefault),
    logoUrl: doc.logoUrl ? String(doc.logoUrl) : null,
    colors: mergeColors(DEFAULT_MOBILE_BRANDING, colors),
    createdAt: doc.createdAt ? new Date(doc.createdAt as string | Date) : undefined,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt as string | Date) : undefined,
  };
}

export async function ensureDefaultBrandingTemplate(db: Db): Promise<MobileBrandingTemplate> {
  const existing = await db.collection(TEMPLATES_COLLECTION).findOne({ isDefault: true });
  if (existing) return toTemplate(existing as Record<string, unknown>);

  const doc = {
    name: 'VDP Default',
    description: 'Default purple theme for field users.',
    isDefault: true,
    logoUrl: null,
    colors: DEFAULT_MOBILE_BRANDING,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection(TEMPLATES_COLLECTION).insertOne(doc);
  return toTemplate({ ...doc, _id: result.insertedId } as Record<string, unknown>);
}

export async function listBrandingTemplates(db: Db): Promise<MobileBrandingTemplate[]> {
  await ensureDefaultBrandingTemplate(db);
  const docs = await db.collection(TEMPLATES_COLLECTION).find({}).sort({ isDefault: -1, name: 1 }).toArray();
  return docs.map((doc) => toTemplate(doc as Record<string, unknown>));
}

export async function getBrandingTemplateById(
  db: Db,
  templateId: string
): Promise<MobileBrandingTemplate | null> {
  try {
    const doc = await db.collection(TEMPLATES_COLLECTION).findOne({ _id: new ObjectId(templateId) });
    return doc ? toTemplate(doc as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function createBrandingTemplate(
  db: Db,
  input: {
    name: string;
    description?: string;
    logoUrl?: string | null;
    colors?: Partial<MobileBrandingColors>;
    isDefault?: boolean;
  }
): Promise<MobileBrandingTemplate> {
  if (input.isDefault) {
    await db.collection(TEMPLATES_COLLECTION).updateMany({}, { $set: { isDefault: false } });
  }

  const doc = {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    isDefault: Boolean(input.isDefault),
    logoUrl: input.logoUrl ?? null,
    colors: mergeColors(DEFAULT_MOBILE_BRANDING, input.colors),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const result = await db.collection(TEMPLATES_COLLECTION).insertOne(doc);
  return toTemplate({ ...doc, _id: result.insertedId } as Record<string, unknown>);
}

export async function updateBrandingTemplate(
  db: Db,
  templateId: string,
  patch: Partial<{
    name: string;
    description: string;
    logoUrl: string | null;
    colors: Partial<MobileBrandingColors>;
    isDefault: boolean;
  }>
): Promise<MobileBrandingTemplate | null> {
  const existing = await getBrandingTemplateById(db, templateId);
  if (!existing) return null;

  if (patch.isDefault) {
    await db.collection(TEMPLATES_COLLECTION).updateMany({}, { $set: { isDefault: false } });
  }

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name != null) update.name = patch.name.trim();
  if (patch.description != null) update.description = patch.description.trim();
  if (patch.logoUrl !== undefined) update.logoUrl = patch.logoUrl;
  if (patch.isDefault != null) update.isDefault = patch.isDefault;
  if (patch.colors) {
    update.colors = mergeColors(existing.colors, patch.colors);
  }

  await db.collection(TEMPLATES_COLLECTION).updateOne({ _id: new ObjectId(templateId) }, { $set: update });
  return getBrandingTemplateById(db, templateId);
}

export async function resolveBrandingForAccessCode(
  db: Db,
  halkaName: string,
  branding?: MobileAccessCodeBranding
): Promise<ResolvedMobileBranding> {
  const defaultTemplate = await ensureDefaultBrandingTemplate(db);
  let template = defaultTemplate;

  if (branding?.templateId) {
    const selected = await getBrandingTemplateById(db, branding.templateId);
    if (selected) template = selected;
  }

  const colors = mergeColors(template.colors, branding?.colors);
  const logoUrl = branding?.logoUrl ?? template.logoUrl;
  const appTitle = branding?.appTitle?.trim() || `${halkaName} Voters`;

  return {
    templateId: template._id ?? null,
    templateName: template.name,
    logoUrl,
    appTitle,
    colors,
  };
}
