import type { OcrRowElement } from '@/lib/ocr-types';
import { CLOUDINARY_CROP_WIDTH } from '@/lib/cloudinary-url';
import {
  ratiosToPixelColumns,
  type ConstituencyTableColumnSettings,
} from '@/lib/table-column-settings';

const CNIC_PATTERN = /^\d{5}-\d{7}-\d$/;
const CNIC_SEARCH = /\d{5}-\d{7}-\d/;

export interface OcrCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrVoterTableCell {
  id: string;
  label: string;
  text: string;
  elements: OcrRowElement[];
  bounds: OcrCropRect;
}

export interface DetectedTableColumn {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  index: number;
}

interface ElementCluster {
  elements: OcrRowElement[];
  minX: number;
  maxX: number;
  centerX: number;
  text: string;
}

export interface OcrVoterTableRow {
  rowIndex: number;
  cnic: string;
  silsila_no: string;
  name: string;
  father_name: string;
  profession: string;
  age: string;
  address: string;
  previous_address: string;
  band: OcrCropRect;
  cnicBox: OcrCropRect;
  elements: OcrRowElement[];
  cells: OcrVoterTableCell[];
  /** Cloudinary-style crop segment: c_crop,y_{y},h_{h},w_{w} */
  cropParams: string;
}

export interface OcrVoterTableMeta {
  firstCnicY: number;
  medianRowHeight: number;
  tableTopY: number;
  tableBottomY: number;
  voterCount: number;
  columns: DetectedTableColumn[];
  columnCount: number;
  columnSettingsUpdatedAt?: string;
}

type VisionAnnotation = {
  description?: string | null;
  boundingPoly: { vertices: { x?: number; y?: number }[] };
};

