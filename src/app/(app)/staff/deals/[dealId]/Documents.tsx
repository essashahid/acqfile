import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { loadPack } from "@/lib/rules/loader";
import type { FilingRecord } from "@/lib/deals/filing";
import { undoAction, retryDealRunAction } from "../actions";
export async function DealDocuments({
  dealId,
  pack,
  overlay,
  editable,
}: {
  dealId: string;
  pack: string;
  overlay: string | null;
  editable: boolean;
}) {
  const db = getDb();
  const [segments, reviews, parties, versions, records, events, runs] = await Promise.all([
    db.select().from(schema.segments).where(eq(schema.segments.dealId, dealId)),
    db
      .select()
      .from(schema.intakeReviews)
      .where(and(eq(schema.intakeReviews.dealId, dealId), eq(schema.intakeReviews.status, "open"))),
    db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId)),
    db.select().from(schema.documentVersions).where(eq(schema.documentVersions.dealId, dealId)),
    db
      .select({ record: schema.recordVersions })
      .from(schema.recordVersions)
      .innerJoin(
        schema.documentVersions,
        and(
          eq(schema.documentVersions.id, schema.recordVersions.documentVersionId),
          eq(schema.documentVersions.dealId, dealId),
        ),
      )
      .where(eq(schema.recordVersions.isCurrent, true)),
    db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.dealId, dealId), eq(schema.events.action, "segment_superseded"))),
    db.select().from(schema.processingRuns).where(eq(schema.processingRuns.status, "failed")),
  ]);
  const folders =
    pack === "unknown"
      ? ["Transaction", "Buyer", "Guarantors", "Target", "Lender"]
      : loadPack(pack, overlay ?? undefined).index.folders;
  const folder = (type: string, partyId: string | null) => {
    if (["OTHER_NOT_REQUIRED", "UNREADABLE"].includes(type)) return "Unfiled or not required";
    if (
      [
        "LOI",
        "PURCHASE_AGREEMENT",
        "SOURCES_USES",
        "SELLER_NOTE",
        "NON_COMPETE",
        "SBA_155",
      ].includes(type)
    )
      return folders[0]!;
    const roles = parties.find((p) => p.id === partyId)?.roles ?? [];
    return roles.includes("buyer_entity")
      ? folders[1]!
      : roles.includes("seller_entity")
        ? folders[3]!
        : roles.some((r) => ["buyer_owner", "guarantor", "donor", "affiliate"].includes(r))
          ? folders[2]!
          : "Unfiled or not required";
  };
  const filed = segments
    .filter((s) => s.isCurrent && s.status === "confirmed")
    .map((s) => ({
      id: s.id,
      versionId: s.documentVersionId,
      label: `${s.docType} · ${parties.find((p) => p.id === s.partyId)?.legalName ?? "Unknown party"} · ${s.period ?? "No period"}`,
      folder: folder(s.docType, s.partyId),
    }));
  for (const { record } of records) {
    const manual = (record.payloadJson as FilingRecord).manual_filing;
    if (manual)
      filed.push({
        id: record.id,
        versionId: record.documentVersionId,
        label: `${manual.doc_type} · manually indexed, unreadable`,
        folder: folder(manual.doc_type, manual.party_id),
      });
  }
  return (
    <section className="card">
      <div className="card-head">
        <h2 className="text-[17px]">Documents</h2>
        <div className="flex flex-wrap items-center gap-2">
          {reviews.length ? (
            <span className="pill pill-warn">{reviews.length} need review</span>
          ) : null}
          <span className="pill pill-quiet">{filed.length} filed</span>
        </div>
      </div>

      <div className="card-body flush">
        <div className="rowline">
          <h3 className="mb-2">Inbox · needs review</h3>
          {reviews.length ? (
            <ul className="space-y-2">
              {reviews.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  {r.priority === "high" ? (
                    <span className="pill pill-bad">High</span>
                  ) : (
                    <span className="pill pill-quiet">{r.type.replaceAll("_", " ")}</span>
                  )}
                  <Link
                    className="link"
                    href={`/staff/deals/${dealId}/files/${r.documentVersionId}`}
                  >
                    {versions.find((v) => v.id === r.documentVersionId)?.sourceFilename}
                  </Link>
                  <span className="meta">{r.reason}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="meta">No open filing reviews.</p>
          )}
        </div>

        <div className="rowline">
          <h3 className="mb-2">Filed documents</h3>
          {filed.length ? (
            <div className="space-y-2">
              {[...new Set(filed.map((f) => f.folder))].sort().map((folder) => (
                <details key={folder} open>
                  <summary className="cursor-pointer font-medium">
                    {folder}{" "}
                    <span className="meta">
                      ({filed.filter((f) => f.folder === folder).length})
                    </span>
                  </summary>
                  <ul className="mt-1.5 space-y-1 pl-4">
                    {filed
                      .filter((f) => f.folder === folder)
                      .map((f) => (
                        <li key={f.id}>
                          <Link
                            className="link"
                            href={`/staff/deals/${dealId}/files/${f.versionId}`}
                          >
                            {f.label}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </details>
              ))}
            </div>
          ) : (
            <p className="meta">Nothing filed yet.</p>
          )}
        </div>

        {events.length > 0 ? (
          <div className="rowline">
            <h3 className="mb-2">Supersession history</h3>
            <ul className="space-y-2">
              {events.map((e) => {
                const newer = segments.find((s) => s.id === e.entityId);
                return (
                  <li key={e.id} className="flex flex-wrap items-center gap-3">
                    <span>{newer?.docType} · earlier segment superseded</span>
                    {editable && newer?.isCurrent ? (
                      <form action={undoAction.bind(null, dealId, e.id)}>
                        <button className="btn btn-sm">Undo supersession</button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {editable && runs.filter((r) => r.configJson.dealId === dealId).length ? (
          <div className="rowline flex flex-wrap gap-2">
            {runs
              .filter((r) => r.configJson.dealId === dealId)
              .map((r) => (
                <form key={r.id} action={retryDealRunAction.bind(null, dealId, r.id)}>
                  <button className="btn btn-sm">Retry incomplete batch</button>
                </form>
              ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
