"use client";

import { useState } from "react";
import { X, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

export type AttachedRanger = {
  id: string;
  rangerType: string;
  registeredUserId: string | null;
  freetextName: string | null;
  registeredUser?: { id: string; fullName: string } | null;
};

type AccompanyingRangersInputProps = {
  eventId: string;
  rangers: AttachedRanger[];
  onChange: () => void;
};

function displayName(ranger: AttachedRanger): string {
  if (ranger.registeredUser !== undefined && ranger.registeredUser !== null) {
    return ranger.registeredUser.fullName;
  }
  if (ranger.freetextName !== null && ranger.freetextName !== "") {
    return ranger.freetextName;
  }
  return "Unknown";
}

export function AccompanyingRangersInput({
  eventId,
  rangers,
  onChange,
}: AccompanyingRangersInputProps) {
  const [search, setSearch] = useState("");
  const [freetext, setFreetext] = useState("");

  const usersQuery = trpc.user.list.useQuery(
    { search, limit: 10 },
    { enabled: search.length > 1 }
  );

  const addRanger = trpc.event.addAccompanyingRanger.useMutation({
    onSuccess: () => {
      setSearch("");
      setFreetext("");
      onChange();
    },
  });

  const removeRanger = trpc.event.removeAccompanyingRanger.useMutation({
    onSuccess: onChange,
  });

  const attachedUserIds = new Set(
    rangers
      .map((r) => r.registeredUserId)
      .filter((id): id is string => id !== null)
  );

  const candidateUsers = (usersQuery.data?.items ?? []).filter(
    (u) => !attachedUserIds.has(u.id)
  );

  const handleAddRegistered = (userId: string) => {
    addRanger.mutate({ eventId, registeredUserId: userId });
  };

  const handleAddFreetext = () => {
    const trimmed = freetext.trim();
    if (trimmed === "") return;
    addRanger.mutate({ eventId, freetextName: trimmed });
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium">Accompanying Rangers</Label>

      <div className="flex flex-wrap gap-2 min-h-[2rem]" data-testid="ranger-chips">
        {rangers.length === 0 && (
          <span className="text-xs text-muted-foreground">
            No accompanying rangers added.
          </span>
        )}
        {rangers.map((ranger) => (
          <Badge
            key={ranger.id}
            variant="secondary"
            className="gap-1.5 pr-1"
            data-testid={`ranger-chip-${ranger.id}`}
          >
            <span>{displayName(ranger)}</span>
            <button
              type="button"
              aria-label={`Remove ${displayName(ranger)}`}
              className="rounded-sm hover:bg-muted-foreground/20 p-0.5"
              onClick={() => { removeRanger.mutate({ id: ranger.id }); }}
              disabled={removeRanger.isPending}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      <div className="space-y-2">
        <div>
          <Label htmlFor="ranger-search" className="text-xs text-muted-foreground">
            Search registered users
          </Label>
          <Input
            id="ranger-search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); }}
            placeholder="Type a name or email..."
            autoComplete="off"
          />
          {search.length > 1 && candidateUsers.length > 0 && (
            <ul
              className="mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow"
              data-testid="ranger-search-results"
            >
              {candidateUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => { handleAddRegistered(user.id); }}
                    disabled={addRanger.isPending}
                  >
                    {user.fullName}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({user.email})
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="ranger-freetext" className="text-xs text-muted-foreground">
              Or add a free-text name
            </Label>
            <Input
              id="ranger-freetext"
              value={freetext}
              onChange={(e) => { setFreetext(e.target.value); }}
              placeholder="e.g. community volunteer"
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddFreetext();
                }
              }}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddFreetext}
            disabled={freetext.trim() === "" || addRanger.isPending}
          >
            <UserPlus className="h-4 w-4 mr-1.5" />
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
