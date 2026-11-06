import "dotenv/config";
import { defineConfig } from "prisma/config";

const isGenerateCommand = process.argv.some((argument) => argument === "generate");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl && !isGenerateCommand) {
  throw new Error("DATABASE_URL is required for Prisma database operations.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Client generation needs the schema only and never connects to this URL.
    url: databaseUrl ?? "postgresql://localhost:5432/imara_care",
  },
});
