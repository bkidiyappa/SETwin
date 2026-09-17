import { createSettings, redactDatabaseUrl } from "@setwin/config";
import { describe, expect, it } from "vitest";

describe("redactDatabaseUrl", () => {
  it("hides the password", () => {
    expect(redactDatabaseUrl("postgresql://setwin:super-secret@127.0.0.1:5432/setwin")).toBe(
      "postgresql://setwin:***@127.0.0.1:5432/setwin",
    );
  });

  it("leaves URLs without passwords unchanged", () => {
    expect(redactDatabaseUrl("postgresql://127.0.0.1:5432/setwin")).toBe(
      "postgresql://127.0.0.1:5432/setwin",
    );
  });
});

describe("createSettings", () => {
  it("normalizes SQLAlchemy-style URLs and redacts secrets", () => {
    const settings = createSettings({
      databaseUrl: "postgresql+psycopg://setwin:super-secret@127.0.0.1:5432/setwin",
    });
    expect(settings.databaseUrl).toBe("postgresql://setwin:super-secret@127.0.0.1:5432/setwin");
    expect(settings.databaseUrlRedacted).toBe("postgresql://setwin:***@127.0.0.1:5432/setwin");
    expect(settings.databaseUrlRedacted).not.toContain("super-secret");
  });
});
