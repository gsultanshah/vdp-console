/**
 * @deprecated Prefer `canvas-templates.ts` for new designs. Re-exports kept for backward compatibility.
 */
export {
  createCampaignTwoPanelTemplate as createCampaignCanvasTemplate,
  createCanvasDesignFromTemplate,
  PARCHI_TEMPLATE_CATALOG,
} from '@/lib/voter-parchi/canvas-templates';

import { createCanvasDesignFromTemplate } from '@/lib/voter-parchi/canvas-templates';
import type { VoterParchiDesign } from '@/lib/voter-parchi/types';

/** @deprecated Use createCanvasDesignFromTemplate with templateId 'campaign-two-panel'. */
export function createCanvasDesign(
  halkaName: string,
  name = 'Campaign voter parchi'
): Omit<VoterParchiDesign, '_id'> {
  return createCanvasDesignFromTemplate({
    halkaName,
    name,
    templateId: 'campaign-two-panel',
    widthMm: 148,
    heightMm: 74,
    parchiPerPage: 4,
  });
}
