import { redirect } from "next/navigation";
/** The workspace opens on its deals (Phase 4: the inherited report dashboard was retired under A42). */
export default function OverviewPage() {
  redirect("/deals");
}
