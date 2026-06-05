import { generationOutputSchema, type GenerationInput, type GenerationOutput } from "./schemas";

function buildSystemPrompt(): string {
  return [
    "You assemble insurance supplement language ONLY from the provided structured payload.",
    "You must NOT invent facts, quantities, measurements, code citations, photos, or revisions.",
    "Use only revisionItemId, quantities, evidenceIds, ruleIds, snippets, and citationText present in the payload.",
    "Return strict JSON matching the output contract.",
    "Use direct technical tone. Never use weak hedging phrases from bannedPhrases.",
    "Every section quantity must exactly match payload values.",
    "Do not include excluded revisions in carrier-ready sections.",
  ].join(" ");
}

function buildUserPrompt(payload: GenerationInput): string {
  return JSON.stringify({
    instructions: {
      outputMode: payload.outputMode,
      toneRules: payload.toneRules,
      bannedPhrases: payload.bannedPhrases,
      formatting:
        "Return JSON with outputMode, title, sections[], excludedRevisions[], unsupportedClaims[], toneLintPassed, warnings[]. Each section must include revisionItemId, heading, body, approvedQty, requestedQty, difference, evidenceIds[], ruleIds[].",
    },
    payload,
  });
}

export async function generateWithOpenAI(
  payload: GenerationInput,
  model: string,
): Promise<GenerationOutput> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(payload) },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI generation failed: ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content.");
  }

  const parsed = generationOutputSchema.parse(JSON.parse(content));
  return parsed;
}
