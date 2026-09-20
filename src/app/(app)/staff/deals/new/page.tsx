import { requireStaff } from "@/lib/workspace";
import { mutationAllowed } from "@/lib/access";
import { DealEditor } from "../DealEditor";
export default async function NewDeal() {
  const ctx = await requireStaff();
  if (!mutationAllowed(ctx)) return <p>This workspace is read-only.</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Create deal</h1>
      <p>Enter known details. Use unknown where information has not been supplied.</p>
      <DealEditor />
    </div>
  );
}
