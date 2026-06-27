'use client';

import { useState } from 'react';
import { EXPORT_GUIDE_SECTIONS } from '@/lib/export-guide';
import { EXPORT_FILE_SIZE_UI_MB } from '@/lib/export-fields';

export default function ExportGuidePanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white shadow sm:rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h3 className="text-lg font-medium text-gray-900">Export guide</h3>
            <p className="mt-1 text-sm text-gray-500">
              How to export from the UI or CLI, field reference, resume, and troubleshooting.
            </p>
          </div>
          <span className="shrink-0 text-sm font-medium text-indigo-600">
            {isOpen ? 'Hide' : 'Show guide'}
          </span>
        </button>

        {isOpen && (
          <div className="mt-6 space-y-8 border-t border-gray-200 pt-6">
            {EXPORT_GUIDE_SECTIONS.map((section) => (
              <section key={section.title}>
                <h4 className="text-sm font-semibold text-gray-900">{section.title}</h4>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  {section.lines.map((line, index) =>
                    line === '' ? (
                      <div key={`${section.title}-${index}`} className="h-2" />
                    ) : line.startsWith('  ') || line.startsWith('#') || line.startsWith('npm ') ? (
                      <pre
                        key={`${section.title}-${index}`}
                        className="overflow-x-auto rounded-md bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800"
                      >
                        {line}
                      </pre>
                    ) : line.startsWith('  •') ? (
                      <p key={`${section.title}-${index}`} className="pl-2">
                        {line.replace(/^  • /, '• ')}
                      </p>
                    ) : (
                      <p key={`${section.title}-${index}`}>{line}</p>
                    )
                  )}
                </div>
              </section>
            ))}

            <p className="text-xs text-gray-500">
              Maximum file size: {EXPORT_FILE_SIZE_UI_MB} MB per output file.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
