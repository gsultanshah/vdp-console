import ConstituencyPageContent from '@/components/constituency/ConstituencyPageContent';
import { normalizeConstituencySlug } from '@/lib/constituency-path';

interface ConstituencyHalkaPageProps {
  params: { halkaName: string };
}

export default function ConstituencyHalkaPage({ params }: ConstituencyHalkaPageProps) {
  const halkaName = normalizeConstituencySlug(params.halkaName);
  return <ConstituencyPageContent initialHalkaName={halkaName} />;
}
