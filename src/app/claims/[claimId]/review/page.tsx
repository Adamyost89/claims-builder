import { redirect } from "next/navigation";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ReviewRedirectPage({ params }: PageProps) {
  const { claimId } = await params;
  redirect(`/claims/${claimId}/estimates`);
}
