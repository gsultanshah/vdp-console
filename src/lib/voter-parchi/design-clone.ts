import type { ParchiCanvasConfig, VoterParchiDesign } from '@/lib/voter-parchi/types';

function newElementId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `el-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function cloneCanvasConfig(canvas: ParchiCanvasConfig): ParchiCanvasConfig {
  return {
    ...canvas,
    backgroundAssetId: null,
    elements: canvas.elements.map((el) => ({
      ...el,
      id: newElementId(),
      assetId: el.assetId ? null : el.assetId,
    })),
  };
}

export function buildCopiedDesignPayload(
  source: VoterParchiDesign,
  targetHalka: string,
  name: string
): Omit<VoterParchiDesign, '_id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'createdByName'> {
  if (!source.canvas) {
    throw new Error('Source design has no canvas layout');
  }
  const normalized = targetHalka.replace(/\s+/g, '').toUpperCase();
  return {
    halkaName: normalized,
    name: name.trim(),
    description: `Copied from ${source.halkaName}: ${source.name}`,
    isDefault: false,
    layoutMode: 'canvas',
    parchiPerPage: source.parchiPerPage,
    slots: [],
    canvas: cloneCanvasConfig(source.canvas),
    assets: [],
    symbolAssetId: null,
    photoAssetId: null,
    headerAssetId: null,
    customHeaderText: source.customHeaderText ?? '',
  };
}

export function designStorageKey(halkaName: string): string {
  return `parchi-design:${halkaName.replace(/\s+/g, '').toUpperCase()}`;
}
