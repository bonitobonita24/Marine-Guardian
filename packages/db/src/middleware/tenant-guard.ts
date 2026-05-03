import { Prisma } from "@prisma/client";
import { getCurrentTenantId } from "../helpers/rls";

const SYSTEM_MODELS = new Set(["AuditLog", "Tenant"]);

export const tenantGuardExtension = Prisma.defineExtension({
  query: {
    $allModels: {
      async $allOperations({ args, query, model, operation }) {
        if (SYSTEM_MODELS.has(model)) {
          return query(args);
        }

        if (model === "User" && operation === "findUnique") {
          return query(args);
        }

        const tenantId = getCurrentTenantId();
        if (tenantId === null) {
          return query(args);
        }

        const argsRecord = args as Record<string, unknown>;

        if ("where" in argsRecord && argsRecord["where"] !== undefined) {
          argsRecord["where"] = {
            ...(argsRecord["where"] as Record<string, unknown>),
            tenantId,
          };
        } else if (
          operation.startsWith("find") ||
          operation.startsWith("count") ||
          operation.startsWith("aggregate") ||
          operation.startsWith("groupBy") ||
          operation === "deleteMany" ||
          operation === "updateMany"
        ) {
          argsRecord["where"] = { tenantId };
        }

        if ("data" in argsRecord && argsRecord["data"] !== undefined) {
          if (!Array.isArray(argsRecord["data"])) {
            argsRecord["data"] = {
              ...(argsRecord["data"] as Record<string, unknown>),
              tenantId,
            };
          }
        }

        return query(args);
      },
    },
  },
});
