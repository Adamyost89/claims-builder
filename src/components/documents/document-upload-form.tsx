"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { UPLOAD_DOCUMENT_TYPES } from "@/lib/documents/constants";

export function DocumentUploadForm({ claimId }: { claimId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch(`/api/claims/${claimId}/documents/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Upload failed");
      }
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="documentType">Document classification *</Label>
        <select
          id="documentType"
          name="documentType"
          required
          className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          defaultValue="CARRIER_ESTIMATE"
        >
          {UPLOAD_DOCUMENT_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-zinc-500">
          Manual classification in Phase 2A. Parsing is not run on upload.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="file">File *</Label>
        <input
          id="file"
          name="file"
          type="file"
          required
          accept=".pdf,.jpg,.jpeg,.png,.docx,.xlsx,application/pdf,image/jpeg,image/png"
          className="block w-full text-sm text-zinc-700 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <p className="text-xs text-zinc-500">PDF, JPG, PNG, DOCX, XLSX — max 100 MB</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Uploading…" : "Upload document"}
      </Button>
    </form>
  );
}
