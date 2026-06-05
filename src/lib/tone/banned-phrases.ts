import { prisma } from "@/lib/db";

export const DEFAULT_BANNED_PHRASES: string[] = [
  "obviously",
  "clearly negligent",
  "bad faith",
  "you must pay",
  "fraudulent",
  "incompetent",
  "ridiculous",
  "unacceptable",
  "demand immediate payment",
  "or else",
];

export async function loadBannedPhrases(): Promise<string[]> {
  const rows = await prisma.bannedPhrase.findMany({
    where: { active: true },
    orderBy: { phrase: "asc" },
  });

  const fromDb = rows.map((row) => row.phrase.trim()).filter(Boolean);
  const merged = new Set(
    [...DEFAULT_BANNED_PHRASES, ...fromDb].map((phrase) => phrase.toLowerCase()),
  );
  return [...merged];
}