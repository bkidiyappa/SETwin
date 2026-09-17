import { randomUUID } from "node:crypto";
import { createSettings } from "@setwin/config";
import { applyMigrations, roles, userRoles, users, withDatabase } from "@setwin/database";
import { eq } from "drizzle-orm";
import net from "node:net";
import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  AuthorizationError,
  assignRole,
  authenticate,
  createTeam,
  createUser,
  login,
  seedIdentityCatalog,
} from "./index.ts";
import { hashPassword } from "./passwords.ts";

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

describe("identity", () => {
  it("assigns roles and rejects unauthorized operations", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    const settings = createSettings({
      databaseUrl: "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
    });
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);

    const suffix = randomUUID().slice(0, 8);
    const adminName = `admin_${suffix}`;
    const devName = `dev_${suffix}`;
    await insertAdmin(settings.databaseUrl, adminName, "admin-pass");

    const session = await login(settings.databaseUrl, adminName, "admin-pass");
    const principal = await authenticate(settings.databaseUrl, session.token);
    expect(principal.roles).toContain("administrator");
    expect(principal.permissions).toContain("admin:manage_users");

    const developer = await createUser(
      settings.databaseUrl,
      { username: devName, password: "dev-pass", role: "developer" },
      principal,
    );
    expect(developer.roles).toContain("developer");

    await assignRole(settings.databaseUrl, devName, "qa_reviewer", principal);
    const assigned = await login(settings.databaseUrl, devName, "dev-pass");
    expect(assigned.user.roles).toEqual(expect.arrayContaining(["developer", "qa_reviewer"]));
    expect(assigned.user.permissions).toContain("code:view");
    expect(assigned.user.permissions).not.toContain("admin:manage_users");

    await expect(
      createUser(
        settings.databaseUrl,
        { username: `blocked_${suffix}`, password: "x", role: "developer" },
        assigned.user,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(login(settings.databaseUrl, adminName, "nope")).rejects.toBeInstanceOf(AuthenticationError);

    await expect(
      createTeam(settings.databaseUrl, { name: `core_${suffix}` }, assigned.user),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const team = await createTeam(settings.databaseUrl, { name: `core_${suffix}` }, principal);
    expect(team.name).toBe(`core_${suffix}`);
  });
});
