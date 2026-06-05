import type { Rule } from "@prisma/client";

import type { IssueDetectionContext } from "@/lib/issues/context";
import { SOURCE_DETECTION_TYPES } from "@/lib/issues/types";

export type RuleEvaluationResult = {
  ruleId: string;
  ruleTitle: string;
  triggered: boolean;
  reason: string;
};

export function evaluateActiveRules(ctx: IssueDetectionContext): RuleEvaluationResult[] {
  return ctx.rules.map((rule) => evaluateRule(rule, ctx));
}

function evaluateRule(rule: Rule, ctx: IssueDetectionContext): RuleEvaluationResult {
  const triggered = ruleTriggers(rule, ctx);
  return {
    ruleId: rule.id,
    ruleTitle: rule.title,
    triggered,
    reason: triggered
      ? `Rule "${rule.title}" conditions met for claim context.`
      : `Rule "${rule.title}" conditions not met.`,
  };
}

function ruleTriggers(rule: Rule, ctx: IssueDetectionContext): boolean {
  const title = rule.title.toLowerCase();
  const applies = rule.appliesWhen.toLowerCase();

  if (title.includes("starter separation")) {
    return ctx.lineItems.length > 0 || ctx.measurements.length > 0;
  }

  if (title.includes("rake starter")) {
    return false;
  }

  if (title.includes("felt") || title.includes("underlayment")) {
    return ctx.lineItems.some((line) => /felt|underlayment/i.test(line.description));
  }

  if (title.includes("measurement comparison")) {
    return ctx.comparisons.some(
      (c) => !c.isWarning && c.requestedQty > c.approvedQty,
    );
  }

  if (title.includes("omitted line")) {
    return ctx.comparisons.some(
      (c) => c.isWarning || (c.approvedQty === 0 && c.requestedQty > 0),
    );
  }

  if (title.includes("ice and water") && title.includes("valley")) {
    return ctx.comparisons.some(
      (c) => c.comparisonKey.includes("valley") && c.requestedQty > c.approvedQty,
    );
  }

  if (applies.includes("roof")) {
    return ctx.measurements.length > 0;
  }

  return false;
}

export function logRuleEvaluationSource(): typeof SOURCE_DETECTION_TYPES.RULE_ENGINE {
  return SOURCE_DETECTION_TYPES.RULE_ENGINE;
}
