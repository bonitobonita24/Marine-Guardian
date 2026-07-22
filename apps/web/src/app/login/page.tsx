"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const emailRaw = formData.get("email");
    const passwordRaw = formData.get("password");
    const email = typeof emailRaw === "string" ? emailRaw : "";
    const password = typeof passwordRaw === "string" ? passwordRaw : "";

    try {
      const csrfRes = await fetch("/api/auth/csrf", {
        credentials: "include",
        cache: "no-store",
      });
      if (!csrfRes.ok) throw new Error("csrf");
      const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

      const body = new URLSearchParams({
        csrfToken,
        email,
        password,
        callbackUrl,
        json: "true",
        rememberMe: rememberMe ? "true" : "false",
      });

      const res = await fetch("/api/auth/callback/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Auth-Return-Redirect": "1",
        },
        body,
        credentials: "include",
      });

      if (!res.ok) throw new Error("post");
      const data = (await res.json()) as { url?: string };

      if (data.url !== undefined && data.url.includes("error=")) {
        setError(t("invalidCredentials"));
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError(t("invalidCredentials"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle>            <img
              src="/marine-guardian-logo.png"
              alt="Marine Guardian"
              className="mx-auto h-11 w-auto"
            />
          </CardTitle>
          <p className="mt-2 text-sm text-muted-foreground">{t("signIn")}</p>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4"
          >
            {error !== null && (
              <p role="alert" className="text-sm text-destructive text-center">
                {error}
              </p>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="min-h-[44px]"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => {
                  setRememberMe(checked === true);
                }}
              />
              <Label htmlFor="rememberMe" className="text-sm font-normal">
                {t("rememberMe")}
              </Label>
            </div>
            <Button
              type="submit"
              className="w-full min-h-[44px]"
              disabled={loading}
            >
              {loading ? "..." : t("signIn")}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <a
              href="/privacy"
              className="underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              Privacy Notice
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
