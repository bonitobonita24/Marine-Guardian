import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

type ActivityType =
  | "event-reported"
  | "event-accompanied"
  | "patrol-led"
  | "patrol-accompanied";

interface ActivityItem {
  type: ActivityType;
  entityId: string;
  title: string | null;
  timestamp: Date;
}

interface RangerActivityTimelineProps {
  recentActivity: ActivityItem[];
}

const TYPE_LABEL: Record<ActivityType, string> = {
  "event-reported": "Reported event",
  "event-accompanied": "Accompanied event",
  "patrol-led": "Led patrol",
  "patrol-accompanied": "Accompanied patrol",
};

function typeVariant(
  type: ActivityType,
): "default" | "secondary" | "outline" {
  if (type === "event-reported" || type === "patrol-led") return "default";
  return "secondary";
}

function formatTimestamp(ts: Date): string {
  return ts.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RangerActivityTimeline({
  recentActivity,
}: RangerActivityTimelineProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No recent activity for this ranger.
          </p>
        ) : (
          <ScrollArea className="max-h-96">
            <ul className="space-y-3">
              {recentActivity.map((item) => (
                <li
                  key={`${item.type}:${item.entityId}`}
                  className="flex items-start gap-3 border-b border-border pb-3 last:border-b-0 last:pb-0"
                >
                  <Badge variant={typeVariant(item.type)} className="shrink-0">
                    {TYPE_LABEL[item.type]}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {item.title ?? "Untitled"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(item.timestamp)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
