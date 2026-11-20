/**
 * What recording a resource's exit means (M68) — pure, and safe to import
 * from client components.
 *
 * An exit is a date, not a status. `exit_date IS NULL` means the person is on
 * the roster; anything else means they have left or are leaving on that day.
 * A second status column would be one more thing to keep in step with the
 * date, and the two would eventually disagree.
 *
 * The one rule with teeth is D17: a deployment that runs past the exit date
 * would keep feeding invoice lines for somebody who is gone. Rather than
 * ending those quietly — which changes what gets billed next month — the exit
 * is refused until the operator either closes them by hand or ticks the box
 * that ends them at the exit date.
 */

export type ExitDeployment = {
  id: number;
  projectName: string;
  startDate: string;
  /** Null means open-ended, which is the common case and always blocks. */
  endDate: string | null;
};

/**
 * Deployments still running the day after the exit. An exit on the 30th
 * leaves a deployment ending on the 30th alone: that is a deployment which
 * ends exactly when the person does, which is the tidy case, not a problem.
 */
export function deploymentsPastExit(
  deployments: readonly ExitDeployment[],
  exitDate: string,
): ExitDeployment[] {
  return deployments.filter((d) => d.endDate === null || d.endDate > exitDate);
}

/**
 * Why an exit is refused, or null when it may go ahead. `endOpenDeployments`
 * is the operator's tick: with it, the same ones named here are ended at the
 * exit date inside the exit's transaction.
 */
export function exitRefusal(
  deployments: readonly ExitDeployment[],
  exitDate: string,
  endOpenDeployments: boolean,
): string | null {
  if (endOpenDeployments) return null;
  const open = deploymentsPastExit(deployments, exitDate);
  if (open.length === 0) return null;
  const names = open.map((d) => d.projectName).join(', ');
  return open.length === 1
    ? `This resource is still deployed on ${names} past ${exitDate}. End that deployment first, or tick the box to end it on the exit date.`
    : `This resource is still deployed on ${open.length} projects past ${exitDate} (${names}). End them first, or tick the box to end them on the exit date.`;
}

/**
 * A deployment that started after the person leaves is a data error worth
 * naming rather than ending silently: ending it at the exit date would leave
 * it finishing before it began.
 */
export function deploymentsStartingAfterExit(
  deployments: readonly ExitDeployment[],
  exitDate: string,
): ExitDeployment[] {
  return deployments.filter((d) => d.startDate > exitDate);
}

/**
 * D19: a leaver keeps their login until the day they leave, so the last
 * timesheet can still be filed. Null would mean "no limit", which is the one
 * thing an exit must not leave behind.
 */
export function accessUntilForExit(exitDate: string): string {
  return exitDate;
}

/** True when the resource has left, or has a leaving date recorded. */
export function hasExited(resource: { exitDate: string | null }): boolean {
  return resource.exitDate !== null;
}

/**
 * Whether the exit has actually happened yet, as against being scheduled.
 * The roster filters on `exit_date IS NULL` regardless — somebody serving
 * notice should not be picked for a new deployment — but the badge reads
 * differently, and so should it.
 */
export function exitState(
  resource: { exitDate: string | null },
  today: string,
): 'active' | 'leaving' | 'exited' {
  if (resource.exitDate === null) return 'active';
  return resource.exitDate > today ? 'leaving' : 'exited';
}
