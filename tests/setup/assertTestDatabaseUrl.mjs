// Guards every destructive test-DB entry point (resetDb()'s deleteMany calls,
// prepare-test-db.mjs's `prisma migrate reset --force`) against ever running
// against a real dev/prod database because TEST_DATABASE_URL or DATABASE_URL
// was pointed at the wrong place by mistake. Refuses to proceed unless the
// database name unmistakably looks disposable.
export function assertTestDatabaseUrl(url) {
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/(^|_)test($|_)/i.test(dbName)) {
    throw new Error(
      `Refusing to run destructive test-DB setup against database "${dbName}" — its name ` +
      `doesn't look like a disposable test database (expected something containing "test", ` +
      `e.g. "dining_test"). Check DATABASE_URL/TEST_DATABASE_URL before retrying.`
    );
  }
}
