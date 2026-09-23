import type { SessionContext } from "@/lib/workspace";
export function demoEnvironment() {
  return (
    process.env.ACQFILE_SAMPLE_MODE === "true" &&
    process.env.REAL_DATA_MODE === "false" &&
    Boolean(process.env.DEMO_CASE_WORKSPACE_ID)
  );
}
export function demoAllowed(ctx: SessionContext) {
  return (
    demoEnvironment() &&
    !ctx.isPublic &&
    ["admin", "reviewer"].includes(ctx.workspace.role) &&
    ctx.workspace.workspaceId === process.env.DEMO_CASE_WORKSPACE_ID
  );
}
export function assertDemo(ctx: SessionContext) {
  if (!demoAllowed(ctx))
    throw Error("Demo cases require authorized staff in the configured sample workspace.");
}
