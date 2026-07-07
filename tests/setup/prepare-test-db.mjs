// Provisions an isolated SQLite database (prisma/test.db) for the test suite by
// pushing the current schema to it. The committed schema hardcodes its datasource
// URL, so we write a temporary schema copy whose datasource reads DATABASE_URL,
// push to the test file, then delete the temp copy. This never touches dev.db.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const schemaPath = path.join(root, 'prisma', 'schema.prisma');
const tmpSchemaPath = path.join(root, 'prisma', 'schema.test.prisma');
const testDbPath = path.join(root, 'prisma', 'test.db');

// Start from a clean database file.
for (const f of [testDbPath, `${testDbPath}-journal`]) {
  try { fs.unlinkSync(f); } catch { /* not present */ }
}

let schema = fs.readFileSync(schemaPath, 'utf8');
// Production runs on PostgreSQL, but the test suite uses a disposable local
// SQLite file (no server needed, runs serially). Rewrite the datasource in the
// temp schema so `db push` targets DATABASE_URL as SQLite. Handles both the
// legacy `url = "file:…"` form and the current `provider = "postgresql"` one.
schema = schema.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
schema = schema.replace(/url\s*=\s*"file:[^"]*"/, 'url = env("DATABASE_URL")');
// SQLite has no native Json type; map Json fields to String for the test schema.
// Only AuditLog.metadata uses it, and audit writes swallow errors, so tests that
// don't assert on audit metadata are unaffected. Production stays Json on Postgres.
schema = schema.replace(/\bJson\b/g, 'String');
fs.writeFileSync(tmpSchemaPath, schema);

const env = { ...process.env, DATABASE_URL: `file:${testDbPath}` };
try {
  execSync(`npx prisma db push --schema "${tmpSchemaPath}" --skip-generate --accept-data-loss`, {
    stdio: 'inherit',
    env,
  });
  // The committed schema is PostgreSQL, so the default client can't talk to the
  // SQLite test file. Generate a SQLite-flavoured client for the test run. Dev/
  // build/typecheck re-run `prisma generate` against the real schema, restoring
  // the PostgreSQL client afterwards.
  execSync(`npx prisma generate --schema "${tmpSchemaPath}"`, { stdio: 'inherit', env });
} finally {
  try { fs.unlinkSync(tmpSchemaPath); } catch { /* ignore */ }
}

console.log(`\nTest database ready at ${testDbPath}`);
