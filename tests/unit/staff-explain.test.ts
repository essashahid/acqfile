import { describe, expect, it } from "vitest";
import { loadPack } from "@/lib/rules/loader";
import type { Rule } from "@/lib/rules/schema";
import {
  actionHref,
  checksFromMessage,
  controlId,
  describeCheck,
  explainItem,
  manualMeaning,
  profileDependencies,
  safeReturn,
  stageEffect,
} from "@/lib/staff/explain";
import { draftBody, draftItems } from "@/lib/deliverables/requests";

const pack = loadPack("sop-50-10-8");
const rules = new Map([...pack.items, ...pack.consistency].map((r) => [r.id, r]));
const rule = (id: string) => rules.get(id)!;
/** The stored check results for a rule, with the given results in rule order. */
const checks = (id: string, results: string[]) =>
  rule(id).checks.map((c, i) => ({ type: c.type, result: results[i]!, message: c.message }));
const explain = (
  id: string,
  results: string[],
  extra: Partial<Parameters<typeof explainItem>[0]> = {},
) =>
  explainItem({
    rule: rule(id),
    status: "needs_review",
    checks: checks(id, results),
    parameters: pack.parameters,
    ...extra,
  });

describe("a review item explains the specific open check", () => {
  it("states the license question and leads to the license record, not a document", () => {
    const ex = explain("TGT-09", ["pass", "unknown"]);
    expect(ex.summary).toBe(
      "Confirm whether the business uses the seller's personal license. Record what you agreed with the lender.",
    );
    expect(ex.summary).not.toMatch(/whether does|Could not determine/);
    expect(ex.family).toBe("manual");
    expect(ex.action).toMatchObject({ kind: "confirm", label: "Record license review" });
    expect(ex.open[0]!.label).toBe("Not recorded");
    // Missing record is not evidence that the license is absent, invalid or personal.
    expect(ex.open[0]!.saved).toBe("Nothing has been recorded yet.");
    expect(manualMeaning("personal_license")).toMatch(/not a yes or no about the license/);
  });

  it("keeps citizenship to lender handling and never decides it", () => {
    const ex = explain("GUA-05", ["pass", "unknown"]);
    expect(ex.summary).toMatch(/^Confirm with the lender how they want citizenship evidence/);
    expect(ex.note).toMatch(/does not decide citizenship or eligibility/);
    expect(ex.note).toMatch(/unverified configuration note, not a statement of current law/);
    expect(`${ex.summary} ${ex.note}`).not.toMatch(/\b(is|are) (eligible|ineligible|a citizen)\b/);
  });

  it("reports lender tracking from the saved state without assuming it was not ordered", () => {
    const none = explain("LND-01", ["unknown"]);
    expect(none.family).toBe("tracking");
    expect(none.action.kind).toBe("tracking");
    expect(none.open[0]!.label).toBe("Not recorded");
    expect(none.open[0]!.saved).toMatch(/does not mean the lender has not ordered it/);
    const ordered = explain("LND-01", ["fail"], {
      status: "tracking",
      saved: [
        { kind: "tracking", key: "", state: "ordered", confirmed: null, note: "Ordered 9/1" },
      ],
    });
    expect(ordered.open[0]!.label).toBe("Ordered");
    expect(ordered.open[0]!.tone).toBe("accent");
  });

  it("uses distinct words for a failed check and an unconfirmed one", () => {
    const signature = rule("ENT-01").checks.find((c) => c.type === "signed_and_dated")!;
    const failed = describeCheck(rule("ENT-01"), { ...signature, result: "fail" }, signature);
    const unknown = describeCheck(rule("ENT-01"), { ...signature, result: "unknown" }, signature);
    expect(failed.label).toBe("Not met");
    expect(unknown.label).toBe("Not confirmed yet");
    expect(failed.text).toBe("The document is recorded as not signed or not dated.");
    expect(unknown.text).toBe(
      "The signature or its date has not been confirmed on the document on file.",
    );
    const ex = explain(
      "ENT-01",
      rule("ENT-01").checks.map((c) => (c === signature ? "unknown" : "pass")),
    );
    expect(ex.action).toMatchObject({ kind: "document", label: "Edit document details" });
  });

  it("gives missing evidence, value disagreement and a relationship different next steps", () => {
    const missing = explainItem({
      rule: rule("GUA-05"),
      status: "missing",
      checks: [],
      findingMessage: "Missing: Citizenship evidence",
    });
    expect(missing.summary).toBe("No citizenship evidence on file.");
    expect(missing.action.kind).toBe("follow-ups");

    const price = explain("CON-03", ["fail"], { status: "received_with_issues" });
    expect(price.family).toBe("disagreement");
    expect(price.action).toMatchObject({
      kind: "values",
      label: "Compare values with their sources",
    });

    const lease = explain(
      "CON-13",
      rule("CON-13").checks.map(() => "fail"),
      {
        status: "received_with_issues",
      },
    );
    expect(lease.family).toBe("relationship");
    expect(lease.summary).toMatch(/does not cover the configured review period/);
    expect(lease.summary).not.toMatch(/different values/);
    expect(lease.action.kind).toBe("follow-ups");
  });

  it("names unread values instead of guessing that they are wrong", () => {
    const withFacts = [...rules.values()].find((r) =>
      r.checks.some((c) => c.type === "presence" && c.facts?.length),
    )!;
    const ex = explainItem({
      rule: withFacts,
      status: "needs_review",
      checks: withFacts.checks.map((c) => ({
        type: c.type,
        result: c.type === "presence" ? "unknown" : "pass",
        message: c.message,
      })),
    });
    expect(ex.summary).toMatch(/is on file, but .* not been read or confirmed\.$/);
    expect(ex.action.kind).toBe("values");
  });
});

