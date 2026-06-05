export type BlockerSeverity = "error" | "warning";

export type Blocker = {
  code: string;
  message: string;
  severity: BlockerSeverity;
  details?: Record<string, unknown>;
};

export type GateResult = {
  gateId: string;
  passed: boolean;
  blockers: Blocker[];
};