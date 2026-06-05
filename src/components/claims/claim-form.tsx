"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClaimType } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CLAIM_TYPES = Object.values(ClaimType);

type ClaimFormProps = {
  mode: "create" | "edit";
  claimId?: string;
  initial?: Partial<{
    customerName: string;
    propertyAddress: string;
    carrier: string;
    claimNumber: string;
    policyNumber: string;
    dateOfLoss: string;
    state: string;
    city: string;
    county: string;
    manufacturerSystem: string;
    claimType: ClaimType;
    notes: string;
  }>;
};

export function ClaimForm({ mode, claimId, initial }: ClaimFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      customerName: String(form.get("customerName") ?? ""),
      propertyAddress: String(form.get("propertyAddress") ?? ""),
      carrier: String(form.get("carrier") ?? ""),
      claimNumber: String(form.get("claimNumber") ?? ""),
      dateOfLoss: String(form.get("dateOfLoss") ?? ""),
      state: String(form.get("state") ?? ""),
      city: String(form.get("city") ?? ""),
      claimType: String(form.get("claimType") ?? ClaimType.ROOF),
      policyNumber: String(form.get("policyNumber") ?? "") || undefined,
      county: String(form.get("county") ?? "") || undefined,
      manufacturerSystem: String(form.get("manufacturerSystem") ?? "") || undefined,
      notes: String(form.get("notes") ?? "") || undefined,
    };

    try {
      const url = mode === "create" ? "/api/claims" : `/api/claims/${claimId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Request failed");
      }
      router.push(`/claims/${data.claim.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name *" name="customerName" defaultValue={initial?.customerName} />
        <Field label="Claim number *" name="claimNumber" defaultValue={initial?.claimNumber} />
        <Field label="Carrier *" name="carrier" defaultValue={initial?.carrier} />
        <Field label="Date of loss *" name="dateOfLoss" type="date" defaultValue={initial?.dateOfLoss} />
        <Field label="Property address *" name="propertyAddress" className="sm:col-span-2" defaultValue={initial?.propertyAddress} />
        <Field label="City *" name="city" defaultValue={initial?.city} />
        <Field label="State *" name="state" defaultValue={initial?.state} />
        <Field label="County" name="county" defaultValue={initial?.county} />
        <Field label="Policy number" name="policyNumber" defaultValue={initial?.policyNumber} />
        <Field label="Manufacturer / system" name="manufacturerSystem" defaultValue={initial?.manufacturerSystem} />
        <div className="space-y-2">
          <Label htmlFor="claimType">Claim type *</Label>
          <select
            id="claimType"
            name="claimType"
            defaultValue={initial?.claimType ?? ClaimType.ROOF}
            className="flex h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm"
          >
            {CLAIM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="notes">Initial note (optional)</Label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={initial?.notes}
            className="flex w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : mode === "create" ? "Create claim" : "Save changes"}
      </Button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <div className={className ?? "space-y-2"}>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required={label.includes("*")} />
    </div>
  );
}
