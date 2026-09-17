import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  authSessions,
  permissions,
  rolePermissions,
  roles,
  teamMembers,
  teams,
  userRoles,
  users,
  withDatabase,
} from "@setwin/database";
import { DEFAULT_ROLES, PERMISSIONS, type PermissionKey } from "./catalog.ts";
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError } from "./errors.ts";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "./passwords.ts";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type Principal = {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
};

export type PublicUser = {
  id: string;
  username: string;
  displayName: string;
  disabled: boolean;
  roles: string[];
};

export async function seedIdentityCatalog(databaseUrl: string): Promise<void> {
  await withDatabase(databaseUrl, async ({ db }) => {
    const now = new Date();
    for (const permission of PERMISSIONS) {
      await db
        .insert(permissions)
        .values({
          id: randomUUID(),
          key: permission.key,
          description: permission.description,
        })
        .onConflictDoNothing({ target: permissions.key });
    }

    const allPermissionRows = await db.select().from(permissions);
    const permissionByKey = new Map(allPermissionRows.map((row) => [row.key, row]));

    for (const role of DEFAULT_ROLES) {
      await db
        .insert(roles)
        .values({
          id: randomUUID(),
          name: role.name,
          description: role.description,
          createdAt: now,
        })
        .onConflictDoNothing({ target: roles.name });
      const stored = (await db.select().from(roles).where(eq(roles.name, role.name)))[0];
      if (!stored) {
        continue;
      }

      const assignedKeys =
        role.permissions === "all" ? allPermissionRows.map((row) => row.key) : role.permissions;
      for (const key of assignedKeys) {
        const permission = permissionByKey.get(key);
        if (!permission) {
          continue;
        }
        await db
          .insert(rolePermissions)
          .values({ roleId: stored.id, permissionId: permission.id })
          .onConflictDoNothing();
      }
    }
  });
}

export async function createUser(
  databaseUrl: string,
  input: { username: string; password: string; displayName?: string; role?: string },
  actor?: Principal,
): Promise<PublicUser> {
  const username = input.username.trim().toLowerCase();
  if (!username || !input.password) {
    throw new ConflictError("Username and password are required");
  }

  return withDatabase(databaseUrl, async (client) => {
    const existingUsers = await client.db.select({ id: users.id }).from(users);
    if (existingUsers.length === 0) {
      return insertUser(client, input, username, input.role ?? "administrator");
    }
    await assertPermission(client, actor, "admin:manage_users");
    return insertUser(client, input, username, input.role);
  });
}

export async function listUsers(databaseUrl: string, actor?: Principal): Promise<PublicUser[]> {
  return withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, "identity:user:view");
    const rows = await client.db.select().from(users);
    const result: PublicUser[] = [];
    for (const row of rows) {
      result.push(await toPublicUser(client, row));
    }
    return result;
  });
}

export async function getUserByUsername(
  databaseUrl: string,
  username: string,
  actor?: Principal,
): Promise<PublicUser> {
  return withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, "identity:user:view");
    const row = (
      await client.db.select().from(users).where(eq(users.username, username.trim().toLowerCase()))
    )[0];
    if (!row) {
      throw new NotFoundError(`User not found: ${username}`);
    }
    return toPublicUser(client, row);
  });
}

export async function assignRole(
  databaseUrl: string,
  username: string,
  roleName: string,
  actor?: Principal,
): Promise<PublicUser> {
  return withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, "admin:manage_roles");
    const user = (
      await client.db.select().from(users).where(eq(users.username, username.trim().toLowerCase()))
    )[0];
    if (!user) {
      throw new NotFoundError(`User not found: ${username}`);
    }
    const role = (await client.db.select().from(roles).where(eq(roles.name, roleName)))[0];
    if (!role) {
      throw new NotFoundError(`Role not found: ${roleName}`);
    }
    const existing = await client.db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, user.id), eq(userRoles.roleId, role.id)));
    if (!existing[0]) {
      await client.db.insert(userRoles).values({ userId: user.id, roleId: role.id });
    }
    return toPublicUser(client, user);
  });
}

export async function listRoles(databaseUrl: string): Promise<Array<{ name: string; description: string }>> {
  return withDatabase(databaseUrl, async ({ db }) => {
    const rows = await db.select().from(roles);
    return rows.map((row) => ({ name: row.name, description: row.description }));
  });
}

export async function createTeam(
  databaseUrl: string,
  input: { name: string; description?: string },
  actor?: Principal,
): Promise<{ id: string; name: string; description: string }> {
  return withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, "team:manage");
    const name = input.name.trim();
    const existing = (await client.db.select().from(teams).where(eq(teams.name, name)))[0];
    if (existing) {
      throw new ConflictError(`Team already exists: ${name}`);
    }
    const team = {
      id: randomUUID(),
      name,
      description: input.description ?? "",
      createdAt: new Date(),
    };
    await client.db.insert(teams).values(team);
    return { id: team.id, name: team.name, description: team.description };
  });
}

