import type { Language, UserRole } from "./enums";

export interface User {
  id: string;
  tenantId: string | null;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  languagePreference: Language;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
