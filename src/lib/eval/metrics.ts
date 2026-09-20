export type Tally = [correct: number, total: number];
export const percent = ([correct, total]: Tally) => (total ? (100 * correct) / total : 100);
export const add = (t: Tally, ok: boolean) => {
  t[0] += Number(ok);
  t[1]++;
};
export const sum = (values: Tally[]): Tally =>
  values.reduce<Tally>((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);
export function gate(label: string, tally: Tally, minimum: number) {
  return {
    label,
    correct: tally[0],
    total: tally[1],
    measured: percent(tally),
    required: `>= ${minimum}%`,
    passed: percent(tally) >= minimum,
  };
}
