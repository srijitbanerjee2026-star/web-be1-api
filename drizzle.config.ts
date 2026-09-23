import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  tablesFilter: ["users", "events", "registrations", "refresh_tokens"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});