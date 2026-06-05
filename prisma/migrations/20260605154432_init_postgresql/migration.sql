-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'SUPPLEMENT_WRITER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('DRAFT', 'INGESTING', 'IN_REVIEW', 'READY_FOR_OUTPUT', 'EXPORTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClaimType" AS ENUM ('ROOF', 'SIDING', 'GUTTERS', 'INTERIOR', 'EXTERIOR', 'MIXED');

-- CreateEnum
CREATE TYPE "WorkflowStage" AS ENUM ('UPLOAD', 'PARSE', 'HUMAN_REVIEW', 'MEASUREMENT_COMPARISON', 'RULE_ISSUE_DETECTION', 'EVIDENCE_VALIDATION', 'GENERATION', 'HUMAN_APPROVAL', 'EXPORT');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CARRIER_ESTIMATE', 'CONTRACTOR_ESTIMATE', 'EAGLEVIEW', 'HOVER', 'GAF', 'ITEL', 'PHOTO', 'INVOICE', 'POLICY_JACKET', 'CARRIER_EMAIL', 'CODE', 'MANUFACTURER', 'FIELD_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "ParseStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "MeasurementVendor" AS ENUM ('EAGLEVIEW', 'HOVER', 'GAF', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('HEURISTIC', 'LLM', 'MANUAL');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('MEASUREMENT', 'PHOTO', 'CODE', 'MANUFACTURER', 'INVOICE', 'CARRIER_INCONSISTENCY', 'POLICY', 'FIELD_NOTE', 'CALCULATION');

-- CreateEnum
CREATE TYPE "IssueCategory" AS ENUM ('OMITTED_ITEM', 'MEASUREMENT_DEFICIENCY', 'ESTIMATE_INCONSISTENCY', 'CODE_MANUFACTURER', 'INSTALLATION_INSUFFICIENCY');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('DRAFT', 'NEEDS_EVIDENCE', 'READY_FOR_OUTPUT', 'EXCLUDED', 'FINALIZED');

