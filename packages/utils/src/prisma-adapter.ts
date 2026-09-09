import { PrismaPg } from '@prisma/adapter-pg'

// Prisma 7 quitó `datasource.url` de schema.prisma — PrismaClient ya no arma su
// conexión solo con DATABASE_URL, necesita un driver adapter explícito. Cada
// servicio sigue haciendo `new PrismaClient({ adapter: createPgAdapter() })`
// como antes hacía `new PrismaClient()`; este helper solo centraliza cómo se
// arma ese adapter para no repetir el `new PrismaPg(...)` en cada archivo.
export function createPgAdapter(): PrismaPg {
  return new PrismaPg({ connectionString: process.env.DATABASE_URL })
}
