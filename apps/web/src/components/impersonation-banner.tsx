import { cookies } from "next/headers";
import { auth } from "@/server/auth";
import { platformPrisma } from "@marine-guardian/db";
import { IMPERSONATION_COOKIE_NAME } from "@/lib/auth/impersonation";
import { ImpersonationBannerExitButton } from "./impersonation-banner-exit-button";

export async function ImpersonationBanner() {
  const jar = await cookies();
  const cookieValue = jar.get(IMPERSONATION_COOKIE_NAME)?.value ?? null;
  if (cookieValue === null || cookieValue === "") return null;

  const session = await auth();
  const roles = session?.user.roles ?? [];
  const isSuperAdmin = roles.includes("super_admin");
  if (!isSuperAdmin) return null;

  const tenant = await platformPrisma.tenant.findUnique({
    where: { id: cookieValue },
    select: { id: true, name: true, slug: true, isActive: true },
  });

  if (!tenant) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      data-testid="impersonation-banner"
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">Platform-admin view</span>
        <span>
          Viewing tenant <span className="font-mono">{tenant.slug}</span> ({tenant.name})
          {!tenant.isActive ? <span className="ml-1 font-semibold">[INACTIVE]</span> : null}
        </span>
      </div>
      <ImpersonationBannerExitButton />
    </div>
  );
}
