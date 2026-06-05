import { ParserType } from "@prisma/client";

import type { FixtureCase } from "@/lib/parsers/types";

export const CARRIER_FIXTURE: FixtureCase = {
  id: "carrier-estimate-basic",
  parserType: ParserType.CARRIER_ESTIMATE,
  pages: [
    {
      pageNumber: 1,
      text: `
Line Item Detail
1 R&R Laminated - comp. shingle rfg. - w/out felt  24.00 SQ  52.14  1251.36
2 Drip edge  156.00 LF  2.45  382.20
3 Starter strip  156.00 LF  1.89  294.84
`,
    },
  ],
  expected: {
    lineItemDescriptions: ["Laminated", "Drip edge", "Starter strip"],
  },
};
