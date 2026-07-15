import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FileText, LayoutTemplate } from "lucide-react";

export default async function AdminContentPage() {
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
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Content (CMS)</h1>
          <p className="text-sm text-muted-foreground">
            Edit the public /docs pages and the /showcase landing page — global content, not tenant-scoped.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/admin/content/docs" data-testid="content-nav-docs">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-center gap-3">
                <FileText className="size-6 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Documentation</CardTitle>
                  <CardDescription>Edit the /docs page tree and body content</CardDescription>
                </div>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>

          <Link href="/admin/content/showcase" data-testid="content-nav-showcase">
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="flex flex-row items-center gap-3">
                <LayoutTemplate className="size-6 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Showcase / Landing</CardTitle>
                  <CardDescription>Edit the /showcase marketing page text</CardDescription>
                </div>
              </CardHeader>
              <CardContent />
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
