import Link from "next/link";
import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { dealView } from "@/lib/staff/deal-view";
import { documentName } from "@/lib/staff/labels";
import { retryFileAction } from "../../deliverable-actions";
import { undoAction, retryDealRunAction } from "../../actions";
import { IntakeForm } from "../../IntakeForm";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

export default async function Documents({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>;
  searchParams: Promise<{ q?: string; party?: string; type?: string; show?: string }>;
}) {
  const { dealId } = await params;
  const f = await searchParams;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const editable = mutationAllowed(ctx);
  const base = `/staff/deals/${dealId}`;

  const pendingBySegment = new Map<string, number>();
  for (const fact of v.pendingFacts)
    pendingBySegment.set(fact.segmentId, (pendingBySegment.get(fact.segmentId) ?? 0) + 1);

  // One entry per file. A file that failed to parse also has an "unreadable" review item; they are
  // the same problem and must not read as two separate tasks.
  type Attention = {
    key: string;
    versionId: string;
    name: string;
    kind: string;
    tone: string;
    why: string;
    retry: boolean;
    valuesHref?: string;
  };
  const attention: Attention[] = [];
  const claim = (versionId: string) => attention.find((a) => a.versionId === versionId);
  for (const r of v.failedFiles) {
    if (claim(r.version.id)) continue;
    attention.push({
      key: r.version.id,
      versionId: r.version.id,
      name: r.arrival.originalPath.split("/").pop() ?? r.arrival.originalPath,
      kind: "Could not be processed",
      tone: "pill-bad",
      why:
        r.version.parseStatus === "failed"
          ? "The file could not be opened safely, so nothing was read from it. It supplies no evidence, and any requirement it was meant to meet stays open."
          : "Processing stopped before this file was filed.",
      retry: true,
    });
  }
  for (const r of v.openReviews) {
    if (claim(r.documentVersionId)) continue;
    attention.push({
      key: `review-${r.id}`,
      versionId: r.documentVersionId,
      name: v.versions.find((x) => x.id === r.documentVersionId)?.sourceFilename ?? "Unknown file",
      kind: r.type.replaceAll("_", " "),
      tone: r.priority === "high" ? "pill-bad" : "pill-warn",
      why: r.reason,
      retry: false,
    });
  }
  for (const [segmentId, n] of pendingBySegment) {
    const segment = v.segments.find((s) => s.id === segmentId);
    if (!segment) continue;
    attention.push({
      key: `values-${segmentId}`,
      versionId: segment.documentVersionId,
      name: documentName(segment.docType),
      kind: "Values await a person",
      tone: "pill-warn",
      why: `${n} extracted value${n === 1 ? "" : "s"} could not be accepted automatically.`,
      retry: false,
      valuesHref: `${base}/documents/${segment.documentVersionId}/values/${segmentId}`,
    });
  }

  const parties = [...new Set(v.segments.map((s) => v.partyName(s.partyId)))].sort();
  const types = [...new Set(v.segments.map((s) => s.docType))]
    .map((t) => ({ id: t, name: documentName(t) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const library = v.segments
    .filter((s) => !f.party || v.partyName(s.partyId) === f.party)
    .filter((s) => !f.type || s.docType === f.type)
    .filter((s) => {
      if (!f.q) return true;
      const needle = f.q.toLowerCase();
      return (
        documentName(s.docType).toLowerCase().includes(needle) ||
        v.partyName(s.partyId).toLowerCase().includes(needle) ||
        v.originalPath(s.documentVersionId).toLowerCase().includes(needle)
      );
    })
    .sort(
      (a, b) =>
        v.partyName(a.partyId).localeCompare(v.partyName(b.partyId)) ||
        documentName(a.docType).localeCompare(documentName(b.docType)) ||
        (a.period ?? "").localeCompare(b.period ?? ""),
    );

  return (
    <>
      <PageHead
        title="Documents"
        subtitle={`${v.counts.arrivals} source files received · ${v.counts.filed} documents filed from them · ${v.counts.documentsNeedingAttention} source files needing attention`}
      />
      <div className="space-y-5">
        {editable ? (
          <p>
            <a className="btn btn-primary mb-4" href="#intake">
              Add documents
            </a>
          </p>
        ) : (
          <p className="meta mb-4">
            View the current library and masked source evidence. Filing and processing are managed
            by an operator.
          </p>
        )}
        {attention.length ? (
          <Card
            title="Needs attention"
            description="Files that could not be processed, documents awaiting a filing decision, and values awaiting a person."
            flush
          >
            <ul>
              {attention.map((a) => (
                <li key={a.key} className="work">
                  <span className={`pill ${a.tone} work-mark`}>{a.kind}</span>
                  <div className="min-w-0 flex-1">
                    <p className="work-title break-words">{a.name}</p>
                    <p className="work-why">{a.why}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-center">
                    <Link
                      className="btn btn-sm"
                      href={a.valuesHref ?? `${base}/documents/${a.versionId}`}
                    >
                      Open
                    </Link>
                    {a.retry && editable ? (
                      <form action={retryFileAction.bind(null, dealId, a.versionId)}>
                        <button className="btn btn-sm">Retry</button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card
          title="Library"
          description="Documents filed from the source files, as an operator reads them."
          flush
        >
          <form className="flex flex-wrap items-end gap-3 px-[18px] py-4">
            <label className="flex min-w-[14rem] flex-1 flex-col gap-1">
              <span className="eyebrow">Search</span>
              <input name="q" defaultValue={f.q ?? ""} placeholder="Document, party or filename" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Party</span>
              <select name="party" defaultValue={f.party ?? ""}>
                <option value="">Any</option>
                {parties.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="eyebrow">Type</span>
              <select name="type" defaultValue={f.type ?? ""}>
                <option value="">Any</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm">Filter</button>
            {f.q || f.party || f.type ? (
              <Link className="link" href={`${base}/documents`}>
                Clear
              </Link>
            ) : null}
            <span className="meta ml-auto self-center">
              {library.length} of {v.segments.length}
            </span>
          </form>
          {library.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th className="w-[32%]">Document</th>
                  <th className="w-[24%]">Party</th>
                  <th className="w-[12%]">Period</th>
                  <th className="w-[16%]">Pages</th>
                  <th>Values</th>
                </tr>
              </thead>
              <tbody>
                {library.map((s) => {
                  const pending = pendingBySegment.get(s.id) ?? 0;
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link
                          className="link font-medium"
                          href={`${base}/documents/${s.documentVersionId}?page=${s.pageStart}`}
                        >
                          {documentName(s.docType)}
                        </Link>
                      </td>
                      <td>{v.partyName(s.partyId)}</td>
                      <td className="num">{s.period ?? <span className="meta">—</span>}</td>
                      <td className="num">
                        {s.pageStart === s.pageEnd
                          ? `p${s.pageStart}`
                          : `p${s.pageStart}–${s.pageEnd}`}
                      </td>
                      <td>
                        {pending ? (
                          <Link
                            className="pill pill-warn"
                            href={`${base}/documents/${s.documentVersionId}/values/${s.id}`}
                          >
                            {pending} to review
                          </Link>
                        ) : (
                          <Link
                            className="link"
                            href={`${base}/documents/${s.documentVersionId}/values/${s.id}`}
                          >
                            View values
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="px-[18px] pb-5">
              <Empty>
                {v.segments.length
                  ? "No documents match these filters."
                  : "Nothing has been filed yet."}
              </Empty>
            </div>
          )}
        </Card>

        {editable ? (
          <Card
            id="intake"
            title="Add documents"
            description="Files, a ZIP, or a folder. Limits are checked on the server before anything is read."
          >
            <IntakeForm dealId={dealId} />
          </Card>
        ) : null}

        <details className="reveal">
          <summary>Upload history and technical detail</summary>
          <div className="mt-2 space-y-5">
            <Card
              title="Source files received"
              description="Every arrival, including duplicates, with its hash and processing result."
              flush
            >
              <table className="grid">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Original path</th>
                    <th>SHA-256</th>
                    <th>Result</th>
                    <th>Filed as</th>
                  </tr>
                </thead>
                <tbody>
                  {v.arrivals.map((r) => {
                    const filed = v.segments.filter((s) => s.documentVersionId === r.version.id);
                    return (
                      <tr key={r.arrival.id}>
                        <td className="num">{r.batch}</td>
                        <td>
                          <Link
                            className="link break-words"
                            href={`${base}/documents/${r.version.id}`}
                          >
                            {r.arrival.originalPath}
                          </Link>
                        </td>
                        <td className="num" title={r.arrival.contentHash}>
                          {r.arrival.contentHash.slice(0, 12)}
                        </td>
                        <td>
                          {r.arrival.duplicate ? (
                            <Pill value="duplicate" title="linked to the existing version" />
                          ) : (
                            <Pill value={r.version.parseStatus} />
                          )}
                        </td>
                        <td className="meta">
                          {filed.length
                            ? filed
                                .map(
                                  (s) =>
                                    `${documentName(s.docType)} p${s.pageStart}–${s.pageEnd}${s.isCurrent ? "" : " (superseded)"}`,
                                )
                                .join("; ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
            {editable && v.failedRuns.length ? (
              <Card title="Incomplete batches">
                <div className="flex flex-wrap gap-2">
                  {v.failedRuns.map((r) => (
                    <form key={r.id} action={retryDealRunAction.bind(null, dealId, r.id)}>
                      <button className="btn btn-sm">Retry batch</button>
                    </form>
                  ))}
                </div>
              </Card>
            ) : null}
            <SupersessionHistory dealId={dealId} editable={editable} />
          </div>
        </details>
      </div>
    </>
  );
}

async function SupersessionHistory({ dealId, editable }: { dealId: string; editable: boolean }) {
  const { getDb, schema } = await import("@/lib/db/client");
  const { and, eq } = await import("drizzle-orm");
  const db = getDb();
  const events = await db
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.dealId, dealId), eq(schema.events.action, "segment_superseded")));
  if (!events.length) return null;
  const segments = await db
    .select()
    .from(schema.segments)
    .where(eq(schema.segments.dealId, dealId));
  return (
    <Card
      title="Replaced documents"
      description="A later copy replaced an earlier one. Undo returns the earlier copy to current."
      flush
    >
      <ul>
        {events.map((e) => {
          const newer = segments.find((s) => s.id === e.entityId);
          return (
            <li key={e.id} className="rowline flex flex-wrap items-center justify-between gap-3">
              <span>
                {newer ? documentName(newer.docType) : "Document"} · earlier copy replaced
              </span>
              {editable && newer?.isCurrent ? (
                <form action={undoAction.bind(null, dealId, e.id)}>
                  <button className="btn btn-sm">Undo</button>
                </form>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
