import "../../scripts/load-env";
import fs from "node:fs";
import { seedPortal } from "../../scripts/seed-portal";
import { closeDb } from "@/lib/db/client";
seedPortal()
  .then((result) =>
    fs.writeFileSync("/tmp/acqfile-browser-deals.json", JSON.stringify(result), { mode: 0o600 }),
  )
  .finally(closeDb);