function bboxFromVertices(vertices: { x?: number; y?: number }[]): OcrCropRect {
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function centerY(vertices: { x?: number; y?: number }[]): number {
  const ys = vertices.map((v) => v.y ?? 0);
  return (Math.min(...ys) + Math.max(...ys)) / 2;
}

function annotationToElement(annotation: VisionAnnotation): OcrRowElement {
  const vertices = annotation.boundingPoly.vertices;
  const box = bboxFromVertices(vertices);
  return {
    text: annotation.description ?? '',
    x: box.x,
    width: box.width,
    height: box.height,
    vertices,
    printableText: (annotation.description ?? '').trim(),
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

interface CnicAnchor {
  cnic: string;
  element: OcrRowElement;
  minY: number;
  maxY: number;
  centerY: number;
}

function findCnicAnchors(annotations: VisionAnnotation[]): CnicAnchor[] {
  const anchors: CnicAnchor[] = [];

  for (const annotation of annotations) {
    const text = (annotation.description ?? '').trim();
    if (!CNIC_PATTERN.test(text)) continue;

    const element = annotationToElement(annotation);
    const vertices = annotation.boundingPoly.vertices;
    const minY = Math.min(...vertices.map((v) => v.y ?? 0));
    const maxY = Math.max(...vertices.map((v) => v.y ?? 0));

    anchors.push({
      cnic: text,
      element,
      minY,
      maxY,
      centerY: (minY + maxY) / 2,
    });
  }

  return anchors.sort((a, b) => a.centerY - b.centerY);
}

function findTableHeaderBottom(annotations: VisionAnnotation[]): number {
  const headerMarkers = ['شناختی', 'کارڈ', 'سلسلہ', 'سابقہ پتہ', 'نام', 'پتہ', 'عمر', 'پیشہ'];
  let maxY = 0;

  for (const annotation of annotations) {
    const text = (annotation.description ?? '').trim();
    if (!headerMarkers.some((marker) => text.includes(marker))) continue;
    const y = Math.max(...annotation.boundingPoly.vertices.map((v) => v.y ?? 0));
    maxY = Math.max(maxY, y);
  }

  return maxY > 0 ? maxY + 8 : 920;
}

function filterTableCnicAnchors(
  anchors: CnicAnchor[],
  headerBottomY: number,
  pageHeight: number
): CnicAnchor[] {
  const footerCutoff = pageHeight - 280;
  return anchors.filter(
    (anchor) => anchor.centerY > headerBottomY + 20 && anchor.centerY < footerCutoff
  );
}

function computeRowBands(
  anchors: CnicAnchor[],
  pageWidth: number,
  pageHeight: number,
  tableTopY: number
): OcrCropRect[] {
  if (!anchors.length) return [];

  const gaps = anchors.slice(1).map((anchor, index) => anchor.centerY - anchors[index].centerY);
  const medianGap = gaps.length ? median(gaps) : 92;
  const halfGap = Math.round(medianGap / 2);

  return anchors.map((anchor, index) => {
    const prev = anchors[index - 1];
    const next = anchors[index + 1];

    let top: number;
    if (prev) {
      top = Math.round((prev.maxY + anchor.minY) / 2);
    } else {
      top = Math.max(tableTopY, Math.round(anchor.minY - halfGap));
    }

    let bottom: number;
    if (next) {
      bottom = Math.round((anchor.maxY + next.minY) / 2);
    } else {
      bottom = Math.min(pageHeight, Math.round(anchor.maxY + halfGap));
    }

    const height = Math.max(40, bottom - top);

    return {
      x: 0,
      y: top,
      width: pageWidth,
      height,
    };
  });
}

function elementCenterX(element: OcrRowElement): number {
  return element.x + element.width / 2;
}

function elementBounds(element: OcrRowElement): OcrCropRect {
  const ys = element.vertices.map((v) => v.y ?? 0);
  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : element.height;
  return {
    x: element.x,
    y: minY,
    width: element.width,
    height: Math.max(element.height, maxY - minY),
  };
}

function mergeBounds(bounds: OcrCropRect[]): OcrCropRect {
  if (!bounds.length) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const minX = Math.min(...bounds.map((bound) => bound.x));
  const minY = Math.min(...bounds.map((bound) => bound.y));
  const maxX = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const maxY = Math.max(...bounds.map((bound) => bound.y + bound.height));

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 0),
    height: Math.max(maxY - minY, 0),
  };
}

function clusterBounds(elements: OcrRowElement[]): { minX: number; maxX: number; centerX: number } {
  const minX = Math.min(...elements.map((element) => element.x));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  return {
    minX,
    maxX,
    centerX: (minX + maxX) / 2,
  };
}

function clusterElementsByGap(elements: OcrRowElement[], minGap: number): ElementCluster[] {
  if (!elements.length) return [];

  const sorted = [...elements].sort((a, b) => a.x - b.x);
  const clusters: ElementCluster[] = [];
  let current: OcrRowElement[] = [sorted[0]];

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const element = sorted[index];
    const gap = element.x - (previous.x + previous.width);

    if (gap > minGap) {
      const bounds = clusterBounds(current);
      clusters.push({
        elements: current,
        minX: bounds.minX,
        maxX: bounds.maxX,
        centerX: bounds.centerX,
        text: current
          .map((item) => item.printableText)
          .filter(Boolean)
          .join(' ')
          .trim(),
      });
      current = [element];
    } else {
      current.push(element);
    }
  }

  const bounds = clusterBounds(current);
  clusters.push({
    elements: current,
    minX: bounds.minX,
    maxX: bounds.maxX,
    centerX: bounds.centerX,
    text: current
      .map((item) => item.printableText)
      .filter(Boolean)
      .join(' ')
      .trim(),
  });

  return clusters;
}

function inferSemanticColumn(headerText: string, index: number, total: number): { id: string; label: string } {
  const text = headerText.replace(/\s+/g, ' ').trim();

  if (/شناختی|کارڈ|cnic|id\s*card/i.test(text)) {
    return { id: 'cnic', label: 'CNIC' };
  }
  if (/سابقہ\s*پتہ|previous\s*address/i.test(text)) {
    return { id: 'previous_address', label: 'Previous address' };
  }
  if (/^پتہ$|address/i.test(text) && !/سابقہ/.test(text)) {
    return { id: 'address', label: 'Address' };
  }
  if (/والد|father|relation/i.test(text)) {
    return { id: 'father_name', label: 'Father / relation' };
  }
  if (/^نام$|name/i.test(text) && !/والد/.test(text)) {
    return { id: 'name', label: 'Name' };
  }
  if (/سلسلہ|silsila|serial/i.test(text)) {
    return { id: 'silsila_no', label: 'Silsila no' };
  }
  if (/پیشہ|profession|occupation/i.test(text)) {
    return { id: 'profession', label: 'Profession' };
  }
  if (/عمر|age/i.test(text)) {
    return { id: 'age', label: 'Age' };
  }

  const position = index + 1;
  const fallbackLabel = text || `Column ${position}`;
  return { id: `col_${index}`, label: fallbackLabel };
}

