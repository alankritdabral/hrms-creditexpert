import { beforeEach, describe, expect, it, vi } from "vitest";

// Never touch the real database from this test.
const ensure = vi.fn(async (..._args: unknown[]) => null as unknown);
vi.mock("@/lib/db/db-adapter", () => ({ ensureTemporaryEmployee: (...a: unknown[]) => ensure(...a) }));

import { ensureCallerEmployee } from "@/lib/temp-employee";

const auth = (role: string) =>
  ({
    authenticated: true,
    role,
    employeeId: "EMP-77",
    branch: "Dehradun",
    actor: { name: "Backend User", role, email: "b@x.com", employeeId: "EMP-77" },
    session: { name: "Backend User", role },
  }) as any;

beforeEach(() => ensure.mockClear());

describe("ensureCallerEmployee", () => {
  it("asks for a temporary employee under the caller's own ID", async () => {
    await ensureCallerEmployee(auth("role-backend-team-1234"));
    expect(ensure).toHaveBeenCalledWith(
      { employeeId: "EMP-77", name: "Backend User", email: "b@x.com", branch: "Dehradun" },
      { name: "Backend User", role: "role-backend-team-1234" }
    );
  });

  it("leaves admin and HR alone", async () => {
    await ensureCallerEmployee(auth("admin"));
    await ensureCallerEmployee(auth("hr"));
    expect(ensure).not.toHaveBeenCalled();
  });

  it("never throws, so the entry still saves", async () => {
    ensure.mockRejectedValueOnce(new Error("db down"));
    await expect(ensureCallerEmployee(auth("employee"))).resolves.toBeUndefined();
  });
});
