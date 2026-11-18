import { Badge } from "@/client/components/ui/badge";

export const HANDOFF_STATUS = {
  queued: "Queued",
  running: "Running",
  needs_approval: "Needs approval",
  done: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
} as const;

export function HandoffStatusBadge({
  status,
  testId,
}: {
  status: keyof typeof HANDOFF_STATUS;
  testId?: string;
}) {
  const variant =
    status === "failed" ? "destructive" : status === "needs_approval" ? "default" : "secondary";
  return (
    <Badge variant={variant} data-testid={testId}>
      {HANDOFF_STATUS[status]}
    </Badge>
  );
}
