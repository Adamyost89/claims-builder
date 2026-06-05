import EmbeddedPostgres from "embedded-postgres";

async function main() {
  const pg = new EmbeddedPostgres({
    databaseDir: ".embedded-postgres",
    user: "claims",
    password: "claims",
    port: 5432,
    persistent: true,
  });

  await pg.initialise();
  await pg.start();

  try {
    await pg.createDatabase("claims_builder");
  } catch {
    // Database may already exist from a prior run.
  }

  console.log(
    "Embedded PostgreSQL ready at postgresql://claims:claims@localhost:5432/claims_builder",
  );

  process.on("SIGINT", async () => {
    await pg.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await pg.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
