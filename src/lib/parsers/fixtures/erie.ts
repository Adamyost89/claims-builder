import { ParserType } from "@prisma/client";

import type { FixtureCase } from "@/lib/parsers/types";

/** Erie pipe-delimited layout that deterministic regex parsers do not match. */
export const ERIE_FIXTURE: FixtureCase = {
  id: "erie-estimate-nonstandard",
  parserType: ParserType.CARRIER_ESTIMATE,
  pages: [
    {
      pageNumber: 1,
      text: `
Erie Insurance - Property Estimate
Claim: ERIE-2024-001
Property: 123 Main St

ITEM|DESCRIPTION|QTY|UNIT|UNIT COST|RC|DEP|ACV
101|Tear out - 3 tab shingles|24.00|SQ|45.00|1080.00|540.00|540.00
102|Install - Lam comp shingle|24.00|SQ|185.00|4440.00|2220.00|2220.00
`,
    },
  ],
  expected: {
    lineItemDescriptions: ["Tear out - 3 tab shingles", "Install - Lam comp shingle"],
  },
};

export const GAF_WASTE_TABLE_FIXTURE: FixtureCase = {
  id: "gaf-waste-table",
  parserType: ParserType.GAF,
  pages: [
    {
      pageNumber: 1,
      text: `
GAF QuickMeasure Report
Total Area 20.33 SQ
Rakes 88 LF
Hips 24 LF

Waste Factor Table
0%    20.33 SQ
10%   22.36 SQ
Suggested Waste 12%   22.77 SQ
`,
    },
  ],
  expected: {
    measurementKeys: ["waste_pct_recommended"],
  },
};
