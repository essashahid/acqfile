import "./load-env";
import { closeDb } from "@/lib/db/client";
import { DEMO_CASES, demoCase } from "@/lib/demo/registry";
import { demoOperator, seedDemoCase } from "./demo-case-seed";
async function main() {
  const [command, id] = process.argv.slice(2);
  if (command !== "seed" && command !== "reset")
    throw Error("Usage: demo:cases seed [D01] | reset D01");
  if (command === "reset" && !id) throw Error("Reset requires ONE named case (D01–D08).");
  const cases = id ? [demoCase(id)] : DEMO_CASES;
  const ctx = await demoOperator();
  for (const c of cases) console.log(c.id, await seedDemoCase(ctx, c.id, command === "reset"));
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
