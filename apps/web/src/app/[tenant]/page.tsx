import { redirect } from "next/navigation";

// There is no UI at "/[tenant]"; the tenant app home is "/[tenant]/dashboard".
// The slug is validated by [tenant]/layout.tsx before this renders.
export default async function TenantRootPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const { tenant } = await params;
  redirect(`/${tenant}/dashboard`);
}
