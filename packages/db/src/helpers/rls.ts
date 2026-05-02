import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";

const tenantContext = new AsyncLocalStorage<string>();

export function getCurrentTenantId(): string | null {
  return tenantContext.getStore() ?? null;
}

export function setCurrentTenantId<T>(tenantId: string, fn: () => T): T {
  return tenantContext.run(tenantId, fn);
}

export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return tenantContext.run(tenantId, () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
      return fn(tx);
    }),
  );
}
