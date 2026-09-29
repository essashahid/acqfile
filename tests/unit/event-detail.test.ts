import { describe, expect, it } from "vitest";
import { eventDetail, type EventLookups } from "@/lib/deliverables/event-detail";

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const VERSION = "4307871c-6e0d-455d-ad03-cacfe30459c1";
const SEGMENT = "e36e5a22-8383-465f-8a03-64b9b22dc691";
const FACT = "0920a526-7996-4a39-9a0c-df7a87a8d2d8";
const PARTY = "473c2675-38ec-46c7-b54f-c50b7157dbdd";
const look: EventLookups = {
  file: (id) => (id === VERSION ? "amended-purchase-agreement.pdf" : null),
  segment: (id) =>
    id === SEGMENT ? { type: "PURCHASE_AGREEMENT", file: "amended-purchase-agreement.pdf" } : null,
  fact: (id) =>
    id === FACT
      ? {
          attribute: "deal.purchase_price",
          value: 1050000,
          file: "amended-purchase-agreement.pdf",
        }
      : null,
  party: (id) => (id === PARTY ? "Kiel McDermott" : "Not recorded"),
  question: (key) => (key === "k1" ? "Which purchase price is right?" : null),
};
const detail = (action: string, entityId: string | null, maskedAfter: unknown) =>
  eventDetail({ action, entityType: "x", entityId, maskedAfter }, look);

describe("change-log details name files, values and people, not record ids", () => {
  it("describes each kind of event readably", () => {
    expect(
      detail("deal_created", null, {
        code: "VCS-1",
        name: "Varnholt",
        as_of: "2026-09-15",
        parties: [{ id: "buyer" }],
      }),
    ).toBe("VCS-1 · Varnholt; as of 15 Sep 2026");
    expect(
      detail("file_uploaded", VERSION, {
        hash: "157a33b5e7f699bd900822605d7f586ac1eb215e56067ac4287f9dbc13e41254",
        batch: 1,
        arrivalId: "b95aa78f-ba08-468f-855c-bfbe057ca518",
      }),
    ).toBe("amended-purchase-agreement.pdf (upload 1)");
    expect(detail("segments_finalized", VERSION, { recordId: SEGMENT, segments: 1 })).toBe(
      "amended-purchase-agreement.pdf: 1 document filed",
    );
    expect(
      detail("facts_extracted", SEGMENT, {
        gaps: 1,
        facts: 5,
        routing: { auto_accepted: 5 },
        byMethod: { text: 5 },
      }),
    ).toMatch(
      /^Purchase agreement in amended-purchase-agreement\.pdf: 5 values read; 5 .+; 1 not found$/,
    );
    expect(
      detail("original_opened", VERSION, {
        link: "[masked ••••9020]",
        documentVersionId: VERSION,
        contentHash: "0e90",
      }),
    ).toBe("amended-purchase-agreement.pdf");
    expect(detail("fact_edit_accept", FACT, { value: 1000000, comment: "Checked page 1" })).toBe(
      "Purchase price: $1,000,000 — amended-purchase-agreement.pdf — “Checked page 1”",
    );
    expect(
      detail("fact_entered", SEGMENT, {
        attribute: "deal.purchase_price",
        value: 1050000,
        page: 2,
        source: "manual",
      }),
    ).toBe("Purchase price: $1,050,000 — amended-purchase-agreement.pdf, page 2");
    expect(detail("portal_link_created", null, { partyId: PARTY })).toBe("For Kiel McDermott");
    expect(
      detail("portal_upload", null, {
        partyId: PARTY,
        linkId: SEGMENT,
        runId: FACT,
        taskKey: "k1",
        versions: [VERSION],
      }),
    ).toBe(
      "Kiel McDermott: 1 file sent through their personal link — Which purchase price is right?",
    );
    expect(
      detail("attestation_tracking", null, {
        rule_id: "LND-01",
        scope_key: "deal",
        state: "ordered",
        kind: "tracking",
      }),
    ).toBe("LND-01 · Not recorded: Ordered");
    expect(detail("snapshot_created", null, { number: 2, files: 44 })).toBe("Version 2; 44 files");
  });

  it("an unfamiliar event keeps its readable details and drops every reference", () => {
    const text = detail("something_new", FACT, {
      caseId: "D08",
      workspaceId: PARTY,
      readingMode: "prepared",
      segment_ids: [SEGMENT],
      evaluation_id: FACT,
      nested: { recordId: SEGMENT, count: 2 },
      stray: `see ${VERSION}`,
    });
    expect(text).toBe("Reading mode: prepared; Count: 2");
    expect(text).not.toMatch(UUID);
  });
});
