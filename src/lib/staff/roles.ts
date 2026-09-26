import type { WorkspaceRole } from "@/lib/workspace";

/** Display names only. Authorization remains in access.ts and every server mutation. */
export function staffRole(role: WorkspaceRole) {
  return role === "admin" ? "Admin" : role === "reviewer" ? "Operator" : "Reviewer";
}
export function staffFocus(role: WorkspaceRole) {
  if (role === "admin")
    return {
      title: "Workspace oversight",
      description:
        "See where each file stands, open the work behind it, and inspect its configuration.",
      entry: "",
      action: "Open overview",
    };
  if (role === "reviewer")
    return {
      title: "Work to move forward",
      description:
        "Start with documents awaiting a person, then resolve outstanding requirements and follow-ups.",
      entry: "/documents",
      action: "Open documents",
    };
  return {
    title: "Files to review",
    description: "View evidence, coverage and recorded decisions. Your access is read-only.",
    entry: "/review",
    action: "View evidence",
  };
}
