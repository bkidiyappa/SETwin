import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Command, CommanderError } from "commander";
import {
  VERSION,
  getLogger,
  getSettings,
  setCorrelationId,
  setupLogging,
} from "@setwin/config";
import { buildStatus, formatInitResult, formatStatus, initialize } from "@setwin/core";
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
  addTeamMember,
  assignRole,
  authenticate,
  createTeam,
  createUser,
  getUserByUsername,
  listRoles,
  listTeams,
  listUsers,
  login,
  type Principal,
} from "@setwin/auth";
import { readStoredToken, writeStoredSession } from "./session.ts";
import {
  createArtifact,
  createArtifactVersion,
  createGherkin,
  createProject,
  createRelationship,
  getArtifact,
  getGherkin,
  getProject,
  listArtifacts,
  listGherkin,
  listProjects,
  listRelationships,
  parseGherkin,
  getWorkflow,
  listApprovalPolicies,
  listWorkflowPolicies,
  addReviewFinding,
  delegateApproval,
  escalateApproval,
  getReview,
  recordReviewDecision,
  transitionWorkflow,
} from "@setwin/twin";

export type CliIo = {
  log: (message: string) => void;
  error: (message: string) => void;
};

export function createProgram(io: CliIo = { log: console.log, error: console.error }): Command {
  const program = new Command();
  program
    .name("setwin")
    .description(
      "SETwin - Software Engineering Twin. AI proposes. SETwin remembers. Roles review. Humans approve.",
    )
    .version(`setwin ${VERSION}`, "-V, --version", "Show the SETwin version and exit.")
    .option("--token <token>", "Session token. Defaults to SETWIN_TOKEN or data/session.json.")
    .helpOption("-h, --help", "Show this message and exit.")
    .showHelpAfterError()
    .helpCommand(false)
    .exitOverride()
    .configureOutput({
      writeOut: (chunk) => io.log(chunk.replace(/\s+$/, "")),
      writeErr: (chunk) => io.error(chunk.replace(/\s+$/, "")),
    });

  program.hook("preAction", () => {
    const settings = getSettings();
    setupLogging(settings.logLevel);
    setCorrelationId(randomUUID());
  });

  program
    .command("status")
    .description("Show configuration health without exposing secrets.")
    .action(async () => {
      const report = await buildStatus();
      getLogger().debug("status requested");
      io.log(formatStatus(report));
    });

  program
    .command("init")
    .description("Create local workspace directories and apply database migrations.")
    .action(async () => {
      const result = await initialize();
      getLogger().debug({ initialized: !result.alreadyInitialized }, "init completed");
      io.log(formatInitResult(result));
      if (!result.databaseReachable) {
        throw new CommanderError(1, "databaseUnreachable", result.message);
      }
    });

  program
    .command("serve")
    .description("Start the SETwin HTTP API.")
    .action(async () => {
      const { startServer } = await import("@setwin/api");
      await startServer();
    });

  program
    .command("login")
    .argument("<username>")
    .option("--password <password>", "Password. Defaults to SETWIN_PASSWORD.")
    .description("Authenticate and store a session token.")
    .action(async (username: string, options: { password: string }) => {
      const password = options.password || process.env.SETWIN_PASSWORD;
      if (!password) {
        throw new ConflictError("Password is required. Pass --password or SETWIN_PASSWORD.");
      }
      const settings = getSettings();
      const result = await login(settings.databaseUrl, username, password);
      await writeStoredSession(settings.dataDir, result.token, result.user.username);
      io.log(`Logged in as ${result.user.username}`);
      io.log(`Roles: ${result.user.roles.join(", ") || "(none)"}`);
    });

  program
    .command("whoami")
    .description("Show the authenticated user.")
    .action(async () => {
      const actor = await requireActor(program);
      io.log(`${actor.username} (${actor.displayName})`);
      io.log(`Roles: ${actor.roles.join(", ") || "(none)"}`);
      io.log(`Permissions: ${actor.permissions.join(", ") || "(none)"}`);
    });

  const user = program.command("user").description("Manage users.");
  user
    .command("create")
    .argument("<username>")
    .requiredOption("--password <password>", "Initial password.")
    .option("--display-name <name>", "Display name.")
    .option("--role <role>", "Role to assign. First user becomes administrator.")
    .description("Create a user.")
    .action(async (username: string, options: { password: string; displayName?: string; role?: string }) => {
      const settings = getSettings();
      const actor = await optionalActor(program);
      const created = await createUser(
        settings.databaseUrl,
        {
          username,
          password: options.password,
          displayName: options.displayName,
          role: options.role,
        },
        actor,
      );
      io.log(`Created user ${created.username}`);
      io.log(`Roles: ${created.roles.join(", ") || "(none)"}`);
    });
  user
    .command("list")
    .description("List users.")
    .action(async () => {
      const settings = getSettings();
      const actor = await requireActor(program);
      const rows = await listUsers(settings.databaseUrl, actor);
      for (const row of rows) {
        io.log(`${row.username}\t${row.displayName}\t${row.roles.join(",")}`);
      }
    });
  user
    .command("show")
    .argument("<username>")
    .description("Show a user.")
    .action(async (username: string) => {
      const actor = await requireActor(program);
      const row = await getUserByUsername(getSettings().databaseUrl, username, actor);
      io.log(`${row.username} (${row.displayName})`);
      io.log(`Roles: ${row.roles.join(", ") || "(none)"}`);
      io.log(`Disabled: ${row.disabled ? "yes" : "no"}`);
    });
  user
    .command("assign-role")
    .argument("<username>")
    .argument("<role>")
    .description("Assign a role to a user.")
    .action(async (username: string, role: string) => {
      const actor = await requireActor(program);
      const updated = await assignRole(getSettings().databaseUrl, username, role, actor);
      io.log(`${updated.username} roles: ${updated.roles.join(", ")}`);
    });

  const role = program.command("role").description("Manage roles.");
  role
    .command("list")
    .description("List roles.")
    .action(async () => {
      const rows = await listRoles(getSettings().databaseUrl);
      for (const row of rows) {
        io.log(`${row.name}\t${row.description}`);
      }
    });

  const team = program.command("team").description("Manage teams.");
  team
    .command("create")
    .argument("<name>")
    .option("--description <text>", "Team description.")
    .description("Create a team.")
    .action(async (name: string, options: { description?: string }) => {
      const actor = await requireActor(program);
      const created = await createTeam(getSettings().databaseUrl, { name, description: options.description }, actor);
      io.log(`Created team ${created.name}`);
    });
  team
    .command("list")
    .description("List teams.")
    .action(async () => {
      const actor = await requireActor(program);
      const rows = await listTeams(getSettings().databaseUrl, actor);
      for (const row of rows) {
        io.log(`${row.name}\t${row.members.join(",")}`);
      }
    });
  team
    .command("add")
    .argument("<team>")
    .argument("<username>")
    .description("Add a user to a team.")
    .action(async (teamName: string, username: string) => {
      const actor = await requireActor(program);
      await addTeamMember(getSettings().databaseUrl, teamName, username, actor);
      io.log(`Added ${username} to ${teamName}`);
    });

  const project = program.command("project").description("Manage projects.");
  project
    .command("create")
    .argument("<key>")
    .option("--name <name>", "Display name.")
    .option("--description <text>", "Project description.")
    .description("Create a project.")
    .action(async (key: string, options: { name?: string; description?: string }) => {
      const actor = await requireActor(program);
      const created = await createProject(
        getSettings().databaseUrl,
        { key, name: options.name, description: options.description },
        actor,
      );
      io.log(`Created project ${created.key}`);
    });
  project
    .command("list")
    .description("List projects.")
    .action(async () => {
      const actor = await requireActor(program);
      const rows = await listProjects(getSettings().databaseUrl, actor);
      for (const row of rows) {
        io.log(`${row.key}\t${row.name}`);
      }
    });
  project
    .command("show")
    .argument("<key>")
    .description("Show a project.")
    .action(async (key: string) => {
      const actor = await requireActor(program);
      const row = await getProject(getSettings().databaseUrl, key, actor);
      io.log(`${row.key} (${row.name})`);
      if (row.description) {
        io.log(row.description);
      }
    });

  const artifact = program.command("artifact").description("Manage artifacts and versions.");
  artifact
    .command("create")
    .requiredOption("--project <key>", "Project key.")
    .requiredOption("--type <type>", "Artifact type, for example REQUIREMENT.")
    .requiredOption("--title <title>", "Title.")
    .option("--content <text>", "Body text.")
    .option("--provenance-source <source>", "Provenance source. Defaults to HUMAN_AUTHORED.")
    .option("--provenance-authority <authority>", "Provenance authority. Defaults to SETWIN.")
    .description("Create an artifact as version 1 DRAFT.")
    .action(
      async (options: {
        project: string;
        type: string;
        title: string;
        content?: string;
        provenanceSource?: string;
        provenanceAuthority?: string;
      }) => {
        const actor = await requireActor(program);
        const created = await createArtifact(getSettings().databaseUrl, options, actor);
        io.log(`${created.key} v${created.currentVersion.version} ${created.currentVersion.status}`);
        io.log(created.currentVersion.title);
      },
    );
  artifact
    .command("list")
    .option("--project <key>", "Filter by project key.")
    .description("List artifacts.")
    .action(async (options: { project?: string }) => {
      const actor = await requireActor(program);
      const rows = await listArtifacts(getSettings().databaseUrl, actor, { project: options.project });
      for (const row of rows) {
        io.log(
          `${row.key}\t${row.type}\t${row.projectKey}\tv${row.currentVersion.version}\t${row.currentVersion.status}\t${row.currentVersion.title}`,
        );
      }
    });
  artifact
    .command("show")
    .argument("<key>")
    .description("Show an artifact, its versions, and provenance.")
    .action(async (key: string) => {
      const actor = await requireActor(program);
      const row = await getArtifact(getSettings().databaseUrl, key, actor);
      io.log(`${row.key}  ${row.type}  ${row.projectKey}`);
      io.log(`Title: ${row.currentVersion.title}`);
      io.log(`Version: ${row.currentVersion.version} ${row.currentVersion.status}`);
      io.log(`Workflow: ${row.currentVersion.workflowState}`);
      io.log(
        `Provenance: ${row.currentVersion.provenance.source} / ${row.currentVersion.provenance.authority}`,
      );
      io.log("Content:");
      io.log(row.currentVersion.content || "(empty)");
      io.log("Versions:");
      for (const version of row.versions) {
        const superseded = version.supersededByVersion ? ` -> v${version.supersededByVersion}` : "";
        io.log(`  v${version.version} ${version.status}${superseded}`);
      }
    });
  artifact
    .command("version")
    .argument("<key>")
    .option("--title <title>", "Replacement title. Defaults to the previous title.")
    .option("--content <text>", "Replacement content. Defaults to the previous content.")
    .option("--provenance-source <source>", "Provenance source. Defaults to HUMAN_AUTHORED.")
    .option("--provenance-authority <authority>", "Provenance authority. Defaults to SETWIN.")
    .description("Create the next DRAFT version. Previous DRAFT versions become SUPERSEDED.")
    .action(
      async (
        key: string,
        options: { title?: string; content?: string; provenanceSource?: string; provenanceAuthority?: string },
      ) => {
        const actor = await requireActor(program);
        const updated = await createArtifactVersion(getSettings().databaseUrl, key, options, actor);
        io.log(`${updated.key} v${updated.currentVersion.version} ${updated.currentVersion.status}`);
      },
    );
  artifact
    .command("relations")
    .argument("<key>")
    .description("List relationships for an artifact.")
    .action(async (key: string) => {
      const actor = await requireActor(program);
      const rows = await listRelationships(getSettings().databaseUrl, key, actor);
      if (rows.length === 0) {
        io.log("(none)");
        return;
      }
      for (const row of rows) {
        const confidence = row.confidence === null ? "" : `\t${row.confidence}`;
        io.log(`${row.fromKey}\t${row.type}\t${row.toKey}\t${row.source}${confidence}`);
      }
    });

  program
    .command("relate")
    .argument("<from>")
    .argument("<type>")
    .argument("<to>")
    .option("--source <source>", "HUMAN, STATIC_ANALYSIS, or AI_INFERRED. Defaults to HUMAN.")
    .option("--confidence <value>", "Required when source is AI_INFERRED.")
    .description("Create a relationship between two artifacts.")
    .action(
      async (from: string, type: string, to: string, options: { source?: string; confidence?: string }) => {
        const actor = await requireActor(program);
        const confidence = options.confidence === undefined ? undefined : Number(options.confidence);
        const created = await createRelationship(
          getSettings().databaseUrl,
          { from, to, type, source: options.source, confidence },
          actor,
        );
        io.log(`${created.fromKey} ${created.type} ${created.toKey} (${created.source})`);
      },
    );

  const gherkin = program.command("gherkin").description("Parse, validate, and store Gherkin.");
  gherkin
    .command("validate")
    .option("--content <text>", "Gherkin source.")
    .option("--file <path>", "Path to a .feature file.")
    .description("Validate Gherkin without saving.")
    .action(async (options: { content?: string; file?: string }) => {
      const parsed = parseGherkin(await readGherkinSource(options));
      io.log(`Valid feature: ${parsed.name}`);
      io.log(`Scenarios: ${parsed.scenarios.length}`);
      io.log(`Steps: ${parsed.scenarios.reduce((sum, scenario) => sum + scenario.steps.length, 0)}`);
    });
  gherkin
    .command("create")
    .requiredOption("--project <key>", "Project key.")
    .option("--content <text>", "Gherkin source.")
    .option("--file <path>", "Path to a .feature file.")
    .option("--title <title>", "Override the Feature name as the artifact title.")
    .option("--requirement <key>", "Requirement this Gherkin VALIDATES.")
    .description("Create a DRAFT Gherkin artifact after validation.")
    .action(
      async (options: {
        project: string;
        content?: string;
        file?: string;
        title?: string;
        requirement?: string;
      }) => {
        const actor = await requireActor(program);
        const created = await createGherkin(
          getSettings().databaseUrl,
          {
            project: options.project,
            content: await readGherkinSource(options),
            title: options.title,
            requirement: options.requirement,
          },
          actor,
        );
        io.log(`${created.artifact.key} v${created.artifact.currentVersion.version} ${created.artifact.currentVersion.status}`);
        io.log(created.feature.name);
        if (created.validates.length > 0) {
          io.log(`Validates: ${created.validates.join(", ")}`);
        }
      },
    );
  gherkin
    .command("list")
    .option("--project <key>", "Filter by project key.")
    .description("List Gherkin artifacts.")
    .action(async (options: { project?: string }) => {
      const actor = await requireActor(program);
      const rows = await listGherkin(getSettings().databaseUrl, actor, { project: options.project });
      for (const row of rows) {
        io.log(
          `${row.artifact.key}\t${row.artifact.projectKey}\tv${row.artifact.currentVersion.version}\t${row.feature.name}`,
        );
      }
    });
  gherkin
    .command("show")
    .argument("<key>")
    .description("Show parsed Gherkin, provenance, and requirement traceability.")
    .action(async (key: string) => {
      const actor = await requireActor(program);
      const row = await getGherkin(getSettings().databaseUrl, key, actor);
      io.log(`${row.artifact.key}  GHERKIN  ${row.artifact.projectKey}`);
      io.log(`Feature: ${row.feature.name}`);
      io.log(`Version: ${row.artifact.currentVersion.version} ${row.artifact.currentVersion.status}`);
      io.log(
        `Provenance: ${row.artifact.currentVersion.provenance.source} / ${row.artifact.currentVersion.provenance.authority}`,
      );
      if (row.validates.length > 0) {
        io.log(`Validates: ${row.validates.join(", ")}`);
      }
      for (const scenario of row.feature.scenarios) {
        io.log(`  ${scenario.keyword}: ${scenario.name}`);
        for (const step of scenario.steps) {
          io.log(`    ${step.keyword} ${step.text}`);
        }
      }
    });
  gherkin
    .command("version")
    .argument("<key>")
    .option("--content <text>", "Replacement Gherkin source.")
    .option("--file <path>", "Path to a .feature file.")
    .description("Create the next DRAFT Gherkin version after validation.")
    .action(async (key: string, options: { content?: string; file?: string }) => {
      const actor = await requireActor(program);
      const updated = await createArtifactVersion(
        getSettings().databaseUrl,
        key,
        { content: await readGherkinSource(options) },
        actor,
      );
      io.log(`${updated.key} v${updated.currentVersion.version} ${updated.currentVersion.status}`);
    });

  const workflow = program.command("workflow").description("Artifact lifecycle transitions and policies.");
  workflow
    .command("show")
    .argument("<key>")
    .description("Show workflow state, allowed actions, and history.")
    .action(async (key: string) => {
      const actor = await requireActor(program);
      const row = await getWorkflow(getSettings().databaseUrl, key, actor);
      io.log(`${row.artifact.key} v${row.artifact.currentVersion.version} ${row.state}`);
      io.log(`Allowed: ${row.allowedActions.join(", ") || "(none)"}`);
      if (row.review) {
        io.log(`Review: ${row.review.status}`);
        io.log(`Requests: ${row.review.requests.map((request) => `${request.requiredRole}:${request.status}`).join(", ") || "(none)"}`);
      }
      if (row.history.length === 0) {
        io.log("History: (none)");
        return;
      }
      io.log("History:");
      for (const event of row.history) {
        const note = event.comment ? ` — ${event.comment}` : "";
        io.log(`  ${event.fromState} -> ${event.toState} (${event.action})${note}`);
      }
    });
  workflow
    .command("submit")
    .argument("<key>")
    .option("--comment <text>", "Transition comment.")
    .option("--due <when>", "Optional approval due date (ISO-8601).")
    .description("Submit a DRAFT version for review.")
    .action(async (key: string, options: { comment?: string; due?: string }) => {
      const actor = await requireActor(program);
      const row = await transitionWorkflow(
        getSettings().databaseUrl,
        key,
        "submit",
        actor,
        options.comment,
        { dueAt: parseDue(options.due) },
      );
      io.log(`${row.artifact.key} ${row.state}`);
      if (row.review) {
        io.log(`Requests: ${row.review.requests.map((request) => `${request.requiredRole}:${request.status}`).join(", ")}`);
      }
    });
  workflow
    .command("approve")
    .argument("<key>")
    .option("--comment <text>", "Transition comment.")
    .description("Approve the current IN_REVIEW version. Requires the policy role.")
    .action(async (key: string, options: { comment?: string }) => {
      const actor = await requireActor(program);
      const row = await transitionWorkflow(getSettings().databaseUrl, key, "approve", actor, options.comment);
      io.log(`${row.artifact.key} ${row.state}`);
    });
  workflow
    .command("reject")
    .argument("<key>")
    .option("--comment <text>", "Transition comment.")
    .description("Reject the current IN_REVIEW version.")
    .action(async (key: string, options: { comment?: string }) => {
      const actor = await requireActor(program);
      const row = await transitionWorkflow(getSettings().databaseUrl, key, "reject", actor, options.comment);
      io.log(`${row.artifact.key} ${row.state}`);
    });
  workflow
    .command("request-changes")
    .argument("<key>")
    .option("--comment <text>", "Transition comment.")
    .description("Request changes on the current IN_REVIEW version.")
    .action(async (key: string, options: { comment?: string }) => {
      const actor = await requireActor(program);
      const row = await transitionWorkflow(getSettings().databaseUrl, key, "request_changes", actor, options.comment);
      io.log(`${row.artifact.key} ${row.state}`);
    });
  workflow
    .command("policies")
    .description("List workflow policies.")
    .action(async () => {
      const actor = await requireActor(program);
      const rows = await listWorkflowPolicies(getSettings().databaseUrl, actor);
      for (const row of rows) {
        io.log(`${row.artifactType}\t${row.action}\t${row.requiredPermission}\t${row.requiredRole ?? "-"}`);
      }
    });

  const review = program.command("review").description("Reviews, findings, and approval requests.");
  review
    .command("show")
    .argument("<key>")
    .description("Show the open or latest review, findings, and approval requests.")
    .action(async (key: string) => {
      const actor = await requireActor(program);
      printReview(io, await getReview(getSettings().databaseUrl, key, actor));
    });
  review
    .command("finding")
    .argument("<key>")
    .requiredOption("--summary <text>", "Finding summary.")
    .option("--severity <level>", "INFO, LOW, MEDIUM, or HIGH. Defaults to INFO.")
    .description("Add a finding to the open review.")
    .action(async (key: string, options: { summary: string; severity?: string }) => {
      const actor = await requireActor(program);
      const row = await addReviewFinding(
        getSettings().databaseUrl,
        key,
        { summary: options.summary, severity: options.severity ?? "INFO" },
        actor,
      );
      io.log(`${row.artifactKey} finding added (${row.findings.at(-1)?.severity ?? "INFO"})`);
    });
  review
    .command("approve")
    .argument("<key>")
    .option("--comment <text>", "Decision comment.")
    .description("Record an approval decision. Completes only when all required requests are approved.")
    .action(async (key: string, options: { comment?: string }) => {
      const actor = await requireActor(program);
      const row = await recordReviewDecision(getSettings().databaseUrl, key, "approve", actor, options.comment);
      io.log(`${row.artifact.key} ${row.state}`);
    });
  review
    .command("reject")
    .argument("<key>")
    .option("--comment <text>", "Decision comment.")
    .description("Reject the open review.")
    .action(async (key: string, options: { comment?: string }) => {
      const actor = await requireActor(program);
      const row = await recordReviewDecision(getSettings().databaseUrl, key, "reject", actor, options.comment);
      io.log(`${row.artifact.key} ${row.state}`);
    });
  review
    .command("request-changes")
    .argument("<key>")
    .option("--comment <text>", "Decision comment.")
    .description("Request changes on the open review.")
    .action(async (key: string, options: { comment?: string }) => {
      const actor = await requireActor(program);
      const row = await recordReviewDecision(getSettings().databaseUrl, key, "request_changes", actor, options.comment);
      io.log(`${row.artifact.key} ${row.state}`);
    });
  review
    .command("delegate")
    .argument("<key>")
    .requiredOption("--to <username>", "User who will decide the pending request.")
    .option("--role <role>", "Required role when more than one request is pending.")
    .description("Delegate a pending approval request to another user with the required role.")
    .action(async (key: string, options: { to: string; role?: string }) => {
      const actor = await requireActor(program);
      const row = await delegateApproval(getSettings().databaseUrl, key, options, actor);
      const assigned = row.requests.find((request) => request.assigneeUsername === options.to);
      io.log(`${row.artifactKey} delegated ${assigned?.requiredRole ?? ""} to ${options.to}`);
    });
  review
    .command("escalate")
    .argument("<key>")
    .requiredOption("--to-role <role>", "Role to escalate the pending request to.")
    .option("--to <username>", "Optional assignee who holds the new role.")
    .description("Escalate a pending approval request to another role.")
    .action(async (key: string, options: { toRole: string; to?: string }) => {
      const actor = await requireActor(program);
      const row = await escalateApproval(getSettings().databaseUrl, key, options, actor);
      io.log(`${row.artifactKey} escalated to ${options.toRole}`);
    });
  review
    .command("policies")
    .description("List approval policies.")
    .action(async () => {
      const actor = await requireActor(program);
      const rows = await listApprovalPolicies(getSettings().databaseUrl, actor);
      for (const row of rows) {
        io.log(`${row.artifactType}\t${row.requiredRole}\t${row.mode}\t${row.sortOrder}`);
      }
    });

  return program;
}

