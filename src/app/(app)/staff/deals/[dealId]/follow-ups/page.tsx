import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildDrafts, ageInDays } from "@/lib/deliverables/requests";
import { dealView } from "@/lib/staff/deal-view";
import { findingHeadline, responsibleName, reviewSubject } from "@/lib/staff/labels";
import { sentAction } from "../../deliverable-actions";
import { EditableDraft } from "../../EditableDraft";
import { FollowUpTabs } from "../../FollowUpTabs";
import { Card, Empty, PageHead, Pill } from "@/components/staff";
import { PRODUCT_NAME } from "@/lib/product";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

export default async function FollowUps({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const drafts = await buildDrafts(ctx, dealId);
  const editable = mutationAllowed(ctx);
  const base = `/staff/deals/${dealId}`;
  const informational = v.findings.filter(
    (f) => f.status === "open" && (f.type === "info" || f.severity === "info"),
  );
  const title = (key: string) => {
    const f = v.findings.find((x) => x.findingKey === key);
    if (!f) return { title: "Item", subject: "" };
    return {
      title:
        reviewSubject(v.rules.get(f.ruleId)?.title ?? "") ||
        findingHeadline(f.type, (f.detailsJson as { message: string }).message),
      subject: v.party(f.scopeKey) + (f.period ? ` · ${f.period}` : ""),
    };
  };
  const lastSent = (responsible: string) =>
    v.requests
      .filter((r) => r.responsible === responsible && r.sentAt)
      .sort((a, b) => b.sentAt!.getTime() - a.sentAt!.getTime())[0]?.sentAt;
  return (
    <>
      <PageHead
        title="Follow-ups"
        subtitle={`One draft per recipient. Copy it, send it yourself, then record exactly what you sent. ${PRODUCT_NAME} never sends anything.`}
      />
      <div className="space-y-5">
        {drafts.length ? (
          <FollowUpTabs
            drafts={drafts.map((d) => {
              const sent = lastSent(d.responsible);
              return {
                key: d.responsible,
                name: responsibleName(d.responsible),
                sent: sent ? `Last recorded ${day(sent)}` : "Not sent yet",
                items: d.findingKeys.map((key) => ({
                  key,
                  ...title(key),
                  href: `${base}/review?finding=${encodeURIComponent(key)}`,
                })),
                editor: editable ? (
                  <EditableDraft
                    initialBody={d.body}
                    findingCount={d.findingKeys.length}
                    action={sentAction.bind(null, dealId, d.responsible, d.findingKeys)}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap rounded-[10px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4 font-sans text-[13.5px] leading-6">
                    {d.body}
                  </pre>
                ),
              };
            })}
          />
        ) : (
          <Card>
            <Empty>
              No new actionable findings need a draft. Findings already recorded as sent appear in
              the history below.
            </Empty>
          </Card>
        )}

        {informational.length ? (
          <Card
            title="Not requested"
            description="Context for the file. The current rules do not require a document, so these never become a request."
            flush
          >
            <ul>
              {informational.map((f) => (
                <li
                  key={f.findingKey}
                  className="rowline flex flex-wrap items-baseline gap-x-3 gap-y-1"
                >
                  <Pill value="info" />
                  <span className="font-medium">
                    {findingHeadline(f.type, (f.detailsJson as { message: string }).message) ||
                      f.ruleId}
                  </span>
                  <span className="meta">
                    {v.party(f.scopeKey)}
                    {f.period ? ` · ${f.period}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card
          title="Recorded as sent"
          description={`A person recorded that they sent this. ${PRODUCT_NAME} delivered nothing.`}
          flush={v.requests.length > 0}
        >
          {v.requests.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Recorded</th>
                  <th>Age</th>
                  <th>Items</th>
                  <th>Still open</th>
                </tr>
              </thead>
              <tbody>
                {v.requests.map((r) => {
                  const stillOpen = v.findings.filter(
                    (f) =>
                      r.findingKeys.includes(f.findingKey) &&
                      (f.status === "requested" || f.status === "open"),
                  ).length;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">
                        {responsibleName(r.responsible)}
                        <details className="reveal mt-2">
                          <summary>Recorded message</summary>
                          <pre className="mt-2 whitespace-pre-wrap font-sans text-sm">{r.body}</pre>
                        </details>
                      </td>
                      <td className="num">{r.sentAt?.toISOString().slice(0, 10) ?? "—"}</td>
                      <td className="num">
                        {ageInDays(r.sentAt)} day{ageInDays(r.sentAt) === 1 ? "" : "s"}
                      </td>
                      <td className="num">{r.findingKeys.length}</td>
                      <td>
                        {stillOpen ? (
                          <span className="pill pill-warn">{stillOpen} awaiting</span>
                        ) : (
                          <span className="pill pill-ok">No linked findings open</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty>Nothing recorded as sent yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
