import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { EngineInputSchema } from "../../src/lib/rules/input";
import { evaluateDeal } from "../../src/lib/rules/engine";
import { loadPack } from "../../src/lib/rules/loader";
import { engineInput, expectedFindings } from "./truth";
import type { Plan } from "../plans/shared";
const sort = (xs: unknown[]) => xs.map((x) => JSON.stringify(x)).sort();
export function oracle(p: Plan, batch: number, root?: string) {
  const authored = engineInput(p, batch);
  const dir = root ? path.join(root, p.id, "truth", `batch-${batch}`) : null;
  const input = dir
    ? EngineInputSchema.parse(
        JSON.parse(fs.readFileSync(path.join(dir, "engine_input.json"), "utf8")),
      )
    : authored;
  assert.deepEqual(input, authored, "Saved engine input differs from plan");
  if (dir) {
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(dir, "expected_checklist.json"), "utf8")),
      p.batches.find((b) => b.batch === batch)!.checklist,
    );
    assert.deepEqual(
      JSON.parse(fs.readFileSync(path.join(dir, "expected_findings.json"), "utf8")),
      expectedFindings(p, batch),
    );
  }
  const actual = evaluateDeal(input, loadPack(p.pack, p.overlay));
  const expected = p.batches.find((b) => b.batch === batch)!;
  const rows = actual.checklist.map(({ item_id, scope_key, period, status }) => ({
    item_id,
    scope_key,
    period,
    status,
  }));
  const findings = actual.findings.map(
    ({ rule_id, scope_key, period, type, severity, finding_key }) => ({
      rule_id,
      scope_key,
      period,
      type,
      severity,
      finding_key,
    }),
  );
  const diff = (a: unknown[], b: unknown[]) => ({
    unexpected: sort(a).filter((s) => !sort(b).includes(s)),
    missing: sort(b).filter((s) => !sort(a).includes(s)),
  });
  const differences = {
    checklist: diff(rows, expected.checklist),
    findings: diff(findings, expectedFindings(p, batch)),
  };
  assert.deepEqual(
    differences,
    { checklist: { unexpected: [], missing: [] }, findings: { unexpected: [], missing: [] } },
    `${p.id}/batch-${batch} mismatch ${JSON.stringify(differences, null, 2)}`,
  );
  assert.equal(actual.result_hash, evaluateDeal(input, loadPack(p.pack, p.overlay)).result_hash);
  for (const f of actual.findings)
    for (const d of f.details)
      if (d.fact_id) {
        const fact = input.accepted_facts.find((x) => x.id === d.fact_id);
        assert.ok(fact);
        assert.equal(d.quote, fact.locator.quote);
        assert.equal(d.file, fact.locator.file);
      }
  return {
    deal: p.id,
    batch,
    rows: rows.length,
    findings: findings.length,
    result_hash: actual.result_hash,
  };
}