function printReview(io: CliIo, row: Awaited<ReturnType<typeof getReview>>): void {
  io.log(`${row.artifactKey} v${row.version} ${row.workflowState} review:${row.status}`);
  if (row.findings.length === 0) {
    io.log("Findings: (none)");
  } else {
    io.log("Findings:");
    for (const finding of row.findings) {
      const resolved = finding.resolved ? "resolved" : "open";
      io.log(`  ${finding.severity}\t${resolved}\t${finding.summary}`);
    }
  }
  io.log("Requests:");
  for (const request of row.requests) {
    const assignee = request.assigneeUsername ?? "-";
    const due = request.dueAt ? request.dueAt.toISOString() : "-";
    const escalated = request.escalatedFromRole ? ` from ${request.escalatedFromRole}` : "";
    io.log(`  ${request.requiredRole}\t${request.status}\tassignee=${assignee}\tdue=${due}${escalated}`);
    for (const decision of request.decisions) {
      const note = decision.comment ? ` — ${decision.comment}` : "";
      io.log(`    ${decision.decision} by ${decision.actorUsername}${note}`);
    }
  }
}

function parseDue(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const dueAt = new Date(value);
  if (Number.isNaN(dueAt.getTime())) {
    throw new ValidationError(`Invalid due date: ${value}`);
  }
  return dueAt;
}

