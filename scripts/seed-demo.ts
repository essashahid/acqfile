import "./load-env";
import { closeDb } from "@/lib/db/client";
import { seedWorkspace } from "@/lib/seed";
import { seedPortal } from "./seed-portal";
async function main() {
  if (!process.argv.includes("--users-only")) {
    const deals = await seedPortal();
    for (const [code, deal] of Object.entries(deals)) {
      console.log(code, deal.id);
      for (const person of deal.people) console.log(`${person.name}: /p/${person.token}`);
    }
    return;
  }
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
