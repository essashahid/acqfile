import "./load-env";
import { closeDb } from "@/lib/db/client";
import { seedWorkspace } from "@/lib/seed";
/** Seed the workspace and demo users. The three-deal demo seed arrives with Phase 7. */
async function main() {
  const r = await seedWorkspace();
  console.log(
    `workspace ${r.workspaceId}; admin ${r.adminId}; reviewer ${r.reviewerId}; viewer ${r.viewerId}`,
  );
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
