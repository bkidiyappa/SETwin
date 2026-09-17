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
  addReviewFinding,
  createArtifact,
  createProject,
  delegateApproval,
  escalateApproval,
  getReview,
  recordReviewDecision,
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

describe("review and approval", () => {
  it(
    "enforces findings, multi-approval, sequential gates, delegation, and escalation",
    async (context) => {
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
    await insertAdmin(settings.databaseUrl, `rv_admin_${suffix}`, "admin-pass");
    const admin = await authenticate(
      settings.databaseUrl,
      (await login(settings.databaseUrl, `rv_admin_${suffix}`, "admin-pass")).token,
    );

    const ownerUser = await createUser(
      settings.databaseUrl,
      { username: `rv_po_${suffix}`, password: "po-pass", role: "product_owner" },
      admin,
    );
    const reviewerUser = await createUser(
      settings.databaseUrl,
      { username: `rv_po2_${suffix}`, password: "po-pass", role: "product_owner" },
      admin,
    );
    const managerUser = await createUser(
      settings.databaseUrl,
      { username: `rv_em_${suffix}`, password: "em-pass", role: "engineering_manager" },
      admin,
    );
    const managerTwo = await createUser(
      settings.databaseUrl,
      { username: `rv_em2_${suffix}`, password: "em-pass", role: "engineering_manager" },
      admin,
    );
    const securityUser = await createUser(
      settings.databaseUrl,
      { username: `rv_sec_${suffix}`, password: "sec-pass", role: "security_reviewer" },
      admin,
    );
    const architectUser = await createUser(
      settings.databaseUrl,
      { username: `rv_arc_${suffix}`, password: "arc-pass", role: "architect" },
      admin,
    );

    const owner = (await login(settings.databaseUrl, ownerUser.username, "po-pass")).user;
    const reviewer = (await login(settings.databaseUrl, reviewerUser.username, "po-pass")).user;
    const manager = (await login(settings.databaseUrl, managerUser.username, "em-pass")).user;
    const managerDelegate = (await login(settings.databaseUrl, managerTwo.username, "em-pass")).user;
    const security = (await login(settings.databaseUrl, securityUser.username, "sec-pass")).user;
    const architect = (await login(settings.databaseUrl, architectUser.username, "arc-pass")).user;

    const project = await createProject(settings.databaseUrl, { key: `rv-${suffix}` }, admin);

    const requirement = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "REQUIREMENT", title: "Cancel", content: "Cancel within 30 minutes." },
      owner,
    );
    await transitionWorkflow(settings.databaseUrl, requirement.key, "submit", owner);
    await expect(recordReviewDecision(settings.databaseUrl, requirement.key, "approve", owner)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    const withFinding = await addReviewFinding(
      settings.databaseUrl,
      requirement.key,
      { severity: "HIGH", summary: "Missing unpaid-order constraint" },
      reviewer,
    );
    expect(withFinding.findings).toHaveLength(1);
    await expect(recordReviewDecision(settings.databaseUrl, requirement.key, "approve", reviewer)).rejects.toBeInstanceOf(
      ConflictError,
    );

    const toEscalate = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "REQUIREMENT", title: "Escalate me", content: "Needs a manager." },
      admin,
    );
    await transitionWorkflow(settings.databaseUrl, toEscalate.key, "submit", admin);
    const escalated = await escalateApproval(
      settings.databaseUrl,
      toEscalate.key,
      { toRole: "engineering_manager", to: manager.username },
      reviewer,
    );
    expect(escalated.requests[0]?.requiredRole).toBe("engineering_manager");
    expect(escalated.requests[0]?.escalatedFromRole).toBe("product_owner");
    const requirementApproved = await recordReviewDecision(settings.databaseUrl, toEscalate.key, "approve", manager);
    expect(requirementApproved.state).toBe("APPROVED");

    const code = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "CODE", title: "Cancel service", content: "function cancel() {}" },
      admin,
    );
    const submittedCode = await transitionWorkflow(settings.databaseUrl, code.key, "submit", admin);
    expect(submittedCode.review?.requests.map((row) => `${row.requiredRole}:${row.status}`)).toEqual([
      "engineering_manager:PENDING",
      "security_reviewer:PENDING",
    ]);
    const delegated = await delegateApproval(
      settings.databaseUrl,
      code.key,
      { to: managerDelegate.username, role: "engineering_manager" },
      manager,
    );
    expect(delegated.requests[0]?.assigneeUsername).toBe(managerDelegate.username);
    await expect(recordReviewDecision(settings.databaseUrl, code.key, "approve", manager)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    const partial = await recordReviewDecision(settings.databaseUrl, code.key, "approve", managerDelegate);
    expect(partial.state).toBe("IN_REVIEW");
    expect(partial.review?.requests.map((row) => row.status)).toEqual(["APPROVED", "PENDING"]);
    const codeApproved = await recordReviewDecision(settings.databaseUrl, code.key, "approve", security);
    expect(codeApproved.state).toBe("APPROVED");

    const architecture = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "ARCHITECTURE", title: "Cancel flow", content: "PO -> service -> DB" },
      admin,
    );
    const submittedArchitecture = await transitionWorkflow(settings.databaseUrl, architecture.key, "submit", admin);
    expect(submittedArchitecture.review?.requests.map((row) => `${row.requiredRole}:${row.status}`)).toEqual([
      "architect:PENDING",
      "engineering_manager:BLOCKED",
    ]);
    await expect(recordReviewDecision(settings.databaseUrl, architecture.key, "approve", manager)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    const afterArchitect = await recordReviewDecision(settings.databaseUrl, architecture.key, "approve", architect);
    expect(afterArchitect.state).toBe("IN_REVIEW");
    expect(afterArchitect.review?.requests.map((row) => row.status)).toEqual(["APPROVED", "PENDING"]);
    const architectureApproved = await recordReviewDecision(settings.databaseUrl, architecture.key, "approve", manager);
    expect(architectureApproved.state).toBe("APPROVED");

    const expired = await createArtifact(
      settings.databaseUrl,
      { project: project.key, type: "REQUIREMENT", title: "Expire", content: "Must expire." },
      admin,
    );
    await transitionWorkflow(settings.databaseUrl, expired.key, "submit", admin, "", { dueAt: new Date(Date.now() - 1000) });
    await expect(recordReviewDecision(settings.databaseUrl, expired.key, "approve", reviewer)).rejects.toBeInstanceOf(
      ConflictError,
    );
    const shown = await getReview(settings.databaseUrl, expired.key, reviewer);
    expect(shown.requests[0]?.dueAt).toBeTruthy();
  },
  30_000,
);
});
