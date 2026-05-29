import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { AdminLandingClient } from "./admin-landing-client";

export default async function AdminPage() {
  const session = await auth();
  if (
    !session?.user ||
    !session.user.roles.includes("super_admin") ||
    session.user.tenantId !== ""
  ) {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <AdminLandingClient
        email={session.user.email}
        roles={session.user.roles}
      />
    </div>
  );
}
