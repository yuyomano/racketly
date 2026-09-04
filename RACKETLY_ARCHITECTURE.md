# RACKETLY — Documento de Arquitectura Técnica

**Versión:** 1.0 | **Fecha:** Mayo 2026 | **Estado:** Diseño

---

## 1. VISIÓN DEL PRODUCTO

**Racketly** es la plataforma todo-en-uno para pádel y pickleball: reservas de canchas, ligas y torneos, comunidad de jugadores, formación y academia, con un modelo freemium y monetización B2B para clubes y patrocinadores.

**Mercados objetivo iniciales:** Colombia, España, México, Argentina, Estados Unidos (comunidad pickleball)

---

## 2. MÓDULOS FUNCIONALES

### 2.1 Reservas (Booking)

- Búsqueda por ciudad/país/club con mapa interactivo
- Disponibilidad en tiempo real con bloqueo optimista
- Reserva individual o en grupo (invitar jugadores)
- Pago integrado: Stripe (global), MercadoPago (LATAM)
- Cancelación con política configurable por club (24h, 48h, sin reembolso)
- QR de acceso generado post-pago
- Precios dinámicos (hora pico / valle) configurables por club
- Cancha patrocinada (branding de marca en reserva)

### 2.2 Ligas y Torneos

- Tipos: Dobles, Individual, Mixto, Por Club, Interclub
- Deportes: Pádel, Pickleball (separados)
- Formatos: Round Robin, Eliminación directa, Grupos + Cuadro, Suizo
- Inscripción con pago de cuota de torneo
- Panel organizador: validación, sorteo, resultados
- App árbitro: live scoring desde móvil
- Actas digitales por partido
- Patrocinios: logo de marca en torneo, estadísticas brandadas

### 2.3 Ranking y Estadísticas

- Sistema ELO adaptado (similar WPT/APT)
- Categorías: C4 → C2 → C1 → B3 → B2 → B1 → A → Open
- Ascenso/descenso automático por puntos acumulados
- Stats por jugador: partidos, victorias, sets, games, racha
- Historial completo de enfrentamientos
- Ranking por ciudad, país, global
- Leaderboard gamificado

### 2.4 Find a Partner

- Matchmaking por: nivel, zona geográfica, disponibilidad, deporte
- Solicitud de partida abierta o privada
- Chat directo post-match para confirmar
- Sistema de reputación (estrellas post-partido)
- "Partida express": cancha + pareja en un solo flujo

### 2.5 Comunidad

- Feed social (posts, fotos, videos cortos tipo Reels)
- Grupos: Técnica, Táctica, Reseñas de palas/paletas, Clubs, Competición
- Perfiles verificados: Jugadores, Entrenadores, Árbitros, Clubes
- Sistema follow/seguir
- Reseñas de palas/paletas con rating
- Noticias del mundo del pádel y pickleball (curadas + RSS)
- Retos virales (ej. "mejor smash de la semana")

### 2.6 Formación / Academia

- Biblioteca de videos: gratuitos y premium
- Cursos estructurados por nivel y deporte
- Marketplace de clases presenciales con entrenadores
- Entrenadores: perfil, disponibilidad, precios, reseñas
- Certificaciones para instructores (emitidas por Racketly)
- Panel del entrenador: gestión de alumnos, progreso, sesiones
- Streaming en vivo de clases (futuro v2)

### 2.7 Club Dashboard (B2B SaaS)

- Gestión de canchas: número, tipo, tarifas, mantenimiento
- Calendario de reservas visual
- Torneos y ligas propios del club
- Estadísticas de ocupación y revenue
- Configuración de precios dinámicos
- Gestión de membresías del club
- Comunicación con socios
- API para integración con sistemas existentes del club

### 2.8 Notificaciones Inteligentes

- "Cancha libre a 500m en 2h, precio especial"
- Recordatorio 1h antes de reserva con QR
- "Tu rival acaba de reservar para mañana ¿juegas?"
- Alerta de torneo disponible en tu nivel y ciudad
- "X acaba de publicar un video sobre tu nivel"
- Push, email y SMS (configurables por usuario)

