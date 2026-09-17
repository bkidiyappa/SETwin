import { randomUUID } from "node:crypto";
import { createSettings } from "@setwin/config";
import { applyMigrations, roles, userRoles, users, withDatabase } from "@setwin/database";
import { eq } from "drizzle-orm";
import net from "node:net";
import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  ConflictError,
  ValidationError,
  authenticate,
  createUser,
  hashPassword,
  login,
  seedIdentityCatalog,
} from "@setwin/auth";
import {
  createArtifact,
  createArtifactVersion,
  createProject,
  createRelationship,
  getArtifact,
  listRelationships,
} from "./index.ts";

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

describe("twin core", () => {
  it("versions artifacts immutably and records provenance and relationships", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    const settings = createSettings({
      databaseUrl: "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
    });
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);

    const suffix = randomUUID().slice(0, 8);
    const adminName = `twin_admin_${suffix}`;
    await insertAdmin(settings.databaseUrl, adminName, "admin-pass");
    const session = await login(settings.databaseUrl, adminName, "admin-pass");
    const principal = await authenticate(settings.databaseUrl, session.token);

    const project = await createProject(
      settings.databaseUrl,
      { key: `demo-${suffix}`, name: "Demo", description: "Twin core" },
      principal,
    );
    expect(project.key).toBe(`demo-${suffix}`);

    const requirement = await createArtifact(
      settings.databaseUrl,
      {
        project: project.key,
        type: "REQUIREMENT",
        title: "Cancel an order",
        content: "Customers can cancel an order within 30 minutes.",
        provenanceSource: "HUMAN_AUTHORED",
      },
      principal,
    );
    expect(requirement.key).toMatch(/^REQ-\d+$/);
    expect(requirement.currentVersion.version).toBe(1);
    expect(requirement.currentVersion.status).toBe("DRAFT");
    expect(requirement.currentVersion.provenance.source).toBe("HUMAN_AUTHORED");
    expect(requirement.currentVersion.provenance.authority).toBe("SETWIN");
    const v1Id = requirement.currentVersion.id;

    const updated = await createArtifactVersion(
      settings.databaseUrl,
      requirement.key,
      { content: "Customers can cancel an unpaid order within 30 minutes." },
      principal,
    );
    expect(updated.currentVersion.version).toBe(2);
    expect(updated.currentVersion.status).toBe("DRAFT");
    expect(updated.currentVersion.id).not.toBe(v1Id);
    const v1 = updated.versions.find((row) => row.version === 1);
    expect(v1?.status).toBe("SUPERSEDED");
    expect(v1?.content).toBe("Customers can cancel an order within 30 minutes.");
    expect(v1?.supersededByVersion).toBe(2);

    const design = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "DESIGN", title: "Cancel flow", content: "API + UI" },
      principal,
    );
    const link = await createRelationship(
      settings.databaseUrl,
      { from: design.key, to: requirement.key, type: "IMPLEMENTS", source: "HUMAN" },
      principal,
    );
    expect(link.fromKey).toBe(design.key);
    expect(link.toKey).toBe(requirement.key);
    const related = await listRelationships(settings.databaseUrl, design.key, principal);
    expect(related).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromKey: design.key, toKey: requirement.key, type: "IMPLEMENTS", source: "HUMAN" }),
      ]),
    );

    await expect(
      createRelationship(
        settings.databaseUrl,
        { from: design.key, to: requirement.key, type: "IMPLEMENTS" },
        principal,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    await expect(
      createRelationship(
        settings.databaseUrl,
        { from: design.key, to: requirement.key, type: "SATISFIES", source: "AI_INFERRED" },
        principal,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const sre = await createUser(
      settings.databaseUrl,
      { username: `twin_sre_${suffix}`, password: "sre-pass", role: "sre" },
      principal,
    );
    const sreSession = await login(settings.databaseUrl, sre.username, "sre-pass");
    await expect(
      createArtifact(
        settings.databaseUrl,
        { project: project.key, type: "CODE", title: "blocked", content: "nope" },
        sreSession.user,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const visible = await getArtifact(settings.databaseUrl, requirement.key, sreSession.user);
    expect(visible.currentVersion.version).toBe(2);
  });
});
