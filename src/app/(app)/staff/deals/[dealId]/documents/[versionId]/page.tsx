import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { getDb, schema } from "@/lib/db/client";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { parsedVersion } from "@/lib/deals/blocks";
import { sourceUrl } from "@/lib/deals/source-url";
import { mutationAllowed, originalAccessAllowed } from "@/lib/access";
import type { FilingRecord } from "@/lib/deals/filing";
import { FileReview } from "../../../FileReview";
import { documentName } from "@/lib/staff/labels";
import { dealView } from "@/lib/staff/deal-view";
import { actionHref, explainItem, safeReturn } from "@/lib/staff/explain";
import { Card, PageHead, Pill } from "@/components/staff";

export default async function FilePage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string; versionId: string }>;
  searchParams: Promise<{
    page?: string;
    returnTo?: string;
    finding?: string;
    row?: string;
    from?: string;
  }>;
}) {
  const { dealId, versionId } = await params;
  const query = await searchParams;
  const base = `/staff/deals/${dealId}`;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const db = getDb();
  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      and(eq(schema.documentVersions.id, versionId), eq(schema.documentVersions.dealId, dealId)),
    );
  if (!version) throw Error("File not found");
  const [record] = await db
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, versionId),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const parties = await db.select().from(schema.parties).where(eq(schema.parties.dealId, dealId));
  const blocks = (await parsedVersion(versionId))?.blocks ?? [];
  const reviews = await db
    .select()
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.documentVersionId, versionId),
        eq(schema.intakeReviews.status, "open"),
      ),
    );
  const filed = await db
    .select()
    .from(schema.segments)
    .where(
      and(eq(schema.segments.documentVersionId, versionId), eq(schema.segments.isCurrent, true)),
    );
  const initialPage = Math.max(1, Math.min(version.pageCount ?? 1, Number(query.page) || 1));

  // The item that sent the operator here, resolved from this deal's own records. Query text is
  // only a key; nothing from it is shown unless it matches a finding or row of this deal.
  let context: {
    title: string;
    subject: string;
    summary: string;
    saved?: string;
    note?: string;
    family: string;
    back: string;
    backLabel: string;
    action: { href: string; label: string } | null;
    onFile: boolean;
  } | null = null;
  if (query.finding || query.row) {
    const v = await dealView(dealId);
    const finding = query.finding
      ? v.findings.find((f) => f.findingKey === query.finding)
      : undefined;
    const rowKeyOf = (r: (typeof v.index)[number]) => `${r.item_id}|${r.scope_key}|${r.period}`;
    const row = finding
      ? v.index.find(
          (r) =>
            r.item_id === finding.ruleId &&
            r.scope_key === finding.scopeKey &&
            (r.period || null) === finding.period,
        )
      : v.index.find((r) => rowKeyOf(r) === query.row);
    const rule = v.rules.get(finding?.ruleId ?? row?.item_id ?? "");
    if (rule && (finding || row)) {
      const rowKey = row ? rowKeyOf(row) : undefined;
      const scope = finding?.scopeKey ?? row!.scope_key;
      const period = finding?.period ?? (row?.period || null);
      const attestations = (
        await db.select().from(schema.attestations).where(eq(schema.attestations.dealId, dealId))
      ).filter(
        (a) => a.ruleId === rule.id && a.scopeKey === scope && (a.period ?? "") === (period ?? ""),
      );
      const ex = explainItem({
        rule,
        status: row?.status ?? "needs_review",
        checks: row?.checks ?? [],
        findingType: finding?.type,
        findingMessage: (finding?.detailsJson as { message?: string } | undefined)?.message,
        parameters: v.pack.parameters,
        saved: attestations.map((a) => ({ ...a, key: a.key ?? "" })),
      });
      const segment = filed.find((s) => s.pageStart <= initialPage && s.pageEnd >= initialPage);
      const fromReview = query.from === "review" && finding;
      const href =
        ex.action.kind === "document"
          ? null
          : actionHref(ex.action.kind, base, {
              rowKey,
              noteKey: ex.action.noteKey,
              findingKey: finding?.findingKey,
              document: segment
                ? { versionId, page: segment.pageStart, segmentId: segment.id }
                : undefined,
            });
      context = {
        title: rule.title,
        subject: `${v.party(scope)}${period ? ` · ${period}` : ""}`,
        summary: ex.summary,
        saved: ex.open[0]?.saved,
        note: ex.note,
        family: ex.family,
        back: fromReview
          ? (safeReturn(base, query.returnTo) ??
            `${base}/review?finding=${encodeURIComponent(finding.findingKey)}`)
          : rowKey
            ? `${base}/requirements?show=all&focus=${encodeURIComponent(rowKey)}#${encodeURIComponent(rowKey)}`
            : `${base}/review?finding=${encodeURIComponent(finding!.findingKey)}`,
        backLabel: fromReview ? "Back to the review item" : "Back to the requirement",
        action: href && ex.action.label ? { href, label: ex.action.label } : null,
        onFile: filed.some((s) => rule.accepts.some((t) => t === s.docType)),
      };
    }
  }
  const back = context?.back ?? safeReturn(base, query.returnTo) ?? `${base}/documents`;
  return (
    <div>
      <PageHead
        eyebrow={
          <Link href={back} className="link">
            {context?.backLabel ??
              (safeReturn(base, query.returnTo) ? "Back to review" : "Back to documents")}
          </Link>
        }
        title="View document"
        subtitle={
          <>
            {version.sourceFilename} ·{" "}
            {version.pageCount
              ? `${version.pageCount} ${version.pageCount === 1 ? "page" : "pages"}`
              : "Page count unavailable"}
          </>
        }
        actions={<Pill value={version.parseStatus} />}
      />
      {context ? (
        <Card className="mb-5" data-testid="document-context">
          <p className="eyebrow">Opened for this item</p>
          <h2 className="mt-1 text-[17px]">{context.title}</h2>
          <p className="meta">{context.subject}</p>
          <p className="mt-2">{context.summary}</p>
          {context.saved ? <p className="meta mt-1">{context.saved}</p> : null}
          {context.note ? <p className="meta mt-1">{context.note}</p> : null}
          <p className="meta mt-2">
            {context.family === "manual" || context.family === "tracking"
              ? `${context.onFile ? "This document is on file for this requirement, but it does not show that the open check was done. " : ""}Editing its details below will not complete that check.`
              : context.family === "document"
                ? `The open check is about this document's details. Correct them below only if they were read wrongly, and say why in the note. Showing page ${initialPage}.`
                : `Showing page ${initialPage}. Compare it with the item before changing anything.`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {context.action ? (
              <Link className="btn btn-primary btn-sm" href={context.action.href}>
                {context.action.label}
              </Link>
            ) : null}
            <Link className="link" href={context.back}>
              {context.backLabel}
            </Link>
          </div>
        </Card>
      ) : null}
      <Card className="mb-5" title="Values read from this file">
        <div className="flex flex-wrap gap-3">
          {filed.map((s) => (
            <Link
              className="btn btn-sm"
              key={s.id}
              href={`${base}/documents/${versionId}/values/${s.id}`}
            >
              Review values: {documentName(s.docType)}
              {s.period ? ` · ${s.period}` : ""}
            </Link>
          ))}
          {!filed.length ? (
            <p className="meta">No current documents filed from this source.</p>
          ) : null}
        </div>
      </Card>
      <FileReview
        initialPage={initialPage}
        dealId={dealId}
        versionId={versionId}
        recordId={record?.id ?? null}
        initial={(record?.payloadJson as FilingRecord | undefined)?.segments ?? []}
        parties={parties.map((p) => ({ id: p.id, name: p.legalName }))}
        pages={version.pageCount ?? 1}
        unreadable={version.parseStatus === "failed"}
        pdf={version.mimeType === "application/pdf"}
        url={originalAccessAllowed(ctx) ? sourceUrl(dealId, versionId) : null}
        blocks={blocks.map((b) => ({ locator: b.locator, page: b.page, rawText: b.text }))}
        editable={mutationAllowed(ctx)}
        conflict={reviews.some((r) => r.type === "version_conflict")}
      />
      <details className="reveal mt-5">
        <summary>Original file details</summary>
        <p className="meta mt-2 break-all">SHA-256: {version.contentHash}</p>
      </details>
    </div>
  );
}
