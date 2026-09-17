import { PERMISSIONS } from "./catalog.ts";
import { hashPassword, verifyPassword } from "./passwords.ts";
import { describe, expect, it } from "vitest";

describe("passwords", () => {
  it("verifies a matching password and rejects a wrong one", async () => {
    const secret = await hashPassword("correct horse");
    expect(await verifyPassword("correct horse", secret.hash, secret.salt)).toBe(true);
    expect(await verifyPassword("wrong", secret.hash, secret.salt)).toBe(false);
  });
});

describe("permission catalog", () => {
  it("has unique keys", () => {
    const keys = PERMISSIONS.map((permission) => permission.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
