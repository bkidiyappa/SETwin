import { randomUUID } from "node:crypto";
import { createSettings } from "@setwin/config";
import { applyMigrations, roles, userRoles, users, withDatabase } from "@setwin/database";
import { eq } from "drizzle-orm";
import net from "node:net";
import { describe, expect, it } from "vitest";
import { ValidationError, authenticate, hashPassword, login, seedIdentityCatalog } from "@setwin/auth";
import { createArtifact, createGherkin, createProject, getGherkin } from "./index.ts";

const FEATURE = `Feature: Order cancellation

  Scenario: Customer cancels an eligible order
    Given an order was placed 10 minutes ago
    And the order has not been fulfilled
    When the customer cancels the order
    Then the order should be cancelled
    And the customer should receive confirmation
`;

function postgresListening(host = "127.0.0.1", port = 5432): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(200);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

async function insertAdmin(databaseUrl: string, username: string, password: string): Promise<void> {
  await withDatabase(databaseUrl, async ({ db }) => {
    const secret = await hashPassword(password);
    const id = randomUUID();
    const now = new Date();
    await db.insert(users).values({
      id,
      username,
      displayName: username,
      passwordHash: secret.hash,
      passwordSalt: secret.salt,
      disabled: false,
      createdAt: now,
      updatedAt: now,
    });
    const adminRole = (await db.select().from(roles).where(eq(roles.name, "administrator")))[0];
    if (!adminRole) {
      throw new Error("administrator role missing; seed the catalog first");
    }
    await db.insert(userRoles).values({ userId: id, roleId: adminRole.id });
  });
}

describe("gherkin twin", () => {
  it("validates, stores structure, and traces to a requirement", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    const settings = createSettings({
      databaseUrl: "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
    });
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);
    const suffix = randomUUID().slice(0, 8);
    const adminName = `gherkin_admin_${suffix}`;
    await insertAdmin(settings.databaseUrl, adminName, "admin-pass");
    const session = await login(settings.databaseUrl, adminName, "admin-pass");
    const principal = await authenticate(settings.databaseUrl, session.token);

    const project = await createProject(settings.databaseUrl, { key: `gherkin-${suffix}` }, principal);
    const requirement = await createArtifact(
      settings.databaseUrl,
      {
        project: project.key,
        type: "REQUIREMENT",
        title: "Cancel an order",
        content: "Customers can cancel an order within 30 minutes.",
      },
      principal,
    );

    await expect(
      createGherkin(settings.databaseUrl, { project: project.key, content: "not a feature" }, principal),
    ).rejects.toBeInstanceOf(ValidationError);

    const gherkin = await createGherkin(
      settings.databaseUrl,
      { project: project.key, content: FEATURE, requirement: requirement.key },
      principal,
    );
    expect(gherkin.artifact.key).toMatch(/^TST-\d+$/);
    expect(gherkin.artifact.currentVersion.status).toBe("DRAFT");
    expect(gherkin.feature.name).toBe("Order cancellation");
    expect(gherkin.feature.scenarios[0]?.steps).toHaveLength(5);
    expect(gherkin.validates).toContain(requirement.key);

    const loaded = await getGherkin(settings.databaseUrl, gherkin.artifact.key, principal);
    expect(loaded.feature.scenarios[0]?.name).toBe("Customer cancels an eligible order");
  });
});