function clustersToColumns(
  clusters: ElementCluster[],
  pageWidth: number,
  labeler: (cluster: ElementCluster, index: number, total: number) => { id: string; label: string }
): DetectedTableColumn[] {
  const sorted = [...clusters].sort((a, b) => a.minX - b.minX);
  const usedIds = new Set<string>();

  return sorted.map((cluster, index) => {
    const prev = sorted[index - 1];
    const next = sorted[index + 1];
    const minX = index === 0 ? 0 : Math.round((prev.maxX + cluster.minX) / 2);
    const maxX =
      index === sorted.length - 1 ? pageWidth : Math.round((cluster.maxX + next.minX) / 2);

    let { id, label } = labeler(cluster, index, sorted.length);
    if (usedIds.has(id)) {
      id = `col_${index}`;
    }
    usedIds.add(id);

    return {
      id,
      label,
      minX,
      maxX,
      index,
    };
  });
}

function findHeaderElements(
  annotations: VisionAnnotation[],
  headerBottomY: number
): OcrRowElement[] {
  const headerTopY = Math.max(0, headerBottomY - 160);
  const headerBandBottom = headerBottomY + 6;

  return annotations
    .filter((annotation) => {
      const center = centerY(annotation.boundingPoly.vertices);
      return center >= headerTopY && center <= headerBandBottom;
    })
    .map(annotationToElement)
    .filter((element) => element.printableText.length > 0);
}

function detectColumnsFromHeader(
  annotations: VisionAnnotation[],
  headerBottomY: number,
  pageWidth: number
): DetectedTableColumn[] | null {
  const headerElements = findHeaderElements(annotations, headerBottomY);
  if (headerElements.length < 2) {
    return null;
  }

  const minGap = Math.max(24, pageWidth * 0.012);
  const clusters = clusterElementsByGap(headerElements, minGap);
  if (clusters.length < 2) {
    return null;
  }

  return clustersToColumns(clusters, pageWidth, (cluster, index, total) =>
    inferSemanticColumn(cluster.text, index, total)
  );
}

function collectSampleRowElements(
  annotations: VisionAnnotation[],
  bands: OcrCropRect[],
  sampleCount = 6
): OcrRowElement[] {
  const sampleBands = bands.slice(0, sampleCount);
  const elements: OcrRowElement[] = [];

  for (const band of sampleBands) {
    const bandBottom = band.y + band.height;
    const rowElements = annotations
      .filter((annotation) => {
        const cy = centerY(annotation.boundingPoly.vertices);
        return cy >= band.y && cy < bandBottom;
      })
      .map(annotationToElement)
      .filter((element) => element.printableText.length > 0);

    elements.push(...rowElements);
  }

  return elements;
}

function detectColumnsFromSampleRows(
  sampleElements: OcrRowElement[],
  pageWidth: number
): DetectedTableColumn[] | null {
  if (sampleElements.length < 3) {
    return null;
  }

  const minGap = Math.max(28, pageWidth * 0.014);
  const clusters = clusterElementsByGap(sampleElements, minGap);
  if (clusters.length < 2) {
    return null;
  }

  return clustersToColumns(clusters, pageWidth, (_cluster, index) => ({
    id: `col_${index}`,
    label: `Column ${index + 1}`,
  }));
}

