export type RegressionMetrics = {
  statusAccuracy: number;
  plantedRecall: number;
  falseSatisfiedBefore: number;
  falseSatisfiedAfter: number;
  trapsRaised: number;
};
/** Percentages are percentage points, not fractions. A passing baseline is never replaced by a failing run. */
export function regression(current: RegressionMetrics, baseline: RegressionMetrics | null) {
  const failures: string[] = [];
  for (const key of ["statusAccuracy", "plantedRecall"] as const)
    if (baseline && baseline[key] - current[key] > 2 + 1e-9)
      failures.push(`${key} dropped more than 2 percentage points`);
  if (current.falseSatisfiedBefore || current.falseSatisfiedAfter) failures.push("False satisfied");
  if (current.trapsRaised) failures.push("Trap raised");
  return failures;
}
