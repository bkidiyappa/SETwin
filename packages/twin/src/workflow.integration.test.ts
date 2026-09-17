import { randomUUID } from "node:crypto";
import { createSettings } from "@setwin/config";
import { applyMigrations, roles, userRoles, users, withDatabase } from "@setwin/database";
import { eq } from "drizzle-orm";
import net from "node:net";
import { describe, expect, it } from "vitest";
import {
  AuthorizationError,
  ConflictError,
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
  seedWorkflowPolicies,
  transitionWorkflow,
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

describe("workflow", () => {
  it("enforces lifecycle gates and type policies", async (context) => {
    if (!(await postgresListening())) {
      context.skip();
    }
    const settings = createSettings({
      databaseUrl: "postgresql://setwin:setwin@127.0.0.1:5432/setwin",
    });
    await applyMigrations(settings.databaseUrl);
    await seedIdentityCatalog(settings.databaseUrl);
    await seedWorkflowPolicies(settings.databaseUrl);

    const suffix = randomUUID().slice(0, 8);
    await insertAdmin(settings.databaseUrl, `wf_admin_${suffix}`, "admin-pass");
    const admin = await authenticate(
      settings.databaseUrl,
      (await login(settings.databaseUrl, `wf_admin_${suffix}`, "admin-pass")).token,
    );
    const developer = await createUser(
      settings.databaseUrl,
      { username: `wf_dev_${suffix}`, password: "dev-pass", role: "developer" },
      admin,
    );
    const dev = (await login(settings.databaseUrl, developer.username, "dev-pass")).user;

    const project = await createProject(settings.databaseUrl, { key: `wf-${suffix}` }, admin);
    const requirement = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "REQUIREMENT", title: "Cancel", content: "Cancel within 30 minutes." },
      admin,
    );
    expect(requirement.currentVersion.workflowState).toBe("DRAFT");

    await expect(transitionWorkflow(settings.databaseUrl, requirement.key, "approve", admin)).rejects.toBeInstanceOf(
      ConflictError,
    );

    const submitted = await transitionWorkflow(settings.databaseUrl, requirement.key, "submit", admin);
    expect(submitted.state).toBe("IN_REVIEW");

    await expect(createArtifactVersion(settings.databaseUrl, requirement.key, { content: "nope" }, admin)).rejects.toBeInstanceOf(
      ConflictError,
    );

    await expect(transitionWorkflow(settings.databaseUrl, requirement.key, "approve", dev)).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    const approved = await transitionWorkflow(
      settings.databaseUrl,
      requirement.key,
      "approve",
      admin,
      "Looks good",
    );
    expect(approved.state).toBe("APPROVED");
    expect(approved.artifact.currentVersion.status).toBe("APPROVED");
    expect(approved.history.map((row) => row.action)).toEqual(["submit", "approve"]);

    await expect(transitionWorkflow(settings.databaseUrl, requirement.key, "submit", admin)).rejects.toBeInstanceOf(
      ConflictError,
    );

    const next = await createArtifactVersion(
      settings.databaseUrl,
      requirement.key,
      { content: "Cancel an unpaid order within 30 minutes." },
      admin,
    );
    expect(next.currentVersion.workflowState).toBe("DRAFT");
    expect(next.currentVersion.status).toBe("DRAFT");
    expect(next.versions.find((row) => row.version === 1)?.status).toBe("APPROVED");
  });
});
