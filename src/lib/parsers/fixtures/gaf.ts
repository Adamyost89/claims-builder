import { ParserType } from "@prisma/client";

import { MEASUREMENT_KEYS } from "@/lib/measurements/keys";
import type { FixtureCase } from "@/lib/parsers/types";

export const GAF_FIXTURE: FixtureCase = {
  id: "gaf-basic",
  parserType: ParserType.GAF,
  pages: [
    {
      pageNumber: 1,
      text: `
GAF QuickMeasure Report
Total Area 20.33 SQ
Rakes 88 LF
Hips 24 LF
`,
    },
  ],
  expected: {
    measurementKeys: [
      MEASUREMENT_KEYS.ROOF_AREA_SQ,
      MEASUREMENT_KEYS.RAKE_LF,
      MEASUREMENT_KEYS.HIP_LF,
    ],
  },
};
