import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { AdminContentDocsClient } from "./admin-content-docs-client";

export default async function AdminContentDocsPage() {
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
      <AdminContentDocsClient />
    </div>
  );
}
