import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ReadinessItem } from "@/lib/workflow/readiness";

const STATUS_LABEL: Record<ReadinessItem["status"], string> = {
  complete: "Complete",
  current: "Current",
  locked: "Locked",
  unavailable: "Phase pending",
};

const STATUS_VARIANT: Record<
  ReadinessItem["status"],
  "default" | "secondary" | "outline" | "destructive"
> = {
  complete: "secondary",
  current: "default",
  locked: "outline",
  unavailable: "outline",
};

export function ReadinessChecklist({ items }: { items: ReadinessItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Readiness checklist</CardTitle>
        <CardDescription>
          Honest workflow status — later-phase steps show placeholders until shipped.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-medium text-zinc-900">{item.label}</p>
                <p className="mt-0.5 text-sm text-zinc-600">{item.detail}</p>
              </div>
              <Badge variant={STATUS_VARIANT[item.status]} className="shrink-0">
                {STATUS_LABEL[item.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
