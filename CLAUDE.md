# CLAUDE.md

Guía para Claude Code al trabajar en este repositorio.

## Qué es Racketly

Plataforma todo-en-uno para pádel y pickleball: reservas de canchas, torneos/ligas
con live scoring, ranking ELO, "Find a Partner", comunidad social y academia de
formación. Monorepo Turborepo con apps cliente, microservicios backend en Node.js
y paquetes compartidos. Ver `RACKETLY_ARCHITECTURE.md` para el diseño completo
(módulos funcionales, modelo de negocio, esquema de BD, endpoints, roadmap).

## Arquitectura del monorepo

```
apps/
  mobile/                 React Native + Expo
  web/                    Next.js 15 (App Router) — dev en puerto 3010
packages/
  shared-types/           Tipos/interfaces TS compartidos entre apps y servicios
  utils/                  ELO, fechas, geo, gamificación, encryptPII/decryptPII
  config/                 ESLint config compartida (eslint.config.js)
services/                 Microservicios Express + TypeScript (cada uno independiente)
  api-gateway/            Puerto 3000 — proxy/rate limiting/auth hacia los demás
  auth-service/           Puerto 3001 — auth + perfiles
  booking-service/        Puerto 3002 — reservas + clubs + membresías
  tournament-service/     Puerto 3003 — torneos + live scoring (Socket.IO)
  community-service/      Puerto 3004 — feed + grupos + gamificación
  academy-service/        Puerto 3005 — cursos + instructores (Mux)
  notification-service/   Puerto 3006 — push/email/SMS (BullMQ)
prisma/
  schema.prisma           Schema único de PostgreSQL, compartido por todos los servicios
infra/docker/              docker-compose para desarrollo y producción
```

Cada servicio en `services/*` es su propio paquete npm con su propio `package.json`,
`tsconfig.json` y build (`tsc` → `dist/`). Se ejecutan con `tsx watch` en desarrollo.
Los paquetes compartidos (`@racketly/shared-types`, `@racketly/utils`) se referencian
como dependencias de workspace (`"*"`) — no hay que publicarlos ni versionarlos.

`packages/utils` expone `encryptPII`/`decryptPII` (AES-256-GCM, clave en
`PII_ENCRYPTION_KEY`) para cifrar `documentNumber`, `phone`, `birthDate` a nivel de
aplicación antes de persistir en BD.

## Comandos de compilación y ejecución

Todo se orquesta con Turborepo desde la raíz (`npm run <script>` invoca el script
en cada workspace que lo define, respetando dependencias vía `turbo.json`).

```bash
npm install              # instalar dependencias de todo el monorepo
npm run db:generate       # prisma generate
npm run db:migrate        # prisma migrate dev
npm run docker:dev        # levantar Postgres/Redis con docker-compose (infra/docker)

npm run dev                # todos los servicios + web vía turbo (requiere Docker/DB arriba)
npm run dev:local          # alternativa sin turbo: concurrently, con logs coloreados por servicio

npm run build              # build de todo (turbo run build)
npm run lint                # lint de todo (turbo run lint)
npm run format              # prettier --write sobre todo el repo
```

Para trabajar en un solo servicio/app sin levantar todo el monorepo:

```bash
npm run dev --workspace=services/booking-service
npm run build --workspace=services/tournament-service
npm run typecheck --workspace=apps/web
```

Puertos de desarrollo: gateway 3000, auth 3001, booking 3002, tournament 3003,
community 3004, academy 3005, notification 3006, web 3010, Prisma Studio 5555.

## Tests

`npm run test` corre `turbo run test` (todo lo que tenga script `test`). Los
runners no son uniformes entre servicios — revisar el `package.json` del paquete
antes de asumir el comando:

- **Vitest** (`booking-service`, `tournament-service`, `packages/utils`):
  ```bash
  npm run test --workspace=services/booking-service
  npx vitest run src/services/payment-ledger.service.test.ts   # un solo archivo
  npx vitest                                                     # watch mode
  ```
- **Jest** (`auth-service`):
  ```bash
  npm run test --workspace=services/auth-service
  npx jest src/routes/auth.routes.test.ts
  ```

`academy-service`, `community-service`, `notification-service`, `api-gateway` y
`apps/mobile` no tienen scripts de test propios todavía.

Los archivos de test viven junto al código que prueban (`*.test.ts`), no en una
carpeta `__tests__/` separada.

## Estilo de código

- **Formateo**: Prettier (`.prettierrc`) — sin punto y coma, comillas simples,
  ancho de línea 100, coma final estilo ES5, `arrowParens: always`, LF. Ejecutar
  `npm run format` antes de commitear; no pelear el formateo a mano.
- **Lint**: ESLint plano (`eslint.config.js`) compartido desde `packages/config`,
  con `@typescript-eslint`. Cada servicio/app corre `eslint src/` vía su propio
  script `lint`.
- **TypeScript**: `tsconfig.base.json` en la raíz define las reglas estrictas para
  todo el repo — `strict`, `noUnusedLocals`, `noUnusedParameters`,
  `noImplicitReturns`, `noFallthroughCasesInSwitch`. Target `ES2022`, módulos
  CommonJS en backend. Cada paquete extiende esta base en su propio `tsconfig.json`.
- **Backend**: Express + Prisma ORM, validación de entrada con **Zod**, JWT +
  refresh tokens rotativos para auth, rate limiting con `express-rate-limit`.
  Errores y datos sensibles nunca se loguean en texto plano (ver PII arriba).
- **Frontend web**: Next.js 15 App Router, Tailwind CSS, TanStack Query para
  estado de servidor.
- **Mobile**: Zustand para estado global, TanStack Query, NativeWind.
- **Idioma**: comentarios, mensajes de commit y textos de UI en español (el
  público objetivo inicial es LATAM/España); nombres de variables/funciones en
  inglés siguiendo convención de código.

## Seguridad — cosas a no romper

- Nunca loguear ni exponer `documentNumber`, `phone`, `birthDate` sin pasar por
  `encryptPII`/`decryptPII` de `@racketly/utils`.
- Nunca almacenar datos de tarjeta; los pagos van siempre vía Stripe/MercadoPago
  con verificación server-side del PaymentIntent antes de confirmar.
- Passwords solo con bcrypt (salt rounds 12), nunca en texto plano ni reversible.
- Mantener el row-level filtering por `club_id` al tocar queries de Prisma en
  `booking-service` y servicios relacionados con clubes.
