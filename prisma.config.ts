import { defineConfig, env } from 'prisma/config'

// Prisma 7 movió la connection URL fuera de schema.prisma. Este archivo solo
// lo usa la CLI (migrate/studio/db push) — PrismaClient en runtime recibe su
// propio driver adapter, ver packages/utils/src/prisma-adapter.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
