import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

/** Recorded with each password so the cost can be raised later. Node's historical default. */
export const SCRYPT_PARAMS = "16384,8,1";

function scryptOptions(params: string): { N: number; r: number; p: number } {
  const [n, r, p] = params.split(",").map((part) => Number(part));
  if (!n || !r || !p) {
    return { N: 16384, r: 8, p: 1 };
  }
  return { N: n, r, p };
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string; params: string }> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(password, salt, 64, scryptOptions(SCRYPT_PARAMS))) as Buffer;
  return { hash: derived.toString("hex"), salt, params: SCRYPT_PARAMS };
}

export async function verifyPassword(password: string, hash: string, salt: string, params = SCRYPT_PARAMS): Promise<boolean> {
  const derived = (await scryptAsync(password, salt, 64, scryptOptions(params))) as Buffer;
  const expected = Buffer.from(hash, "hex");
  if (derived.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(derived, expected);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newSessionToken(): string {
  return `stw_${randomBytes(32).toString("hex")}`;
}
