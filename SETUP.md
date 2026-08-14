# Racketly — Guía de Setup de Desarrollo

## Prerequisitos de infraestructura

El proyecto necesita **PostgreSQL** y **Redis**. Elige una de estas opciones:

---

## OPCIÓN 1: Docker Desktop (Recomendado) 🐳

**Instalar Docker Desktop:**
1. Ir a https://www.docker.com/products/docker-desktop/
2. Descargar e instalar para Windows
3. Reiniciar el equipo
4. Abrir Docker Desktop y esperar que arranque

**Luego ejecutar:**
```powershell
cd "C:\Users\angelsa\OneDrive - Bellon S.A.S\Documents\Racketly"
npm run docker:dev
```

Esto levanta automáticamente:
- PostgreSQL en `localhost:5432`
- Redis en `localhost:6379`

---

## OPCIÓN 2: Supabase Cloud (Sin instalar nada) ☁️

1. Ir a https://supabase.com → Create new project → Free tier
2. En el dashboard → Settings → Database → copiar la **Connection string (URI)**
3. Editar `.env`:
   ```
   DATABASE_URL=postgresql://postgres:[TU-PASSWORD]@db.[TU-REF].supabase.co:5432/postgres
   ```
4. Para Redis: usar https://upstash.com → Create Database → Free tier → copiar URL

---

## OPCIÓN 3: PostgreSQL local 🖥️

1. Descargar desde https://www.postgresql.org/download/windows/
2. Instalar con usuario `postgres`, contraseña `racketly_dev_pass`
3. Crear la base de datos:
   ```sql
   CREATE DATABASE racketly;
   CREATE USER racketly WITH PASSWORD 'racketly_dev_pass';
   GRANT ALL PRIVILEGES ON DATABASE racketly TO racketly;
   ```
4. Para Redis: descargar desde https://github.com/microsoftarchive/redis/releases

---

## Una vez tengas la DB lista

```powershell
# 1. Copiar y configurar variables de entorno
cp .env.example .env
# Editar .env con tu DATABASE_URL

# 2. Crear todas las tablas
npm run db:migrate

# 3. Ver la base de datos visualmente (opcional)
npm run db:studio

# 4. Poblar con datos de prueba
npm run db:seed

# 5. Arrancar todos los servicios
npm run dev
```

---

## Puertos en desarrollo

| Servicio | Puerto | URL |
|---|---|---|
| API Gateway | 4000 | http://localhost:4000 |
| Auth Service | 3001 | http://localhost:3001/health |
| Booking Service | 3002 | http://localhost:3002/health |
| Tournament Service | 3003 | http://localhost:3003/health |
| Community Service | 3004 | http://localhost:3004/health |
| Academy Service | 3005 | http://localhost:3005/health |
| Notification Service | 3006 | http://localhost:3006/health |
| Web (Next.js) | 3000 | http://localhost:3000 |
| Prisma Studio | 5555 | http://localhost:5555 |

---

## Verificar que funciona

```powershell
# Health check de todos los servicios
curl http://localhost:3001/health
curl http://localhost:3002/health
curl http://localhost:3003/health
```

Respuesta esperada:
```json
{"success":true,"service":"auth-service","status":"ok"}
```
