import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { AdminUsersClient } from "./admin-users-client";

export default async function AdminUsersPage() {
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
      <AdminUsersClient
        email={session.user.email}
        roles={session.user.roles}
      />
    </div>
  );
}
