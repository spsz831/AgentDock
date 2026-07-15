import type { InstallPlanPreview, PlanAction } from '../core/installer';
import { t } from '../i18n';

const DRY_RUN_LABEL: Record<PlanAction, string> = {
  create: 'CREATE   ',
  overwrite: 'OVERWRITE',
  merge: 'MERGE    ',
  skip: 'SKIP     ',
  conflict: 'CONFLICT ',
};

const DIFF_LABEL: Record<PlanAction, string> = {
  create: 'NEW      ',
  overwrite: 'CHANGED  ',
  merge: 'MERGE    ',
  skip: 'SAME     ',
  conflict: 'CONFLICT ',
};

/**
 * Render an install plan preview as text lines.
 * `mode: 'dry-run'` shows intended actions; `mode: 'diff'` shows the gap
 * between the package and the current target machine.
 */
export function renderPlan(plan: InstallPlanPreview, mode: 'dry-run' | 'diff', title?: string): string[] {
  const labels = mode === 'dry-run' ? DRY_RUN_LABEL : DIFF_LABEL;
  const heading = title
    ?? (mode === 'dry-run' ? t('dryrun.header') : t('diff.header'));
  const lines: string[] = [heading, `  target: ${plan.targetPath}`];

  for (const entry of plan.entries) {
    const note = entry.note ? `  (${entry.note})` : '';
    lines.push(`  ${labels[entry.action]} ${entry.to}${note}`);
  }

  const conflicts = plan.conflicts.length;
  const hint = conflicts > 0
    ? (mode === 'dry-run' ? t('plan.forceHint') : t('plan.conflictHint'))
    : '';
  const summary = mode === 'dry-run'
    ? t('plan.summaryDryRun', { total: plan.entries.length, conflicts, hint })
    : t('plan.summaryDiff', { total: plan.entries.length, conflicts, hint });
  lines.push(`  ${summary}`);
  return lines;
}
