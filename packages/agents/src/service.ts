import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { desc, eq } from "drizzle-orm";
import { completeViaGateway } from "@setwin/ai";
import { recordAuditEvent } from "@setwin/audit";
import { NotFoundError, ValidationError, requirePermission, type Principal } from "@setwin/auth";
import { agentProposals, codingAgentRuns, projects, withDatabase } from "@setwin/database";
import { createArtifact } from "@setwin/twin";

const execFileAsync = promisify(execFile);

export const SCRUM_ROLES = [
  "product_owner",
  "architect",
  "developer",
  "qe",
  "security",
  "sre",
  "release",
  "reviewer",
] as const;

export type ScrumRole = (typeof SCRUM_ROLES)[number];

export const CODING_AGENTS = ["opencode", "openhands", "claude-code", "cursor", "windsurf"] as const;
export type CodingAgentName = (typeof CODING_AGENTS)[number];

const ROLE_PROMPTS: Record<ScrumRole, { artifactType: string; instruction: string }> = {
  product_owner: {
    artifactType: "REQUIREMENT",
    instruction: "Propose a refined requirement with acceptance criteria. Draft only.",
  },
  architect: {
    artifactType: "ARCHITECTURE",
    instruction: "Propose an architecture note covering components and boundaries. Draft only.",
  },
  developer: {
    artifactType: "DESIGN",
    instruction: "Propose an implementation design with modules and interfaces. Draft only.",
  },
  qe: {
    artifactType: "TEST",
    instruction: "Propose a test strategy and key scenarios. Draft only.",
  },
  security: {
    artifactType: "DECISION",
    instruction: "Propose security risks and mitigations. Draft only.",
  },
  sre: {
    artifactType: "DESIGN",
    instruction: "Propose reliability, observability, and operational concerns. Draft only.",
  },
  release: {
    artifactType: "DECISION",
    instruction: "Propose a release checklist and rollout plan. Draft only.",
  },
  reviewer: {
    artifactType: "DECISION",
    instruction: "Propose review findings and questions. Draft only.",
  },
};

export async function proposeAsRole(
  databaseUrl: string,
  input: { project: string; role: string; topic: string },
  actor?: Principal,
): Promise<{
  id: string;
  role: ScrumRole;
  title: string;
  content: string;
  artifactKey: string | null;
  status: string;
}> {
  const principal = await requirePermission(databaseUrl, actor, "agent:propose");
  const role = input.role.trim().toLowerCase() as ScrumRole;
  if (!SCRUM_ROLES.includes(role)) {
    throw new ValidationError(`Unknown scrum role: ${input.role}`);
  }
  const spec = ROLE_PROMPTS[role];
  const ai = await completeViaGateway(
    databaseUrl,
    {
      task: "agent.propose",
      system: `You are the SETwin ${role} agent. ${spec.instruction} Never mark anything approved.`,
      prompt: `Project ${input.project}. Topic: ${input.topic}`,
    },
    principal,
  );
  const content =
    ai.status === "ok" && ai.text.trim()
      ? ai.text.trim()
      : deterministicProposal(role, input.topic);
  const title = `${role} proposal: ${input.topic}`.slice(0, 120);
  let artifactKey: string | null = null;
  try {
    const artifact = await createArtifact(
      databaseUrl,
      {
        project: input.project,
        type: spec.artifactType,
        title,
        content,
        provenanceSource: "AI_INFERRED",
        provenanceAuthority: "SETWIN",
      },
      principal,
    );
    artifactKey = artifact.key;
  } catch {
    artifactKey = null;
  }
  const project = await withDatabase(databaseUrl, async ({ db }) => {
    const row = (await db.select().from(projects).where(eq(projects.key, input.project.trim().toLowerCase())))[0];
    if (!row) {
      throw new NotFoundError(`Project not found: ${input.project}`);
    }
    return row;
  });
  const proposal = {
    id: randomUUID(),
    projectId: project.id,
    role,
    title,
    content,
    artifactType: spec.artifactType,
    artifactKey,
    status: "DRAFT",
    aiActionId: ai.actionId,
    createdBy: principal.id,
    createdAt: new Date(),
  };
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(agentProposals).values(proposal);
  });
  await recordAuditEvent(databaseUrl, {
    action: "agent.propose",
    entityType: "agent_proposal",
    entityId: proposal.id,
    entityKey: artifactKey ?? proposal.id,
    after: { role, status: "DRAFT" },
    actor: principal,
  });
  return {
    id: proposal.id,
    role,
    title,
    content,
    artifactKey,
    status: "DRAFT",
  };
}

