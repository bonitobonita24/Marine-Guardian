import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@marine-guardian/db", () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "@marine-guardian/db";
import { writeExportAudit } from "../export-audit";

function partial<T>(obj: T): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return expect.objectContaining(obj as any) as T;
}

describe("writeExportAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes one AuditLog row with action=DATA_EXPORT and correct identifiers", async () => {
    await writeExportAudit({
      userId: "u1",
      tenantId: "t1",
      entity: "events",
      format: "csv",
      filterHash: "abc123",
      rowCount: 42,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: partial({
        action: "DATA_EXPORT",
        userId: "u1",
        tenantId: "t1",
        entityType: "events",
        entityId: "abc123",
      }),
    });
  });

  it("includes format and rowCount in changesJson", async () => {
    await writeExportAudit({
      userId: "u9",
      tenantId: "t9",
      entity: "patrols",
      format: "pdf",
      filterHash: "deadbeef",
      rowCount: 17,
    });

    type CreateCall = { data: { changesJson: unknown } };
    const mock = prisma.auditLog.create as unknown as {
      mock: { calls: CreateCall[][] };
    };
    const arg = mock.mock.calls[0]?.[0];
    expect(arg?.data.changesJson).toEqual({ format: "pdf", rowCount: 17 });
  });

  it("uses the entity name as entityType verbatim", async () => {
    await writeExportAudit({
      userId: "u1",
      tenantId: "t1",
      entity: "alert-rules",
      format: "csv",
      filterHash: "h",
      rowCount: 0,
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: partial({ entityType: "alert-rules" }),
    });
  });
});
