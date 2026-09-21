import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type RoleTaskSkill = {
  id: string;
  title: string;
  whenToUse: string;
  instructions: string[];
};

export type RoleSkill = {
  role: string;
  displayName: string;
  mission: string;
  skills: string[];
  guardrails: string[];
  outputs: string[];
  defaultArtifactType: string;
  tasks: RoleTaskSkill[];
  sourcePath: string;
};

type FrontMatter = {
  role: string;
  displayName: string;
  defaultArtifactType: string;
};

const SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "skills");

function parseFrontMatter(raw: string): { meta: FrontMatter; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Skill markdown missing front matter");
  }
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx <= 0) {
      continue;
    }
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  if (!meta.role || !meta.displayName || !meta.defaultArtifactType) {
    throw new Error("Skill front matter requires role, displayName, defaultArtifactType");
  }
  return {
    meta: {
      role: meta.role,
      displayName: meta.displayName,
      defaultArtifactType: meta.defaultArtifactType,
    },
    body: match[2],
  };
}

function section(body: string, heading: string): string {
  const pattern = new RegExp(`## ${heading}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`, "i");
  return body.match(pattern)?.[1]?.trim() ?? "";
}

function bullets(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function parseTasks(body: string): RoleTaskSkill[] {
  const tasks: RoleTaskSkill[] = [];
  const taskBlocks = body.split(/\r?\n## Task:\s*/i).slice(1);
  for (const block of taskBlocks) {
    const lines = block.split(/\r?\n/);
    const id = (lines[0] ?? "").trim();
    if (!id) {
      continue;
    }
    const rest = lines.slice(1).join("\n");
    const title = rest.match(/\*\*Title:\*\*\s*(.+)/i)?.[1]?.trim() ?? id;
    const whenToUse = rest.match(/\*\*When:\*\*\s*(.+)/i)?.[1]?.trim() ?? "";
    const instructions = bullets(rest);
    tasks.push({ id, title, whenToUse, instructions });
  }
  return tasks;
}

function loadSharedGuardrails(): string[] {
  const sharedPath = path.join(SKILLS_DIR, "_shared.md");
  const raw = readFileSync(sharedPath, "utf8");
  return bullets(raw);
}

function loadRoleSkillFile(filePath: string, sharedGuardrails: string[]): RoleSkill {
  const raw = readFileSync(filePath, "utf8");
  const { meta, body } = parseFrontMatter(raw);
  const mission =
    body.match(/# Mission\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/i)?.[1]?.trim().replace(/\s+/g, " ") ?? "";
  return {
    role: meta.role,
    displayName: meta.displayName,
    defaultArtifactType: meta.defaultArtifactType,
    mission,
    skills: bullets(section(body, "Skills")),
    guardrails: [...sharedGuardrails, ...bullets(section(body, "Guardrails"))],
    outputs: bullets(section(body, "Outputs")),
    tasks: parseTasks(body),
    sourcePath: filePath,
  };
}

function loadAllRoleSkills(): Record<string, RoleSkill> {
  const shared = loadSharedGuardrails();
  const files = readdirSync(SKILLS_DIR)
    .filter((name) => name.endsWith(".md") && !name.startsWith("_"))
    .sort();
  const roles: Record<string, RoleSkill> = {};
  for (const file of files) {
    const skill = loadRoleSkillFile(path.join(SKILLS_DIR, file), shared);
    roles[skill.role] = skill;
  }
  if (!roles.product_owner) {
    throw new Error(`No role skills loaded from ${SKILLS_DIR}`);
  }
  return roles;
}

let cached: Record<string, RoleSkill> | null = null;

export function getSkillsDirectory(): string {
  return SKILLS_DIR;
}

export function reloadRoleSkills(): Record<string, RoleSkill> {
  cached = loadAllRoleSkills();
  return cached;
}

export function getRoleSkillsCatalog(): Record<string, RoleSkill> {
  if (!cached) {
    cached = loadAllRoleSkills();
  }
  return cached;
}

/** Snapshot of loaded markdown skills (same shape as the former ROLE_SKILLS object). */
export const ROLE_SKILLS: Record<string, RoleSkill> = new Proxy({} as Record<string, RoleSkill>, {
  get(_target, prop: string | symbol) {
    if (typeof prop !== "string") {
      return undefined;
    }
    return getRoleSkillsCatalog()[prop];
  },
  ownKeys() {
    return Reflect.ownKeys(getRoleSkillsCatalog());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const value = getRoleSkillsCatalog()[String(prop)];
    if (value === undefined) {
      return undefined;
    }
    return { configurable: true, enumerable: true, writable: false, value };
  },
});

export type ScrumRole = string;

export const SCRUM_ROLES: string[] = [];

function refreshRoleList(): void {
  const catalog = getRoleSkillsCatalog();
  SCRUM_ROLES.length = 0;
  SCRUM_ROLES.push(...Object.keys(catalog));
}

refreshRoleList();

export function getRoleSkill(role: string): RoleSkill {
  const key = role.trim().toLowerCase();
  const skill = getRoleSkillsCatalog()[key];
  if (!skill) {
    throw new Error(`Unknown role skill: ${role}`);
  }
  return skill;
}

export function listRoleSkills(): RoleSkill[] {
  return SCRUM_ROLES.map((role) => getRoleSkill(role));
}

export function getRoleTask(role: string, taskId: string): RoleTaskSkill {
  const skill = getRoleSkill(role);
  const task = skill.tasks.find((row) => row.id === taskId);
  if (!task) {
    throw new Error(`Unknown task ${taskId} for role ${role}`);
  }
  return task;
}

/** Role that owns revision for a given artifact type. */
export function roleForArtifactType(artifactType: string): string {
  const type = artifactType.trim().toUpperCase();
  const map: Record<string, string> = {
    STORY: "product_owner",
    REQUIREMENT: "product_owner",
    EPIC: "product_owner",
    FEATURE: "product_owner",
    GHERKIN: "qe",
    TEST: "qe",
    ARCHITECTURE: "architect",
    DESIGN: "developer",
    CODE: "developer",
    COMPONENT: "architect",
    DECISION: "reviewer",
  };
  return map[type] ?? "reviewer";
}

/** Build the system prompt used as AI guidelines + guardrails for a role (optional task). */
export function buildRoleSystemPrompt(role: string, taskId?: string): string {
  const skill = getRoleSkill(role);
  const lines = [
    `You are the SETwin ${skill.displayName} agent.`,
    `Mission: ${skill.mission}`,
    "",
    "Skills:",
    ...skill.skills.map((row) => `- ${row}`),
    "",
    "Guardrails:",
    ...skill.guardrails.map((row) => `- ${row}`),
    "",
    "Expected outputs:",
    ...skill.outputs.map((row) => `- ${row}`),
  ];
  if (taskId) {
    const task = getRoleTask(role, taskId);
    lines.push(
      "",
      `Active task: ${task.title}`,
      `When: ${task.whenToUse}`,
      "Task instructions:",
      ...task.instructions.map((row) => `- ${row}`),
    );
  }
  lines.push("", "Respond with content suitable for a SETwin DRAFT artifact. Never approve.");
  return lines.join("\n");
}
