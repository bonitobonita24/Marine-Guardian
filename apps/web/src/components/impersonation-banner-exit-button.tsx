"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

export function ImpersonationBannerExitButton() {
  const router = useRouter();
  const exit = trpc.platformImpersonation.exit.useMutation({
    onSuccess: () => {
      router.push("/admin/tenants");
      router.refresh();
    },
  });

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => { exit.mutate(); }}
      disabled={exit.isPending}
      data-testid="impersonation-banner-exit"
    >
      Exit tenant view
    </Button>
  );
}
