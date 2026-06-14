import { redirect } from "next/navigation";

// Root route. There is no UI at "/": the app home is "/dashboard". Unauthenticated
// requests are bounced to /login by middleware before reaching here; authenticated
// requests (incl. post-login callbackUrl="/") land here and are redirected onward.
// Without this page "/" 404s, which surfaced as a post-login 404 (callbackUrl="/").
export default function RootPage() {
  redirect("/dashboard");
}
