export {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "./errors.ts";
export { PERMISSIONS, DEFAULT_ROLES, type PermissionKey } from "./catalog.ts";
export { hashPassword, verifyPassword } from "./passwords.ts";
export {
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
  requirePermission,
  seedIdentityCatalog,
  type Principal,
  type PublicUser,
} from "./service.ts";
