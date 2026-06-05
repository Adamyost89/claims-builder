import bcrypt from "bcryptjs";
import { ParserType, RuleAuthority, UserRole } from "@prisma/client";

import { PARSER_CERTIFICATION_THRESHOLDS } from "../src/lib/parsers/certification";

import { DEFAULT_BANNED_PHRASES } from "../src/lib/tone/banned-phrases";
import { prisma } from "../src/lib/db";

type SeedRule = {
  title: string;
  scopeCategory: string;
  authorityType: RuleAuthority;
  citationText: string;
  appliesWhen: string;
  requiredEvidence: string;
  outputLanguage: string;
};

const SYSTEM_RULES: SeedRule[] = [
  {
    title: "Starter separation at eaves and rakes",
    scopeCategory: "ROOFING",
    authorityType: RuleAuthority.MANUFACTURER,
    citationText: "Manufacturer installation instructions require separated starter at eaves and rakes.",
    appliesWhen: "Asphalt shingle roof replacement is in scope.",
    requiredEvidence: "MANUFACTURER,PHOTO",
    outputLanguage:
      "Carrier scope omits separated starter course required at eaves and rakes per manufacturer system instructions.",
  },
  {
    title: "Rake starter course",
    scopeCategory: "ROOFING",
    authorityType: RuleAuthority.MANUFACTURER,
    citationText: "Rake edges require dedicated starter or factory-sealed starter treatment.",
    appliesWhen: "Roof replacement includes rake edges.",
    requiredEvidence: "MANUFACTURER,MEASUREMENT",
    outputLanguage:
      "Rake starter is required and was not included in the approved carrier quantity.",
  },
  {
    title: "Felt / underlayment audit",
    scopeCategory: "ROOFING",
    authorityType: RuleAuthority.CODE,
    citationText: "Underlayment coverage must match slope and code minimums for the jurisdiction.",
    appliesWhen: "Underlayment removal or replacement is part of scope.",
    requiredEvidence: "CODE,MEASUREMENT",
    outputLanguage:
      "Approved underlayment quantity does not satisfy code-required coverage for the roof slopes present.",
  },
  {
    title: "Measurement comparison variance",
    scopeCategory: "MEASUREMENT",
    authorityType: RuleAuthority.MEASUREMENT,
    citationText: "Carrier quantities must be supported when measurement reports show higher values.",
    appliesWhen: "Measurement report exists for the claim roof facet.",
    requiredEvidence: "MEASUREMENT",
    outputLanguage:
      "Measurement report values exceed carrier-approved quantities for the compared line items.",
  },
  {
    title: "Omitted line items",
    scopeCategory: "SUPPLEMENT",
    authorityType: RuleAuthority.CARRIER_INCONSISTENCY,
    citationText: "Contractor scope includes installed items missing from carrier estimate.",
    appliesWhen: "Contractor and carrier estimates are both parsed.",
    requiredEvidence: "PHOTO,INVOICE",
    outputLanguage:
      "Contractor estimate documents work that is omitted from the carrier-approved scope.",
  },
  {
    title: "Ice and water barrier at valleys",
    scopeCategory: "ROOFING",
    authorityType: RuleAuthority.CODE,
    citationText: "Valleys in freeze-prone regions require ice barrier overlap per local code.",
    appliesWhen: "Valley metal or open valleys are present in scope.",
    requiredEvidence: "CODE,PHOTO",
    outputLanguage:
      "Ice and water barrier coverage at valleys is not reflected in the approved scope.",
  },
];

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Admin User";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set to seed the database.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.user.upsert({
    where: { email },
    update: {
      name,
      passwordHash,
      role: UserRole.ADMIN,
      active: true,
    },
    create: {
      email,
      name,
      passwordHash,
      role: UserRole.ADMIN,
      active: true,
    },
  });

  await prisma.orgSettings.upsert({
    where: { id: "default" },
    update: {
      productionReady: false,
      dryRunsRequired: 10,
    },
    create: {
      id: "default",
      productionReady: false,
      dryRunsRequired: 10,
      dryRunsReviewedCount: 0,
      confidenceThreshold: 0.85,
    },
  });

  for (const rule of SYSTEM_RULES) {
    const existing = await prisma.rule.findFirst({
      where: { title: rule.title, isSystem: true },
    });

    if (existing) {
      await prisma.rule.update({
        where: { id: existing.id },
        data: {
          scopeCategory: rule.scopeCategory,
          authorityType: rule.authorityType,
          citationText: rule.citationText,
          appliesWhen: rule.appliesWhen,
          requiredEvidence: rule.requiredEvidence,
          outputLanguage: rule.outputLanguage,
          active: true,
          isSystem: true,
          needsReview: false,
        },
      });
    } else {
      await prisma.rule.create({
        data: {
          ...rule,
          active: true,
          isSystem: true,
          needsReview: false,
        },
      });
    }
  }

  await prisma.issueDetectionCertification.upsert({
    where: { id: "default" },
    update: {
      requiredAccuracy: 1,
      certified: false,
      fixtureAccuracy: null,
      failuresJson: null,
    },
    create: {
      id: "default",
      version: "1.0.0",
      requiredAccuracy: 1,
      certified: false,
    },
  });

  for (const parserType of Object.values(ParserType)) {
    await prisma.parserCertification.upsert({
      where: { parserType },
      update: {
        requiredAccuracy: PARSER_CERTIFICATION_THRESHOLDS[parserType],
        parserCertified: false,
      },
      create: {
        parserType,
        requiredAccuracy: PARSER_CERTIFICATION_THRESHOLDS[parserType],
        parserCertified: false,
        notes: "Not certified until fixture tests pass (Phase 2B).",
      },
    });
  }

  for (const phrase of DEFAULT_BANNED_PHRASES) {
    await prisma.bannedPhrase.upsert({
      where: { phrase },
      update: { active: true },
      create: { phrase, active: true },
    });
  }

  console.log(
    "Seed completed: admin user, org settings, system rules, parser certifications, banned phrases.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });