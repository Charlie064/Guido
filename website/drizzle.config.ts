import { defineConfig } from "drizzle-kit";

// Used only to render the raw CREATE TABLE SQL for worker/db/schema.ts
// (`npx drizzle-kit generate --config drizzle.config.ts`) — the project
// keeps hand-maintained SQL files under migrations/ applied via `wrangler
// d1 migrations apply` (see package.json's db:migrate:* scripts), not
// drizzle-kit's own migration journal, so its output here is a source to
// copy from, not something applied directly.
export default defineConfig({
  dialect: "sqlite",
  schema: "./worker/db/schema.ts",
  out: "./.drizzle-scratch",
});
