"use client";

import { useState, useMemo } from "react";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

/**
 * Create-fuel-entry dialog (operator+).
 *
 * Receipt photo upload deferred to a follow-up batch — no presigned URL
 * helper exists in packages/storage yet. The field is nullable on the
 * schema; the form omits receiptPhotoUrl entirely so the server records
 * null until upload UI lands.
 *
 * Liters and totalPrice are decimal-as-string per shared/positiveDecimalString
 * regex /^\d+(\.\d+)?$/ — UI sends the raw string so Postgres decimal
 * precision is preserved end-to-end.
 */
export function CreateFuelEntryDialog({
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const utils = trpc.useUtils();

  const [municipalityId, setMunicipalityId] = useState<string | null>(null);
  const [dateReceivedRaw, setDateReceivedRaw] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [liters, setLiters] = useState<string>("");
  const [totalPrice, setTotalPrice] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<
    { kind: "success" } | { kind: "error"; message: string } | null
  >(null);

  const municipalitiesQuery = trpc.municipality.list.useQuery();
  const municipalityOptions = useMemo(() => {
    return (municipalitiesQuery.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      province: m.province,
    }));
  }, [municipalitiesQuery.data]);
  // Grouped by province — mirrors MapMunicipalitySelect / report-filter-bar's
  // province-grouped Select pattern (first-appearance order).
  const provinceGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string }[]>();
    for (const m of municipalityOptions) {
      const list = groups.get(m.province) ?? [];
      list.push({ id: m.id, name: m.name });
      groups.set(m.province, list);
    }
    return [...groups.entries()];
  }, [municipalityOptions]);

  const create = trpc.fuelEntry.create.useMutation({
    onSuccess: () => {
      setFeedback({ kind: "success" });
      void utils.fuelEntry.list.invalidate();
      void utils.fuelEntry.consumptionAnalytics.invalidate();
    },
    onError: (err) => {
      setFeedback({ kind: "error", message: err.message });
    },
  });

  function resetForm() {
    setMunicipalityId(null);
    setDateReceivedRaw(new Date().toISOString().slice(0, 10));
    setLiters("");
    setTotalPrice("");
    setNotes("");
    setValidationError(null);
    setFeedback(null);
    create.reset();
  }

  function handleClose() {
    resetForm();
    onOpenChange(false);
  }

  function handleSuccessClose() {
    resetForm();
    onSuccess();
  }

  function handleSubmit() {
    setValidationError(null);
    setFeedback(null);

    if (municipalityId === null) {
      setValidationError("Municipality is required.");
      return;
    }
    const selectedMunicipality = municipalityOptions.find(
      (m) => m.id === municipalityId,
    );
    if (selectedMunicipality === undefined) {
      setValidationError("Selected municipality is no longer available.");
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

    create.mutate({
      areaName: selectedMunicipality.name,
      municipalityId,
      dateReceived,
      liters,
      totalPrice,
      notes: notes.trim() === "" ? null : notes.trim(),
    });
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
          <DialogTitle>Log fuel entry</DialogTitle>
          <DialogDescription>
            Record a bulk fuel allocation for a municipality. Liters and
            total price are mandatory. Receipt photo upload coming in a
            follow-up release.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="fuel-create-municipality">Municipality</Label>
            <Select
              value={municipalityId ?? ""}
              onValueChange={(v) => {
                setMunicipalityId(v);
              }}
            >
              <SelectTrigger
                id="fuel-create-municipality"
                data-testid="fuel-create-municipality"
              >
                <SelectValue placeholder="Select municipality" />
              </SelectTrigger>
              <SelectContent>
                {provinceGroups.map(([province, items]) => (
                  <SelectGroup key={province}>
                    <SelectLabel>{province}</SelectLabel>
                    {items.map((m) => (
                      <SelectItem key={m.id} value={m.id} className="pl-6">
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-create-date">Date received</Label>
            <Input
              id="fuel-create-date"
              data-testid="fuel-create-date"
              type="date"
              value={dateReceivedRaw}
              onChange={(e) => {
                setDateReceivedRaw(e.target.value);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fuel-create-liters">Liters</Label>
              <Input
                id="fuel-create-liters"
                data-testid="fuel-create-liters"
                inputMode="decimal"
                placeholder="100.000"
                value={liters}
                onChange={(e) => {
                  setLiters(e.target.value);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-create-price">Total price</Label>
              <Input
                id="fuel-create-price"
                data-testid="fuel-create-price"
                inputMode="decimal"
                placeholder="1500000.00"
                value={totalPrice}
                onChange={(e) => {
                  setTotalPrice(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fuel-create-notes">Notes (optional)</Label>
            <textarea
              id="fuel-create-notes"
              data-testid="fuel-create-notes"
              rows={3}
              placeholder="Supplier name, delivery details…"
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
            data-testid="fuel-create-validation-error"
            className="text-sm text-destructive"
          >
            {validationError}
          </p>
        )}
        {feedback?.kind === "success" && (
          <p
            data-testid="fuel-create-success"
            className="text-sm text-emerald-600 dark:text-emerald-400"
          >
            Fuel entry logged.
          </p>
        )}
        {feedback?.kind === "error" && (
          <p
            data-testid="fuel-create-error"
            className="text-sm text-destructive"
          >
            {feedback.message}
          </p>
        )}

        <DialogFooter>
          {feedback?.kind === "success" ? (
            <Button
              data-testid="fuel-create-success-close"
              onClick={handleSuccessClose}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={create.isPending}
              >
                Cancel
              </Button>
              <Button
                data-testid="fuel-create-submit"
                onClick={handleSubmit}
                disabled={create.isPending}
              >
                {create.isPending ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
