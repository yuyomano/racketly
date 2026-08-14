# 🎾 Racketly

**La plataforma todo-en-uno para Pádel y Pickleball**

Reservas de canchas · Torneos y Ligas · Find a Partner · Live Scoring · Comunidad · Academia

---

## Stack

| Capa | Tecnología |
|---|---|
| Mobile | React Native + Expo |
| Web | Next.js 15 |
| Backend | Node.js + TypeScript (microservicios) |
| Base de datos | PostgreSQL 16 + Redis 7 |
| Tiempo real | Socket.IO (live scoring) |
| Video | Mux |
| Pagos | Stripe + MercadoPago |
| Push/Email | Firebase + SendGrid |
| Monorepo | Turborepo |
| Infra | Docker → Kubernetes |

## Estructura del proyecto

```
racketly/
├── apps/
│   ├── mobile/           # React Native + Expo
│   └── web/              # Next.js 15
├── packages/
│   ├── shared-types/     # Types TypeScript compartidos
│   ├── utils/            # ELO, fechas, geo, gamificación
│   └── config/           # ESLint, TS config
├── services/
│   ├── auth-service/     # Auth + Perfiles (puerto 3001)
│   ├── booking-service/  # Reservas + Clubs (puerto 3002)
│   ├── tournament-service/ # Torneos + Live Scoring (puerto 3003)
│   ├── community-service/  # Feed + Grupos + Gamificación (puerto 3004)
│   ├── academy-service/    # Cursos + Instructores (puerto 3005)
│   └── notification-service/ # Push + Email + Smart alerts (puerto 3006)
├── prisma/
│   └── schema.prisma     # Schema completo PostgreSQL
├── infra/
│   └── docker/           # docker-compose + nginx
└── .github/workflows/    # CI/CD GitHub Actions
```

## Arrancar en desarrollo

### Prerrequisitos
- Node.js 20+
- Docker Desktop

### 1. Clonar y configurar entorno

```bash
git clone <repo>
cd racketly
cp .env.example .env
# Editar .env con tus claves reales
```

### 2. Levantar infraestructura (Postgres + Redis)

```bash
npm run docker:dev
```

### 3. Instalar dependencias y generar Prisma

```bash
npm install
npm run db:generate
npm run db:migrate
```

### 4. Arrancar todos los servicios

```bash
npm run dev
```

### Puertos en desarrollo

| Servicio | Puerto |
|---|---|
| API Gateway (nginx) | http://localhost:4000 |
| Auth Service | http://localhost:3001 |
| Booking Service | http://localhost:3002 |
| Tournament Service | http://localhost:3003 |
| Community Service | http://localhost:3004 |
| Academy Service | http://localhost:3005 |
| Notification Service | http://localhost:3006 |
| Web (Next.js) | http://localhost:3000 |
| Prisma Studio | http://localhost:5555 |

## Roadmap

- **Fase 1 (M1-4):** Auth + Reservas + Clubs + QR + Pagos Stripe
- **Fase 2 (M5-8):** Torneos + Live Scoring + Find a Partner + Comunidad + Gamificación
- **Fase 3 (M9-12):** Premium + Academia + Publicidad + MercadoPago LATAM
- **Fase 4 (M13+):** IA + Multi-idioma + White-label + Streaming

---

© 2026 Racketly
