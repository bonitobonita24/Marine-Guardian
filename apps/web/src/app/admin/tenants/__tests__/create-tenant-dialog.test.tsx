// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

const { stubs } = vi.hoisted(() => {
  const s: { createMutate: any; createWithAdminMutate: any } = {
    createMutate: vi.fn(),
    createWithAdminMutate: vi.fn(),
  };
  return { stubs: s };
});

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      platform: {
        list: { invalidate: vi.fn() },
        metrics: { invalidate: vi.fn() },
      },
      platformUser: {
        list: { invalidate: vi.fn() },
      },
    }),
    platform: {
      create: {
        useMutation: (opts: any) => ({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          mutate: (input: any) => { stubs.createMutate(input, opts); },
          isPending: false,
        }),
      },
      createTenantWithAdmin: {
        useMutation: (opts: any) => ({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          mutate: (input: any) => { stubs.createWithAdminMutate(input, opts); },
          isPending: false,
        }),
      },
    },
  },
}));

import { CreateTenantDialog } from "../create-tenant-dialog";

beforeEach(() => {
  stubs.createMutate = vi.fn();
  stubs.createWithAdminMutate = vi.fn();
  cleanup();
});

function openDialog() {
  render(<CreateTenantDialog />);
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: /add tenant/i }));
  });
}

function fillField(labelPattern: RegExp, value: string) {
  const el = screen.getByLabelText(labelPattern);
  fireEvent.change(el, { target: { value } });
}

function clickButton(namePattern: RegExp) {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: namePattern }));
  });
}

describe("CreateTenantDialog", () => {
  it("renders Add Tenant trigger button", () => {
    render(<CreateTenantDialog />);
    expect(screen.getByRole("button", { name: /add tenant/i })).toBeTruthy();
  });

  it("starts with admin section collapsed (no admin fields visible)", () => {
    openDialog();
    expect(screen.queryByLabelText(/admin email/i)).toBeNull();
    expect(screen.queryByLabelText(/admin full name/i)).toBeNull();
    expect(screen.queryByLabelText(/admin password/i)).toBeNull();
  });

  it("reveals admin fields when section toggle clicked", () => {
    openDialog();
    clickButton(/initial site admin/i);
    expect(screen.getByLabelText(/admin email/i)).toBeTruthy();
    expect(screen.getByLabelText(/admin full name/i)).toBeTruthy();
    expect(screen.getByLabelText(/admin password/i)).toBeTruthy();
  });

  it("calls platform.create when admin section is closed", () => {
    openDialog();
    fillField(/^name$/i, "Coral Bay");
    fillField(/^slug$/i, "coral-bay");
    clickButton(/create tenant$/i);

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createWithAdminMutate).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const [payload] = (stubs.createMutate.mock.calls[0] ?? []) as [any, ...any[]];
    expect(payload).toMatchObject({ name: "Coral Bay", slug: "coral-bay" });
  });

  it("calls platform.create when admin section opened but left empty", () => {
    openDialog();
    fillField(/^name$/i, "Empty Admin");
    fillField(/^slug$/i, "empty-admin");
    clickButton(/initial site admin/i);
    clickButton(/create tenant$/i);

    expect(stubs.createMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createWithAdminMutate).not.toHaveBeenCalled();
  });

  it("calls createTenantWithAdmin when admin section filled with valid data", () => {
    openDialog();
    fillField(/^name$/i, "Filled Admin");
    fillField(/^slug$/i, "filled-admin");
    clickButton(/initial site admin/i);
    fillField(/admin email/i, "admin@filled.test");
    fillField(/admin full name/i, "Filled Admin");
    fillField(/admin password/i, "strong-password-123");
    clickButton(/create tenant \+ admin/i);

    expect(stubs.createWithAdminMutate).toHaveBeenCalledTimes(1);
    expect(stubs.createMutate).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const [payload] = (stubs.createWithAdminMutate.mock.calls[0] ?? []) as [any, ...any[]];
    expect(payload).toMatchObject({
      tenant: { name: "Filled Admin", slug: "filled-admin" },
      admin: {
        email: "admin@filled.test",
        fullName: "Filled Admin",
        password: "strong-password-123",
        languagePreference: "en",
      },
    });
  });

  it("shows inline error when admin section partially filled", () => {
    openDialog();
    fillField(/^name$/i, "Partial");
    fillField(/^slug$/i, "partial");
    clickButton(/initial site admin/i);
    fillField(/admin email/i, "admin@partial.test");
    clickButton(/create tenant \+ admin/i);

    expect(stubs.createWithAdminMutate).not.toHaveBeenCalled();
    expect(stubs.createMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/all initial admin fields are required/i)).toBeTruthy();
  });

  it("shows inline error when admin password under 12 chars", () => {
    openDialog();
    fillField(/^name$/i, "Short Pass");
    fillField(/^slug$/i, "short-pass");
    clickButton(/initial site admin/i);
    fillField(/admin email/i, "admin@short.test");
    fillField(/admin full name/i, "Short");
    fillField(/admin password/i, "short");
    clickButton(/create tenant \+ admin/i);

    expect(stubs.createWithAdminMutate).not.toHaveBeenCalled();
    expect(screen.getByText(/at least 12 characters/i)).toBeTruthy();
  });
});