### 2.9 Gamificación

- Insignias: Racha de 5 victorias, Primer torneo, 100 partidos, etc.
- XP y niveles de usuario en la app
- Leaderboard semanal de actividad en comunidad
- Misiones: "Juega en 3 clubs distintos este mes"
- Logros compartibles en redes sociales
- "Jugador de la semana" en cada club

### 2.10 Publicidad y Patrocinios

- Banners nativos (no intrusivos) en feed y búsqueda
- Canchas patrocinadas por marca
- Torneos/ligas co-branded con patrocinador
- Estadísticas de alcance para marcas (panel de advertiser)
- Segmentación por nivel, ciudad, deporte, edad
- Paquetes: logo en resultados, menciones en notificaciones, banners exclusivos

---

## 3. MODELO FREEMIUM

| Tier             | Precio/mes | Perfil              | Beneficios                                                                           |
| ---------------- | ---------- | ------------------- | ------------------------------------------------------------------------------------ |
| **Free**         | $0         | Todos               | Reservas básicas, comunidad, 5 videos/mes, ranking público                           |
| **Amateur+**     | $9         | Jugador aficionado  | Reservas prioritarias, videos ilimitados, stats avanzadas, Find a Partner sin límite |
| **Pro**          | $22        | Jugador competitivo | Todo Amateur+ + análisis ELO avanzado, acceso torneos Pro, insignias exclusivas      |
| **Instructor**   | $35        | Entrenadores        | Perfil verificado, marketplace clases, gestión alumnos, cursos propios               |
| **Club Starter** | $99/mes    | Club pequeño        | Panel gestión, hasta 4 canchas, torneos propios, branding básico                     |
| **Club Pro**     | $249/mes   | Club mediano/grande | Canchas ilimitadas, API, white-label parcial, patrocinios, soporte dedicado          |

---

## 4. ARQUITECTURA TÉCNICA

### 4.1 Vista General

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTES                              │
│  React Native App (iOS/Android) │ Next.js Web (PWA)         │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTPS / WebSocket
┌──────────────────▼──────────────────────────────────────────┐
│                    API GATEWAY (nginx / Kong)                 │
│            Rate limiting · Auth · SSL termination             │
└──────┬──────────┬──────────┬──────────┬──────────┬──────────┘
       │          │          │          │          │
