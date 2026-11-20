import { describe, expect, it, vi } from "vitest";

// Records every whole-collection read while keeping the real (in-memory) behaviour.
const collectionReads: string[] = [];
vi.mock("@/lib/firestore-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/firestore-service")>();
  return {
    ...actual,
    getCollectionFromFirestore: (name: string, ...rest: unknown[]) => {
      collectionReads.push(name);
      return (actual.getCollectionFromFirestore as (...a: unknown[]) => unknown)(name, ...rest);
    },
  };
});

import { isFirestoreConfigured } from "@/lib/firestore-service";
import { getCustomRoles, withRoleUserCounts } from "./db-adapter";
import { resolveAllowedSections } from "@/lib/allowed-sections";
import type { UserAccount } from "@/lib/types";

describe("custom roles", () => {
  it("are resolved on the session heartbeat without reading the users or employees collections", async () => {
    if (isFirestoreConfigured()) throw new Error("Refusing to run: Firestore credentials are present in the test environment.");
    collectionReads.length = 0;

    const roles = await getCustomRoles();
    await resolveAllowedSections("employee");

    expect(roles.map((r) => r.id)).toEqual(expect.arrayContaining(["admin", "hr", "employee"]));
    expect(collectionReads).not.toContain("users");
    expect(collectionReads).not.toContain("employees");
  });

  it("count users per role, treating an account with no role as Employee", async () => {
    const roles = await getCustomRoles();
    const users = [{ role: "hr" }, { role: "Employee" }, { role: undefined }, { role: "admin" }] as unknown as UserAccount[];
    const counts = Object.fromEntries(withRoleUserCounts(roles, users).map((r) => [r.id, r.userCount]));
    expect(counts).toMatchObject({ admin: 1, hr: 1, employee: 2 });
  });
});
