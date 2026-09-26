import { fakeId } from "../../plans/shared";
/** Authored value as a document prints it; synthetic identifiers print in the clear. */
export function display(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value) && "hmac" in value) {
    for (const clear of [
      "00-1234567",
      "00-1234568",
      "00-7654321",
      "00-5556789",
      "00-5566789",
      "900-12-3456",
      "901-23-4567",
    ])
      if (fakeId(clear).hmac === (value as { hmac: string }).hmac) return clear;
    throw Error("Unknown synthetic identifier");
  }
  if (Array.isArray(value))
    return value
      .map((v) =>
        typeof v === "object" && v !== null
          ? Object.values(v).map(display).join(" / ")
          : display(v),
      )
      .join("; ");
  return typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
}
