import { requireCurrentAccount } from '@/lib/session';
import { canWrite } from '@/lib/access';
import { skillMatrix } from '@/lib/reviews';
import SkillsClient from './client';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Skill Matrix · Resource Deployment' };

/** M67 (G-RM-02): a proficiency level per skill per resource, kept by the Resource Manager. */
export default async function SkillsPage() {
  const session = await requireCurrentAccount();
  return <SkillsClient matrix={await skillMatrix()} canWrite={canWrite(session.role, '/api/skills')} />;
}
