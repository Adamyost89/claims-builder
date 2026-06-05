import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api/errors";
import { requireSessionUser } from "@/lib/auth/session";
import { exportApprovedOutput } from "@/lib/export/service";

type RouteContext = { params: Promise<{ claimId: string }> };

const exportSchema = z.object({
  outputId: z.string({ error: "outputId is required." }).min(1, "outputId is required."),
  format: z.enum(["clipboard", "docx", "pdf"]),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireSessionUser();
    const { claimId } = await context.params;
    const body = exportSchema.parse(await request.json());

    const result = await exportApprovedOutput({
      claimId,
      outputId: body.outputId,
      format: body.format,
      actorId: user.id,
      actorRole: user.role,
    });

    if (body.format === "clipboard") {
      return NextResponse.json({
        text: result.text,
        watermarked: result.watermarked,
      });
    }

    if (!result.buffer || !result.fileName) {
      throw new Error("Export buffer missing.");
    }

    return new NextResponse(new Uint8Array(result.buffer), {
      headers: {
        "Content-Type": result.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
