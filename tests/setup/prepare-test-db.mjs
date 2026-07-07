// Provisions an isolated PostgreSQL database for the test suite and applies the
// committed migrations to it — the SAME engine as production, so tests catch
// engine-specific behavior instead of papering over it (which the old SQLite
// harness could not).
//
// Where the test Postgres comes from:
//   • CI / custom setups: set TEST_DATABASE_URL (or DATABASE_URL) to a reachable
//     Postgres — this script just resets + migrates it, touching nothing else.
//   • Local dev (no URL set): this script starts a throwaway Postgres container
//     (Podman or Docker) named `dining-test-pg` on port 5433 and uses that.
//
// It NEVER touches dev or production data — it only ever talks to the test URL.
import { execSync } from 'node:child_process';

// Keep this default in sync with tests/setup/test-env.ts.
const DEFAULT_TEST_DB_URL =
  'postgresql://postgres:postgres@127.0.0.1:5433/dining_test?schema=public';

const CONTAINER = 'dining-test-pg';
const IMAGE = 'docker.io/library/postgres:16-alpine';

const explicitUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const url = explicitUrl || DEFAULT_TEST_DB_URL;

const run = (cmd, opts = {}) =>
  execSync(cmd, { stdio: 'inherit', ...opts });
const quiet = (cmd) => {
  try { return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
};

// Pick a container engine (Podman or Docker), if either is installed.
function containerEngine() {
  for (const e of ['podman', 'docker']) {
    if (quiet(`command -v ${e}`)) return e;
  }
  return null;
}

// Start (or reuse) a local throwaway Postgres container and wait until it's ready.
function ensureLocalPostgres() {
  const engine = containerEngine();
  if (!engine) {
    console.error(
      `\nNo reachable test Postgres.\n` +
      `Either set TEST_DATABASE_URL to a Postgres instance, or install Podman/Docker\n` +
      `so this script can start one automatically.\n`
    );
    process.exit(1);
  }

  const running = quiet(`${engine} ps --filter name=^${CONTAINER}$ --format '{{.Names}}'`);
  if (running !== CONTAINER) {
    // Remove any stopped leftover, then start fresh.
    quiet(`${engine} rm -f ${CONTAINER}`);
    console.log(`Starting throwaway Postgres (${engine}) → ${CONTAINER} on :5433`);
    run(
      `${engine} run -d --name ${CONTAINER} ` +
      `-e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=dining_test ` +
      `-p 5433:5432 ${IMAGE}`
    );
  }

  // Wait for readiness.
  for (let i = 0; i < 60; i++) {
    if (quiet(`${engine} exec ${CONTAINER} pg_isready -U postgres`)?.includes('accepting')) {
      return;
    }
    execSync('sleep 1');
  }
  console.error(`Postgres container ${CONTAINER} did not become ready in time.`);
  process.exit(1);
}

// In local mode (no explicit URL) we own the container lifecycle; otherwise the
// caller (CI) guarantees the database is already up.
if (!explicitUrl) ensureLocalPostgres();

// Reset the test database and re-apply every committed migration from scratch.
// `migrate reset --force` drops all objects and runs `migrate deploy`, so this
// also validates that the migration history applies cleanly on real Postgres.
const env = { ...process.env, DATABASE_URL: url };
run('npx prisma migrate reset --force --skip-seed --skip-generate', { env });

console.log(`\nTest database ready (PostgreSQL): ${url.replace(/:[^:@/]*@/, ':****@')}`);
