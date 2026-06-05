import { afterAll, describe, expect, it } from "vitest";
import { ParserType } from "@prisma/client";

import { prisma } from "@/lib/db";
import {
  certifyParserFromFixtures,
  runFixtureCase,
} from "@/lib/parsers/fixture-certification";
import { CARRIER_FIXTURE } from "@/lib/parsers/fixtures/carrier";
import { EAGLEVIEW_FIXTURE } from "@/lib/parsers/fixtures/eagleview";

describe("parser fixture certification", () => {
  afterAll(async () => {
    await prisma.parserCertification.updateMany({
      data: { parserCertified: false, fixtureAccuracy: null },
    });
    await prisma.$disconnect();
  });

  it("passes carrier and eagleview fixtures at required accuracy", () => {
    const carrier = runFixtureCase(CARRIER_FIXTURE);
    const eagleview = runFixtureCase(EAGLEVIEW_FIXTURE);

    expect(carrier.parserCertified).toBe(true);
    expect(carrier.accuracy).toBeGreaterThanOrEqual(carrier.requiredAccuracy);
    expect(eagleview.parserCertified).toBe(true);
    expect(eagleview.accuracy).toBeGreaterThanOrEqual(eagleview.requiredAccuracy);
  });

  it("keeps parser uncertified when fixture accuracy is below threshold", () => {
    const broken = runFixtureCase({
      ...CARRIER_FIXTURE,
      id: "carrier-broken",
      expected: {
        lineItemDescriptions: ["Item that does not exist in fixture"],
      },
    });

    expect(broken.parserCertified).toBe(false);
    expect(broken.accuracy).toBeLessThan(broken.requiredAccuracy);
  });

  it("updates ParserCertification only when accuracy threshold is met", async () => {
    const pass = await certifyParserFromFixtures(ParserType.CARRIER_ESTIMATE);
    expect(pass?.parserCertified).toBe(true);

    await prisma.parserCertification.update({
      where: { parserType: ParserType.ITEL },
      data: { parserCertified: false, fixtureAccuracy: 0.5 },
    });
    const itel = await prisma.parserCertification.findUnique({
      where: { parserType: ParserType.ITEL },
    });
    expect(itel?.parserCertified).toBe(false);
  });
});
