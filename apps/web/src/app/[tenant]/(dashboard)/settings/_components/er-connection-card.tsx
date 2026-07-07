"use client";

import { useState } from "react";
import { z } from "zod";
import { CheckCircle, XCircle, Loader2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc/client";

const TOKEN_PLACEHOLDER = "••••••••";

// Mirrors the server contract (settings.upsertErConnection:
// z.string().url().max(500)) so the user gets immediate inline feedback
// instead of typing an arbitrary string and only learning it is invalid
// after a failed round-trip. Restrict to http/https to reject inputs that
// are technically URL-shaped (e.g. "javascript:…", "ftp://…").
const ER_URL_SCHEMA = z
  .string()
  .trim()
  .min(1, { message: "Server URL is required." })
  .max(500, { message: "Server URL is too long (max 500 characters)." })
  .url({ message: "Enter a valid URL (e.g. https://your-instance.pamdas.org)." })
  .refine(
    (v) => /^https?:\/\//i.test(v),
    { message: "URL must start with http:// or https://." },
  );

function validateErUrl(value: string): string | null {
  const result = ER_URL_SCHEMA.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid URL.");
}

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
  const [urlError, setUrlError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Populate form from query data on first load
  const conn = connQuery.data;
  const displayBaseUrl = baseUrl !== "" ? baseUrl : (conn?.baseUrl ?? "");

  const handleBaseUrlChange = (value: string) => {
    setBaseUrl(value);
    // Clear the error as soon as the input becomes valid; otherwise keep the
    // last message but do not nag on every keystroke for an empty field.
    setUrlError(value.trim() === "" ? null : validateErUrl(value));
  };

  const handleSave = () => {
    setSaveError(null);
    const validationMessage = validateErUrl(displayBaseUrl);
    if (validationMessage !== null) {
      setUrlError(validationMessage);
      return;
    }
    setUrlError(null);
    upsertMut.mutate({
      baseUrl: displayBaseUrl.trim(),
      // Send empty string when the user hasn't changed the token
      // (server will keep existing enc token)
      apiToken: apiToken || undefined,
    });
  };

  const handleTest = () => {
    setTestResult(null);
    testMut.mutate();
  };

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
            type="url"
            inputMode="url"
            value={displayBaseUrl}
            onChange={(e) => { handleBaseUrlChange(e.target.value); }}
            onBlur={(e) => {
              const v = e.target.value;
              setUrlError(v.trim() === "" ? null : validateErUrl(v));
            }}
            placeholder="https://your-instance.pamdas.org"
            autoComplete="off"
            aria-invalid={urlError !== null}
            data-testid="er-base-url-input"
          />
          {urlError !== null && (
            <p className="mt-1 text-xs text-destructive" data-testid="er-base-url-error">
              {urlError}
            </p>
          )}
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

      {saveError !== null && saveError !== "" && (
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
          disabled={upsertMut.isPending || displayBaseUrl === "" || urlError !== null}
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
            disabled={testMut.isPending}
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
