import { beforeAll, describe, expect, it } from "vitest";
import { getSql } from "@/lib/db/client";
import { seeded } from "./helpers";
import { loadPack } from "@/lib/rules/loader";
import { persistPackSnapshot } from "@/lib/rules/persistence";
import { fixtureInput } from "../unit/engine-fixtures";
let seed: Awaited<ReturnType<typeof seeded>>,
  deal: string,
  otherDeal: string,
  party: string,
  version: string,
  segment: string;
beforeAll(async () => {
  seed = await seeded();
  const sql = getSql(),
    profile = JSON.stringify(fixtureInput().profile);
  const deals =
    await sql`insert into deals(workspace_id,code,name,profile_json,rule_pack_version,as_of_date) values (${seed.workspaceId},'D1','Synthetic deal',${profile}::jsonb,'sop-50-10-8','2026-09-15'),(${seed.workspaceId},'D2','Other synthetic deal',${profile}::jsonb,'sop-50-10-8','2026-09-15') returning id`;
  deal = deals[0]!.id;
  otherDeal = deals[1]!.id;
  const parties =
    await sql`insert into parties(deal_id,kind,roles,legal_name) values (${deal},'entity',array['buyer_entity'],'Zelmivar Holdings LLC') returning id`;
  party = parties[0]!.id;
  const docs =
    await sql`insert into documents(workspace_id,deal_id,logical_key,display_name) values (${seed.workspaceId},${deal},'DOMAIN-TEST','Domain test') returning id`;
  const versions =
    await sql`insert into document_versions(workspace_id,document_id,version_number,content_hash,storage_path,mime_type,byte_size,source_filename) values (${seed.workspaceId},${docs[0]!.id},1,${"c".repeat(64)},'synthetic/domain.pdf','application/pdf',100,'domain.pdf') returning id`;
  version = versions[0]!.id;
  const segments =
    await sql`insert into segments(deal_id,document_version_id,metadata_locator,page_start,page_end,doc_type,party_id,classification_method,classification_confidence,status) values (${deal},${version},'{}',1,2,'EIN_LETTER',${party},'manual',1,'confirmed') returning id`;
  segment = segments[0]!.id;
});
describe("additive domain storage", () => {
  it("creates all ten tables and keeps legacy documents nullable", async () => {
    const sql = getSql();
    const rows = await sql`select tablename from pg_tables where schemaname='public'`;
    for (const name of [
      "deals",
      "parties",
      "ownership_links",
      "segments",
      "facts",
      "rule_pack_snapshots",
      "evaluations",
      "checklist_status",
      "findings",
      "events",
      "record_versions",
      "attestations",
    ])
      expect(rows.map((r) => r.tablename)).toContain(name);
    await expect(
      sql`insert into documents(workspace_id,logical_key,display_name) values (${seed.workspaceId},'LEGACY-NULL','Legacy')`,
    ).resolves.toBeDefined();
  });
  it("snapshots exact resolved content idempotently and prevents mutation", async () => {
    const pack = loadPack("sop-50-10-8", "sample-lender-a");
    const [a, b] = await Promise.all([persistPackSnapshot(pack), persistPackSnapshot(pack)]);
    expect(a!.id).toBe(b!.id);
    expect(a!.contentHash).toBe(pack.content_hash);
    expect(a!.resolvedYaml).toContain("sample-lender-a");
    const sql = getSql();
    await expect(
      sql`update rule_pack_snapshots set version='changed' where id=${a!.id}`,
    ).rejects.toThrow("Immutable");
    await expect(sql`delete from rule_pack_snapshots where id=${a!.id}`).rejects.toThrow(
      "Immutable",
    );
  });
  it("enforces same-deal references for segments, facts and ownership", async () => {
    const sql = getSql();
    await expect(
      sql`insert into segments(deal_id,document_version_id,metadata_locator,page_start,page_end,doc_type,classification_method,classification_confidence,status) values (${otherDeal},${version},'{}',1,2,'EIN_LETTER','manual',1,'confirmed')`,
    ).rejects.toThrow("another deal");
    await expect(
      sql`update documents set deal_id=${otherDeal} where id=(select document_id from document_versions where id=${version})`,
    ).rejects.toThrow("Cannot reassign");
    await expect(
      sql`insert into facts(deal_id,segment_id,attribute,value_json,normalized_value_json,unit,method,locator_json,confidence,confidence_components,validators_passed,routing_status,record_version) values (${otherDeal},${segment},'party.legal_name','"Synthetic"','"Synthetic"','text','text','{"file":"test.pdf","page":1,"source_block":"p1","quote":"Synthetic"}',1,'{}',true,'accepted',1)`,
    ).rejects.toThrow("foreign key");
    await expect(
      sql`insert into ownership_links(deal_id,owner_party_id,owned_party_id,percent,stage,origin) values (${otherDeal},${party},${party},100,'post_closing','declared')`,
    ).rejects.toThrow();
  });
  it("stores masked identifiers and requires manual audit evidence", async () => {
    const sql = getSql();
    const identifier = JSON.stringify({ hmac: "a".repeat(64), last_four: "1234" }),
      locator = JSON.stringify({
        file: "domain.pdf",
        page: 1,
        source_block: "1",
        quote: "Identifier ending 1234",
      });
    const events =
      await sql`insert into events(deal_id,actor_id,action,entity_type,entity_id,masked_after) values (${deal},${seed.adminId},'manual_fact','segment',${segment},${identifier}::jsonb) returning id`;
    const event = events[0]!.id;
    const insert = (value: string, audit: string | null) =>
      sql`insert into facts(deal_id,segment_id,subject_party_id,attribute,value_json,normalized_value_json,unit,method,locator_json,confidence,confidence_components,validators_passed,routing_status,actor_id,audit_event_id,record_version) values (${deal},${segment},${party},'party.identifier',${value}::jsonb,${value}::jsonb,'masked_identifier','manual',${locator}::jsonb,1,'{}',true,'accepted',${seed.adminId},${audit},1)`;
    await expect(insert(identifier, null)).rejects.toThrow();
    await expect(insert(JSON.stringify({ clear: "123456789" }), event)).rejects.toThrow();
    await expect(insert(identifier, event)).resolves.toBeDefined();
    await expect(sql`update events set action='edited' where id=${event}`).rejects.toThrow(
      "Immutable",
    );
    await expect(sql`delete from events where id=${event}`).rejects.toThrow("Immutable");
  });
  it("rejects invalid page ranges and confidence", async () => {
    const sql = getSql();
    await expect(
      sql`insert into segments(deal_id,document_version_id,metadata_locator,page_start,page_end,doc_type,classification_method,classification_confidence,status) values (${deal},${version},'{}',5,2,'EIN_LETTER','manual',1.2,'confirmed')`,
    ).rejects.toThrow();
  });
});
