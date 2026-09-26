// Value formatting for synthetic documents. Pure; shared by drawing, truth and plan authoring.
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const iso = (value: unknown) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (!m) throw Error(`Not an ISO date: ${String(value)}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
};
/** "August 31, 2026" */
export const longDate = (value: unknown) => {
  const { y, m, d } = iso(value);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
/** "08/31/2026", the form most U.S. business documents and the intake parser both read. */
export const usDate = (value: unknown) => {
  const { y, m, d } = iso(value);
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
};
export const monthName = (month: number) => MONTHS[month - 1]!;
export const addDays = (value: string, days: number) =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const grouped = (n: number, cents: boolean) =>
  Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: 2,
  });
/** "$2,425,000", keeping cents only when present. Negative amounts read as accountants print them. */
export const money = (n: number) => {
  const s = `$${grouped(n, Math.round(Math.abs(n) * 100) % 100 !== 0)}`;
  return n < 0 ? `(${s})` : s;
};
/** "$180,000.00", as statements and ledgers print every amount. */
export const money2 = (n: number) => {
  const s = `$${grouped(n, true)}`;
  return n < 0 ? `(${s})` : s;
};
/** "1,200,000", as tax software fills whole-dollar return lines. */
export const amount = (n: number) => (n < 0 ? `(${grouped(n, false)})` : grouped(n, false));
/** "2,040.00", a ledger column without the currency sign. */
export const amount2 = (n: number) => (n < 0 ? `(${grouped(n, true)})` : grouped(n, true));
const ONES =
  "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(
    " ",
  );
const TENS = "  twenty thirty forty fifty sixty seventy eighty ninety".split(" ");
function words(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return TENS[Math.floor(n / 10)]! + (n % 10 ? `-${ONES[n % 10]}` : "");
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
  for (const [size, name] of [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ] as const)
    if (n >= size)
      return `${words(Math.floor(n / size))} ${name}${n % size ? ` ${words(n % size)}` : ""}`;
  return String(n);
}
const title = (s: string) =>
  s.replace(/(^|[\s-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
/** "Two Hundred Forty Thousand and 00/100 Dollars", as a promissory note states its principal. */
export const dollarsInWords = (n: number) =>
  `${title(words(Math.floor(n)))} and ${String(Math.round((n % 1) * 100)).padStart(2, "0")}/100 Dollars`;
/** "one hundred twenty (120)", as agreements state a count. */
export const countInWords = (n: number) => `${words(n)} (${n})`;
/** Deterministic pseudo-random stream for supporting figures that no rule reads. */
export function seeded(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 1_000_000) / 1_000_000;
  };
}
/** Split a total into parts that add back to it exactly, to the cent. */
export function split(total: number, weights: number[]) {
  const cents = Math.round(total * 100);
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((cents * w) / sum));
  parts[0]! += cents - parts.reduce((a, b) => a + b, 0);
  return parts.map((c) => c / 100);
}
/** Split a whole-dollar total into whole-dollar parts that add back to it exactly. */
export function splitWhole(total: number, weights: number[]) {
  const whole = Math.round(total);
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.floor((whole * w) / sum));
  parts[0]! += whole - parts.reduce((a, b) => a + b, 0);
  return parts;
}
