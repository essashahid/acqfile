import Link from "next/link";
import { DealDocuments } from "./Documents";
import { and, eq, desc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db/client";
import { requireWorkspace } from "@/lib/workspace";
import { readDeal, dealDraft } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { DealEditor } from "../DealEditor";
import { IntakeForm } from "../IntakeForm";
export default async function DealPage({
  params,
}: {
  params: Promise<{ dealId: string }>;
}) {
  const { dealId } = await params;
  const ctx = await requireWorkspace();
  const { deal } = await readDeal(ctx, dealId);
  const segments = await getDb()
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  const rows = await getDb()
    .select({
      arrival: schema.intakeFiles,
      batch: schema.dealBatches.number,
      version: schema.documentVersions,
    })
    .from(schema.intakeFiles)
    .innerJoin(
      schema.dealBatches,
      and(
        eq(schema.dealBatches.id, schema.intakeFiles.batchId),
        eq(schema.dealBatches.dealId, dealId),
      ),
    )
    .innerJoin(
      schema.documentVersions,
      eq(schema.documentVersions.id, schema.intakeFiles.documentVersionId),
    )
    .orderBy(desc(schema.dealBatches.number));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">
        {deal.code} · {deal.name}
      </h1>
      <p>
        Rule pack: {deal.rulePackVersion} · Overlay: {deal.overlayId ?? "Base"}{" "}
        · Rules unverified
      </p>
      {mutationAllowed(ctx) && (
        <>
          <details>
            <summary>Edit profile, parties and ownership</summary>
            <DealEditor
              initial={await dealDraft(ctx, dealId)}
              id={dealId}
              revision={deal.revision}
            />
          </details>
          <IntakeForm dealId={dealId} />
        </>
      )}
      <h2 className="text-xl font-semibold">Intake</h2>
      <table className="w-full text-left text-sm">
        <thead>
          <tr>
            <th>Batch</th>
            <th>Original path</th>
            <th>SHA-256</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.arrival.id} className="border-b">
              <td>{r.batch}</td>
              <td className="py-3">
                <Link
                  className="underline"
                  href={`/deals/${dealId}/files/${r.version.id}`}
                >
                  {r.arrival.originalPath}
                </Link>
                <p className="text-xs">
                  {segments
                    .filter((s) => s.documentVersionId === r.version.id)
                    .map(
                      (s) =>
                        `${s.docType} p${s.pageStart}–${s.pageEnd} · ${s.isCurrent ? s.status : "superseded"}`,
                    )
                    .join("; ")}
                </p>
              </td>
              <td title={r.arrival.contentHash} className="font-mono">
                {r.arrival.contentHash.slice(0, 12)}
              </td>
              <td>
                {r.arrival.duplicate
                  ? "Duplicate · linked to existing version"
                  : r.version.parseStatus === "failed"
                    ? "UNREADABLE · high priority review"
                    : r.version.parseStatus}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <DealDocuments
        dealId={dealId}
        pack={deal.rulePackVersion}
        overlay={deal.overlayId}
        editable={mutationAllowed(ctx)}
      />
    </div>
  );
}
