import { ParserType } from "@prisma/client";

import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { FixtureCase } from "@/lib/parsers/types";

export const EAGLEVIEW_FIXTURE: FixtureCase = {
  id: "eagleview-basic",
  parserType: ParserType.EAGLEVIEW,
  pages: [
    {
      pageNumber: 1,
      text: `
EagleView Premium Report
Total Roof Area: 24.33 SQ
Eaves: 156 LF
Ridges: 42 LF
Valleys: 18 LF
`,
    },
  ],
  expected: {
    measurementKeys: [
      MEASUREMENT_KEYS.ROOF_AREA_SQ,
      MEASUREMENT_KEYS.EAVE_LF,
      MEASUREMENT_KEYS.RIDGE_LF,
      MEASUREMENT_KEYS.VALLEY_LF,
    ],
  },
};
