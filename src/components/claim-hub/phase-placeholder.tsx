import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type PhasePlaceholderProps = {
  title: string;
  phase: number;
  description: string;
};

export function PhasePlaceholder({
  title,
  phase,
  description,
}: PhasePlaceholderProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Not available until Phase {phase}.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-zinc-600">{description}</CardContent>
    </Card>
  );
}
