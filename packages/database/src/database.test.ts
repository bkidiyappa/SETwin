import { checkDatabase } from "@setwin/database";
import { describe, expect, it } from "vitest";

describe("checkDatabase", () => {
  it("reports a closed port without leaking the password", async () => {
    const health = await checkDatabase("postgresql://setwin:super-secret@127.0.0.1:1/setwin");
    expect(health.reachable).toBe(false);
    expect(health.detail).toContain("not listening on 127.0.0.1:1");
    expect(health.detail).not.toContain("super-secret");
  });
});