export async function addTeamMember(
  databaseUrl: string,
  teamName: string,
  username: string,
  actor?: Principal,
): Promise<void> {
  await withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, "team:manage");
    const team = (await client.db.select().from(teams).where(eq(teams.name, teamName)))[0];
    if (!team) {
      throw new NotFoundError(`Team not found: ${teamName}`);
    }
    const user = (
      await client.db.select().from(users).where(eq(users.username, username.trim().toLowerCase()))
    )[0];
    if (!user) {
      throw new NotFoundError(`User not found: ${username}`);
    }
    const existing = await client.db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.userId, user.id)));
    if (!existing[0]) {
      await client.db.insert(teamMembers).values({ teamId: team.id, userId: user.id });
    }
  });
}

export async function listTeams(
  databaseUrl: string,
  actor?: Principal,
): Promise<Array<{ name: string; description: string; members: string[] }>> {
  return withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, "team:view");
    const teamRows = await client.db.select().from(teams);
    const result = [];
    for (const team of teamRows) {
      const memberRows = await client.db
        .select({ username: users.username })
        .from(teamMembers)
        .innerJoin(users, eq(users.id, teamMembers.userId))
        .where(eq(teamMembers.teamId, team.id));
      result.push({
        name: team.name,
        description: team.description,
        members: memberRows.map((row) => row.username),
      });
    }
    return result;
  });
}

export async function login(
  databaseUrl: string,
  username: string,
  password: string,
): Promise<{ token: string; user: Principal }> {
  return withDatabase(databaseUrl, async (client) => {
    const user = (
      await client.db.select().from(users).where(eq(users.username, username.trim().toLowerCase()))
    )[0];
    if (!user || user.disabled) {
      throw new AuthenticationError("Invalid username or password");
    }
    const ok = await verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!ok) {
      throw new AuthenticationError("Invalid username or password");
    }
    const token = newSessionToken();
    const now = new Date();
    await client.db.insert(authSessions).values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      revokedAt: null,
    });
    return { token, user: await toPrincipal(client, user) };
  });
}

export async function authenticate(databaseUrl: string, token: string): Promise<Principal> {
  if (!token) {
    throw new AuthenticationError();
  }
  return withDatabase(databaseUrl, async (client) => {
    const now = new Date();
    const session = (
      await client.db
        .select()
        .from(authSessions)
        .where(
          and(
            eq(authSessions.tokenHash, hashToken(token)),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now),
          ),
        )
    )[0];
    if (!session) {
      throw new AuthenticationError("Invalid or expired session");
    }
    const user = (await client.db.select().from(users).where(eq(users.id, session.userId)))[0];
    if (!user || user.disabled) {
      throw new AuthenticationError("Invalid or expired session");
    }
    return toPrincipal(client, user);
  });
}

export async function requirePermission(
  databaseUrl: string,
  actor: Principal | undefined,
  permission: PermissionKey,
): Promise<Principal> {
  return withDatabase(databaseUrl, async (client) => {
    await assertPermission(client, actor, permission);
    return actor as Principal;
  });
}

type DbClient = Parameters<Parameters<typeof withDatabase>[1]>[0];

async function insertUser(
  client: DbClient,
  input: { password: string; displayName?: string },
  username: string,
  roleName?: string,
): Promise<PublicUser> {
  const existing = (await client.db.select().from(users).where(eq(users.username, username)))[0];
  if (existing) {
    throw new ConflictError(`User already exists: ${username}`);
  }
  const secret = await hashPassword(input.password);
  const now = new Date();
  const user = {
    id: randomUUID(),
    username,
    displayName: input.displayName?.trim() || username,
    passwordHash: secret.hash,
    passwordSalt: secret.salt,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };
  await client.db.insert(users).values(user);
  if (roleName) {
    const role = (await client.db.select().from(roles).where(eq(roles.name, roleName)))[0];
    if (!role) {
      throw new NotFoundError(`Role not found: ${roleName}`);
    }
    await client.db.insert(userRoles).values({ userId: user.id, roleId: role.id });
  }
  return toPublicUser(client, user);
}

async function assertPermission(
  client: DbClient,
  actor: Principal | undefined,
  permission: PermissionKey,
): Promise<void> {
  if (!actor) {
    throw new AuthenticationError();
  }
  const principal = await loadPrincipalById(client, actor.id);
  if (!principal.permissions.includes(permission)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
}

async function loadPrincipalById(client: DbClient, userId: string): Promise<Principal> {
  const user = (await client.db.select().from(users).where(eq(users.id, userId)))[0];
  if (!user) {
    throw new AuthenticationError();
  }
  return toPrincipal(client, user);
}

async function toPrincipal(
  client: DbClient,
  user: typeof users.$inferSelect,
): Promise<Principal> {
  const roleRows = await client.db
    .select({ name: roles.name, key: permissions.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(userRoles.userId, user.id));
  const roleNames = [...new Set(roleRows.map((row) => row.name))];
  const permissionKeys = [...new Set(roleRows.map((row) => row.key).filter((key): key is string => Boolean(key)))];
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    roles: roleNames,
    permissions: permissionKeys,
  };
}

async function toPublicUser(client: DbClient, user: typeof users.$inferSelect): Promise<PublicUser> {
  const principal = await toPrincipal(client, user);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    disabled: user.disabled,
    roles: principal.roles,
  };
}
