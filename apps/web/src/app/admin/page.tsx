import { auth } from "@/server/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "./sign-out-button";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) return null;

  const { email, roles } = session.user;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Platform Admin Console</CardTitle>
          <CardDescription>Marine Guardian — Super Admin</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Logged in as</span>
            <span className="font-medium">{email}</span>
            {roles.map((r) => (
              <Badge key={r} variant="secondary">
                {r}
              </Badge>
            ))}
          </div>

          <p className="text-sm text-muted-foreground leading-relaxed">
            This account has no tenant context (
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              tenantId = ""
            </code>
            ). Tenant-scoped pages are not accessible from this session. The
            full Super Admin Panel (PRODUCT.md §210) is deferred. To manage
            tenant data, sign out and re-login as a tenant-scoped user, or use
            the user-management API directly.
          </p>

          <div className="pt-2">
            <SignOutButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
