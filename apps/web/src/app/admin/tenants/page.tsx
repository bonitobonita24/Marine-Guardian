import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { AdminTenantsClient } from "./admin-tenants-client";

export default async function AdminTenantsPage() {
  const session = await auth();
  if (
    !session?.user ||
    !session.user.roles.includes("tenant_manager") ||
    session.user.tenantId !== ""
  ) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <AdminTenantsClient
        email={session.user.email}
        roles={session.user.roles}
      />
    </div>
  );
}
