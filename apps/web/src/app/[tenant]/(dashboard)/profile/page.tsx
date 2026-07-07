import { ChangePasswordCard } from "./_components/change-password-card";
import { DataPrivacyCard } from "./_components/data-privacy-card";

/**
 * Profile / self-service account page (2026-07-06).
 *
 * Open to EVERY authenticated role — including administrator (which loses
 * /users and /settings) and viewer (which loses everything except Command
 * Center / Map / Exports). Every user, regardless of role, can change their
 * own password (ChangePasswordCard → account.changeOwnPassword) and their
 * own name/email + exercise the rest of their PH Data Privacy Act
 * data-subject rights (DataPrivacyCard → dsr.* procedures, moved here from
 * Settings since it is self-service, not tenant configuration).
 */
export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <ChangePasswordCard />
      <DataPrivacyCard />
    </div>
  );
}
