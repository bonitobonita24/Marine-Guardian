import { z } from "zod";
import { languageSchema, userRoleSchema } from "./enums";

export const userSchema = z.object({
  id: z.string().cuid(),
  tenantId: z.string().cuid().nullable(),
  email: z.string().email().max(255),
  name: z.string().min(1).max(255),
  passwordHash: z.string(),
  role: userRoleSchema,
  languagePreference: languageSchema.default("en"),
  isActive: z.boolean().default(true),
  lastLoginAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const createUserSchema = userSchema.omit({
  id: true,
  passwordHash: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  password: z.string().min(8).max(128),
});

export const updateUserSchema = createUserSchema.partial().omit({
  password: true,
});
