import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type StoredSession = {
  token: string;
  username: string;
};

export async function readStoredToken(dataDir: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path.join(dataDir, "session.json"), "utf8");
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.token;
  } catch {
    return undefined;
  }
}

export async function writeStoredSession(dataDir: string, token: string, username: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(
    path.join(dataDir, "session.json"),
    `${JSON.stringify({ token, username } satisfies StoredSession, null, 2)}\n`,
    "utf8",
  );
}
