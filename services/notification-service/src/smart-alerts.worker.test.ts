import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { QueueEvents } from 'bullmq'
import { PrismaClient } from '@prisma/client'
import { smartAlertQueue, redisConnection } from './index'

// El worker de smart-alerts corre en este mismo proceso (se registra al importar './index')
// contra Redis real. La ruta HTTP que encola ya está cubierta en index.test.ts — acá se
// encola directo en la cola para poder esperar (job.waitUntilFinished) el job puntual que
// nos importa en vez de un conteo agregado, que se pisa con jobs de otros archivos de test
// corriendo en paralelo contra la misma cola real.
const prisma = new PrismaClient()
const queueEvents = new QueueEvents('smart-alerts', { connection: redisConnection })

async function runSmartAlert(type: string, userId: string, payload: unknown) {
  const job = await smartAlertQueue.add(type, { type, userId, payload })
  await job.waitUntilFinished(queueEvents)
}

describe('smart-alerts worker', () => {
  let userId: string
  // Santo Domingo — usada como origen del perfil para los casos de distancia.
  const HOME = { latitude: 18.4861, longitude: -69.9312 }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { email: `smartalert-${Date.now()}@racketly.test` },
    })
    userId = user.id
    await prisma.playerProfile.create({
      data: {
        userId,
        displayName: 'Smart Alert Test',
        country: 'DO',
        city: 'Santo Domingo',
        latitude: HOME.latitude,
        longitude: HOME.longitude,
        eloPadel: 1000,
        category: 'B2',
      },
    })
  })

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { userId } })
    await prisma.playerProfile.delete({ where: { userId } })
    await prisma.user.delete({ where: { id: userId } })
    await prisma.$disconnect()
    await queueEvents.close()
  })

  it('nearby_court dentro del radio crea la notificación', async () => {
    await runSmartAlert('nearby_court', userId, {
      courtLat: HOME.latitude + 0.01,
      courtLon: HOME.longitude,
      clubName: 'Club Cerca',
    })

    const notif = await prisma.notification.findFirst({ where: { userId, type: 'nearby_court' } })
    expect(notif?.title).toBe('Cancha libre cerca de ti')
  })

  it('nearby_court fuera del radio no crea notificación', async () => {
    await runSmartAlert('nearby_court', userId, {
      courtLat: HOME.latitude + 5,
      courtLon: HOME.longitude,
      clubName: 'Club Lejos',
    })

    const count = await prisma.notification.count({ where: { userId, type: 'nearby_court' } })
    expect(count).toBe(1) // sigue siendo solo la del test anterior
  })

  it('rival_available con ELO cercano crea la notificación', async () => {
    await runSmartAlert('rival_available', userId, { rivalElo: 1100, sport: 'padel' })

    const notif = await prisma.notification.findFirst({
      where: { userId, type: 'rival_available' },
    })
    expect(notif?.title).toBe('Rival disponible')
  })

  it('rival_available con ELO lejano no crea notificación', async () => {
    await runSmartAlert('rival_available', userId, { rivalElo: 1800, sport: 'padel' })

    const count = await prisma.notification.count({ where: { userId, type: 'rival_available' } })
    expect(count).toBe(1)
  })

  it('tournament_category con la misma categoría crea la notificación', async () => {
    await runSmartAlert('tournament_category', userId, {
      category: 'B2',
      tournamentName: 'Copa Racketly',
    })

    const notif = await prisma.notification.findFirst({
      where: { userId, type: 'tournament_category' },
    })
    expect(notif?.title).toBe('Torneo en tu categoría')
  })

  it('tournament_category con categoría distinta no crea notificación', async () => {
    await runSmartAlert('tournament_category', userId, {
      category: 'OPEN',
      tournamentName: 'Copa Elite',
    })

    const count = await prisma.notification.count({
      where: { userId, type: 'tournament_category' },
    })
    expect(count).toBe(1)
  })
})
