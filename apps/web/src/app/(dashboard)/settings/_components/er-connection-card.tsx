"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

const TOKEN_PLACEHOLDER = "••••••••";

type ConnectionStatus = "unchecked" | "connected" | "error";

function StatusBadge({ status }: { status: string }) {
  if (status === "connected") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-green-600"
        data-testid="er-status-connected"
      >
        <CheckCircle className="h-3.5 w-3.5" />
        Connected
      </span>
    );
  }
  if (status === "error") {
    return (
      <span
        className="inline-flex items-center gap-1 text-xs font-medium text-destructive"
        data-testid="er-status-error"
      >
        <XCircle className="h-3.5 w-3.5" />
        Connection error
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground" data-testid="er-status-unchecked">
      Not yet verified
    </span>
  );
}

export function ErConnectionCard() {
  const utils = trpc.useUtils();

  const connQuery = trpc.settings.getErConnection.useQuery();
  const upsertMut = trpc.settings.upsertErConnection.useMutation({
    onSuccess: () => {
      void utils.settings.getErConnection.invalidate();
      setApiToken(""); // clear after save so we never re-send masked value
      setSaveError(null);
    },
    onError: (err) => {
      setSaveError(err.message);
    },
  });
  const testMut = trpc.settings.testErConnection.useMutation({
    onSuccess: () => {
      void utils.settings.getErConnection.invalidate();
      setTestResult(null);
    },
    onError: (err) => {
      setTestResult({ ok: false, error: err.message });
    },
  });

  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Populate form from query data on first load
  const conn = connQuery.data;
  const displayBaseUrl = baseUrl !== "" ? baseUrl : (conn?.baseUrl ?? "");

  const handleSave = () => {
    setSaveError(null);
    upsertMut.mutate({
      baseUrl: displayBaseUrl,
      // Send empty string when the user hasn't changed the token
      // (server will keep existing enc token)
      apiToken: apiToken || undefined,
    });
  };

  const handleTest = () => {
    setTestResult(null);
    testMut.mutate();
  };

  const isAdmin = true; // RBAC enforced server-side; page is admin-routed

  if (connQuery.isLoading) {
    return (
      <div className="rounded-lg border p-5">
        <p className="text-sm text-muted-foreground">Loading connection settings…</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-5 space-y-5" data-testid="er-connection-card">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Wifi className="h-4 w-4" />
            EarthRanger Connection
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Connect this tenant to an EarthRanger instance for data sync.
          </p>
        </div>
        {conn && <StatusBadge status={conn.status} />}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="er-base-url" className="text-xs text-muted-foreground">
            EarthRanger Server URL
          </Label>
          <Input
            id="er-base-url"
            value={displayBaseUrl}
            onChange={(e) => { setBaseUrl(e.target.value); }}
            placeholder="https://your-instance.pamdas.org"
            autoComplete="off"
            data-testid="er-base-url-input"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="er-api-token" className="text-xs text-muted-foreground">
            API Bearer Token
            {conn && (
              <span className="ml-2 text-[10px] font-normal">
                (leave blank to keep existing token)
              </span>
            )}
          </Label>
          <Input
            id="er-api-token"
            type="password"
            value={apiToken}
            onChange={(e) => { setApiToken(e.target.value); }}
            placeholder={conn ? TOKEN_PLACEHOLDER : "Paste your DAS bearer token"}
            autoComplete="new-password"
            data-testid="er-api-token-input"
          />
          {conn && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Token is stored encrypted. It is never shown in plaintext after saving.
            </p>
          )}
        </div>
      </div>

      {saveError && (
        <p className="text-xs text-destructive" data-testid="er-save-error">
          {saveError}
        </p>
      )}

      {testResult !== null && !testResult.ok && (
        <p className="text-xs text-destructive" data-testid="er-test-error">
          Test failed: {testResult.error}
        </p>
      )}

      {conn?.lastValidatedAt && (
        <p className="text-xs text-muted-foreground">
          Last validated:{" "}
          {new Date(conn.lastValidatedAt).toLocaleString()}
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!isAdmin || upsertMut.isPending || displayBaseUrl === ""}
          data-testid="er-save-btn"
        >
          {upsertMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {conn ? "Update Connection" : "Save Connection"}
        </Button>

        {conn && (
          <Button
            type="button"
            variant="outline"
            onClick={handleTest}
            disabled={!isAdmin || testMut.isPending}
            data-testid="er-test-btn"
          >
            {testMut.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              "Test Connection"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
