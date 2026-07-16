/** Design code format: {halka}d{NN} e.g. la39d01 = LA39 design 01 */

const DESIGN_CODE_RE = /^([a-z0-9]+)d(\d{2})$/i;

export function normalizeHalkaForDesignCode(halkaName: string): string {
  return halkaName.replace(/\s+/g, '').toUpperCase();
}

export function halkaDesignPrefix(halkaName: string): string {
  return normalizeHalkaForDesignCode(halkaName).toLowerCase();
}

export function normalizeDesignCode(designCode: string): string {
  return designCode.trim().toLowerCase();
}

export function parseDesignCode(designCode: string): { halkaPrefix: string; sequence: number } | null {
  const normalized = normalizeDesignCode(designCode);
  const match = DESIGN_CODE_RE.exec(normalized);
  if (!match) return null;
  return {
    halkaPrefix: match[1].toLowerCase(),
    sequence: Number.parseInt(match[2], 10),
  };
}

export function buildDesignCode(halkaName: string, sequence: number): string {
  const prefix = halkaDesignPrefix(halkaName);
  if (!Number.isFinite(sequence) || sequence < 1 || sequence > 99) {
    throw new Error(`Design sequence must be between 1 and 99 for ${prefix}`);
  }
  return `${prefix}d${String(sequence).padStart(2, '0')}`;
}

export function isValidDesignCode(designCode: string): boolean {
  return parseDesignCode(designCode) != null;
}

export function maxDesignSequenceForHalka(
  designCodes: string[],
  halkaName: string
): number {
  const prefix = halkaDesignPrefix(halkaName);
  let max = 0;
  for (const code of designCodes) {
    const parsed = parseDesignCode(code);
    if (parsed?.halkaPrefix === prefix) {
      max = Math.max(max, parsed.sequence);
    }
  }
  return max;
}
