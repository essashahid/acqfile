import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/workspace";
export default async function OverviewPage() {
  const ctx = await requireWorkspace();
  if (ctx.isPublic) redirect("/login");
  redirect(ctx.workspace.role === "adviser" ? "/deals" : "/staff/deals");
}
