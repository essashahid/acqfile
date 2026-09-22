/** Deliberately bounded US forms; unsupported punctuation is never stripped into a number. */
export function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  if (text.length > 64 || !text) return null;
  const accounting = text.startsWith("(") && text.endsWith(")");
  if (accounting) text = text.slice(1, -1);
  if (!/^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) return null;
  if (accounting && text.startsWith("-")) return null;
  const value = Number(text.replace(/[$,]/g, "")) * (accounting ? -1 : 1);
  return Number.isFinite(value) ? value : null;
}
export function parseBoolean(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;
  if (/^(yes|true|x)$/i.test(raw.trim())) return true;
  if (/^(no|false)$/i.test(raw.trim())) return false;
  return null;
}
/** Application form dates explicitly use US month/day/year, or ISO. No Date rollover. */
export function parseDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  if (!iso && !us) return null;
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : [us![3], us![1], us![2]];
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  )
    return null;
  return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
}
