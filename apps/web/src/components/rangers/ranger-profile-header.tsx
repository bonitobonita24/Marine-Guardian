import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RangerProfile {
  id: string;
  name: string;
  source: "earthranger_sync" | "manual_entry";
  erSubjectId: string | null;
  isActive: boolean;
  createdAt: Date;
}

interface RangerProfileHeaderProps {
  profile: RangerProfile;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    const first = parts[0] ?? "";
    return first === "" ? "?" : first.slice(0, 2).toUpperCase();
  }
  const firstChar = parts[0]?.[0] ?? "";
  const lastChar = parts[parts.length - 1]?.[0] ?? "";
  const combined = (firstChar + lastChar).toUpperCase();
  return combined === "" ? "?" : combined;
}

export function RangerProfileHeader({ profile }: RangerProfileHeaderProps) {
  const sourceLabel =
    profile.source === "earthranger_sync" ? "EarthRanger" : "Manual entry";

  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground"
        >
          {initials(profile.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold">{profile.name}</h1>
            <Badge variant={profile.isActive ? "default" : "secondary"}>
              {profile.isActive ? "Active" : "Inactive"}
            </Badge>
            <Badge variant="outline">{sourceLabel}</Badge>
          </div>
          {profile.erSubjectId !== null && profile.erSubjectId !== "" && (
            <p className="mt-1 text-xs text-muted-foreground">
              EarthRanger subject:{" "}
              <span className="font-mono">{profile.erSubjectId}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Added {profile.createdAt.toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
