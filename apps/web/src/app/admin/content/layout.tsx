import { Toaster } from "sonner";

/**
 * Layout scoped to /admin/content/* (CMS_BUILD_PLAN.md — W6). Each page under
 * this route still repeats the platform-admin auth-gate inline (matching the
 * existing /admin/tenants, /admin/users, /admin page.tsx convention exactly)
 * — this layout ONLY mounts a single `sonner` `<Toaster />`, which the Plate
 * media kit's upload-error/upload-toast components (media-toolbar-button.tsx,
 * media-upload-toast.tsx) call into but which is not mounted anywhere else in
 * this app.
 */
export default function AdminContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <Toaster richColors position="bottom-right" />
    </>
  );
}
