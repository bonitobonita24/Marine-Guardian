"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { useSession } from "next-auth/react";
import type { FuelEntryRow } from "./fuel-entry-table";

interface Props {
  entry: FuelEntryRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isCoordinator: boolean;
}

/**
 * Edit-fuel-entry dialog.
 *
 * Routes to fuelEntry.update (operator on OWN entry) or fuelEntry.updateAny
 * (coordinator+ on any entry). The role-and-ownership choice happens in the
 * dialog rather than the page so the mutation is colocated with the form.
 *
 * If the current user is a coordinator+ AND they own the entry, prefer
 * `update` — it has the ownership check that protects against accidentally
 * editing someone else's entry. Coordinators editing OTHER users' entries
 * must go through `updateAny`.
 */
export function EditFuelEntryDialog({
  entry,
  open,
  onOpenChange,
  onSuccess,
  isCoordinator,
}: Props) {
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const currentUserId = session?.user.id ?? "";
  const isOwner = entry.loggedByUserId === currentUserId;

  const [areaBoundaryId, setAreaBoundaryId] = useState<string | null>(
    entry.areaBoundaryId,
  );
  const [dateReceivedRaw, setDateReceivedRaw] = useState<string>(() => {
    const d =
      entry.dateReceived instanceof Date
        ? entry.dateReceived
        : new Date(entry.dateReceived);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  });
  const [liters, setLiters] = useState<string>(entry.liters);
  const [totalPrice, setTotalPrice] = useState<string>(entry.totalPrice);
  const [notes, setNotes] = useState<string>(entry.notes ?? "");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "success" } | { kind: "error"; message: string } | null
  >(null);

  // Reset internal state if the dialog's entry prop changes.
  useEffect(() => {
    setAreaBoundaryId(entry.areaBoundaryId);
    const d =
      entry.dateReceived instanceof Date
        ? entry.dateReceived
        : new Date(entry.dateReceived);
    setDateReceivedRaw(
      Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10),
    );
    setLiters(entry.liters);
    setTotalPrice(entry.totalPrice);
    setNotes(entry.notes ?? "");
    setValidationError(null);
    setFeedback(null);
  }, [entry]);

  const areasQuery = trpc.areaBoundary.list.useQuery({
    limit: 200,
    isEnabled: true,
  });
  const areaOptions = useMemo(() => {
    const items = areasQuery.data?.items ?? [];
    return items.map((a) => ({ id: a.id, name: a.name }));
  }, [areasQuery.data]);

  const useUpdateAny = isCoordinator && !isOwner;

  const update = trpc.fuelEntry.update.useMutation({
    onSuccess: () => {
      setFeedback({ kind: "success" });
      void utils.fuelEntry.list.invalidate();
      void utils.fuelEntry.consumptionAnalytics.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });
  const updateAny = trpc.fuelEntry.updateAny.useMutation({
    onSuccess: () => {
      setFeedback({ kind: "success" });
      void utils.fuelEntry.list.invalidate();
      void utils.fuelEntry.consumptionAnalytics.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  const isPending = update.isPending || updateAny.isPending;

  function handleClose() {
    setValidationError(null);
    setFeedback(null);
    update.reset();
    updateAny.reset();
    onOpenChange(false);
  }

  function handleSuccessClose() {
    setValidationError(null);
    setFeedback(null);
    update.reset();
    updateAny.reset();
    onSuccess();
  }

  function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    if (areaBoundaryId === null) {
      setValidationError("Area is required.");
      return;
    }
    const selectedArea = areaOptions.find((a) => a.id === areaBoundaryId);
    if (selectedArea === undefined) {
      setValidationError("Selected area is no longer available.");
      return;
    }
    if (dateReceivedRaw === "") {
      setValidationError("Date received is required.");
      return;
    }
    const dateReceived = new Date(dateReceivedRaw);
    if (Number.isNaN(dateReceived.getTime())) {
      setValidationError("Date received is invalid.");
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(liters) || Number(liters) <= 0) {
      setValidationError("Liters must be a positive number.");
      return;
    }
    if (!/^\d+(\.\d+)?$/.test(totalPrice) || Number(totalPrice) <= 0) {
      setValidationError("Total price must be a positive number.");
      return;
    }

    const payload = {
      id: entry.id,
      areaName: selectedArea.name,
      areaBoundaryId,
      dateReceived,
      liters,
      totalPrice,
      notes: notes.trim() === "" ? null : notes.trim(),
    };
    if (useUpdateAny) {
      updateAny.mutate(payload);
    } else {
      update.mutate(payload);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit fuel entry</DialogTitle>
          <DialogDescription>
            Update an existing fuel allocation.
            {useUpdateAny && (
              <span className="ml-1 text-xs text-muted-foreground">
                (editing another user&apos;s entry — coordinator role)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="fuel-edit-area">Area</Label>
            <Select
              value={areaBoundaryId ?? ""}
              onValueChange={(v) => {
                setAreaBoundaryId(v);
              }}
            >
              <SelectTrigger
                id="fuel-edit-area"
                data-testid="fuel-edit-area"
              >
                <SelectValue placeholder="Select area" />
              </SelectTrigger>
              <SelectContent>
                {areaOptions.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-edit-date">Date received</Label>
            <Input
              id="fuel-edit-date"
              data-testid="fuel-edit-date"
              type="date"
              value={dateReceivedRaw}
              onChange={(e) => {
                setDateReceivedRaw(e.target.value);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fuel-edit-liters">Liters</Label>
              <Input
                id="fuel-edit-liters"
                data-testid="fuel-edit-liters"
                inputMode="decimal"
                value={liters}
                onChange={(e) => {
                  setLiters(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-edit-price">Total price</Label>
              <Input
                id="fuel-edit-price"
                data-testid="fuel-edit-price"
                inputMode="decimal"
                value={totalPrice}
                onChange={(e) => {
                  setTotalPrice(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-edit-notes">Notes (optional)</Label>
            <textarea
              id="fuel-edit-notes"
              data-testid="fuel-edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        </div>

        {validationError !== null && (
          <p
            data-testid="fuel-edit-validation-error"
            className="text-sm text-destructive"
          >
            {validationError}
          </p>
        )}
        {feedback?.kind === "success" && (
          <p
            data-testid="fuel-edit-success"
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            Fuel entry updated.
          </p>
        )}
        {feedback?.kind === "error" && (
          <p
            data-testid="fuel-edit-error"
            className="text-sm text-destructive"
          >
            {feedback.message}
          </p>
        )}

        <DialogFooter>
          {feedback?.kind === "success" ? (
            <Button
              data-testid="fuel-edit-success-close"
              onClick={handleSuccessClose}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid="fuel-edit-submit"
                onClick={handleSubmit}
                disabled={isPending}
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