describe("links, stages and history", () => {
  it("links a manual check to its exact control on Requirements", () => {
    const rowKey = "TGT-09|48cfb5a9-6d9c|";
    const href = actionHref("confirm", "/staff/deals/d", { rowKey, noteKey: "personal_license" })!;
    expect(href).toBe(
      `/staff/deals/d/requirements?show=all&focus=${encodeURIComponent(rowKey)}#${controlId("confirm", rowKey, "personal_license")}`,
    );
    expect(controlId("confirm", rowKey, "personal_license")).toMatch(/^[A-Za-z0-9_-]+$/);
    // Two owners with the same requirement never share a control.
    expect(controlId("confirm", "GUA-05|a|", "x")).not.toBe(controlId("confirm", "GUA-05|b|", "x"));
  });

  it("accepts only a way back into this deal's Review or Requirements", () => {
    const base = "/staff/deals/d1";
    expect(safeReturn(base, "/staff/deals/d1/review?finding=k")).toBe(
      "/staff/deals/d1/review?finding=k",
    );
    expect(safeReturn(base, "https://evil.example/staff/deals/d1/review")).toBeNull();
    expect(safeReturn(base, "//evil.example/staff/deals/d1/review")).toBeNull();
    expect(safeReturn(base, "/staff/deals/d2/review?finding=k")).toBeNull();
    expect(safeReturn(base, "/staff/deals/d1/review/../../d2/review")).toBeNull();
  });

  it("describes preparation effect from the configured stage, not from priority", () => {
    expect(
      stageEffect(rule("LND-01"), { status: "needs_review", responsible: "lender" }).blocks,
    ).toBe(false);
    expect(
      stageEffect(rule("TGT-09"), { status: "needs_review", responsible: "seller" }),
    ).toMatchObject({
      blocks: true,
      text: "Must be completed before the file can be prepared.",
    });
    const unknownStage = { ...rule("TGT-09"), submission_stage: "unknown" } as Rule;
    expect(stageEffect(unknownStage, { status: "satisfied", responsible: "seller" }).blocks).toBe(
      true,
    );
  });

  it("reads a closed item's checks from its recorded message", () => {
    expect(
      checksFromMessage(
        rule("TXN-08"),
        "unknown: Confirm with lender whether required; unknown: Lender-ordered item received",
      ).map((c) => c.type),
    ).toEqual(["manual_confirmation", "tracking"]);
  });

  it("claims deal-profile dependencies only where a check reads the profile", () => {
    expect(profileDependencies(rule("TGT-09"))).toEqual([]);
    expect(profileDependencies(rule("CON-02"))).toContain("Declared post-closing ownership");
  });
});

describe("follow-up drafts match the check", () => {
  const finding = (ruleId: string, message: string, type = "needs_review") =>
    ({
      ruleId,
      type,
      severity: "major",
      scopeKey: "s",
      period: null,
      detailsJson: { message, details: [] },
    }) as never;
  const items = (f: never) =>
    draftItems(
      [f],
      rules,
      () => "Varnholt Climate Services LLC",
      () => "License, page 1",
    );

  it("asks about the personal license instead of a replacement document", () => {
    const [item] = items(
      finding(
        "TGT-09",
        "unknown: Does the business operate on the seller’s personal license? Record handling with lender",
      ),
    );
    expect(item!.ask).toMatch(
      /^Please tell us whether Varnholt Climate Services LLC operates under the seller.s personal license\./,
    );
    expect(`${item!.ask} ${item!.because}`).not.toMatch(
      /whether does|send a (complete|new)|could not confirm that does/i,
    );
  });

  it("asks the lender for tracking status and requests no borrower document", () => {
    const [item] = items(finding("LND-01", "unknown: Lender-ordered item received"));
    expect(item!.ask).toBe(
      "Please tell us the status of the credit reports: not yet ordered, ordered, or received.",
    );
    expect(item!.because).toMatch(/No document is needed from the borrower/);
  });

  it("does not head an answers-only message as a document request", () => {
    const body = draftBody(
      { code: "D08", name: "Varnholt Climate Services LLC" },
      "lender",
      [finding("LND-01", "unknown: Lender-ordered item received")],
      rules,
      () => "Transaction",
      () => "",
    );
    expect(body.split("\n")[0]).toBe("Information needed for Varnholt Climate Services LLC");
  });
});