function horizontalOverlap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function refineColumnSemantics(
  columns: DetectedTableColumn[],
  anchors: CnicAnchor[],
  sampleElements: OcrRowElement[],
  pageWidth: number
): DetectedTableColumn[] {
  if (!columns.length) {
    return columns;
  }

  const next = columns.map((column) => ({ ...column }));
  const usedIds = new Set(next.map((column) => column.id));

  const cnicCenters = anchors.map((anchor) => elementCenterX(anchor.element));
  if (cnicCenters.length) {
    const target = median(cnicCenters);
    const cnicIndex = next.reduce((bestIndex, column, index, list) => {
      const center = (column.minX + column.maxX) / 2;
      const bestCenter = (list[bestIndex].minX + list[bestIndex].maxX) / 2;
      return Math.abs(center - target) < Math.abs(bestCenter - target) ? index : bestIndex;
    }, 0);

    if (!usedIds.has('cnic') || next[cnicIndex].id.startsWith('col_')) {
      const previousId = next[cnicIndex].id;
      usedIds.delete(previousId);
      next[cnicIndex] = {
        ...next[cnicIndex],
        id: 'cnic',
        label: 'CNIC',
      };
      usedIds.add('cnic');
    }
  }

  const rightmostIndex = next.length - 1;
  const rightColumn = next[rightmostIndex];
  const rightElements = sampleElements.filter((element) => {
    const centerX = elementCenterX(element);
    return centerX >= rightColumn.minX && centerX <= rightColumn.maxX;
  });
  const mostlySerial =
    rightElements.length > 0 &&
    rightElements.filter((element) => /^\d{1,4}$/.test(element.printableText)).length /
      rightElements.length >=
      0.5;

  if (mostlySerial && (!usedIds.has('silsila_no') || rightColumn.id.startsWith('col_'))) {
    usedIds.delete(rightColumn.id);
    next[rightmostIndex] = {
      ...rightColumn,
      id: 'silsila_no',
      label: 'Silsila no',
    };
    usedIds.add('silsila_no');
  }

  for (let index = 0; index < next.length; index += 1) {
    const column = next[index];
    const columnElements = sampleElements.filter((element) => {
      const centerX = elementCenterX(element);
      return centerX >= column.minX && centerX <= column.maxX;
    });
    if (!columnElements.length) {
      continue;
    }

    const numericRatio =
      columnElements.filter((element) => /^\d{1,3}$/.test(element.printableText)).length /
      columnElements.length;
    const columnWidth = column.maxX - column.minX;

    if (
      numericRatio >= 0.6 &&
      columnWidth < pageWidth * 0.12 &&
      (!usedIds.has('age') || column.id.startsWith('col_'))
    ) {
      usedIds.delete(column.id);
      next[index] = {
        ...column,
        id: 'age',
        label: 'Age',
      };
      usedIds.add('age');
    }
  }

  return next;
}

function detectColumns(
  annotations: VisionAnnotation[],
  anchors: CnicAnchor[],
  bands: OcrCropRect[],
  headerBottomY: number,
  pageWidth: number
): DetectedTableColumn[] {
  const fromHeader = detectColumnsFromHeader(annotations, headerBottomY, pageWidth);
  const sampleElements = collectSampleRowElements(annotations, bands);
  const fromRows = detectColumnsFromSampleRows(sampleElements, pageWidth);

  let columns = fromHeader ?? fromRows ?? [];
  if (!columns.length && sampleElements.length) {
    columns = [
      {
        id: 'col_0',
        label: 'Column 1',
        minX: 0,
        maxX: pageWidth,
        index: 0,
      },
    ];
  }

  return refineColumnSemantics(columns, anchors, sampleElements, pageWidth);
}

