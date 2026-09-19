import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { databaseUrl } from "@/lib/env";

export type Db = PostgresJsDatabase<typeof schema>;

type Conn = { sql: postgres.Sql; db: Db; url: string };

const globalRef = globalThis as unknown as { __acqfileDb?: Conn };

function connect(url: string): Conn {
  const sql = postgres(url, { max: 10, prepare: false, onnotice: () => {} });
  return { sql, db: drizzle(sql, { schema }), url };
}

export function getConn(): Conn {
  const url = databaseUrl();
  if (!globalRef.__acqfileDb || globalRef.__acqfileDb.url !== url) {
    globalRef.__acqfileDb = connect(url);
  }
  return globalRef.__acqfileDb;
}

export function getDb(): Db {
  return getConn().db;
}

export function getSql(): postgres.Sql {
  return getConn().sql;
}

export async function closeDb() {
  if (globalRef.__acqfileDb) {
    await globalRef.__acqfileDb.sql.end({ timeout: 5 });
    globalRef.__acqfileDb = undefined;
  }
}

export { schema };
