import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3006'

// fetch con timeout vía Promise.race — se evita `AbortSignal.timeout()` porque su tipo choca
// con el `AbortSignal` de @types/node en este tsconfig (sin lib "dom").
function postJson(url: string, body: unknown, timeoutMs = 3000): Promise<unknown> {
  return Promise.race([
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
  ])
}

// Envía un aviso a un jugador por push (si tiene pushToken) y por email (siempre, es
// obligatorio en el modelo) — en paralelo, best-effort. Ninguna falla acá debe romper el
// flujo que la llama (cron o cancelación), por eso cada request se envuelve en su propio
// try/catch y se corre con allSettled.
export async function notifyPlayer(
  userId: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {}
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, pushToken: true } })
  if (!user) return

  await Promise.allSettled([
    user.pushToken
      ? postJson(`${NOTIFICATION_SERVICE_URL}/api/notifications/send`, {
          userId, token: user.pushToken, type: 'booking_warning', title, body, data,
        }).catch(() => {})
      : Promise.resolve(),
    postJson(`${NOTIFICATION_SERVICE_URL}/api/notifications/email`, {
      to: user.email, subject: title, html: `<p>${body}</p>`,
    }).catch(() => {}),
  ])
}
