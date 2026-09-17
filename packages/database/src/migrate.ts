import { applyMigrations } from "./index.ts";
import { createSettings } from "@setwin/config";

const settings = createSettings();
await applyMigrations(settings.databaseUrl);
