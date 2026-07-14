'use client';

/** Full-bleed designer shell below the main navigation bar. */
export default function ParchiDesignerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 top-14 z-30 overflow-hidden bg-slate-50">
      {children}
    </div>
  );
}
