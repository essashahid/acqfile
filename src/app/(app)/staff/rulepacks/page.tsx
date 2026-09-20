import { requireStaff } from "@/lib/workspace";
import { Card, PageHead } from "@/components/staff";
import { loadPack, PACK_VERSIONS, comparePacks } from "@/lib/rules/loader";
import type { Rule } from "@/lib/rules/schema";
export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
function RuleDetail({ rule }: { rule: Rule }) {
  return (
    <article className="rowline" data-rule-id={rule.id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="font-mono text-[13px] font-semibold">{rule.id}</span>
        <h3>{rule.title}</h3>
        <span className="pill pill-warn">Unverified</span>
        {!rule.required && <span className="pill pill-quiet">Optional</span>}
      </div>
      <p className="mt-2">{rule.description}</p>
      <p className="meta mt-2">
        Scope: {rule.scope} · {rule.period_requirement ?? "No recurring period"} · Responsible:{" "}
        {rule.responsible}
      </p>
      <ul className="mt-2 list-disc pl-5 text-[13.5px]">
        {rule.checks.map((check, i) => (
          <li key={i}>{check.message}</li>
        ))}
      </ul>
      <p className="mt-3 text-[13.5px]">
        <span className="eyebrow">Source · {rule.source_ref.class}</span>{" "}
        {rule.source_ref.url ? (
          <a className="link" href={rule.source_ref.url} target="_blank" rel="noreferrer">
            {rule.source_ref.citation}
          </a>
        ) : (
          rule.source_ref.citation
        )}
      </p>
      <details className="mt-2 text-[13px]">
        <summary className="link cursor-pointer">Conditions and checks</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-[9px] bg-[var(--surface-sunken)] p-3">
          {JSON.stringify({ applies_when: rule.applies_when, checks: rule.checks }, null, 2)}
        </pre>
      </details>
    </article>
  );
}
export default async function RulePacksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaff();
  const query = await searchParams;
  const selected = one(query.pack);
  const version = PACK_VERSIONS.find((v) => v === selected) ?? "sop-50-10-8-1";
  const overlay = one(query.overlay) === "sample-lender-a" ? "sample-lender-a" : undefined;
  const compareVersion = PACK_VERSIONS.find((v) => v === one(query.compare)) ?? "sop-50-10-8";
  const compareOverlay =
    one(query.compare_overlay) === "sample-lender-a" ? "sample-lender-a" : undefined;
  const pack = loadPack(version, overlay),
    other = loadPack(compareVersion, compareOverlay);
  const changes = comparePacks(other, pack);
  return (
    <>
      <PageHead
        title="Rule packs"
        subtitle="Read the evidence requirements and compare versions. Every rule awaits lender review."
      />
      <Card className="mb-5">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Pack</span>
            <select name="pack" defaultValue={version}>
              {PACK_VERSIONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Overlay</span>
            <select name="overlay" defaultValue={overlay ?? ""}>
              <option value="">None</option>
              <option value="sample-lender-a">Sample Lender A</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Compare from</span>
            <select name="compare" defaultValue={compareVersion}>
              {PACK_VERSIONS.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="eyebrow">Compare overlay</span>
            <select name="compare_overlay" defaultValue={compareOverlay ?? ""}>
              <option value="">None</option>
              <option value="sample-lender-a">Sample Lender A</option>
            </select>
          </label>
          <button className="btn btn-primary" type="submit">
            View comparison
          </button>
        </form>
      </Card>
      <Card className="mb-5" title={`${pack.version} · ${pack.overlay ?? "Base"}`}>
        <p className="meta">
          Effective loan number date: {pack.effective.loan_number_on_or_after} · {pack.items.length}{" "}
          checklist definitions · {pack.consistency.length} consistency rules
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {Object.entries(pack.parameters).map(([key, value]) => (
            <div key={key}>
              <dt className="eyebrow">{key}</dt>
              <dd className="font-mono text-[13.5px]">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 break-all text-[13.5px]">
          <span className="eyebrow">Filename template</span>{" "}
          <code>{pack.index.filename_template}</code>
        </p>
        <p className="meta mt-2 break-all text-[12px]">Content hash: {pack.content_hash}</p>
      </Card>
      <Card
        className="mb-5"
        title={`Comparison · ${changes.length} changed rules`}
        description={`From ${other.version} (${other.overlay ?? "Base"}) to ${pack.version} (${pack.overlay ?? "Base"}). Parameter changes count as rule changes.`}
      >
        <p className="sr-only">Pack comparison.</p>
        <div className="mb-3 grid gap-3 md:grid-cols-2">
          <div className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
            <p className="eyebrow">From filename</p>
            <p className="mt-1 break-all text-[13.5px] font-mono">
              {other.index.filename_template}
            </p>
          </div>
          <div className="rounded-[9px] border border-[var(--line)] bg-[var(--surface-sunken)] p-3">
            <p className="eyebrow">To filename</p>
            <p className="mt-1 break-all text-[13.5px] font-mono">{pack.index.filename_template}</p>
          </div>
        </div>
        {!changes.length && <p className="meta">No rule differences.</p>}
        {changes.map((change) => (
          <details key={change.id} className="mb-2 rounded-[9px] border border-[var(--line)] p-3">
            <summary className="link cursor-pointer">
              {change.id} · {change.change}
            </summary>
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <p className="eyebrow mb-1">From</p>
                <pre className="max-h-96 overflow-auto rounded-[9px] bg-[var(--surface-sunken)] p-3 text-[12px]">
                  {JSON.stringify(change.before, null, 2) ?? "Absent"}
                </pre>
              </div>
              <div className="min-w-0">
                <p className="eyebrow mb-1">To</p>
                <pre className="max-h-96 overflow-auto rounded-[9px] bg-[var(--surface-sunken)] p-3 text-[12px]">
                  {JSON.stringify(change.after, null, 2) ?? "Absent"}
                </pre>
              </div>
            </div>
          </details>
        ))}
      </Card>
      <Card
        title="Resolved rules"
        description={`${pack.items.length} checklist definitions and ${pack.consistency.length} consistency rules`}
        flush
      >
        {[...pack.items, ...pack.consistency].map((rule) => (
          <RuleDetail key={rule.id} rule={rule} />
        ))}
      </Card>
    </>
  );
}
