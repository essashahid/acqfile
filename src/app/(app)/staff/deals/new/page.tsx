import { requireStaff } from "@/lib/workspace";
import { mutationAllowed } from "@/lib/access";
import { DealEditor } from "../DealEditor";
import { Card, PageHead } from "@/components/staff";

export default async function NewDeal() {
  const ctx = await requireStaff();
  if (!mutationAllowed(ctx))
    return (
      <>
        <PageHead title="Create deal" />
        <Card>
          <p className="meta">This workspace is read-only.</p>
        </Card>
      </>
    );
  return (
    <>
      <PageHead
        title="Create deal"
        subtitle="Enter known details. Use unknown where information has not been supplied."
      />
      <Card>
        <DealEditor />
      </Card>
    </>
  );
}
