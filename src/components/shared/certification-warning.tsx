import { getIssueDetectionCertification } from "@/lib/issues/certification";
import { evaluateProductionReadiness } from "@/lib/production/readiness";

export async function CertificationWarning({ phase }: { phase: string }) {
  const [issueCert, readiness] = await Promise.all([
    getIssueDetectionCertification(),
    evaluateProductionReadiness(),
  ]);

  if (readiness.productionReady) {
    return null;
  }

  const messages: string[] = [];
  if (!readiness.issueDetectionCertified) {
    messages.push(
      `Issue detection fixtures are not certified (${issueCert?.fixtureAccuracy != null ? `${(issueCert.fixtureAccuracy * 100).toFixed(0)}%` : "not run"}; 100% required).`,
    );
  }
  if (!readiness.parsersCertified) {
    messages.push("One or more parsers are not fixture-certified.");
  }
  if (!readiness.dryRunsSatisfied) {
    messages.push(
      `Dry-run reviews ${readiness.dryRunsReviewedCount}/${readiness.dryRunsRequired} not complete.`,
    );
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">{phase} — production safeguards active</p>
      <p className="mt-1">
        Carrier-ready output remains blocked until parser certification, issue detection
        certification (100% golden fixtures), and dry-run requirements are satisfied.
      </p>
      <ul className="mt-2 list-disc pl-5">
        {messages.map((message) => (
          <li key={message}>{message}</li>
        ))}
      </ul>
    </div>
  );
}