async function readGherkinSource(options: { content?: string; file?: string }): Promise<string> {
  if (options.file) {
    return readFile(options.file, "utf8");
  }
  if (options.content) {
    return options.content;
  }
  throw new ValidationError("Pass --content or --file.");
}

async function optionalActor(program: Command): Promise<Principal | undefined> {
  const token = await resolveToken(program);
  if (!token) {
    return undefined;
  }
  return authenticate(getSettings().databaseUrl, token);
}

async function requireActor(program: Command): Promise<Principal> {
  const actor = await optionalActor(program);
  if (!actor) {
    throw new AuthenticationError("Login required. Run `setwin login <username> --password ...`.");
  }
  return actor;
}

async function resolveToken(program: Command): Promise<string | undefined> {
  const fromFlag = program.getOptionValue("token") as string | undefined;
  return fromFlag || process.env.SETWIN_TOKEN || (await readStoredToken(getSettings().dataDir));
}

export async function runCli(argv: string[], io?: CliIo): Promise<number> {
  const program = createProgram(io);
  if (argv.length === 0) {
    program.outputHelp();
    return 0;
  }
  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (error) {
    if (error instanceof CommanderError) {
      if (error.code === "commander.helpDisplayed" || error.code === "commander.version") {
        return 0;
      }
      return error.exitCode;
    }
    if (
      error instanceof AuthenticationError ||
      error instanceof AuthorizationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError ||
      error instanceof ValidationError
    ) {
      (io ?? { log: console.log, error: console.error }).error(error.message);
      return error.statusCode === 401 || error.statusCode === 403 ? 1 : 1;
    }
    throw error;
  }
}
