// 5.1c — area-rederive processor tests.
//
// Verifies the BullMQ job handler:
//  (1) calls validateTenantContext on the payload (rejects empty tenantId/userId),
//  (2) delegates to applyAreaDerivation with the correct positional args
//      (prisma, entity, id) — the prisma instance is the module-level
//      platformPrisma cast, NOT the job payload,
//  (3) returns the helper's result so BullMQ persists it as the job result,
//  (4) supports all three entity types (event / patrol / fuelEntry).
//
// Mocks applyAreaDerivation directly via vi.mock("../../lib/area-derivation").
// The helper itself is exhaustively tested in
// packages/jobs/src/lib/__tests__/area-derivation.test.ts — this file only
// verifies the processor wires the helper correctly.

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { AreaRederiveJobPayload } from "../../queues/types";

vi.mock("bullmq", () => ({
  Worker: vi.fn(),
  Queue: vi.fn(),
}));

vi.mock("../../workers/base-worker", () => ({
  validateTenantContext: vi.fn(),
}));

vi.mock("@marine-guardian/db", () => ({
  platformPrisma: { __marker: "platformPrisma-mock" },
}));

vi.mock("../../lib/area-derivation", () => ({
  applyAreaDerivation: vi.fn(),
}));

import { processAreaRederive } from "../area-rederive.processor";
import { validateTenantContext } from "../../workers/base-worker";
import { applyAreaDerivation } from "../../lib/area-derivation";
import { platformPrisma } from "@marine-guardian/db";

const mockApply = applyAreaDerivation as ReturnType<typeof vi.fn>;
const mockValidate = validateTenantContext as ReturnType<typeof vi.fn>;

function makeJob(
  overrides: Partial<AreaRederiveJobPayload> = {},
): Job<AreaRederiveJobPayload> {
  return {
    id: "test-job-1",
    data: {
      tenantId: "tenant-1",
      userId: "user-1",
      entity: "event",
      id: "evt-1",
      ...overrides,
    },
  } as unknown as Job<AreaRederiveJobPayload>;
}

describe("processAreaRederive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApply.mockResolvedValue({
      areaBoundaryId: "b1",
      matchedVia: "name",
    });
  });

  it("calls validateTenantContext with the job payload before doing any work", async () => {
    await processAreaRederive(makeJob());
    expect(mockValidate).toHaveBeenCalledTimes(1);
    expect(mockValidate).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: "user-1",
      entity: "event",
      id: "evt-1",
    });
  });

  it("delegates to applyAreaDerivation with positional args (prisma, entity, id)", async () => {
    await processAreaRederive(
      makeJob({ entity: "patrol", id: "patrol-99" }),
    );
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledWith(platformPrisma, "patrol", "patrol-99");
  });

  it("returns the result from applyAreaDerivation for BullMQ result storage", async () => {
    mockApply.mockResolvedValueOnce({
      areaBoundaryId: "b2",
      matchedVia: "nearest",
    });
    const result = await processAreaRederive(makeJob());
    expect(result).toEqual({ areaBoundaryId: "b2", matchedVia: "nearest" });
  });

  it("returns null result when applyAreaDerivation reports no match", async () => {
    mockApply.mockResolvedValueOnce({
      areaBoundaryId: null,
      matchedVia: null,
    });
    const result = await processAreaRederive(makeJob());
    expect(result).toEqual({ areaBoundaryId: null, matchedVia: null });
  });

  it("supports entity='event'", async () => {
    await processAreaRederive(makeJob({ entity: "event", id: "evt-42" }));
    expect(mockApply).toHaveBeenCalledWith(platformPrisma, "event", "evt-42");
  });

  it("supports entity='patrol'", async () => {
    await processAreaRederive(makeJob({ entity: "patrol", id: "patrol-42" }));
    expect(mockApply).toHaveBeenCalledWith(platformPrisma, "patrol", "patrol-42");
  });

  it("supports entity='fuelEntry'", async () => {
    await processAreaRederive(makeJob({ entity: "fuelEntry", id: "fuel-42" }));
    expect(mockApply).toHaveBeenCalledWith(platformPrisma, "fuelEntry", "fuel-42");
  });

  it("propagates exceptions from applyAreaDerivation (no try/catch)", async () => {
    mockApply.mockRejectedValueOnce(new Error("findUniqueOrThrow failed"));
    await expect(processAreaRederive(makeJob())).rejects.toThrow(
      "findUniqueOrThrow failed",
    );
  });

  it("propagates exceptions from validateTenantContext (rejects empty tenantId)", async () => {
    mockValidate.mockImplementationOnce(() => {
      throw new Error("Job payload missing tenantId");
    });
    await expect(
      processAreaRederive(makeJob({ tenantId: "" })),
    ).rejects.toThrow("Job payload missing tenantId");
    // applyAreaDerivation should not have been called when validation throws.
    expect(mockApply).not.toHaveBeenCalled();
  });
});