-- CreateEnum
CREATE TYPE "ReadinessStatus" AS ENUM ('NOT_ASSESSED', 'NEEDS_EVIDENCE', 'PARTIALLY_READY', 'READY_FOR_OUTPUT', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "RuleAuthority" AS ENUM ('CODE', 'MANUFACTURER', 'CARRIER_INCONSISTENCY', 'MEASUREMENT', 'PHOTO', 'INVOICE', 'POLICY');

-- CreateEnum
CREATE TYPE "OutputMode" AS ENUM ('FULL_SUPPLEMENT', 'CARRIER_REBUTTAL', 'SHORT_REPLY', 'INTERNAL_AUDIT', 'SCOPE_COMPARISON', 'MISSING_EVIDENCE_CHECKLIST');

-- CreateEnum
CREATE TYPE "OutputStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXPORTED');

-- CreateEnum
CREATE TYPE "ConfidenceReviewType" AS ENUM ('ESTIMATE_LINE', 'MEASUREMENT_VALUE', 'DOCUMENT_CLASSIFICATION', 'RULE_TRIGGER');

-- CreateEnum
CREATE TYPE "ConfidenceReviewResolution" AS ENUM ('PENDING', 'ACCEPTED', 'EDITED', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ParserType" AS ENUM ('CARRIER_ESTIMATE', 'EAGLEVIEW', 'HOVER', 'GAF', 'ITEL');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('CLAIM_CREATE', 'CLAIM_UPDATE', 'NOTE_CREATE', 'UPLOAD', 'DOCUMENT_DELETE', 'PARSE', 'MANUAL_EDIT', 'RULE_TRIGGER', 'EVIDENCE_LINK', 'OVERRIDE', 'GENERATE', 'TONE_LINT_FAIL', 'APPROVAL', 'EXPORT', 'EXPORT_BLOCKED', 'GATE_BLOCKED', 'CONFIDENCE_RESOLVE', 'COMPARISON_RUN', 'COMPARISON_REVIEW', 'ISSUE_DETECTION_RUN', 'ISSUE_REVIEW', 'NO_ISSUES_FOUND', 'EVIDENCE_REVIEW', 'EVIDENCE_UNLINK', 'OUTPUT_DELETE', 'DRY_RUN_REVIEW', 'PRODUCTION_OVERRIDE', 'PRODUCTION_OVERRIDE_REVOKE', 'WORKFLOW_ADVANCE');

-- CreateEnum
CREATE TYPE "ReviewTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'VIEWER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "productionReady" BOOLEAN NOT NULL DEFAULT false,
    "fixtureTestsPassedAt" TIMESTAMP(3),
    "dryRunsReviewedCount" INTEGER NOT NULL DEFAULT 0,
    "dryRunsRequired" INTEGER NOT NULL DEFAULT 10,
    "confidenceThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "productionOverrideBy" TEXT,
    "productionOverrideAt" TIMESTAMP(3),
    "productionOverrideNote" TEXT,
    "productionOverrideExpiresAt" TIMESTAMP(3),
    "productionOverrideRevokedAt" TIMESTAMP(3),
    "productionOverrideRevokedBy" TEXT,
    "productionOverrideRevokeNote" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssueDetectionCertification" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "requiredAccuracy" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "fixtureAccuracy" DOUBLE PRECISION,
    "certified" BOOLEAN NOT NULL DEFAULT false,
    "certifiedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "failuresJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueDetectionCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedPhrase" (
    "id" TEXT NOT NULL,
    "phrase" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BannedPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Claim" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "propertyAddress" TEXT NOT NULL,
    "carrier" TEXT NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "policyNumber" TEXT,
    "dateOfLoss" TIMESTAMP(3) NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "county" TEXT,
    "manufacturerSystem" TEXT,
    "claimType" "ClaimType" NOT NULL DEFAULT 'ROOF',
    "status" "ClaimStatus" NOT NULL DEFAULT 'DRAFT',
    "workflowStage" "WorkflowStage" NOT NULL DEFAULT 'UPLOAD',
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "dryRunReviewedAt" TIMESTAMP(3),
    "dryRunReviewedById" TEXT,
    "comparisonReviewedAt" TIMESTAMP(3),
    "issuesReviewedAt" TIMESTAMP(3),
    "evidenceReviewedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimNote" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "parseStatus" "ParseStatus" NOT NULL DEFAULT 'PENDING',
    "parseError" TEXT,
    "confidence" DOUBLE PRECISION,
    "classificationConfidence" DOUBLE PRECISION,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "metadataJson" TEXT,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "originalFieldValue" TEXT,
    "sourcePage" INTEGER,
    "sourceText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "extractionMethod" "ExtractionMethod" NOT NULL,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParserCertification" (
    "id" TEXT NOT NULL,
    "parserType" "ParserType" NOT NULL,
    "requiredAccuracy" DOUBLE PRECISION NOT NULL,
    "fixtureAccuracy" DOUBLE PRECISION,
    "parserCertified" BOOLEAN NOT NULL DEFAULT false,
    "lastCertifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParserCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "documentId" TEXT,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "caption" TEXT,
    "takenAt" TIMESTAMP(3),
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstimateLineItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "extractionId" TEXT,
    "description" TEXT NOT NULL,
    "originalDescription" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "originalQuantity" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "category" TEXT,
    "lineCode" TEXT,
    "sourcePage" INTEGER,
    "rawText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "extractionMethod" "ExtractionMethod" NOT NULL DEFAULT 'HEURISTIC',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstimateLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementReport" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "vendor" "MeasurementVendor" NOT NULL,
    "reportName" TEXT,
    "reportDate" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "rawSummaryJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeasurementValue" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "extractionId" TEXT,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "originalValue" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "slope" TEXT,
    "sourcePage" INTEGER,
    "rawText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "extractionMethod" "ExtractionMethod" NOT NULL DEFAULT 'HEURISTIC',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeasurementValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonResult" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "comparisonKey" TEXT NOT NULL,
    "approvedQty" DOUBLE PRECISION NOT NULL,
    "requestedQty" DOUBLE PRECISION NOT NULL,
    "difference" DOUBLE PRECISION NOT NULL,
    "pctDifference" DOUBLE PRECISION,
    "formula" TEXT NOT NULL,
    "physicallySufficient" BOOLEAN NOT NULL DEFAULT true,
    "explanation" TEXT NOT NULL,
    "sourceDocumentIds" TEXT NOT NULL,
    "carrierLineItemId" TEXT,
    "measurementValueIds" TEXT NOT NULL,
    "isWarning" BOOLEAN NOT NULL DEFAULT false,
    "unit" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparisonResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scopeCategory" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "authorityType" "RuleAuthority" NOT NULL,
    "citationText" TEXT NOT NULL,
    "sourceDocument" TEXT,
    "appliesWhen" TEXT NOT NULL,
    "requiredEvidence" TEXT NOT NULL,
    "outputLanguage" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleEvaluation" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "confidence" DOUBLE PRECISION,
    "needsConfidenceReview" BOOLEAN NOT NULL DEFAULT false,
    "revisionItemId" TEXT,
    "resultJson" TEXT,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevisionItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sectionNumber" INTEGER,
    "title" TEXT NOT NULL,
    "category" "IssueCategory" NOT NULL,
    "carrierApprovedLineItem" TEXT,
    "carrierApprovedQty" DOUBLE PRECISION,
    "carrierApprovedUnit" TEXT,
    "requestedLineItem" TEXT,
    "requestedQty" DOUBLE PRECISION,
    "requestedUnit" TEXT,
    "qtyDifference" DOUBLE PRECISION,
    "calculationMethod" TEXT,
    "basis" TEXT,
    "revisionRequired" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'DRAFT',
    "readinessStatus" "ReadinessStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "exportEligible" BOOLEAN NOT NULL DEFAULT false,
    "requiredEvidenceTypes" TEXT NOT NULL DEFAULT '[]',
    "excludedReason" TEXT,
    "overrideById" TEXT,
    "overrideNote" TEXT,
    "overriddenAt" TIMESTAMP(3),
    "ruleId" TEXT,
    "sourceDetectionType" TEXT,
    "comparisonResultId" TEXT,
    "calculationId" TEXT,
    "detectionKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevisionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLink" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "revisionItemId" TEXT NOT NULL,
    "evidenceType" "EvidenceType" NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "snippet" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "isSatisfied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Calculation" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "revisionItemId" TEXT,
    "calculatorType" TEXT NOT NULL,
    "inputsJson" TEXT NOT NULL,
    "outputsJson" TEXT NOT NULL,
    "formula" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedOutput" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "outputMode" "OutputMode" NOT NULL,
    "status" "OutputStatus" NOT NULL DEFAULT 'DRAFT',
    "contentText" TEXT,
    "contentJson" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "toneLintPassed" BOOLEAN NOT NULL DEFAULT false,
    "toneLintViolations" TEXT,
    "unsupportedClaimsJson" TEXT NOT NULL DEFAULT '[]',
    "generationBlocked" BOOLEAN NOT NULL DEFAULT false,
    "isMockGeneration" BOOLEAN NOT NULL DEFAULT false,
    "revisionIdsIncluded" TEXT NOT NULL DEFAULT '[]',
    "approvedSections" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "exportedById" TEXT,
    "exportFormat" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedOutput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewTask" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "relatedType" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requiredEvidenceType" "EvidenceType",
    "status" "ReviewTaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidenceReviewItem" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "reviewType" "ConfidenceReviewType" NOT NULL,
    "relatedTable" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "blocksOutput" BOOLEAN NOT NULL DEFAULT true,
    "resolution" "ConfidenceReviewResolution" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfidenceReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimEvent" (
    "id" TEXT NOT NULL,
    "claimId" TEXT,
    "actorId" TEXT,
    "eventType" "AuditEventType" NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutputTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "outputMode" "OutputMode" NOT NULL,
    "headerTemplate" TEXT,
    "sectionTemplate" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutputTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BannedPhrase_phrase_key" ON "BannedPhrase"("phrase");

-- CreateIndex
CREATE INDEX "DocumentExtraction_documentId_fieldName_idx" ON "DocumentExtraction"("documentId", "fieldName");

-- CreateIndex
CREATE INDEX "DocumentExtraction_claimId_reviewStatus_idx" ON "DocumentExtraction"("claimId", "reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "ParserCertification_parserType_key" ON "ParserCertification"("parserType");

-- CreateIndex
CREATE INDEX "ComparisonResult_claimId_comparisonKey_idx" ON "ComparisonResult"("claimId", "comparisonKey");

-- CreateIndex
CREATE INDEX "RevisionItem_claimId_detectionKey_idx" ON "RevisionItem"("claimId", "detectionKey");

-- CreateIndex
CREATE INDEX "RevisionItem_claimId_category_idx" ON "RevisionItem"("claimId", "category");

-- CreateIndex
CREATE INDEX "ConfidenceReviewItem_claimId_resolution_idx" ON "ConfidenceReviewItem"("claimId", "resolution");

-- CreateIndex
CREATE INDEX "ClaimEvent_claimId_eventType_createdAt_idx" ON "ClaimEvent"("claimId", "eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_dryRunReviewedById_fkey" FOREIGN KEY ("dryRunReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimNote" ADD CONSTRAINT "ClaimNote_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimNote" ADD CONSTRAINT "ClaimNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtraction" ADD CONSTRAINT "DocumentExtraction_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstimateLineItem" ADD CONSTRAINT "EstimateLineItem_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementReport" ADD CONSTRAINT "MeasurementReport_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementReport" ADD CONSTRAINT "MeasurementReport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementValue" ADD CONSTRAINT "MeasurementValue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MeasurementReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementValue" ADD CONSTRAINT "MeasurementValue_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeasurementValue" ADD CONSTRAINT "MeasurementValue_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonResult" ADD CONSTRAINT "ComparisonResult_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleEvaluation" ADD CONSTRAINT "RuleEvaluation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleEvaluation" ADD CONSTRAINT "RuleEvaluation_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RevisionItem" ADD CONSTRAINT "RevisionItem_overrideById_fkey" FOREIGN KEY ("overrideById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_revisionItemId_fkey" FOREIGN KEY ("revisionItemId") REFERENCES "RevisionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Calculation" ADD CONSTRAINT "Calculation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedOutput" ADD CONSTRAINT "GeneratedOutput_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedOutput" ADD CONSTRAINT "GeneratedOutput_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedOutput" ADD CONSTRAINT "GeneratedOutput_exportedById_fkey" FOREIGN KEY ("exportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewTask" ADD CONSTRAINT "ReviewTask_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidenceReviewItem" ADD CONSTRAINT "ConfidenceReviewItem_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidenceReviewItem" ADD CONSTRAINT "ConfidenceReviewItem_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvent" ADD CONSTRAINT "ClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "Claim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimEvent" ADD CONSTRAINT "ClaimEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
