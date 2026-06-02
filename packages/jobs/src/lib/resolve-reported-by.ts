import type { PrismaClient } from "@marine-guardian/db";

export interface ReportedByPayload {
  name?: string;
  email?: string;
}

export interface ResolvedReportedBy {
  reportedByUserId: string | null;
  reportedByKnownRangerId: string | null;
}

/**
 * Resolves ER `reported_by` payload to internal User or KnownRanger by tenant.
 * Match precedence: User (by email, exact lowercase) > KnownRanger (by name, exact).
 * Both null when no payload, no match, or both fields blank.
 */
export async function resolveReportedBy(
  prisma: PrismaClient,
  tenantId: string,
  reportedBy: ReportedByPayload | null | undefined,
): Promise<ResolvedReportedBy> {
  const empty: ResolvedReportedBy = {
    reportedByUserId: null,
    reportedByKnownRangerId: null,
  };
  if (reportedBy == null) return empty;

  const email = reportedBy.email?.trim().toLowerCase();
  if (email != null && email.length > 0) {
    const user = await prisma.user.findFirst({
      where: { email, tenantId },
      select: { id: true },
    });
    if (user !== null) {
      return { reportedByUserId: user.id, reportedByKnownRangerId: null };
    }
  }

  const name = reportedBy.name?.trim();
  if (name != null && name.length > 0) {
    const ranger = await prisma.knownRanger.findFirst({
      where: { name, tenantId, isActive: true },
      select: { id: true },
    });
    if (ranger !== null) {
      return { reportedByUserId: null, reportedByKnownRangerId: ranger.id };
    }
  }

  return empty;
}
