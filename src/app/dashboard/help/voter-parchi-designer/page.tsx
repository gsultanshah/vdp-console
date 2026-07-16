'use client';

import { CodeBlock, HelpLink, HelpPageHeader, Section } from '@/components/help/HelpDoc';

export default function VoterParchiDesignerHelpPage() {
  return (
    <div className="space-y-8">
      <HelpPageHeader
        title="Voter Parchi Designer"
        description="Complete guide to designing voter slip (parchi) layouts — canvas editing, live voter preview, A4 print layout, PDF export, and bulk generation."
      />

      <Section title="What is the Parchi Designer?">
        <p>
          The <strong>Voter Parchi Designer</strong> is a visual layout editor for election voter slips
          (parchi). You place labels, voter data fields, images, shapes, and free text on a slip-sized
          canvas — similar to a simple Canva-style editor — then generate PDFs that fill an A4 page with
          multiple slips per sheet.
        </p>
        <p>
          Each design belongs to one <strong>constituency (Halka)</strong>. When voters are printed, real
          data from the database (name, CNIC, address, polling station, electoral roll row image, etc.) is
          placed into your layout automatically.
        </p>
        <p>
          Open the designer from a constituency home page → <strong>Parchi designer</strong> card, or from
          the <strong>Voter parchi</strong> section → <strong>Open canvas designer</strong> (admin only).
          The URL pattern is{' '}
          <code className="rounded bg-gray-100 px-1">/dashboard/constituency/{'{HALKA}'}/parchi-designer/</code>.
        </p>
        <p>
          <strong>Note:</strong> Only <strong>canvas-mode</strong> designs can be edited in this visual
          designer. Older slot-based layouts still work for PDF generation on the constituency page but
          cannot be opened in the canvas editor.
        </p>
      </Section>

      <Section title="Who can do what?">
        <p className="font-medium text-gray-900">Administrators</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Create, rename, save, and copy designs</li>
          <li>Add, move, resize, style, duplicate, and delete elements</li>
          <li>Upload images on image elements (double-click on canvas)</li>
          <li>Change slip dimensions, slips per A4 page, and canvas background color</li>
          <li>Undo changes (up to 10 steps) and use autosave</li>
        </ul>
        <p className="mt-3 font-medium text-gray-900">Non-admin users (viewers)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Open and switch between existing designs</li>
          <li>Preview layouts with real voter data from a selected block code</li>
          <li>Toggle A4 print preview guides</li>
          <li>Download a sample PDF for the selected block</li>
          <li>Use fullscreen mode</li>
        </ul>
        <p className="mt-2">
          Viewers cannot edit the canvas, create designs, upload images, or save changes. If you need to
          change a layout, ask an administrator.
        </p>
      </Section>

      <Section title="Getting started — first time">
        <p>When you open the designer and no canvas design exists yet, you see three options:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>
            <strong>Open existing design</strong> — pick a design already saved for this constituency
            (disabled if none exist).
          </li>
          <li>
            <strong>Copy from another constituency</strong> (admin) — clone a layout from a different
            Halka. Useful when two constituencies share the same campaign slip format.{' '}
            <em>Images are not copied</em> — double-click each image element on the canvas to re-upload
            its file after copying.
          </li>
          <li>
            <strong>Create new design</strong> (admin) — start from a template (see Templates below).
          </li>
        </ol>
        <p className="mt-2">
          The designer remembers your last opened design per constituency for the current browser session.
        </p>
      </Section>

      <Section title="Top toolbar — every control">
        <p>The compact header bar runs across the top of the designer. Controls from left to right:</p>

        <p className="font-medium text-gray-900">Back link &amp; title</p>
        <p>
          Click the constituency name (arrow + Halka) to return to the constituency home page. Hidden in
          fullscreen mode.
        </p>

        <p className="font-medium text-gray-900">Design code (CLI)</p>
        <p>
          Every design gets a unique code like <code className="rounded bg-gray-100 px-1">la39d01</code>{' '}
          (LA39 design 01). The code is shown in the designer toolbar and Properties panel. Use it with
          the CLI:
        </p>
        <CodeBlock>{`npm run export-parchi -- --halka LA39 --mode per-block --all-blockcodes --design-code la39d01`}</CodeBlock>
        <p>
          Codes are assigned automatically when a design is created. Older designs receive codes the
          next time designs are loaded for that constituency. Codes cannot be edited after creation.
        </p>

        <p className="font-medium text-gray-900">Design selector</p>
        <p>
          Dropdown listing all canvas designs for this Halka. Switching designs prompts you to confirm if
          there are unsaved changes (admin).
        </p>

        <p className="font-medium text-gray-900">Design name</p>
        <p>
          Editable text field (admin) to rename the current design. Changing the name marks the design as
          unsaved until you save.
        </p>

        <p className="font-medium text-gray-900">Save status indicator</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Amber dot</strong> — unsaved changes</li>
          <li><strong>Spinner</strong> — saving in progress</li>
          <li><strong>Green check</strong> — all changes saved</li>
        </ul>

        <p className="font-medium text-gray-900">Preview block code</p>
        <p>
          Select an electoral <strong>block code</strong> from this constituency. This drives which real
          voters appear in the canvas preview and in the PDF download. Choose <strong>None</strong> if no
          blocks are loaded yet. Without a block, the designer falls back to sample Urdu placeholder data.
        </p>

        <p className="font-medium text-gray-900">Slips per A4 page</p>
        <p>
          How many parchi fit on one printed A4 sheet (1–5). Admin only. Grid layouts:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>1</strong> — 1×1 (one slip per page)</li>
          <li><strong>2</strong> — 1×2 (two slips stacked vertically)</li>
          <li><strong>3</strong> — 1×3</li>
          <li><strong>4</strong> — 2×2 grid</li>
          <li><strong>5</strong> — 1×5 column</li>
        </ul>
        <p>
          Changing this reloads preview voters (one voter per slip slot) and updates the A4 preview panel.
        </p>

        <p className="font-medium text-gray-900">A4 guides toggle (grid icon)</p>
        <p>
          Shows or hides the <strong>A4 print preview</strong> panel beside the design canvas. Off by
          default so you have more room to edit. Turn on when checking how slips tile on a real A4 sheet.
        </p>

        <p className="font-medium text-gray-900">Undo (U-turn arrow)</p>
        <p>
          Reverts the last canvas change. Admin only. Keyboard shortcut: <strong>Ctrl+Z</strong> (Windows)
          or <strong>Cmd+Z</strong> (Mac). Maximum <strong>10 undo steps</strong>. Undo clears the current
          selection.
        </p>

        <p className="font-medium text-gray-900">Download PDF (green download)</p>
        <p>
          Generates a preview PDF for the <strong>selected block code</strong> using the current design.
          If you are an admin with unsaved changes, the design is saved first automatically. Downloaded
          file name: <code className="rounded bg-gray-100 px-1">{'{HALKA}'}-{'{block}'}-parchi-preview.pdf</code>.
          This is a <em>sample</em> PDF for one block — not the full constituency bulk export (see Bulk
          generation below).
        </p>

        <p className="font-medium text-gray-900">Fullscreen</p>
        <p>Expands the designer to fill the browser window using the Fullscreen API.</p>

        <p className="font-medium text-gray-900">Open / copy design (folder icon)</p>
        <p>Opens the Design Library dialog (admin). Switch designs or copy from another constituency.</p>

        <p className="font-medium text-gray-900">New design (plus icon)</p>
        <p>Opens the New Design dialog to create a design from a template (admin).</p>

        <p className="font-medium text-gray-900">Save (blue check)</p>
        <p>
          Manually saves the design (admin). Disabled when there are no changes or while a save is in
          progress. Autosave also runs <strong>1.5 seconds</strong> after any edit (admin only).
        </p>
      </Section>

      <Section title="Left sidebar — Toolbox">
        <p>
          The left panel is the <strong>Toolbox</strong>. Collapse it with <strong>Hide toolbox</strong> or
          the narrow chevron tab on the edge to gain canvas space.
        </p>

        <p className="font-medium text-gray-900">Add elements</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>+ Label</strong> — static Urdu (or English) label text. Use for field captions like
            نام or پتہ. Right-aligned Nastaliq by default. Can be linked to a voter field so the Urdu
            label auto-fills from field definitions.
          </li>
          <li>
            <strong>+ Value</strong> — dynamic voter data box. Binds to a voter field (default: name).
            Shows live data from the preview voter. White background with border by default.
          </li>
          <li>
            <strong>+ Text</strong> — freeform static text (e.g. campaign slogans, constituency title).
            Starts with placeholder Urdu text <em>نیا متن</em>.
          </li>
          <li>
            <strong>+ Image</strong> — image placeholder. Default binds to <strong>photo</strong> field.
            Double-click on canvas to upload a custom image, or bind to symbol / row scan via Properties.
          </li>
        </ul>
        <p className="mt-2">
          <strong>Recommended pattern:</strong> use separate <strong>Label</strong> and <strong>Value</strong>{' '}
          elements side by side instead of one combined box. This gives finer control over label and value
          fonts, sizes, and positions.
        </p>

        <p className="font-medium text-gray-900">Shapes</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Filled box</strong> — solid green rectangle for panels and backgrounds</li>
          <li><strong>Rectangle outline</strong> — bordered box with transparent fill</li>
          <li><strong>Circle</strong> — circular shape (always round regardless of bounding box)</li>
        </ul>
        <p>Style shapes further in the Properties panel (border color, width, line style, fill, opacity).</p>

        <p className="font-medium text-gray-900">Line style (Solid / Dashed / Dotted)</p>
        <p>
          Applies border line style to the currently selected element(s). Requires at least one selected
          element. If the element has no border color yet, sets green <code className="rounded bg-gray-100 px-1">#00401A</code>{' '}
          at 1px width automatically. Works on rectangles, circles, images, and bordered field boxes.
        </p>

        <p className="font-medium text-gray-900">Roll scan (قطعہ)</p>
        <p>
          Adds a full-width <strong>electoral roll row image</strong> element at the top of the slip
          (~100% wide × 11% tall). Pulls the cropped row scan (<code className="rounded bg-gray-100 px-1">rowCrop</code>)
          from each voter&apos;s uploaded list page. Rendered with <em>cover</em> fit (fills the box,
          aligned left) to match the printed roll row.
        </p>

        <p className="font-medium text-gray-900">Voter fields</p>
        <p>
          Scrollable list of all bindable voter data fields. One click adds a <strong>label + value pair</strong>{' '}
          pre-positioned for that field. Urdu labels are shown. Excludes <strong>row scan</strong> — use
          Roll scan for that. For photos, symbols, or decorative images, use <strong>+ Image</strong> and
          upload via double-click on the canvas.
        </p>
        <p>Available fields:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Statistical code, CNIC, name, father/relation name, age</li>
          <li>Address, previous address, polling station</li>
          <li>Block code, silsila number, gharana number</li>
          <li>Gender, profession, religion</li>
          <li>Custom text (from design-level custom header setting)</li>
        </ul>
        <p className="mt-2">
          <strong>Name field note:</strong> the printed voter name is resolved from the list name column
          (not the full OCR search blob). Numbers embedded in names are stripped for display.
        </p>

        <p className="font-medium text-gray-900">Images (symbol, photo, background)</p>
        <p>
          Use <strong>+ Image</strong> in Add elements, position and resize the box on the canvas, then{' '}
          <strong>double-click</strong> the image element to upload a file (JPEG, PNG, WebP, or GIF).
          Each image is stored on that element — there is no separate design-level assets panel. For a
          full-slip background, add a large image element behind other layers (low z-index) and stretch it
          to cover the slip.
        </p>

        <p className="font-medium text-gray-900">Layers panel</p>
        <p>
          Lists every element sorted by stacking order (top layer first). Format:{' '}
          <code className="rounded bg-gray-100 px-1">type · fieldId z{'{N}'}</code>. Click a row to
          select that element. <strong>Shift+click</strong> or <strong>Ctrl/Cmd+click</strong> toggles
          multi-select. Trash icon deletes a single layer (admin).
        </p>
        <p>
          <strong>Drag to reorder (admin):</strong> use the grip handle on the left of a layer row and
          drag it up or down. The top of the list is the front of the slip (highest z-index). Dropping on
          another row moves the layer to that position and updates z-index values automatically. Layer
          reorder is undoable.
        </p>
      </Section>

      <Section title="Design canvas — editing">
        <p>The center area shows your slip at the correct print aspect ratio.</p>

        <p className="font-medium text-gray-900">Slip surface</p>
        <p>
          The white (or colored) rectangle is the printable slip. A label below shows dimensions in mm
          (e.g. <code className="rounded bg-gray-100 px-1">148 × 74 mm</code>). Optional background
          image fills the slip with <em>cover</em> centering.
        </p>

        <p className="font-medium text-gray-900">Selecting elements</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Click an element to select it (indigo highlight ring)</li>
          <li>Click empty slip area to deselect all</li>
          <li><strong>Shift+click</strong> or <strong>Ctrl/Cmd+click</strong> to add/remove from selection</li>
          <li>The <strong>primary</strong> selection (last clicked) shows resize handles and the delete X</li>
        </ul>

        <p className="font-medium text-gray-900">Moving elements</p>
        <p>
          Drag the primary selected element to reposition it. Positions are stored as <strong>percentages</strong>{' '}
          (0–100) of slip width and height, so layouts scale correctly when slip size changes. Elements
          cannot be dragged outside the slip bounds. A 4px movement threshold prevents accidental drags on
          click.
        </p>

        <p className="font-medium text-gray-900">Resizing elements</p>
        <p>
          Eight resize handles on the primary selection: north, south, east, west, and four corners
          (N, S, E, W, NE, NW, SE, SW). Minimum element size: 4% width × 3% height. One undo entry is
          recorded per completed resize drag.
        </p>

        <p className="font-medium text-gray-900">Deleting elements</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Red <strong>X</strong> button on the primary selected element (admin)</li>
          <li><strong>Delete</strong> or <strong>Backspace</strong> key when elements are selected (admin; not when typing in an input)</li>
          <li>Trash icon in Layers panel or Properties panel</li>
        </ul>

        <p className="font-medium text-gray-900">Resizing the slip itself</p>
        <p>
          Amber handles appear on the slip border (admin). Drag to change print dimensions in mm live.
          Clamped between 20–210 mm width and 20–297 mm height (A4 limits). A floating label shows current
          mm while dragging. Slip resize is undoable.
        </p>

        <p className="font-medium text-gray-900">Live voter preview</p>
        <p>
          Value fields, labels linked to fields, and images show real data from preview voters loaded for
          the selected block code. Urdu text is right-to-left; Latin numbers and English use left-to-right.
          Empty values display as <strong>—</strong>.
        </p>

        <p className="font-medium text-gray-900">Image upload on canvas</p>
        <p>
          <strong>Double-click</strong> an image element to upload a custom file (admin). Accepts
          JPEG, PNG, WebP, GIF. Client compresses to max <strong>1 MB</strong> and <strong>1200px</strong>{' '}
          longest side as JPEG. Progress overlay shows &quot;Optimizing…&quot; then &quot;Uploading…&quot;.
          Design auto-saves after a successful upload.
        </p>
      </Section>

      <Section title="Element types — reference">
        <p>Every object on the canvas is an <strong>element</strong> with a type:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>label</strong> — static caption text. Urdu from <code className="rounded bg-gray-100 px-1">labelUrdu</code>,
            custom <code className="rounded bg-gray-100 px-1">text</code>, or auto from linked field
            definition. Bold green default for field labels.
          </li>
          <li>
            <strong>field</strong> (Value) — dynamic voter data resolved at PDF time from{' '}
            <code className="rounded bg-gray-100 px-1">fieldId</code>. Font auto-scales in PDF to fill
            the box.
          </li>
          <li>
            <strong>text</strong> — static custom text you type in Properties.
          </li>
          <li>
            <strong>image</strong> — uploaded image file, or row scan from voter data when bound to{' '}
            <code className="rounded bg-gray-100 px-1">rowCrop</code>.
            Row scan uses cover fit; others use contain (fit inside box).
          </li>
          <li>
            <strong>rect</strong> / <strong>circle</strong> — decorative or structural shapes.
          </li>
          <li>
            <strong>labelValue</strong> — legacy combined label+value in one box (from older templates).
            Still renders in PDF and designer but <em>cannot be added</em> from the toolbox — use Label +
            Value pairs instead.
          </li>
        </ul>
        <p>
          All positions (<code className="rounded bg-gray-100 px-1">x</code>,{' '}
          <code className="rounded bg-gray-100 px-1">y</code>,{' '}
          <code className="rounded bg-gray-100 px-1">w</code>,{' '}
          <code className="rounded bg-gray-100 px-1">h</code>) are percentages of the slip.{' '}
          <code className="rounded bg-gray-100 px-1">zIndex</code> controls which element appears on top.
        </p>
      </Section>

      <Section title="Right sidebar — Properties">
        <p>
          The right panel shows <strong>element properties</strong> when something is selected, or{' '}
          <strong>canvas properties</strong> when nothing is selected. Collapse with the chevron tab like
          the toolbox.
        </p>

        <p className="font-medium text-gray-900">When elements are selected</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Duplicate</strong> — copies all selected elements, offset +3% right and down, with new
            IDs. All copies become the new selection.
          </li>
          <li>
            <strong>Delete</strong> — removes selection (admin).
          </li>
          <li>
            <strong>Horizontal align</strong> (2+ elements, admin) — align left edges, horizontal centers,
            or right edges of the selection bounding box. No vertical align tool.
          </li>
          <li>
            <strong>Data field</strong> — bind to a voter field or image source. Changing a label&apos;s
            field updates its Urdu caption automatically.
          </li>
          <li>
            <strong>Label / text content</strong> — textarea for <code className="rounded bg-gray-100 px-1">label</code>{' '}
            and <code className="rounded bg-gray-100 px-1">text</code> elements (single selection).
          </li>
          <li>
            <strong>Position &amp; size</strong> — numeric x, y, w, h in percent (single selection, step
            0.5).
          </li>
          <li>
            <strong>Layer (z-index)</strong> — stacking order number (single selection).
          </li>
          <li><strong>Style controls</strong> — see Style controls section below.</li>
        </ul>
        <p>
          With <strong>multi-select</strong>, style changes apply to all selected elements. Position, size,
          and z-index show values for the <em>primary</em> selection only.
        </p>

        <p className="font-medium text-gray-900">When nothing is selected (canvas properties)</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Usage tips for multi-select, drag, resize, amber slip handles, and image double-click</li>
          <li>
            <strong>Slip size (mm)</strong> — width and height number inputs (20–210 × 20–297)
          </li>
          <li>
            <strong>Size presets</strong> (admin) — Campaign 148×74, Half A4 wide 105×148, Full A4 width
            210×99, Compact 120×60
          </li>
          <li>A4 context line — shows cell size and slips-per-page grid</li>
          <li>
            <strong>Preview block code</strong> — search box + dropdown with voter name and count
          </li>
          <li><strong>Page background color</strong> — slip fill color (independent of background image)</li>
          <li>Switch design dropdown (when 2+ designs exist)</li>
          <li>Open or copy design button (admin)</li>
        </ul>
      </Section>

      <Section title="Style controls">
        <p>
          Available in the Properties panel when elements are selected. Changes apply to <strong>all</strong>{' '}
          selected elements. Controls appear only if at least one selected element supports them.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Font</strong> — <em>Nastaliq Urdu</em> (default for campaign text),{' '}
            <em>Sans Arabic</em> (clean readable Urdu), or <em>Latin / numbers</em> (CNIC, English
            polling station names). PDF uses Nastaliq for Urdu with automatic sizing and vertical centering.
          </li>
          <li>
            <strong>Font size</strong> — 6–32 px. PDF may scale text up or down to fit the element box
            while preserving readability.
          </li>
          <li><strong>Text color</strong> — color picker</li>
          <li>
            <strong>Background</strong> — fill color with Clear button for transparency. Not available on
            plain <code className="rounded bg-gray-100 px-1">field</code> (value) elements.
          </li>
          <li>
            <strong>Border color &amp; width</strong> — for shapes, images, and bordered fields (0–8 px)
          </li>
          <li>
            <strong>Line style</strong> — Solid, Dashed, or Dotted borders (same control as toolbox)
          </li>
          <li><strong>Corner radius</strong> — 0–24 px, rectangles only</li>
          <li><strong>Text align</strong> — Right, Center, or Left</li>
          <li><strong>Opacity</strong> — 0.1 to 1.0 slider for any element</li>
        </ul>
      </Section>

      <Section title="A4 print preview">
        <p>
          Enable from the toolbar <strong>A4 guides</strong> button. The screen splits: design canvas on
          the left, simulated A4 sheet on the right.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>A4 page shown at 210×297 mm proportions with 8 mm margin and 2 mm gap between slips</li>
          <li>Numbered slots (1 to N) show how many slips fit per page</li>
          <li>Each slot renders your full design with a <strong>different preview voter</strong> when enough voters are loaded</li>
          <li>Footer shows layout summary: slips per page, slip mm, cell mm, and grid (e.g. 2×2)</li>
          <li>If the slip is smaller than its grid cell, the slot footer shows the cell dimensions</li>
        </ul>
        <p>
          Use this to verify spacing, font sizes, and roll-scan crops before bulk PDF generation.
        </p>
      </Section>

      <Section title="Templates">
        <p>When creating a new design (admin), choose a starting template:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Campaign two-panel</strong> (148×74 mm, 4 per page) — Left panel: voter details with
            row scan, name, CNIC, address, polling station. Right panel: candidate photo, election
            symbol, constituency branding, slogans. Best for full campaign slips.
          </li>
          <li>
            <strong>Voter roll box</strong> (190×48 mm, 5 per page) — Compact bordered box with
            statistical code, CNIC, address, and polling station. Best for minimal list-style slips.
          </li>
          <li>
            <strong>Blank canvas</strong> (148×74 mm, 4 per page) — Empty slip with placeholder Urdu text
            only. Start from scratch.
          </li>
        </ul>
        <p>You can change slip size and slips-per-page after creation in Properties or the toolbar.</p>
      </Section>

      <Section title="Design Library dialog">
        <p>Opened from the toolbar folder icon or canvas properties (admin).</p>
        <p className="font-medium text-gray-900">Open existing</p>
        <p>
          Lists canvas designs for the <strong>current</strong> constituency. Shows name, slips per page,
          and slip dimensions. Click to switch. Highlights the active design.
        </p>
        <p className="font-medium text-gray-900">Copy from constituency</p>
        <p>
          Pick a <strong>source constituency</strong> (any Halka except the current one), then a source
          design, then enter a new name. Copies layout, elements, field bindings, slip size, and slips per
          page with fresh element IDs.
        </p>
        <p className="mt-2 font-medium text-amber-800">Important — images are not copied:</p>
        <ul className="list-disc space-y-1 pl-5 text-amber-900">
          <li>Double-click each image element on the canvas to re-upload its file after copying a design</li>
        </ul>
      </Section>

      <Section title="Save, autosave &amp; undo">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Manual save</strong> — toolbar blue check or waits for autosave
          </li>
          <li>
            <strong>Autosave</strong> — 1.5 s after any change (admin). Silent; watch the status indicator.
          </li>
          <li>
            <strong>Unsaved guard</strong> — switching designs with dirty changes shows a browser confirm
            dialog
          </li>
          <li>
            <strong>Undo history</strong> — per design, max 10 steps. Records moves, resizes, property
            edits (debounced 800 ms), slip resize, and image uploads. Resets when you switch designs.{' '}
            <strong>No redo.</strong>
          </li>
        </ul>
        <p>Saved data includes: design name, canvas elements (with per-element image assets), slip mm size, background color, slips per A4 page, and layout mode.</p>
      </Section>

      <Section title="PDF preview vs bulk generation">
        <p className="font-medium text-gray-900">Designer PDF download (toolbar)</p>
        <p>
          Quick preview for the <strong>selected block code</strong> — generates one A4 page (or more if
          multiple voters fill slots) using real voter data. Useful for proofing layout and fonts before a
          full run.
        </p>
        <p>
          If the system cannot find a <strong>polling station</strong> for that block, it asks you to
          enter one manually. The provided polling station is then used for that block&apos;s generated
          parchi instead of failing the job.
        </p>
        <p className="font-medium text-gray-900">Bulk generation (constituency page)</p>
        <p>
          On the constituency home page, scroll to <strong>Voter parchi</strong>. There you can select a
          saved design, filter by gender and block codes, and start a <strong>bulk PDF job</strong> for all
          voters (or selected blocks). Progress is tracked server-side; download the completed PDF when
          finished. The canvas designer and bulk generator use the same canvas layout engine.
        </p>
        <p>
          For <strong>single-block</strong> and <strong>bulk block-by-block</strong> generation in the web
          UI, if a block has no polling station in the system, the app prompts you for the polling station
          and retries generation with that value for the block.
        </p>
      </Section>

      <Section title="Keyboard shortcuts">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Ctrl+Z / Cmd+Z</strong> — Undo (admin; ignored when focus is in an input field)</li>
          <li><strong>Delete / Backspace</strong> — Delete selected elements (admin; not in input fields)</li>
          <li><strong>Shift+click</strong> — Add/remove from multi-selection</li>
          <li><strong>Ctrl+click / Cmd+click</strong> — Add/remove from multi-selection (Mac/Windows)</li>
        </ul>
        <p>
          There are no shortcuts yet for save, duplicate, copy/paste, arrow-key nudge, or redo.
        </p>
      </Section>

      <Section title="PDF rendering notes">
        <p>Understanding how text appears in generated PDFs helps avoid layout surprises:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Urdu text uses <strong>Noto Nastaliq Urdu</strong> where available; PDF auto-scales font to fit each text box and vertically centers it</li>
          <li>Urdu word order is adjusted for PDFKit (RTL rendering limitation) so names and labels read correctly</li>
          <li>Trailing colons are stripped from labels in PDF output</li>
          <li>CNIC and numeric fields use Latin alignment (left-to-right)</li>
          <li>Row scan images use cover fit clipped to the element box, aligned to the left edge of the roll row</li>
          <li>Age values append <strong>سال</strong> in display</li>
        </ul>
      </Section>

      <Section title="Tips &amp; limitations">
        <ul className="list-disc space-y-2 pl-5">
          <li>Give name fields generous height and width — PDF scales Nastaliq up to fill available space</li>
          <li>Use <strong>Label</strong> + <strong>Value</strong> pairs instead of legacy combined labelValue boxes</li>
          <li>Turn on <strong>A4 guides</strong> before finalizing slips-per-page and slip dimensions</li>
          <li>After copying a design from another constituency, double-click each image element to re-upload its file</li>
          <li>Only the <strong>primary</strong> selected element shows resize handles — select one element for precise sizing</li>
          <li>Horizontal align works on 2+ elements; there is no vertical align — position manually or use numeric y values</li>
          <li>Duplicate (not copy/paste) is the way to clone elements within a design</li>
          <li>Legacy slot-mode designs cannot be edited in the visual designer — create a new canvas design instead</li>
          <li>Touch devices: double-tap an image element to upload (450 ms / 10 px double-tap detection)</li>
          <li>If polling station lookup is missing for a block, the generator will ask you to type one before continuing</li>
        </ul>
      </Section>

      <Section title="Related">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <HelpLink href="/dashboard/help/constituency">Constituency</HelpLink> — block codes, voter
            processing, and bulk parchi generation
          </li>
          <li>
            <HelpLink href="/dashboard/help/vdp-mobile">VDP Mobile</HelpLink> — field app parchi viewing
            and sharing
          </li>
          <li>
            <HelpLink href="/dashboard/help/data-processing">Data Processing</HelpLink> — create
            constituencies and import polling schemes
          </li>
          <li>
            <HelpLink href="/dashboard/help/cli-commands">CLI Commands</HelpLink> — OCR and voter database
            processing before parchi generation
          </li>
        </ul>
      </Section>
    </div>
  );
}
