import { requireStaff } from "@/lib/workspace";
import { PageHeader } from "@/components/PageHeader";
import { loadPack, PACK_VERSIONS, comparePacks } from "@/lib/rules/loader";
import type { Rule } from "@/lib/rules/schema";
export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
function RuleDetail({ rule }: { rule: Rule }) {
  return (
    <article className="rounded-lg border border-[var(--line)] p-4" data-rule-id={rule.id}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm">{rule.id}</span>
        <h3 className="font-semibold">{rule.title}</h3>
        <span className="rounded bg-amber-50 px-2 text-sm text-amber-900">Unverified</span>
        {!rule.required && <span className="text-sm">Optional · not required</span>}
      </div>
      <p className="mt-2 text-sm">{rule.description}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Scope: {rule.scope} · {rule.period_requirement ?? "No recurring period"} · Responsible:{" "}
        {rule.responsible}
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {rule.checks.map((check, i) => (
          <li key={i}>{check.message}</li>
        ))}
      </ul>
      <p className="mt-3 text-sm">
        <strong>Source · {rule.source_ref.class}:</strong>{" "}
        {rule.source_ref.url ? (
          <a className="underline" href={rule.source_ref.url} target="_blank" rel="noreferrer">
            {rule.source_ref.citation}
          </a>
        ) : (
          rule.source_ref.citation
        )}
      </p>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer">Conditions and checks</summary>
        <pre className="overflow-auto p-3">
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
  const selectClass =
    "mt-1 block rounded border border-[var(--line)] bg-[var(--surface)] px-3 py-2";
  return (
    <>
      <PageHeader
        section="rulepacks"
        title="Rule packs"
        subtitle="Read the evidence requirements and compare versions. Every rule awaits lender review."
      />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          Pack
          <select name="pack" defaultValue={version} className={selectClass}>
            {PACK_VERSIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Overlay
          <select name="overlay" defaultValue={overlay ?? ""} className={selectClass}>
            <option value="">None</option>
            <option value="sample-lender-a">Sample Lender A</option>
          </select>
        </label>
        <label className="text-sm">
          Compare from
          <select name="compare" defaultValue={compareVersion} className={selectClass}>
            {PACK_VERSIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Compare overlay
          <select
            name="compare_overlay"
            defaultValue={compareOverlay ?? ""}
            className={selectClass}
          >
            <option value="">None</option>
            <option value="sample-lender-a">Sample Lender A</option>
          </select>
        </label>
        <button className="rounded bg-[var(--accent)] px-4 py-2 text-white" type="submit">
          View comparison
        </button>
      </form>
      <section
        className="mb-6 rounded-lg border border-[var(--line)] p-4"
        aria-label="Pack parameters"
      >
        <h2 className="font-semibold">
          {pack.version} · {pack.overlay ?? "Base"}
        </h2>
        <p className="mt-1 text-sm">
          Effective loan number date: {pack.effective.loan_number_on_or_after} · {pack.items.length}{" "}
          checklist definitions · {pack.consistency.length} consistency rules
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {Object.entries(pack.parameters).map(([key, value]) => (
            <div key={key}>
              <dt className="text-[var(--muted)]">{key}</dt>
              <dd className="font-mono">{String(value)}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 break-all text-sm">
          Filename template: <code>{pack.index.filename_template}</code>
        </p>
        <p className="mt-2 break-all text-xs text-[var(--muted)]">
          Content hash: {pack.content_hash}
        </p>
      </section>
      <section aria-label="Pack comparison" className="mb-8">
        <h2 className="mb-3 text-lg font-semibold">Comparison · {changes.length} changed rules</h2>
        <p className="mb-3 text-sm">
          From {other.version} ({other.overlay ?? "Base"}) to {pack.version} (
          {pack.overlay ?? "Base"}). Parameter changes count as rule changes.
        </p>
        <div className="mb-3 grid gap-3 md:grid-cols-2">
          <div className="rounded border border-[var(--line)] p-3">
            <strong>From filename</strong>
            <p className="break-all text-sm">{other.index.filename_template}</p>
          </div>
          <div className="rounded border border-[var(--line)] p-3">
            <strong>To filename</strong>
            <p className="break-all text-sm">{pack.index.filename_template}</p>
          </div>
        </div>
        {!changes.length && <p>No rule differences.</p>}
        {changes.map((change) => (
          <details key={change.id} className="mb-2 rounded border border-[var(--line)] p-3">
            <summary className="cursor-pointer font-medium">
              {change.id} · {change.change}
            </summary>
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
              <div className="min-w-0">
                <h3>From</h3>
                <pre className="max-h-96 overflow-auto bg-[var(--bg)] p-3 text-xs">
                  {JSON.stringify(change.before, null, 2) ?? "Absent"}
                </pre>
              </div>
              <div className="min-w-0">
                <h3>To</h3>
                <pre className="max-h-96 overflow-auto bg-[var(--bg)] p-3 text-xs">
                  {JSON.stringify(change.after, null, 2) ?? "Absent"}
                </pre>
              </div>
            </div>
          </details>
        ))}
      </section>
      <section className="space-y-3" aria-label="Resolved rules">
        <h2 className="text-lg font-semibold">Resolved rules</h2>
        {[...pack.items, ...pack.consistency].map((rule) => (
          <RuleDetail key={rule.id} rule={rule} />
        ))}
      </section>
    </>
  );
}