export async function listProposals(
  databaseUrl: string,
  actor?: Principal,
): Promise<Array<{ id: string; role: string; title: string; status: string; artifactKey: string | null }>> {
  await requirePermission(databaseUrl, actor, "agent:propose");
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(agentProposals).orderBy(desc(agentProposals.createdAt));
    return rows.map((row) => ({
      id: row.id,
      role: row.role,
      title: row.title,
      status: row.status,
      artifactKey: row.artifactKey,
    }));
  });
}

export type CodingAgentAdapter = {
  name: CodingAgentName;
  isAvailable(): Promise<boolean>;
  invoke(input: { prompt: string; workspacePath?: string }): Promise<{ output: string; status: string; error?: string }>;
};

function cliAdapter(name: CodingAgentName, command: string, argsFor: (prompt: string) => string[]): CodingAgentAdapter {
  return {
    name,
    async isAvailable() {
      try {
        await execFileAsync(command, ["--version"], { windowsHide: true });
        return true;
      } catch {
        return false;
      }
    },
    async invoke(input) {
      try {
        const { stdout, stderr } = await execFileAsync(command, argsFor(input.prompt), {
          cwd: input.workspacePath || process.cwd(),
          windowsHide: true,
          timeout: 30_000,
          maxBuffer: 2 * 1024 * 1024,
        });
        return { output: `${stdout}${stderr}`.trim(), status: "ok" };
      } catch (error) {
        return {
          output: "",
          status: "unavailable",
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createCodingAgentAdapters(): CodingAgentAdapter[] {
  return [
    cliAdapter("opencode", "opencode", (prompt) => ["run", prompt]),
    cliAdapter("openhands", "openhands", (prompt) => ["--task", prompt]),
    cliAdapter("claude-code", "claude", (prompt) => ["-p", prompt]),
    cliAdapter("cursor", "cursor", (prompt) => ["agent", prompt]),
    cliAdapter("windsurf", "windsurf", (prompt) => ["agent", prompt]),
  ];
}

export async function invokeCodingAgent(
  databaseUrl: string,
  input: { agent: string; prompt: string; workspacePath?: string },
  actor?: Principal,
): Promise<{ id: string; agent: string; status: string; output: string; error: string }> {
  const principal = await requirePermission(databaseUrl, actor, "coding_agent:invoke");
  const agent = input.agent.trim().toLowerCase() as CodingAgentName;
  if (!CODING_AGENTS.includes(agent)) {
    throw new ValidationError(`Unknown coding agent: ${input.agent}`);
  }
  const adapter = createCodingAgentAdapters().find((row) => row.name === agent);
  if (!adapter) {
    throw new ValidationError(`No adapter for ${agent}`);
  }
  const available = await adapter.isAvailable();
  const result = available
    ? await adapter.invoke({ prompt: input.prompt, workspacePath: input.workspacePath })
    : { output: "", status: "unavailable", error: `${agent} CLI not found on PATH` };
  const row = {
    id: randomUUID(),
    agent,
    prompt: input.prompt,
    workspacePath: input.workspacePath ?? "",
    status: result.status,
    output: result.output,
    error: result.error ?? "",
    actorId: principal.id,
    createdAt: new Date(),
  };
  await withDatabase(databaseUrl, async ({ db }) => {
    await db.insert(codingAgentRuns).values(row);
  });
  await recordAuditEvent(databaseUrl, {
    action: "coding_agent.invoke",
    entityType: "coding_agent_run",
    entityId: row.id,
    entityKey: agent,
    after: { status: row.status },
    actor: principal,
  });
  return { id: row.id, agent, status: row.status, output: row.output, error: row.error };
}

function deterministicProposal(role: ScrumRole, topic: string): string {
  return [
    `# ${role} draft proposal`,
    "",
    `Topic: ${topic}`,
    "",
    "This DRAFT was produced without a live model response.",
    "It must be reviewed and approved by a human before becoming authoritative.",
    "",
    "## Suggested next steps",
    "- Clarify acceptance criteria",
    "- Link related artifacts in SETwin",
    "- Submit for workflow review",
  ].join("\n");
}