┌──────▼──┐ ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌──▼──────┐
│Booking  │ │Tourney  │ │Community│ │Academy │ │Notif    │
│Service  │ │Service  │ │Service  │ │Service │ │Service  │
│(Node.js)│ │(Node.js)│ │(Node.js)│ │(Node.js│ │(Node.js)│
└──────┬──┘ └────┬────┘ └───┬────┘ └───┬────┘ └──┬──────┘
       │         │          │          │          │
┌──────▼─────────▼──────────▼──────────▼──────────▼──────────┐
│                  PostgreSQL (principal)                       │
│  Redis (caché + disponibilidad canchas + sesiones)           │
│  Elasticsearch (búsqueda de clubes, jugadores, contenido)    │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                    SERVICIOS EXTERNOS                         │
│  Stripe · MercadoPago │ Mux (video) │ Firebase (push)        │
│  Google Maps/Mapbox   │ Twilio (SMS)│ SendGrid (email)       │
│  AWS S3 / Cloudflare R2 (storage)  │ OpenAI (matchmaking)   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Stack por Capa

#### Frontend Mobile

- **React Native** + Expo (iOS + Android desde un solo codebase)
- **React Navigation** v6 (navegación)
- **Zustand** (estado global)
- **React Query / TanStack Query** (servidor state + caché)
- **NativeWind** (Tailwind para React Native)
- **Mux React Native SDK** (reproducción de video)
- **react-native-maps** (mapa de clubes)

#### Frontend Web

- **Next.js 15** (App Router, SSR/SSG para SEO)
- **Tailwind CSS**
- **ShadCN/UI** (componentes)
- **Framer Motion** (animaciones)
- Comparte lógica de negocio con mobile vía **shared packages (monorepo)**

#### Backend (Microservicios)

- **Node.js + Express** (cada servicio)
- **TypeScript** en todo el backend
- **Prisma ORM** (PostgreSQL)
- **Socket.IO** (live scoring, notificaciones en tiempo real)
- **Bull/BullMQ** (colas: notificaciones, emails, procesamiento de pagos)
- **JWT + Refresh Tokens** (autenticación)
- **Zod** (validación de schemas)

#### Base de Datos

- **PostgreSQL 16** (datos principales)
- **Redis 7** (caché de disponibilidad de canchas, sesiones, rate limiting)
- **Elasticsearch 8** (búsqueda de clubes, jugadores, contenido, palas)

#### Infraestructura

- **Monorepo:** Turborepo
- **Contenedores:** Docker + Docker Compose (desarrollo), Kubernetes (producción)
- **Cloud:** AWS (ECS Fargate) o Railway/Render (inicio más ágil)
- **CDN:** Cloudflare
- **Storage:** AWS S3 o Cloudflare R2
- **Video streaming:** Mux
- **CI/CD:** GitHub Actions

---

## 5. ESQUEMA DE BASE DE DATOS (Entidades Principales)

### Users & Profiles

```sql
users
  id, email, phone, password_hash, created_at
  subscription_tier (free|amateur|pro|instructor|club_starter|club_pro)

player_profiles
  user_id, display_name, avatar_url, bio
  sport (padel|pickleball|both)
  country, city, latitude, longitude
  elo_padel, elo_pickleball
  category (C4..Open)
  xp_points, level, badges[]

instructor_profiles
  user_id, verified, certifications[], specialty
  hourly_rate, availability_schedule
  rating_avg, total_reviews

club_profiles
  id, name, description, country, city, address
  latitude, longitude, photos[]
  subscription_tier, verified
  contact_email, phone, website
  social_media{}
  opening_hours{}
```

### Courts & Bookings

```sql
courts
  id, club_id, name, sport (padel|pickleball)
  surface (cristal|hormigon|hierba_artificial|cemento)
  indoor/outdoor, capacity (2|4)
  is_active, photos[]

time_slots
  id, court_id, date, start_time, end_time
  base_price, peak_price, currency
  sponsor_id (nullable)

bookings
  id, slot_id, user_id, status (pending|confirmed|cancelled|completed)
  players[] (user_ids + guest_names)
  amount_paid, payment_id, payment_provider
  qr_code, qr_expires_at
  cancelled_at, refund_amount
```

### Tournaments & Leagues

```sql
tournaments
  id, club_id (nullable para interclub), organizer_id
  name, description, sport, format (round_robin|elimination|groups|swiss)
  type (pairs|teams|individual|mixed)
  category, max_participants, entry_fee
  prize_info, rules
  registration_start, registration_end
  start_date, end_date, status
  sponsor_id (nullable), sponsor_logo_url

tournament_participants
  id, tournament_id, player_id, partner_id (nullable)
  team_name, registered_at, payment_status

matches
  id, tournament_id, round, court_id (nullable)
  player1_id, player2_id (or team)
  scheduled_at, started_at, finished_at
  score_sets[] (JSON: [{p1:6, p2:4}, {p1:7, p2:5}])
  winner_id, referee_id, status
  live (bool)

elo_history
  id, player_id, match_id
  elo_before, elo_after, delta
  created_at
```

### Community

```sql
posts
  id, author_id, type (text|photo|video|reel|poll)
  content, media_urls[], sport_tag
  group_id (nullable), likes_count, comments_count
  is_premium, created_at

comments
  id, post_id, author_id, content, likes_count, parent_id

groups
  id, name, description, category
  (technique|tactics|gear|clubs|competition|general)
  sport, member_count, is_private

follows
  follower_id, following_id, following_type (user|club|group)

gear_reviews
  id, reviewer_id, brand, model, sport
  rating (1-5), review_text, photos[]
  verified_purchase (bool)
```

### Academy

```sql
courses
  id, instructor_id, title, description, sport
  level (beginner|intermediate|advanced|pro)
  type (video|presential|hybrid)
  price, is_premium, thumbnail_url
  duration_hours, language, created_at

lessons
  id, course_id, title, order_index
  video_url (mux_asset_id), duration_seconds
  is_free_preview, description

enrollments
  id, user_id, course_id, enrolled_at
  progress_percent, last_lesson_id, completed_at

instructor_sessions (clases presenciales)
  id, instructor_id, title, sport, level
  club_id (nullable), location_description
  date, start_time, duration_minutes
  max_students, price_per_person, currency
  booked_count, status
```

### Find a Partner

```sql
match_requests
  id, requester_id, sport, level_min, level_max
  city, max_distance_km, preferred_date, time_preference
  court_id (nullable), message, status
  expires_at, created_at

match_applications
  id, request_id, applicant_id, message
  status (pending|accepted|rejected)
  responded_at

player_reputation
  id, reviewer_id, reviewed_id, match_id
  rating (1-5), on_time (bool), fair_play (bool)
  comment, created_at
```

### Gamification

```sql
badges
  id, code, name, description, icon_url
  condition_type, condition_value, xp_reward

user_badges
  user_id, badge_id, earned_at, notified

missions
  id, title, description, sport (nullable)
  xp_reward, badge_id (nullable)
  start_date, end_date, is_recurring

user_missions
  user_id, mission_id, progress, completed_at
```

### Ads & Sponsorships

```sql
sponsors
  id, brand_name, logo_url, contact_email
  country, sport_focus[]

ad_campaigns
  id, sponsor_id, type (banner|tournament|court|notification)
  target_sport, target_category, target_country
  budget, cpm_rate, start_date, end_date, status

ad_impressions
  id, campaign_id, user_id, placement, created_at

tournament_sponsorships
  tournament_id, sponsor_id, package_type
  amount, deliverables{}
```

---

## 6. API REST — ENDPOINTS PRINCIPALES

```
AUTH
  POST   /api/auth/register
  POST   /api/auth/login
  POST   /api/auth/refresh
  POST   /api/auth/logout
  POST   /api/auth/google  (OAuth)

CLUBS
  GET    /api/clubs?city=&sport=&lat=&lng=&radius=
  GET    /api/clubs/:id
  GET    /api/clubs/:id/courts
  GET    /api/clubs/:id/availability?date=

BOOKINGS
  GET    /api/courts/:id/slots?date=
  POST   /api/bookings          (crear reserva + pago)
  GET    /api/bookings/:id      (con QR)
  DELETE /api/bookings/:id      (cancelar)
  GET    /api/users/me/bookings

TOURNAMENTS
  GET    /api/tournaments?sport=&city=&status=
  POST   /api/tournaments        (crear)
  GET    /api/tournaments/:id
  POST   /api/tournaments/:id/register
  GET    /api/tournaments/:id/bracket
  PUT    /api/matches/:id/score  (actualizar marcador)
  WS     /ws/matches/:id         (live scoring)

PLAYERS / RANKING
  GET    /api/players/:id
  GET    /api/rankings?sport=&category=&country=
  GET    /api/players/:id/stats
  GET    /api/players/:id/history

FIND PARTNER
  POST   /api/match-requests
  GET    /api/match-requests?sport=&city=&date=
  POST   /api/match-requests/:id/apply
  PUT    /api/match-applications/:id/respond

COMMUNITY
  GET    /api/feed
  POST   /api/posts
  GET    /api/posts/:id
  POST   /api/posts/:id/like
  POST   /api/posts/:id/comments
  GET    /api/groups
  POST   /api/groups/:id/join

ACADEMY
  GET    /api/courses?sport=&level=&type=
  GET    /api/courses/:id
  POST   /api/courses/:id/enroll
  PUT    /api/enrollments/:id/progress
  GET    /api/instructors?city=&sport=
  POST   /api/instructor-sessions/:id/book

NOTIFICATIONS
  GET    /api/notifications
  PUT    /api/notifications/:id/read
  PUT    /api/notifications/settings

CLUB DASHBOARD (requiere rol club)
  GET    /api/dashboard/bookings
  GET    /api/dashboard/revenue
  GET    /api/dashboard/occupancy
  PUT    /api/dashboard/courts/:id
  POST   /api/dashboard/tournaments
```

---

## 7. ESTRUCTURA DEL REPOSITORIO (Monorepo)

```
racketly/
├── apps/
│   ├── mobile/              # React Native + Expo
│   │   ├── src/
│   │   │   ├── screens/
│   │   │   │   ├── auth/
│   │   │   │   ├── booking/
│   │   │   │   ├── tournaments/
│   │   │   │   ├── community/
│   │   │   │   ├── academy/
│   │   │   │   ├── findPartner/
│   │   │   │   ├── profile/
│   │   │   │   └── clubDashboard/
│   │   │   ├── components/
│   │   │   ├── navigation/
│   │   │   ├── store/        (Zustand)
│   │   │   └── hooks/
│   │   └── app.json
│   │
│   └── web/                 # Next.js 15
│       ├── app/
│       │   ├── (public)/    (landing, SEO)
│       │   ├── (app)/       (autenticado)
│       │   └── dashboard/   (club dashboard)
│       └── components/
│
├── packages/
│   ├── api-client/          # SDK compartido (fetch + types)
│   ├── shared-types/        # Types/interfaces TypeScript compartidas
│   ├── ui/                  # Componentes compartidos web/mobile
│   ├── utils/               # Validaciones, formatters, ELO calc
│   └── config/              # ESLint, TypeScript configs
│
├── services/
│   ├── booking-service/     # Node.js + Express + Prisma
│   ├── tournament-service/  # Node.js + Express + Socket.IO
│   ├── community-service/   # Node.js + Express
│   ├── academy-service/     # Node.js + Express + Mux
│   ├── notification-service/# Node.js + Bull + Firebase + SendGrid
│   ├── auth-service/        # Node.js + JWT
│   └── api-gateway/         # nginx config
│
├── infra/
│   ├── docker/
│   │   ├── docker-compose.yml         (desarrollo)
│   │   └── docker-compose.prod.yml
│   ├── kubernetes/           (producción)
│   └── terraform/            (AWS/infra as code)
│
├── prisma/
│   └── schema.prisma         (schema compartido)
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── turbo.json
├── package.json
└── README.md
```

---

## 8. FLUJOS CLAVE

### Flujo de Reserva

```
Usuario abre app
  → Mapa/lista de clubs cercanos (geolocalización)
  → Selecciona club → ve canchas disponibles
  → Selecciona cancha + horario
  → Invita jugadores (opcional, de contactos/Find a Partner)
  → Checkout: precio + resumen
  → Pago (Stripe/MercadoPago)
  → Confirmación + QR generado
  → Notificación push a jugadores invitados
  → Recordatorio 1h antes con QR
  → Post-partido: invitación a dejar reputación a compañeros
```

### Flujo de Torneo

```
Organizador crea torneo (nombre, sport, formato, fechas, cuota)
  → Publicado en feed + notificaciones a jugadores de la categoría y ciudad
  → Jugadores se inscriben (pago de cuota)
  → Cierre inscripciones → sorteo automático (o manual)
  → Cuadro publicado, notificaciones con horarios
  → Árbitro/jugadores actualizan marcador en vivo (Socket.IO)
  → Marcador visible en tiempo real para espectadores
  → Fin de partido → ELO actualizado automáticamente
  → Ganadores suben de categoría si aplica
  → Resultados en perfil de cada jugador
```

### Flujo Find a Partner

```
Usuario crea solicitud: deporte, nivel, fecha, zona
  → Visible en mapa y lista para jugadores compatibles
  → Otros jugadores aplican con mensaje
  → Solicitante acepta → chat abierto para coordinar
  → Pueden reservar cancha desde el mismo chat
  → Post-partido: rating mutuo de fair play y puntualidad
```

---

## 9. PLAN DE DESARROLLO POR FASES

### FASE 1 — MVP (Meses 1-4)

**Objetivo:** Validar con 2-3 clubes piloto y 200 usuarios

- [ ] Auth (registro, login, perfil básico)
- [ ] Onboarding de clubs (panel básico)
- [ ] Gestión de canchas y horarios
- [ ] Reservas con pago (Stripe primero)
- [ ] QR de acceso
- [ ] Ranking ELO básico
- [ ] App mobile iOS + Android
- [ ] Web básica (landing + reservas)

### FASE 2 — Crecimiento (Meses 5-8)

**Objetivo:** 10 clubs, 1000 usuarios, primera liga

- [ ] Torneos y ligas (round robin + eliminación)
- [ ] Live scoring con Socket.IO
- [ ] Find a Partner
- [ ] Comunidad básica (feed, posts, grupos)
- [ ] Notificaciones push inteligentes
- [ ] Club Dashboard completo
- [ ] MercadoPago (LATAM)
- [ ] Gamificación (badges + XP)

### FASE 3 — Monetización (Meses 9-12)

**Objetivo:** Revenue positivo, 50 clubs, 5000 usuarios

- [ ] Subscripciones premium (Stripe Billing)
- [ ] Academia / videos premium (Mux)
- [ ] Marketplace instructores
- [ ] Sistema de publicidad / patrocinios
- [ ] Pickleball diferenciado completamente
- [ ] Elasticsearch para búsqueda avanzada
- [ ] Analytics para clubs (dashboard avanzado)

### FASE 4 — Escala (Mes 13+)

- [ ] Multi-idioma (ES, EN, PT)
- [ ] Expansión a nuevos países
- [ ] API pública para integraciones de clubs
- [ ] IA: recomendación de rivales, análisis de juego
- [ ] Streaming en vivo de torneos
- [ ] White-label para federaciones

---

## 10. MÉTRICAS DE ÉXITO

| Métrica              | M3   | M6     | M12     |
| -------------------- | ---- | ------ | ------- |
| Clubes activos       | 3    | 15     | 60      |
| Usuarios registrados | 300  | 2,000  | 10,000  |
| Reservas/mes         | 500  | 5,000  | 30,000  |
| Usuarios premium     | 20   | 200    | 1,200   |
| MRR (USD)            | $200 | $3,000 | $20,000 |
| Torneos/mes          | 0    | 5      | 30      |

---

## 11. CONSIDERACIONES DE SEGURIDAD

- Autenticación: JWT (15min) + Refresh Token (30d) rotativo y revocable (tabla `RefreshToken`)
- Passwords: bcrypt con salt rounds 12
- Pagos: nunca almacenar datos de tarjeta (Stripe/MP se encargan); PaymentIntent verificado server-side antes de confirmar, con webhook de Stripe como red de seguridad
- QR codes: firmados con HMAC, expiran 30min después del partido
- Rate limiting por IP y por usuario, más estricto en login/register
- TLS: `infra/docker/docker-compose.prod.yml` + `infra/docker/Caddyfile` — Caddy como terminador TLS delante del api-gateway, con certificados Let's Encrypt automáticos (sin certbot manual). Requiere DNS de `racketly.club`/`api.racketly.club` apuntando al servidor antes de poder emitir el certificado. Alternativa con nginx + certbot manual en `infra/docker/nginx.conf`.
- PII cifrada a nivel de aplicación (`documentNumber`, `phone`, `birthDate`) con AES-256-GCM (`@racketly/utils` `encryptPII`/`decryptPII`, clave en `PII_ENCRYPTION_KEY`) — además de `passwordHash` (bcrypt, no reversible)
- Row-level security en PostgreSQL por club_id
- GDPR/LGPD: eliminación de cuenta con borrado de datos personales

---

_Documento generado por Racketly Design Team — Mayo 2026_
