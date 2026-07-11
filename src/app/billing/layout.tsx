import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoice | VDP Console',
};

export default function BillingPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100 py-10">
      <div className="mx-auto max-w-5xl px-4">{children}</div>
    </div>
  );
}
