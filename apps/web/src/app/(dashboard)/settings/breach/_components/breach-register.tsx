"use client";

import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc/client";

/**
 * Personal-data-breach register (V32.9 / NPC Circular 16-03). Admin-only.
 * Records breaches and tracks the statutory notification lifecycle (NPC within
 * 72h + full written report within 5 business days).
 *
 * Access control is enforced server-side: every breach.* procedure is gated to
 * adminProcedure (super_admin | site_admin). A non-admin who reaches this page
 * sees only error states.
 *
 * WCAG 2.2 AA: associated labels, 44px controls, a captioned data table,
 * role="status" feedback.
 */

const SEVERITIES = ["low", "medium", "high"] as const;
type Severity = (typeof SEVERITIES)[number];

function severityVariant(s: string): "default" | "secondary" | "destructive" {
  if (s === "high") return "destructive";
  if (s === "medium") return "default";
  return "secondary";
}

function fmt(d: Date | string | null): string {
  if (d === null) return "—";
  return new Date(d).toLocaleDateString();
}

export function BreachRegister() {
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<string | null>(null);
  const [severity, setSeverity] = useState<Severity>("medium");
  const [detectedAt, setDetectedAt] = useState("");
  const [affected, setAffected] = useState("0");
  const [description, setDescription] = useState("");

  const listQuery = trpc.breach.list.useQuery();

  const invalidate = () => void utils.breach.list.invalidate();
  const onError = (e: { message: string }) => { setStatus(e.message); };

  const recordMut = trpc.breach.record.useMutation({
    onSuccess: () => {
      setStatus("Breach recorded.");
      setDetectedAt("");
      setAffected("0");
      setDescription("");
      invalidate();
    },
    onError,
  });
  const npcMut = trpc.breach.markNpcNotified.useMutation({
    onSuccess: () => {
      setStatus("NPC notification recorded.");
      invalidate();
    },
    onError,
  });
  const subjMut = trpc.breach.markSubjectsNotified.useMutation({
    onSuccess: () => {
      setStatus("Subject notification recorded.");
      invalidate();
    },
    onError,
  });
  const reportMut = trpc.breach.submitReport.useMutation({
    onSuccess: () => {
      setStatus("Written report recorded.");
      invalidate();
    },
    onError,
  });

  const busy = recordMut.isPending;

  return (
    <div className="space-y-6">
      {status !== null && (
        <p
          role="status"
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
        >
          {status}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
            Record a breach
          </CardTitle>
          <CardDescription>
            The written-report deadline (NPC + 72h + 5 business days) is computed
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (detectedAt === "") {
                setStatus("Enter the detection date/time.");
                return;
              }
              if (description.trim() === "") {
                setStatus("Enter a description.");
                return;
              }
              recordMut.mutate({
                severity,
                detectedAt: new Date(detectedAt),
                affectedUserCount: Math.max(0, Number(affected) || 0),
                description: description.trim(),
              });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="breach-severity">Severity</Label>
              <select
                id="breach-severity"
                value={severity}
                onChange={(e) => { setSeverity(e.target.value as Severity); }}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="breach-detected">Detected at</Label>
              <Input
                id="breach-detected"
                type="datetime-local"
                value={detectedAt}
                onChange={(e) => { setDetectedAt(e.target.value); }}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="breach-affected">Affected users</Label>
              <Input
                id="breach-affected"
                type="number"
                min={0}
                value={affected}
                onChange={(e) => { setAffected(e.target.value); }}
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="breach-desc">Description</Label>
              <Textarea
                id="breach-desc"
                value={description}
                onChange={(e) => { setDescription(e.target.value); }}
                rows={3}
                placeholder="What happened, what data was involved"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="min-h-[44px]" disabled={busy}>
                {recordMut.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                )}
                Record breach
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Breach register</CardTitle>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading&hellip;</p>
          ) : (listQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">
              No breaches recorded.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">
                  Recorded personal-data breaches and their notification status
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Detected</TableHead>
                    <TableHead scope="col">Severity</TableHead>
                    <TableHead scope="col">Status</TableHead>
                    <TableHead scope="col">Report due</TableHead>
                    <TableHead scope="col">NPC</TableHead>
                    <TableHead scope="col">Subjects</TableHead>
                    <TableHead scope="col">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {listQuery.data?.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>{fmt(b.detectedAt)}</TableCell>
                      <TableCell>
                        <Badge variant={severityVariant(b.severity)}>
                          {b.severity}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">{b.status}</TableCell>
                      <TableCell>{fmt(b.writtenReportDueAt)}</TableCell>
                      <TableCell>{fmt(b.npcNotifiedAt)}</TableCell>
                      <TableCell>{fmt(b.subjectsNotifiedAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-[44px]"
                            disabled={b.npcNotifiedAt !== null}
                            onClick={() => { npcMut.mutate({ breachId: b.id }); }}
                          >
                            NPC notified
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-[44px]"
                            disabled={b.subjectsNotifiedAt !== null}
                            onClick={() => { subjMut.mutate({ breachId: b.id }); }}
                          >
                            Subjects notified
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="min-h-[44px]"
                            disabled={b.writtenReportSubmittedAt !== null}
                            onClick={() => { reportMut.mutate({ breachId: b.id }); }}
                          >
                            Report submitted
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
