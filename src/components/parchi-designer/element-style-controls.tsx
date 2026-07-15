'use client';

import type { ParchiCanvasElement, ParchiCanvasElementStyle } from '@/lib/voter-parchi/types';
import { DEFAULT_URDU_FONT_FAMILY, PARCHI_FONT_FAMILY_OPTIONS } from '@/lib/voter-parchi/parchi-fonts';

interface ElementStyleControlsProps {
  elements: ParchiCanvasElement[];
  disabled?: boolean;
  onStyleChange: (patch: Partial<ParchiCanvasElementStyle>) => void;
}

function supportsBorder(el: ParchiCanvasElement): boolean {
  return el.type === 'rect' || el.type === 'circle' || el.type === 'field' || el.type === 'labelValue' || el.type === 'image';
}

function supportsBackground(el: ParchiCanvasElement): boolean {
  return el.type !== 'field';
}

function supportsTextColor(el: ParchiCanvasElement): boolean {
  return el.type === 'text' || el.type === 'label' || el.type === 'field' || el.type === 'labelValue';
}

function supportsFontSize(el: ParchiCanvasElement): boolean {
  return el.type === 'text' || el.type === 'label' || el.type === 'field' || el.type === 'labelValue';
}

function supportsTextAlign(el: ParchiCanvasElement): boolean {
  return el.type === 'text' || el.type === 'label' || el.type === 'field' || el.type === 'labelValue';
}

export default function ElementStyleControls({ elements, disabled, onStyleChange }: ElementStyleControlsProps) {
  if (elements.length === 0) return null;
  const element = elements[elements.length - 1];
  const style = element.style ?? {};
  const showFontSize = elements.some(supportsFontSize);
  const showTextColor = elements.some(supportsTextColor);
  const showBackground = elements.some(supportsBackground);
  const showBorder = elements.some(supportsBorder);
  const showCornerRadius = elements.some((el) => el.type === 'rect');
  const showTextAlign = elements.some(supportsTextAlign);

  return (
    <div className="space-y-3">
      {showFontSize ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Font</span>
          <select
            value={style.fontFamily ?? DEFAULT_URDU_FONT_FAMILY}
            disabled={disabled}
            onChange={(e) =>
              onStyleChange({ fontFamily: e.target.value as ParchiCanvasElementStyle['fontFamily'] })
            }
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
          >
            {PARCHI_FONT_FAMILY_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {showFontSize ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Font size</span>
          <input
            type="number"
            min={6}
            max={32}
            disabled={disabled}
            value={style.fontSize ?? 10}
            onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
          />
        </label>
      ) : null}

      {showTextColor ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Text color</span>
          <input
            type="color"
            disabled={disabled}
            value={style.color ?? '#111111'}
            onChange={(e) => onStyleChange({ color: e.target.value })}
            className="mt-1 h-9 w-full cursor-pointer rounded border border-slate-200"
          />
        </label>
      ) : null}

      {showBackground ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Background</span>
          <div className="mt-1 flex gap-2">
            <input
              type="color"
              disabled={disabled}
              value={style.backgroundColor?.startsWith('#') ? style.backgroundColor : '#ffffff'}
              onChange={(e) => onStyleChange({ backgroundColor: e.target.value })}
              className="h-9 flex-1 cursor-pointer rounded border border-slate-200"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onStyleChange({ backgroundColor: 'transparent' })}
              className="rounded-lg border border-slate-200 px-2 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear
            </button>
          </div>
        </label>
      ) : null}

      {showBorder ? (
        <>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Border color</span>
            <input
              type="color"
              disabled={disabled}
              value={style.borderColor ?? '#00401A'}
              onChange={(e) =>
                onStyleChange({
                  borderColor: e.target.value,
                  borderWidth: style.borderWidth ?? 1,
                })
              }
              className="mt-1 h-9 w-full cursor-pointer rounded border border-slate-200"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-slate-500">Border width</span>
            <input
              type="number"
              min={0}
              max={8}
              step={0.5}
              disabled={disabled}
              value={style.borderWidth ?? 1}
              onChange={(e) =>
                onStyleChange({
                  borderWidth: Number(e.target.value),
                  borderColor: style.borderColor ?? '#00401A',
                })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
            />
          </label>
        </>
      ) : null}

      {showCornerRadius ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Corner radius</span>
          <input
            type="number"
            min={0}
            max={24}
            disabled={disabled}
            value={style.borderRadius ?? 0}
            onChange={(e) => onStyleChange({ borderRadius: Number(e.target.value) })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
          />
        </label>
      ) : null}

      {showTextAlign ? (
        <label className="block">
          <span className="text-xs font-semibold text-slate-500">Text align</span>
          <select
            value={style.textAlign ?? 'right'}
            disabled={disabled}
            onChange={(e) => onStyleChange({ textAlign: e.target.value as 'left' | 'center' | 'right' })}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5"
          >
            <option value="right">Right</option>
            <option value="center">Center</option>
            <option value="left">Left</option>
          </select>
        </label>
      ) : null}

      <label className="block">
        <span className="text-xs font-semibold text-slate-500">Opacity</span>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          disabled={disabled}
          value={style.opacity ?? 1}
          onChange={(e) => onStyleChange({ opacity: Number(e.target.value) })}
          className="mt-1 w-full"
        />
      </label>
    </div>
  );
}
