import { requireStaff } from "@/lib/workspace";
import { requireDeal } from "@/lib/deals/service";
import { mutationAllowed } from "@/lib/access";
import { buildDrafts, ageInDays } from "@/lib/deliverables/requests";
import { dealView } from "@/lib/staff/deal-view";
import { findingHeadline } from "@/lib/staff/labels";
import { sentAction } from "../../deliverable-actions";
import { CopyDraft } from "../../CopyDraft";
import { RecordSent } from "../../RecordSent";
import { Card, Empty, PageHead, Pill } from "@/components/staff";

export default async function FollowUps({ params }: { params: Promise<{ dealId: string }> }) {
  const { dealId } = await params;
  const ctx = await requireStaff();
  await requireDeal(ctx, dealId);
  const v = await dealView(dealId);
  const drafts = await buildDrafts(ctx, dealId);
  const editable = mutationAllowed(ctx);
  const informational = v.findings.filter(
    (f) => f.status === "open" && (f.type === "info" || f.severity === "info"),
  );
  return (
    <>
      <PageHead
        title="Follow-ups"
        subtitle="One draft per responsible party, built from the open findings. AcqFile never sends anything; you copy the message and send it yourself."
      />
      <div className="space-y-5">
        {drafts.map((d) => (
          <Card
            key={d.responsible}
            title={d.responsible}
            description={`${d.findingKeys.length - d.informational} request${d.findingKeys.length - d.informational === 1 ? "" : "s"}${d.informational ? ` · ${d.informational} informational finding kept out of the message` : ""}`}
            actions={
              <>
                <CopyDraft body={d.body} />
                {editable ? (
                  <RecordSent action={sentAction.bind(null, dealId, d.responsible)} />
                ) : null}
              </>
            }
          >
            <p className="meta mb-2">
              This is what the recipient reads. Internal evidence stays on the Review screen.
            </p>
            <pre className="max-h-[24rem] overflow-auto whitespace-pre-wrap rounded-[10px] border border-[var(--line)] bg-[var(--surface-sunken)] p-4 font-sans text-[13.5px] leading-6">
              {d.body}
            </pre>
          </Card>
        ))}
        {!drafts.length ? (
          <Card>
            <Empty>
              No open findings, so there is nothing to ask anyone for. Findings already recorded as
              sent appear in the history below.
            </Empty>
          </Card>
        ) : null}

        {informational.length ? (
          <Card
            title="Not requested"
            description="Informational findings are context for the file. The current rules do not require a document, so they are never turned into a demand."
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
          description="A record that a person sent the message. It does not mean AcqFile delivered anything."
          flush={v.requests.length > 0}
        >
          {v.requests.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Responsible party</th>
                  <th>Recorded</th>
                  <th>Age</th>
                  <th>Items</th>
                  <th>Still open</th>
                </tr>
              </thead>
              <tbody>
                {v.requests.map((r) => {
                  const stillOpen = v.findings.filter(
                    (f) => r.findingKeys.includes(f.findingKey) && f.status === "requested",
                  ).length;
                  return (
                    <tr key={r.id}>
                      <td className="font-medium">{r.responsible}</td>
                      <td className="num">{r.sentAt?.toISOString().slice(0, 10) ?? "—"}</td>
                      <td className="num">{ageInDays(r.sentAt)} days</td>
                      <td className="num">{r.findingKeys.length}</td>
                      <td>
                        {stillOpen ? (
                          <span className="pill pill-warn">{stillOpen} awaiting</span>
                        ) : (
                          <span className="pill pill-ok">All answered</span>
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
