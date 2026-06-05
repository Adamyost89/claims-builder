import { certifyIssueDetectionFromFixtures } from "../src/lib/issues/certification";
import { syncOrgProductionReadyFlag } from "../src/lib/production/readiness";

async function main() {
  const result = await certifyIssueDetectionFromFixtures();
  const readiness = await syncOrgProductionReadyFlag();

  console.log("Issue detection certification run complete.");
  console.log(`  Version: ${result.version}`);
  console.log(`  Accuracy: ${(result.fixtureAccuracy * 100).toFixed(2)}% (${result.passed}/${result.total})`);
  console.log(`  Certified: ${result.certified ? "YES" : "NO"}`);
  console.log(`  Production ready: ${readiness.productionReady ? "YES" : "NO"}`);

  if (result.failures.length > 0) {
    console.log("\nFailures:");
    for (const failure of result.failures.slice(0, 20)) {
      console.log(`  - [${failure.fixtureId}] ${failure.type}: ${failure.message}`);
    }
    if (result.failures.length > 20) {
      console.log(`  ... and ${result.failures.length - 20} more`);
    }
    process.exit(1);
  }

  if (!result.certified) {
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  });
