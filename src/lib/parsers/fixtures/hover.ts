import { ParserType } from "@prisma/client";

import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { FixtureCase } from "@/lib/parsers/types";

export const HOVER_FIXTURE: FixtureCase = {
  id: "hover-basic",
  parserType: ParserType.HOVER,
  pages: [
    {
      pageNumber: 1,
      text: `
HOVER Property Measurements
Roof Area: 22.10 SQ
Eave Length: 140 LF
Ridge Length: 38 LF
`,
    },
  ],
  expected: {
    measurementKeys: [
      MEASUREMENT_KEYS.ROOF_AREA_SQ,
      MEASUREMENT_KEYS.EAVE_LF,
      MEASUREMENT_KEYS.RIDGE_LF,
    ],
  },
};
