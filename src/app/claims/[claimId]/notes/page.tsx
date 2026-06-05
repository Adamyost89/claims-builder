import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { authOptions } from "@/auth";
import { NoteForm } from "@/components/claims/note-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getClaimById } from "@/lib/claims/service";
import { canAddNotes } from "@/lib/rbac";

type PageProps = { params: Promise<{ claimId: string }> };

export default async function ClaimNotesPage({ params }: PageProps) {
  const { claimId } = await params;
  const session = await getServerSession(authOptions);
  const claim = await getClaimById(claimId);
  if (!claim) {
    notFound();
  }

  const canAdd = session?.user && canAddNotes(session.user.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
        <p className="text-sm text-zinc-600">
          Internal notes for {claim.customerName}. All notes are audit-logged.
        </p>
      </div>

      {canAdd && (
        <Card>
          <CardHeader>
            <CardTitle>New note</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteForm claimId={claim.id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Note history</CardTitle>
          <CardDescription>{claim.notes.length} note(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {claim.notes.length === 0 ? (
            <p className="text-sm text-zinc-600">No notes yet.</p>
          ) : (
            claim.notes.map((note) => (
              <div key={note.id} className="border-b border-zinc-100 pb-4 last:border-0">
                <p className="text-sm text-zinc-900">{note.body}</p>
                <p className="mt-1 text-xs text-zinc-500">
                  {note.author.name} · {note.createdAt.toLocaleString()}
                </p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