function assignElementToColumn(
  element: OcrRowElement,
  cnic: string,
  columns: DetectedTableColumn[]
): string {
  const text = element.printableText;
  if (text === cnic || CNIC_SEARCH.test(text)) {
    const cnicColumn = columns.find((column) => column.id === 'cnic');
    if (cnicColumn) {
      return cnicColumn.id;
    }
  }

  const elementMinX = element.x;
  const elementMaxX = element.x + element.width;
  const centerX = elementCenterX(element);

  const ranked = columns
    .map((column) => {
      const overlap = horizontalOverlap(elementMinX, elementMaxX, column.minX, column.maxX);
      const columnWidth = Math.max(1, column.maxX - column.minX);
      return {
        column,
        score: overlap / Math.min(Math.max(1, element.width), columnWidth),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked[0]) {
    return ranked[0].column.id;
  }

  const nearest = columns.reduce((best, column) => {
    const center = (column.minX + column.maxX) / 2;
    const bestCenter = (best.minX + best.maxX) / 2;
    return Math.abs(centerX - center) < Math.abs(centerX - bestCenter) ? column : best;
  });

  return nearest.id;
}

export function buildRowCells(
  rowElements: OcrRowElement[],
  cnic: string,
  band: OcrCropRect,
  columns: DetectedTableColumn[]
): OcrVoterTableCell[] {
  const grouped = new Map<string, OcrRowElement[]>();
  for (const column of columns) {
    grouped.set(column.id, []);
  }

  for (const element of rowElements) {
    const columnId = assignElementToColumn(element, cnic, columns);
    if (!grouped.has(columnId)) {
      grouped.set(columnId, []);
    }
    grouped.get(columnId)!.push(element);
  }

  return columns.map((column) => {
    const elements = (grouped.get(column.id) ?? []).sort((a, b) => b.x - a.x);
    const text = elements
      .map((element) => element.printableText)
      .filter(Boolean)
      .join(' ')
      .trim();
    const elementBoundsList = elements.map(elementBounds);
    const bounds =
      elementBoundsList.length > 0
        ? mergeBounds(elementBoundsList)
        : {
            x: column.minX,
            y: band.y,
            width: column.maxX - column.minX,
            height: band.height,
          };

    return {
      id: column.id,
      label: column.label,
      text,
      elements,
      bounds,
    };
  });
}

function fieldsFromCells(cells: OcrVoterTableCell[]) {
  const byId = Object.fromEntries(cells.map((cell) => [cell.id, cell.text]));
  return {
    silsila_no: byId.silsila_no ?? '',
    name: byId.name ?? '',
    father_name: byId.father_name ?? '',
    profession: byId.profession ?? '',
    age: byId.age ?? '',
    address: byId.address ?? '',
    previous_address: byId.previous_address ?? '',
  };
}

export function formatCropParams(rect: OcrCropRect): string {
  return `c_crop,y_${Math.round(rect.y)},h_${Math.round(rect.height)},w_${CLOUDINARY_CROP_WIDTH}`;
}

export function extractVoterTableRows(
  annotations: VisionAnnotation[],
  pageWidth: number,
  pageHeight: number,
  options?: {
    columnSettings?: ConstituencyTableColumnSettings | null;
  }
): { rows: OcrVoterTableRow[]; meta: OcrVoterTableMeta } {
  const headerBottomY = findTableHeaderBottom(annotations);
  const tableTopY = headerBottomY + 12;

  const allAnchors = findCnicAnchors(annotations);
  const anchors = filterTableCnicAnchors(allAnchors, headerBottomY, pageHeight);

  if (!anchors.length) {
    return {
      rows: [],
      meta: {
        firstCnicY: 0,
        medianRowHeight: 0,
        tableTopY,
        tableBottomY: tableTopY,
        voterCount: 0,
        columns: [],
        columnCount: 0,
      },
    };
  }

  const bands = computeRowBands(anchors, pageWidth, pageHeight, tableTopY);
  const columns =
    options?.columnSettings?.columns?.length
      ? ratiosToPixelColumns(options.columnSettings.columns, pageWidth)
      : detectColumns(annotations, anchors, bands, headerBottomY, pageWidth);
  const gaps = anchors.slice(1).map((anchor, index) => anchor.centerY - anchors[index].centerY);
  const medianRowHeight = gaps.length ? Math.round(median(gaps)) : Math.round(bands[0]?.height ?? 90);

  const rows: OcrVoterTableRow[] = anchors.map((anchor, index) => {
    const band = bands[index];
    const bandBottom = band.y + band.height;

    const rowElements = annotations
      .filter((annotation) => {
        const cy = centerY(annotation.boundingPoly.vertices);
        return cy >= band.y && cy < bandBottom;
      })
      .map(annotationToElement)
      .sort((a, b) => b.x - a.x);

    const cnicBox = bboxFromVertices(anchor.element.vertices);
    const cells = buildRowCells(rowElements, anchor.cnic, band, columns);
    const fields = fieldsFromCells(cells);

    return {
      rowIndex: index + 1,
      cnic: anchor.cnic,
      ...fields,
      band,
      cnicBox,
      elements: rowElements,
      cells,
      cropParams: formatCropParams(band),
    };
  });

  const lastBand = bands[bands.length - 1];

  return {
    rows,
    meta: {
      firstCnicY: Math.round(anchors[0].minY),
      medianRowHeight,
      tableTopY: bands[0]?.y ?? tableTopY,
      tableBottomY: lastBand ? lastBand.y + lastBand.height : tableTopY,
      voterCount: rows.length,
      columns,
      columnCount: columns.length,
    },
  };
}
