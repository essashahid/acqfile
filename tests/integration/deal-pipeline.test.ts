import fs from "node:fs";
import { PDFDocument } from "pdf-lib";
import { it, expect } from "vitest";
import { and, eq, asc } from "drizzle-orm";
import { getDb, getSql, schema } from "@/lib/db/client";
import { saveDeal } from "@/lib/deals/service";
import { intake } from "@/lib/deals/intake";
import { processDealRun, processDealVersion } from "@/lib/deals/process";
import {
  reviewFile,
  undoSupersession,
  type FilingRecord,
} from "@/lib/deals/filing";
import { seeded } from "./helpers";
import { seedEvalCases } from "@/lib/eval/cases";
import { ingestCorpus } from "@/lib/eval/corpus";
import { runEvaluation } from "@/lib/eval/run";
import { listDocuments } from "@/lib/queries/documents";
import type { SessionContext } from "@/lib/workspace";
import type { documents } from "../../fixtures/lib/truth";
it("all three deals and every batch satisfy the Phase 3 pipeline gates", async () => {
  process.env.PII_HMAC_KEY = "SYNTHETIC-PIPELINE-TEST-HMAC-KEY-ONLY-2026";
  const seed = await seeded();
  const ctx: SessionContext = {
    user: {
      id: seed.adminId,
      email: "admin@example.com",
      displayName: "Synthetic administrator",
    },
    workspace: {
      workspaceId: seed.workspaceId,
      slug: "default",
      name: "Synthetic workspace",
      role: "admin",
    },
  };
  const db = getDb(),
    report = [];
  let aId = "",
    aVersion = "",
    aRun = "",
    bId = "";
  for (const code of ["deal-a", "deal-b", "deal-c"]) {
    const truth = JSON.parse(
      fs.readFileSync(`fixtures/deals/${code}/truth/documents.json`, "utf8"),
    ) as ReturnType<typeof documents>;
    const draft = JSON.parse(
      fs.readFileSync(`fixtures/deals/${code}/truth/deal.json`, "utf8"),
    );
    const id = await saveDeal(ctx, {
      ...draft,
      code,
      name: draft.parties.find((p: { roles: string[] }) =>
        p.roles.includes("seller_entity"),
      ).legal_name,
    });
    if (code === "deal-b") bId = id;
    const parties = await db
      .select()
      .from(schema.parties)
      .where(eq(schema.parties.dealId, id));
    const partyAlias = (uuid: string | null) =>
      parties.find((p) => p.id === uuid)?.externalKey ?? null;
    const counts = {
      deal: code,
      segments: 0,
      type: 0,
      bundle_boundaries: 0,
      bundle_segments: 0,
      party_period: 0,
      signatures: 0,
      wrong_true: 0,
      deterministic: 0,
      deterministic_correct: 0,
      classifier: 0,
      pipeline_expectations: 0,
      files: 0,
      batches: 0,
    };
    for (let batch = 1; batch <= (code === "deal-a" ? 2 : 1); batch++) {
      const upload = await intake(ctx, id, [
        {
          path: `batch-${batch}.zip`,
          bytes: fs.readFileSync(`fixtures/deals/${code}/batch-${batch}.zip`),
        },
      ]);
      if (code === "deal-a" && batch === 1) {
        aId = id;
        aRun = upload.runId;
        aVersion = upload.rows.find((r) => !r.duplicate)!.documentVersionId;
        await processDealVersion(ctx, id, aVersion, aRun, {
          injectFailure: { step: "segment_classify", attempts: 1 },
          sleep: async () => {},
        });
      }
      expect(
        await processDealRun(ctx, id, upload.runId, { sleep: async () => {} }),
      ).toEqual({
        completed: upload.rows.filter((r) => !r.duplicate).length,
        failed: 0,
      });
      counts.batches++;
      for (const arrival of upload.rows) {
        const expected = truth.find(
          (d) => d.file === `incoming/batch-${batch}/${arrival.originalPath}`,
        )!;
        expect(expected, arrival.originalPath).toBeDefined();
        expect(arrival.duplicate, arrival.originalPath).toBe(
          !!expected.pipeline.duplicate_of,
        );
        counts.files++;
        if (arrival.duplicate) {
          const existing = await db
            .select()
            .from(schema.intakeFiles)
            .where(
              and(
                eq(
                  schema.intakeFiles.documentVersionId,
                  arrival.documentVersionId,
                ),
                eq(schema.intakeFiles.duplicate, false),
              ),
            );
          expect(
            existing.some(
              (f) =>
                `incoming/batch-${batch}/${f.originalPath}` ===
                expected.pipeline.duplicate_of,
            ),
          ).toBe(true);
          counts.pipeline_expectations++;
          continue;
        }
        const [version] = await db
          .select()
          .from(schema.documentVersions)
          .where(eq(schema.documentVersions.id, arrival.documentVersionId));
        expect(version!.parseStatus === "failed").toBe(
          expected.pipeline.unreadable,
        );
        const actual = await db
          .select()
          .from(schema.segments)
          .where(
            eq(schema.segments.documentVersionId, arrival.documentVersionId),
          )
          .orderBy(asc(schema.segments.pageStart));
        expect(actual.length, arrival.originalPath).toBe(
          expected.segments.length,
        );
        if (expected.pipeline.unreadable) {
          expect(actual).toHaveLength(0);
          expect(
            (
              await db
                .select()
                .from(schema.intakeReviews)
                .where(eq(schema.intakeReviews.documentVersionId, version!.id))
            ).some((r) => r.type === "unreadable" && r.priority === "high"),
          ).toBe(true);
          counts.pipeline_expectations++;
        }
        for (const [i, s] of actual.entries()) {
          const target = expected.segments[i]!;
          counts.segments++;
          const type = s.docType === target.doc_type,
            boundary =
              s.pageStart === target.page_start &&
              s.pageEnd === target.page_end;
          counts.type += Number(type);
          if (expected.pipeline.bundle) {
            counts.bundle_segments++;
            counts.bundle_boundaries += Number(boundary);
          }
          counts.party_period += Number(
            partyAlias(s.partyId) ===
              (target.party_id === "outside-party" ? null : target.party_id) &&
              s.period === target.period,
          );
          counts.signatures += Number(
            s.signed === target.signed && s.dated === target.dated,
          );
          counts.wrong_true += Number(
            (s.signed === true && target.signed !== true) ||
              (s.dated === true && target.dated !== true),
          );
          if (s.classificationMethod === "signature") {
            counts.deterministic++;
            counts.deterministic_correct += Number(type && boundary);
          } else counts.classifier++;
          for (const oldId of expected.pipeline.supersedes) {
            const oldFile = truth.find((d) =>
              d.segments.some((s) => s.id === oldId),
            )!;
            const oldArrival = (
              await db
                .select()
                .from(schema.intakeFiles)
                .innerJoin(
                  schema.dealBatches,
                  eq(schema.dealBatches.id, schema.intakeFiles.batchId),
                )
                .where(eq(schema.dealBatches.dealId, id))
            ).find(
              (r) =>
                r.intake_files.originalPath ===
                oldFile.file.replace(/^incoming\/batch-\d+\//, ""),
            )!;
            const old = (
              await db
                .select()
                .from(schema.segments)
                .where(
                  eq(
                    schema.segments.documentVersionId,
                    oldArrival.intake_files.documentVersionId,
                  ),
                )
            ).find((x) => x.docType === s.docType && x.partyId === s.partyId)!;
            expect(old.isCurrent).toBe(false);
            counts.pipeline_expectations++;
          }
          if (
            target.doc_type === "LEASE" &&
            expected.file.includes("scan0007")
          ) {
            expect(s.docType).toBe("LEASE");
            counts.pipeline_expectations++;
          }
          if (target.id === "brochure") {
            expect(s.docType).toBe("OTHER_NOT_REQUIRED");
            counts.pipeline_expectations++;
          }
          if (target.party_id === "outside-party") {
            expect(s.partyId).toBeNull();
            expect(
              (
                await db
                  .select()
                  .from(schema.intakeReviews)
                  .where(
                    eq(
                      schema.intakeReviews.documentVersionId,
                      s.documentVersionId,
                    ),
                  )
              ).some((r) => r.type === "party_assignment"),
            ).toBe(true);
            counts.pipeline_expectations++;
          }
        }
      }
    }
    expect(counts.type / counts.segments).toBeGreaterThanOrEqual(0.95);
    expect(
      counts.bundle_boundaries / counts.bundle_segments,
    ).toBeGreaterThanOrEqual(0.9);
    expect(counts.party_period / counts.segments).toBeGreaterThanOrEqual(0.9);
    expect(counts.signatures / counts.segments).toBeGreaterThanOrEqual(0.9);
    expect(counts.wrong_true).toBe(0);
    report.push(counts);
  }
  // Same identity and date, different bytes: require an explicit audited selection.
  const sameDate = await PDFDocument.load(
    fs.readFileSync(
      "fixtures/deals/deal-b/incoming/batch-1/Buyer/Attachments/1919.pdf",
    ),
  );
  sameDate.setSubject("SYNTHETIC same-date resubmission");
  const conflictUpload = await intake(ctx, bId, [
    { path: "1919-resubmitted.pdf", bytes: Buffer.from(await sameDate.save()) },
  ]);
  expect(
    await processDealRun(ctx, bId, conflictUpload.runId, {
      sleep: async () => {},
    }),
  ).toEqual({ completed: 1, failed: 0 });
  const conflictVersion = conflictUpload.rows[0]!.documentVersionId;
  const conflictReviews = await db
    .select()
    .from(schema.intakeReviews)
    .where(eq(schema.intakeReviews.documentVersionId, conflictVersion));
  expect(
    conflictReviews.some(
      (r) => r.type === "version_conflict" && r.status === "open",
    ),
  ).toBe(true);
  const [conflictRecord] = await db
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, conflictVersion),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const conflictSegments = (conflictRecord!.payloadJson as FilingRecord)
    .segments;
  expect(conflictSegments[0]!.status).toBe("proposed");
  await reviewFile(ctx, bId, conflictVersion, {
    record_id: conflictRecord!.id,
    segments: conflictSegments,
    force_current: true,
    note: "Compared same-date originals; selected this submitted version",
  });
  const current1919 = await db
    .select()
    .from(schema.segments)
    .where(
      and(
        eq(schema.segments.dealId, bId),
        eq(schema.segments.docType, "SBA_1919"),
        eq(schema.segments.isCurrent, true),
        eq(schema.segments.status, "confirmed"),
      ),
    );
  expect(current1919).toHaveLength(1);
  expect(current1919[0]!.documentVersionId).toBe(conflictVersion);
  expect(
    (
      await db
        .select()
        .from(schema.events)
        .where(
          and(
            eq(schema.events.dealId, bId),
            eq(schema.events.action, "version_selected"),
          ),
        )
    ).length,
  ).toBe(1);
  const steps = await db
    .select()
    .from(schema.runSteps)
    .where(eq(schema.runSteps.documentVersionId, aVersion));
  expect(steps.find((s) => s.stepName === "parse")!.attemptCount).toBe(1);
  expect(
    steps.find((s) => s.stepName === "segment_classify")!.attemptCount,
  ).toBe(2);
  const beforeCalls = (await db.select().from(schema.llmCalls)).length;
  await processDealVersion(ctx, aId, aVersion, aRun, { sleep: async () => {} });
  expect((await db.select().from(schema.llmCalls)).length).toBe(beforeCalls);
  const [review] = await db
    .select()
    .from(schema.intakeReviews)
    .where(
      and(
        eq(schema.intakeReviews.dealId, aId),
        eq(schema.intakeReviews.type, "segmentation"),
      ),
    )
    .limit(1);
  const [record] = await db
    .select()
    .from(schema.recordVersions)
    .where(
      and(
        eq(schema.recordVersions.documentVersionId, review!.documentVersionId),
        eq(schema.recordVersions.isCurrent, true),
      ),
    );
  const payload = record!.payloadJson as FilingRecord;
  const input = {
    record_id: record!.id,
    segments: payload.segments,
    note: "Confirmed source boundaries",
  };
  await reviewFile(ctx, aId, review!.documentVersionId, input);
  await expect(
    reviewFile(ctx, aId, review!.documentVersionId, input),
  ).rejects.toThrow("Stale");
  expect(
    (
      await db
        .select()
        .from(schema.recordVersions)
        .where(
          eq(
            schema.recordVersions.documentVersionId,
            review!.documentVersionId,
          ),
        )
    ).length,
  ).toBe(2);
  const [event] = await db
    .select()
    .from(schema.events)
    .where(
      and(
        eq(schema.events.dealId, aId),
        eq(schema.events.action, "segment_superseded"),
      ),
    )
    .limit(1);
  await undoSupersession(ctx, aId, event!.id);
  await expect(undoSupersession(ctx, aId, event!.id)).rejects.toThrow("Stale");
  const payloads =
    await getSql()`select row_to_json(t)::text as payload from source_blocks t union all select row_to_json(t)::text from run_steps t union all select row_to_json(t)::text from run_events t union all select row_to_json(t)::text from record_versions t union all select row_to_json(t)::text from segments t union all select row_to_json(t)::text from events t`;
  expect(
    payloads.some((r) =>
      /\b\d{3}-\d{2}-\d{4}\b|\b\d{2}-\d{7}\b/.test(r.payload),
    ),
  ).toBe(false);
  expect(await listDocuments(seed.workspaceId)).toHaveLength(0);
  await seedEvalCases();
  const corpus = await ingestCorpus({
    workspaceId: seed.workspaceId,
    userId: seed.adminId,
  });
  const legacyEvaluation = await runEvaluation({
    workspaceId: seed.workspaceId,
    userId: seed.adminId,
    processingRunId: corpus.processingRunId,
    skipResumability: true,
  });
  expect(legacyEvaluation.results).toHaveLength(76);
  expect((await listDocuments(seed.workspaceId)).length).toBeGreaterThan(0);
  fs.writeFileSync(
    "/tmp/acqfile-phase3-pipeline-proof.json",
    JSON.stringify(
      {
        report,
        resume: "pass",
        review_versions: "pass",
        stale_edit: "pass",
        undo: "pass",
        equal_date_conflict: "pass",
        identifier_lint: "pass",
        legacy_coexistence: "pass",
      },
      null,
      2,
    ),
  );
}, 180000);
