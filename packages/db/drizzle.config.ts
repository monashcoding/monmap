import { defineConfig } from "drizzle-kit";
import { DATABASE_URL } from "./src/env.ts";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: DATABASE_URL },
  casing: "snake_case",
});
