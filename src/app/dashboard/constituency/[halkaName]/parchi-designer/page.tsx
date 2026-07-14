import ParchiDesigner from '@/components/parchi-designer/ParchiDesigner';
import { normalizeConstituencySlug } from '@/lib/constituency-path';

interface ParchiDesignerPageProps {
  params: { halkaName: string };
}

export default function ParchiDesignerPage({ params }: ParchiDesignerPageProps) {
  const halkaName = normalizeConstituencySlug(params.halkaName);
  return <ParchiDesigner halkaName={halkaName} />;
}
