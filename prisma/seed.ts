/**
 * Racketly — Seed completo de base de datos
 * Cubre: clubs, canchas, slots, jugadores, torneos, partidos,
 *        ELO history, comunidad, academia, gamificación, sponsors
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d
}

function dateStr(days: number): string {
  return addDays(days).toISOString().split('T')[0]
}

async function hash(password: string) {
  return bcrypt.hash(password, 10)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  Racketly Seed iniciando...\n')

  // ════════════════════════════════════════════════════════════════════════════
  // 1. SPONSORS
  // ════════════════════════════════════════════════════════════════════════════

  console.log('💰 Creando sponsors...')

  const sponsorBullpadel = await prisma.sponsor.upsert({
    where: { id: 'sponsor-bullpadel' },
    update: {},
    create: {
      id: 'sponsor-bullpadel',
      brandName: 'Bullpadel',
      logoUrl: 'https://example.com/logos/bullpadel.png',
      contactEmail: 'marketing@bullpadel.com',
      country: 'ES',
      sportFocus: ['padel'],
    },
  })

  const sponsorHead = await prisma.sponsor.upsert({
    where: { id: 'sponsor-head' },
    update: {},
    create: {
      id: 'sponsor-head',
      brandName: 'HEAD Sport',
      logoUrl: 'https://example.com/logos/head.png',
      contactEmail: 'marketing@head.com',
      country: 'ES',
      sportFocus: ['padel', 'pickleball'],
    },
  })

  const sponsorSelkirk = await prisma.sponsor.upsert({
    where: { id: 'sponsor-selkirk' },
    update: {},
    create: {
      id: 'sponsor-selkirk',
      brandName: 'Selkirk Sport',
      logoUrl: 'https://example.com/logos/selkirk.png',
      contactEmail: 'marketing@selkirk.com',
      country: 'US',
      sportFocus: ['pickleball'],
    },
  })

  // Campañas de anuncios
  await prisma.adCampaign.createMany({
    data: [
      {
        sponsorId: sponsorBullpadel.id,
        type: 'banner',
        targetSport: 'padel',
        targetCountry: 'CO',
        budget: 5000000,
        cpmRate: 2500,
        imageUrl: 'https://example.com/ads/bullpadel-banner.jpg',
        linkUrl: 'https://bullpadel.com',
        startDate: new Date(),
        endDate: addDays(90),
        status: 'active',
      },
      {
        sponsorId: sponsorHead.id,
        type: 'tournament',
        targetSport: 'padel',
        budget: 8000000,
        cpmRate: 3000,
        imageUrl: 'https://example.com/ads/head-tournament.jpg',
        linkUrl: 'https://head.com/padel',
        startDate: new Date(),
        endDate: addDays(60),
        status: 'active',
      },
      {
        sponsorId: sponsorSelkirk.id,
        type: 'banner',
        targetSport: 'pickleball',
        targetCountry: 'US',
        budget: 3000,
        cpmRate: 4,
        imageUrl: 'https://example.com/ads/selkirk-banner.jpg',
        linkUrl: 'https://selkirk.com',
        startDate: new Date(),
        endDate: addDays(45),
        status: 'active',
      },
    ],
    skipDuplicates: true,
  })

  console.log('  ✅ 3 sponsors + 3 campañas')

  // ════════════════════════════════════════════════════════════════════════════
  // 2. USUARIOS — Admin y dueños de clubs
  // ════════════════════════════════════════════════════════════════════════════

  console.log('👤 Creando usuarios administradores...')

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@racketly.app' },
    update: {},
    create: {
      id: 'user-admin',
      email: 'admin@racketly.app',
      passwordHash: await hash('Admin2026!'),
      subscriptionTier: 'club_pro',
      playerProfile: {
        create: {
          displayName: 'Racketly Admin',
          country: 'CO',
          city: 'Bogotá',
          sport: 'both',
          eloPadel: 1500,
          eloPickleball: 1450,
          category: 'B1',
          xpPoints: 12000,
          level: 9,
        },
      },
    },
  })

  // ════════════════════════════════════════════════════════════════════════════
  // 3. CLUBS (Colombia, España, México, USA)
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🏟️  Creando clubs...')

  const clubsData = [
    // ── Colombia ──────────────────────────────────────────────────────────────
    {
      id: 'club-bogota-1',
      ownerId: adminUser.id,
      name: 'Bogotá Padel Club',
      description:
        'El club de pádel de referencia en el norte de Bogotá. 8 canchas de cristal panorámico, academia certificada y restaurante gourmet.',
      country: 'CO',
      city: 'Bogotá',
      currency: 'COP',
      address: 'Calle 127 #15-45, Usaquén',
      latitude: 4.7109,
      longitude: -74.0721,
      subscriptionTier: 'club_pro' as const,
      verified: true,
      sports: ['padel', 'pickleball'] as ['padel', 'pickleball'],
      amenities: ['parking', 'vestuarios', 'cafetería', 'academia', 'tienda', 'fisioterapia'],
      cancellationPolicy: 'flexible' as const,
      ratingAvg: 4.8,
      totalReviews: 312,
    },
    {
      id: 'club-bogota-2',
      ownerId: adminUser.id,
      name: 'Chicó Racket Club',
      description:
        'Club familiar en el corazón del Chicó. 4 canchas de pádel y zona de pickleball exterior.',
      country: 'CO',
      city: 'Bogotá',
      currency: 'COP',
      address: 'Cra 15 #90-28, Chicó Norte',
      latitude: 4.6797,
      longitude: -74.0492,
      subscriptionTier: 'club_starter' as const,
      verified: true,
      sports: ['padel', 'pickleball'] as ['padel', 'pickleball'],
      amenities: ['parking', 'vestuarios', 'cafetería'],
      cancellationPolicy: 'moderate' as const,
      ratingAvg: 4.5,
      totalReviews: 128,
    },
    {
      id: 'club-medellin-1',
      ownerId: adminUser.id,
      name: 'El Poblado Padel',
      description:
        'El mejor club de pádel en Medellín. Ubicación privilegiada en El Poblado con 6 canchas y vista a la montaña.',
      country: 'CO',
      city: 'Medellín',
      currency: 'COP',
      address: 'Cra 43A #5-115, El Poblado',
      latitude: 6.2088,
      longitude: -75.5741,
      subscriptionTier: 'club_pro' as const,
      verified: true,
      sports: ['padel'] as ['padel'],
      amenities: ['parking', 'vestuarios', 'restaurante', 'piscina', 'academia'],
      cancellationPolicy: 'flexible' as const,
      ratingAvg: 4.9,
      totalReviews: 267,
    },
    {
      id: 'club-cali-1',
      ownerId: adminUser.id,
      name: 'Cali Padel & Pickle',
      description:
        'Club moderno en el norte de Cali con canchas de pádel y pickleball. ¡El único con liga nocturna los viernes!',
      country: 'CO',
      city: 'Cali',
      currency: 'COP',
      address: 'Cra 100 #11-60, Ciudad Jardín',
      latitude: 3.395,
      longitude: -76.532,
      subscriptionTier: 'club_starter' as const,
      verified: true,
      sports: ['padel', 'pickleball'] as ['padel', 'pickleball'],
      amenities: ['parking', 'vestuarios', 'bar', 'iluminación_nocturna'],
      cancellationPolicy: 'strict' as const,
      ratingAvg: 4.6,
      totalReviews: 89,
    },
    // ── España ────────────────────────────────────────────────────────────────
    {
      id: 'club-madrid-1',
      ownerId: adminUser.id,
      name: 'Madrid Padel Premium',
      description:
        'Club de referencia en Madrid con 10 canchas indoor y outdoor. Sede oficial de varios torneos WPT.',
      country: 'ES',
      city: 'Madrid',
      currency: 'EUR',
      address: 'Av. del Padre Huidobro, 28035 Madrid',
      latitude: 40.4773,
      longitude: -3.7492,
      subscriptionTier: 'club_pro' as const,
      verified: true,
      sports: ['padel'] as ['padel'],
      amenities: ['parking', 'vestuarios', 'spa', 'restaurante', 'tienda', 'academia'],
      cancellationPolicy: 'flexible' as const,
      ratingAvg: 4.9,
      totalReviews: 892,
    },
    {
      id: 'club-barcelona-1',
      ownerId: adminUser.id,
      name: 'Barcelona Beach Padel',
      description:
        'Canchas de pádel y pickleball frente al mar. El ambiente más único de Catalunya.',
      country: 'ES',
      city: 'Barcelona',
      currency: 'EUR',
      address: 'Passeig Marítim 42, 08003 Barcelona',
      latitude: 41.3851,
      longitude: 2.1734,
      subscriptionTier: 'club_pro' as const,
      verified: true,
      sports: ['padel', 'pickleball'] as ['padel', 'pickleball'],
      amenities: ['vestuarios', 'bar', 'terraza', 'vistas_al_mar'],
      cancellationPolicy: 'moderate' as const,
      ratingAvg: 4.7,
      totalReviews: 445,
    },
    // ── México ────────────────────────────────────────────────────────────────
    {
      id: 'club-cdmx-1',
      ownerId: adminUser.id,
      name: 'Polanco Padel Club',
      description:
        'Club premium en la mejor zona de Ciudad de México. 6 canchas indoor con clima controlado.',
      country: 'MX',
      city: 'Ciudad de México',
      currency: 'MXN',
      address: 'Av. Presidente Masaryk 61, Polanco',
      latitude: 19.432,
      longitude: -99.19,
      subscriptionTier: 'club_pro' as const,
      verified: true,
      sports: ['padel', 'pickleball'] as ['padel', 'pickleball'],
      amenities: ['parking', 'vestuarios', 'restaurante', 'tienda'],
      cancellationPolicy: 'flexible' as const,
      ratingAvg: 4.8,
      totalReviews: 321,
    },
    // ── USA ───────────────────────────────────────────────────────────────────
    {
      id: 'club-miami-1',
      ownerId: adminUser.id,
      name: 'Miami Pickleball & Padel Center',
      description:
        'The premier racket sports facility in South Florida. 12 pickleball courts, 4 padel courts, pro shop.',
      country: 'US',
      city: 'Miami',
      currency: 'USD',
      address: '1200 Brickell Ave, Miami, FL 33131',
      latitude: 25.7617,
      longitude: -80.1918,
      subscriptionTier: 'club_pro' as const,
      verified: true,
      sports: ['padel', 'pickleball'] as ['padel', 'pickleball'],
      amenities: ['parking', 'locker_rooms', 'pro_shop', 'cafe', 'coaching'],
      cancellationPolicy: 'moderate' as const,
      ratingAvg: 4.9,
      totalReviews: 1203,
    },
  ]

  const createdClubs: Record<string, { id: string }> = {}
  for (const club of clubsData) {
    const c = await prisma.club.upsert({
      where: { id: club.id },
      update: {},
      create: { ...club, isActive: true },
    })
    createdClubs[club.id] = c
  }
  console.log(`  ✅ ${clubsData.length} clubs (CO, ES, MX, US)`)

  // ════════════════════════════════════════════════════════════════════════════
  // 4. CANCHAS
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🎾 Creando canchas...')

  const courtsData = [
    // Bogotá Padel Club — 4 pádel + 2 pickleball
    {
      clubId: 'club-bogota-1',
      name: 'Pista 1 — Cristal VIP',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 70000,
      peakPrice: 110000,
      currency: 'COP',
      sponsorId: sponsorBullpadel.id,
    },
    {
      clubId: 'club-bogota-1',
      name: 'Pista 2 — Cristal',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 60000,
      peakPrice: 90000,
      currency: 'COP',
    },
    {
      clubId: 'club-bogota-1',
      name: 'Pista 3 — Cristal',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 60000,
      peakPrice: 90000,
      currency: 'COP',
    },
    {
      clubId: 'club-bogota-1',
      name: 'Pista 4 — Panorámica',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: false,
      basePrice: 55000,
      peakPrice: 80000,
      currency: 'COP',
    },
    {
      clubId: 'club-bogota-1',
      name: 'Pickleball 1',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: true,
      basePrice: 40000,
      peakPrice: 60000,
      currency: 'COP',
    },
    {
      clubId: 'club-bogota-1',
      name: 'Pickleball 2',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: true,
      basePrice: 40000,
      peakPrice: 60000,
      currency: 'COP',
    },
    // Chicó Racket Club — 2 pádel
    {
      clubId: 'club-bogota-2',
      name: 'Pista A',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 50000,
      peakPrice: 75000,
      currency: 'COP',
    },
    {
      clubId: 'club-bogota-2',
      name: 'Pista B',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 50000,
      peakPrice: 75000,
      currency: 'COP',
    },
    // El Poblado Medellín — 3 pádel
    {
      clubId: 'club-medellin-1',
      name: 'Pista Principal',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 65000,
      peakPrice: 95000,
      currency: 'COP',
    },
    {
      clubId: 'club-medellin-1',
      name: 'Pista 2',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 60000,
      peakPrice: 88000,
      currency: 'COP',
    },
    {
      clubId: 'club-medellin-1',
      name: 'Pista 3 — Exterior',
      sport: 'padel' as const,
      surface: 'hierba_artificial',
      isIndoor: false,
      basePrice: 50000,
      peakPrice: 70000,
      currency: 'COP',
    },
    // Cali — 2 pádel + 1 pickleball
    {
      clubId: 'club-cali-1',
      name: 'Pista Sur',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 45000,
      peakPrice: 65000,
      currency: 'COP',
    },
    {
      clubId: 'club-cali-1',
      name: 'Pista Norte',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 45000,
      peakPrice: 65000,
      currency: 'COP',
    },
    {
      clubId: 'club-cali-1',
      name: 'Pickle Court',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 30000,
      peakPrice: 45000,
      currency: 'COP',
    },
    // Madrid — 4 pádel
    {
      clubId: 'club-madrid-1',
      name: 'Pista 1 — Indoor Premium',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 18,
      peakPrice: 28,
      currency: 'EUR',
      sponsorId: sponsorHead.id,
    },
    {
      clubId: 'club-madrid-1',
      name: 'Pista 2 — Indoor',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 16,
      peakPrice: 24,
      currency: 'EUR',
    },
    {
      clubId: 'club-madrid-1',
      name: 'Pista 3 — Indoor',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 16,
      peakPrice: 24,
      currency: 'EUR',
    },
    {
      clubId: 'club-madrid-1',
      name: 'Pista 4 — Outdoor',
      sport: 'padel' as const,
      surface: 'hierba_artificial',
      isIndoor: false,
      basePrice: 12,
      peakPrice: 18,
      currency: 'EUR',
    },
    // Barcelona — 2 pádel + 2 pickleball
    {
      clubId: 'club-barcelona-1',
      name: 'Pista Mar 1',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: false,
      basePrice: 20,
      peakPrice: 32,
      currency: 'EUR',
    },
    {
      clubId: 'club-barcelona-1',
      name: 'Pista Mar 2',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: false,
      basePrice: 20,
      peakPrice: 32,
      currency: 'EUR',
    },
    {
      clubId: 'club-barcelona-1',
      name: 'Pickle 1 — Beach',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 14,
      peakPrice: 22,
      currency: 'EUR',
    },
    {
      clubId: 'club-barcelona-1',
      name: 'Pickle 2 — Beach',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 14,
      peakPrice: 22,
      currency: 'EUR',
    },
    // CDMX — 3 pádel + 1 pickleball
    {
      clubId: 'club-cdmx-1',
      name: 'Court 1 — Premium',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 350,
      peakPrice: 520,
      currency: 'MXN',
    },
    {
      clubId: 'club-cdmx-1',
      name: 'Court 2',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 300,
      peakPrice: 450,
      currency: 'MXN',
    },
    {
      clubId: 'club-cdmx-1',
      name: 'Pickleball Court',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: true,
      basePrice: 250,
      peakPrice: 380,
      currency: 'MXN',
    },
    // Miami — 2 pádel + 4 pickleball
    {
      clubId: 'club-miami-1',
      name: 'Padel Court 1',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 35,
      peakPrice: 55,
      currency: 'USD',
    },
    {
      clubId: 'club-miami-1',
      name: 'Padel Court 2',
      sport: 'padel' as const,
      surface: 'cristal',
      isIndoor: true,
      basePrice: 35,
      peakPrice: 55,
      currency: 'USD',
      sponsorId: sponsorSelkirk.id,
    },
    {
      clubId: 'club-miami-1',
      name: 'Pickleball Court 1',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 22,
      peakPrice: 35,
      currency: 'USD',
    },
    {
      clubId: 'club-miami-1',
      name: 'Pickleball Court 2',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 22,
      peakPrice: 35,
      currency: 'USD',
    },
    {
      clubId: 'club-miami-1',
      name: 'Pickleball Court 3',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 22,
      peakPrice: 35,
      currency: 'USD',
    },
    {
      clubId: 'club-miami-1',
      name: 'Pickleball Court 4',
      sport: 'pickleball' as const,
      surface: 'cemento',
      isIndoor: false,
      basePrice: 22,
      peakPrice: 35,
      currency: 'USD',
    },
  ]

  const createdCourts: { id: string; basePrice: number; peakPrice: number; currency: string }[] = []
  for (const court of courtsData) {
    const { basePrice, peakPrice, currency, ...courtData } = court
    const c = await prisma.court.create({
      data: { ...courtData, currency, capacity: 4, isActive: true },
    })
    createdCourts.push({ id: c.id, basePrice, peakPrice, currency })
  }
  console.log(`  ✅ ${createdCourts.length} canchas`)

  // ════════════════════════════════════════════════════════════════════════════
  // 5. TIME SLOTS — 14 días hacia adelante
  // ════════════════════════════════════════════════════════════════════════════

  console.log('📅 Generando slots de reserva (14 días)...')

  const allSlots: object[] = []
  for (const court of createdCourts) {
    for (let day = 0; day < 14; day++) {
      const date = dateStr(day)
      for (let hour = 7; hour < 22; hour++) {
        const startH = hour.toString().padStart(2, '0')
        const endH = (hour + 1).toString().padStart(2, '0')
        const isPeak = hour < 10 || hour >= 18
        allSlots.push({
          courtId: court.id,
          date,
          startTime: `${startH}:00`,
          endTime: `${endH}:00`,
          basePrice: court.basePrice,
          peakPrice: court.peakPrice,
          currency: court.currency,
          isPeak,
        })
      }
    }
  }

  // Insertar en lotes de 500
  for (let i = 0; i < allSlots.length; i += 500) {
    await prisma.timeSlot.createMany({
      data: allSlots.slice(i, i + 500) as any[],
      skipDuplicates: true,
    })
  }
  console.log(`  ✅ ${allSlots.length} slots generados`)

  // ════════════════════════════════════════════════════════════════════════════
  // 6. JUGADORES
  // ════════════════════════════════════════════════════════════════════════════

  console.log('👥 Creando jugadores...')

  const playersData = [
    // Instructores verificados
    {
      email: 'pablo.instructor@racketly.app',
      name: 'Pablo Herranz',
      elo: 1820,
      eloPick: 1600,
      cat: 'A' as const,
      city: 'Madrid',
      country: 'ES',
      xp: 18500,
      tier: 'instructor' as const,
      sport: 'padel' as const,
    },
    {
      email: 'maria.coach@racketly.app',
      name: 'María Fernández',
      elo: 1780,
      eloPick: 1550,
      cat: 'A' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 15200,
      tier: 'instructor' as const,
      sport: 'both' as const,
    },
    {
      email: 'john.coach@racketly.app',
      name: 'John Williams',
      elo: 1650,
      eloPick: 1900,
      cat: 'B1' as const,
      city: 'Miami',
      country: 'US',
      xp: 12400,
      tier: 'instructor' as const,
      sport: 'pickleball' as const,
    },
    // Jugadores Pro
    {
      email: 'carlos.pro@racketly.app',
      name: 'Carlos Martínez',
      elo: 1720,
      eloPick: 1400,
      cat: 'A' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 22000,
      tier: 'pro' as const,
      sport: 'padel' as const,
    },
    {
      email: 'ana.pro@racketly.app',
      name: 'Ana García',
      elo: 1680,
      eloPick: 1380,
      cat: 'A' as const,
      city: 'Medellín',
      country: 'CO',
      xp: 19500,
      tier: 'pro' as const,
      sport: 'padel' as const,
    },
    {
      email: 'miguel.pro@racketly.app',
      name: 'Miguel Torres',
      elo: 1620,
      eloPick: 1550,
      cat: 'B1' as const,
      city: 'Madrid',
      country: 'ES',
      xp: 16800,
      tier: 'pro' as const,
      sport: 'both' as const,
    },
    {
      email: 'sofia.pro@racketly.app',
      name: 'Sofía Ramos',
      elo: 1580,
      eloPick: 1480,
      cat: 'B1' as const,
      city: 'Barcelona',
      country: 'ES',
      xp: 14200,
      tier: 'pro' as const,
      sport: 'padel' as const,
    },
    {
      email: 'david.pro@racketly.app',
      name: 'David Chen',
      elo: 1420,
      eloPick: 1720,
      cat: 'B2' as const,
      city: 'Miami',
      country: 'US',
      xp: 11000,
      tier: 'pro' as const,
      sport: 'pickleball' as const,
    },
    // Jugadores Amateur Premium
    {
      email: 'laura.amateur@racketly.app',
      name: 'Laura Sánchez',
      elo: 1380,
      eloPick: 1200,
      cat: 'B2' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 6500,
      tier: 'amateur' as const,
      sport: 'padel' as const,
    },
    {
      email: 'juan.amateur@racketly.app',
      name: 'Juan Pablo Ríos',
      elo: 1340,
      eloPick: 1150,
      cat: 'B3' as const,
      city: 'Cali',
      country: 'CO',
      xp: 5200,
      tier: 'amateur' as const,
      sport: 'padel' as const,
    },
    {
      email: 'valentina@racketly.app',
      name: 'Valentina Pérez',
      elo: 1290,
      eloPick: 1100,
      cat: 'B3' as const,
      city: 'Medellín',
      country: 'CO',
      xp: 4100,
      tier: 'amateur' as const,
      sport: 'both' as const,
    },
    {
      email: 'alejandro@racketly.app',
      name: 'Alejandro Ruiz',
      elo: 1250,
      eloPick: 1080,
      cat: 'C1' as const,
      city: 'Ciudad de México',
      country: 'MX',
      xp: 3200,
      tier: 'amateur' as const,
      sport: 'padel' as const,
    },
    {
      email: 'camila@racketly.app',
      name: 'Camila Vargas',
      elo: 1210,
      eloPick: 1050,
      cat: 'C1' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 2800,
      tier: 'amateur' as const,
      sport: 'padel' as const,
    },
    {
      email: 'andrés@racketly.app',
      name: 'Andrés Molina',
      elo: 1180,
      eloPick: 1020,
      cat: 'C2' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 1900,
      tier: 'free' as const,
      sport: 'padel' as const,
    },
    // Free tier
    {
      email: 'lucia@racketly.app',
      name: 'Lucía Morales',
      elo: 1150,
      eloPick: 980,
      cat: 'C2' as const,
      city: 'Madrid',
      country: 'ES',
      xp: 1200,
      tier: 'free' as const,
      sport: 'padel' as const,
    },
    {
      email: 'roberto@racketly.app',
      name: 'Roberto Lima',
      elo: 1100,
      eloPick: 950,
      cat: 'C3' as const,
      city: 'Barcelona',
      country: 'ES',
      xp: 800,
      tier: 'free' as const,
      sport: 'pickleball' as const,
    },
    {
      email: 'isabella@racketly.app',
      name: 'Isabella Costa',
      elo: 1060,
      eloPick: 920,
      cat: 'C3' as const,
      city: 'Miami',
      country: 'US',
      xp: 500,
      tier: 'free' as const,
      sport: 'pickleball' as const,
    },
    {
      email: 'nuevo@racketly.app',
      name: 'Diego Nuevo',
      elo: 1000,
      eloPick: 1000,
      cat: 'C4' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 50,
      tier: 'free' as const,
      sport: 'padel' as const,
    },
    // Jugadores adicionales para pruebas de reservas
    {
      email: 'sara.vega@racketly.app',
      name: 'Sara Vega',
      elo: 1350,
      eloPick: 1180,
      cat: 'B3' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 4800,
      tier: 'amateur' as const,
      sport: 'padel' as const,
    },
    {
      email: 'felipe.ossa@racketly.app',
      name: 'Felipe Ossa',
      elo: 1310,
      eloPick: 1120,
      cat: 'B3' as const,
      city: 'Medellín',
      country: 'CO',
      xp: 3900,
      tier: 'amateur' as const,
      sport: 'padel' as const,
    },
    {
      email: 'natalia.reyes@racketly.app',
      name: 'Natalia Reyes',
      elo: 1270,
      eloPick: 1090,
      cat: 'C1' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 2600,
      tier: 'amateur' as const,
      sport: 'both' as const,
    },
    {
      email: 'sebastian.cano@racketly.app',
      name: 'Sebastián Cano',
      elo: 1230,
      eloPick: 1060,
      cat: 'C1' as const,
      city: 'Cali',
      country: 'CO',
      xp: 2100,
      tier: 'free' as const,
      sport: 'padel' as const,
    },
    {
      email: 'mariana.gil@racketly.app',
      name: 'Mariana Gil',
      elo: 1195,
      eloPick: 1030,
      cat: 'C2' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 1700,
      tier: 'free' as const,
      sport: 'padel' as const,
    },
    {
      email: 'tomas.pardo@racketly.app',
      name: 'Tomás Pardo',
      elo: 1160,
      eloPick: 990,
      cat: 'C2' as const,
      city: 'Bogotá',
      country: 'CO',
      xp: 1400,
      tier: 'free' as const,
      sport: 'padel' as const,
    },
    {
      email: 'elena.suarez@racketly.app',
      name: 'Elena Suárez',
      elo: 1490,
      eloPick: 1320,
      cat: 'B2' as const,
      city: 'Madrid',
      country: 'ES',
      xp: 8200,
      tier: 'pro' as const,
      sport: 'padel' as const,
    },
    {
      email: 'jorge.blanco@racketly.app',
      name: 'Jorge Blanco',
      elo: 1440,
      eloPick: 1280,
      cat: 'B2' as const,
      city: 'Barcelona',
      country: 'ES',
      xp: 7100,
      tier: 'pro' as const,
      sport: 'both' as const,
    },
    {
      email: 'kevin.smith@racketly.app',
      name: 'Kevin Smith',
      elo: 1380,
      eloPick: 1650,
      cat: 'B3' as const,
      city: 'Miami',
      country: 'US',
      xp: 5500,
      tier: 'amateur' as const,
      sport: 'pickleball' as const,
    },
    {
      email: 'ashley.jones@racketly.app',
      name: 'Ashley Jones',
      elo: 1300,
      eloPick: 1580,
      cat: 'B3' as const,
      city: 'Miami',
      country: 'US',
      xp: 4200,
      tier: 'amateur' as const,
      sport: 'pickleball' as const,
    },
    {
      email: 'marco.rios@racketly.app',
      name: 'Marco Ríos',
      elo: 1520,
      eloPick: 1350,
      cat: 'B1' as const,
      city: 'Ciudad de México',
      country: 'MX',
      xp: 9800,
      tier: 'pro' as const,
      sport: 'padel' as const,
    },
    {
      email: 'daniela.mora@racketly.app',
      name: 'Daniela Mora',
      elo: 1460,
      eloPick: 1290,
      cat: 'B2' as const,
      city: 'Ciudad de México',
      country: 'MX',
      xp: 7600,
      tier: 'pro' as const,
      sport: 'padel' as const,
    },
  ]

  const createdPlayers: Record<string, string> = {} // email → userId
  for (const p of playersData) {
    const user = await prisma.user.upsert({
      where: { email: p.email },
      update: {},
      create: {
        email: p.email,
        passwordHash: await hash('Test2026!'),
        subscriptionTier: p.tier,
        playerProfile: {
          create: {
            displayName: p.name,
            country: p.country,
            city: p.city,
            sport: p.sport,
            eloPadel: p.elo,
            eloPickleball: p.eloPick,
            category: p.cat,
            xpPoints: p.xp,
            level: Math.max(1, Math.floor(p.xp / 1500)),
          },
        },
      },
    })
    createdPlayers[p.email] = user.id
  }

  console.log(`  ✅ ${playersData.length} jugadores creados`)

  // ════════════════════════════════════════════════════════════════════════════
  // 7. PERFILES DE INSTRUCTOR
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🎓 Creando perfiles de instructor...')

  const instructorProfiles = [
    {
      userId: createdPlayers['pablo.instructor@racketly.app'],
      displayName: 'Pablo Herranz',
      bio: 'Ex jugador del circuito WPT con 15 años de experiencia como entrenador. Especialista en técnica de bandeja y víbora. He entrenado a más de 200 jugadores de todos los niveles.',
      verified: true,
      certifications: [
        'Certificación FEP Nivel 3',
        'Entrenador Nacional RFEP',
        'Preparador Físico Certificado',
      ],
      specialty: ['Técnica avanzada', 'Táctica de pareja', 'Preparación física'],
      sport: 'padel' as const,
      country: 'ES',
      city: 'Madrid',
      hourlyRate: 80,
      currency: 'EUR',
      ratingAvg: 4.9,
      totalReviews: 124,
    },
    {
      userId: createdPlayers['maria.coach@racketly.app'],
      displayName: 'María Fernández',
      bio: 'Entrenadora certificada FEP y USAPA. Especialista en transición de pádel a pickleball. Clases individuales y grupales en Bogotá y online.',
      verified: true,
      certifications: ['FEP Nivel 2', 'USAPA Instructor Certified', 'Personal Trainer ISSA'],
      specialty: ['Iniciación', 'Técnica de golpes', 'Pádel y Pickleball'],
      sport: 'both' as const,
      country: 'CO',
      city: 'Bogotá',
      hourlyRate: 150000,
      currency: 'COP',
      ratingAvg: 4.8,
      totalReviews: 87,
    },
    {
      userId: createdPlayers['john.coach@racketly.app'],
      displayName: 'John Williams',
      bio: 'Former PPA Tour player. Pickleball coach specializing in dinking strategy, third shot drops and tournament preparation. Available in-person in Miami and online worldwide.',
      verified: true,
      certifications: ['PPR Certified Pro', 'IPTPA Level 3', 'ACE Fitness Certified'],
      specialty: ['Dinking strategy', 'Third shot drops', 'Tournament prep', 'Kitchen game'],
      sport: 'pickleball' as const,
      country: 'US',
      city: 'Miami',
      hourlyRate: 120,
      currency: 'USD',
      ratingAvg: 5.0,
      totalReviews: 203,
    },
  ]

  for (const ip of instructorProfiles) {
    await prisma.instructorProfile.upsert({
      where: { userId: ip.userId },
      update: {},
      create: ip,
    })
  }

  // Sesiones presenciales de instructores
  await prisma.instructorSession.createMany({
    data: [
      {
        instructorId: createdPlayers['pablo.instructor@racketly.app'],
        title: 'Clínica de Bandeja y Víbora',
        sport: 'padel',
        level: 'intermediate',
        clubId: 'club-madrid-1',
        locationDescription: 'Madrid Padel Premium — Pista 1',
        date: dateStr(3),
        startTime: '10:00',
        durationMinutes: 90,
        maxStudents: 4,
        pricePerPerson: 45,
        currency: 'EUR',
        bookedCount: 2,
        status: 'open',
      },
      {
        instructorId: createdPlayers['maria.coach@racketly.app'],
        title: 'Iniciación al Pádel — Grupo Principiantes',
        sport: 'padel',
        level: 'beginner',
        clubId: 'club-bogota-1',
        locationDescription: 'Bogotá Padel Club — Pista 3',
        date: dateStr(2),
        startTime: '09:00',
        durationMinutes: 60,
        maxStudents: 6,
        pricePerPerson: 80000,
        currency: 'COP',
        bookedCount: 3,
        status: 'open',
      },
      {
        instructorId: createdPlayers['john.coach@racketly.app'],
        title: 'Pickleball Strategy — Intermediate Group',
        sport: 'pickleball',
        level: 'intermediate',
        clubId: 'club-miami-1',
        locationDescription: 'Miami Pickleball Center — Court 1',
        date: dateStr(5),
        startTime: '08:00',
        durationMinutes: 120,
        maxStudents: 4,
        pricePerPerson: 85,
        currency: 'USD',
        bookedCount: 1,
        status: 'open',
      },
    ],
    skipDuplicates: true,
  })

  console.log('  ✅ 3 instructores + sesiones presenciales')

  // ════════════════════════════════════════════════════════════════════════════
  // 8. TORNEOS
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🏆 Creando torneos...')

  const tournaments = [
    // ── Abiertos (inscripción activa) ─────────────────────────────────────────
    {
      id: 'torneo-bogota-b-1',
      clubId: 'club-bogota-1',
      organizerId: adminUser.id,
      name: 'Copa Racketly Bogotá — Categoría B',
      description:
        'El torneo más esperado del año en Bogotá. Formato dobles, round robin + cuadro final. Premios en efectivo y trofeos.',
      sport: 'padel' as const,
      format: 'groups_bracket' as const,
      type: 'pairs' as const,
      category: 'B3' as const,
      maxParticipants: 16,
      currentParticipants: 8,
      entryFee: 120000,
      currency: 'COP',
      prizeInfo: '1ro: $500.000 COP + trofeo | 2do: $250.000 COP | 3ro: $100.000 COP',
      location: 'Bogotá Padel Club, Usaquén',
      registrationStart: new Date(),
      registrationEnd: addDays(10),
      startDate: addDays(14),
      endDate: addDays(15),
      status: 'open' as const,
      sponsorId: sponsorBullpadel.id,
      sponsorLogoUrl: 'https://example.com/logos/bullpadel.png',
    },
    {
      id: 'torneo-miami-pickle-1',
      clubId: 'club-miami-1',
      organizerId: adminUser.id,
      name: 'Miami Open Pickleball — Mixed Doubles',
      description:
        'First Racketly sanctioned pickleball tournament in South Florida. Mixed doubles format, round robin + bracket.',
      sport: 'pickleball' as const,
      format: 'elimination' as const,
      type: 'mixed' as const,
      category: 'B2' as const,
      maxParticipants: 32,
      currentParticipants: 14,
      entryFee: 75,
      currency: 'USD',
      prizeInfo: '1st: $500 USD | 2nd: $250 USD | 3rd: $100 USD',
      location: 'Miami Pickleball & Padel Center, Brickell',
      registrationStart: new Date(),
      registrationEnd: addDays(7),
      startDate: addDays(21),
      endDate: addDays(22),
      status: 'open' as const,
      sponsorId: sponsorSelkirk.id,
      sponsorLogoUrl: 'https://example.com/logos/selkirk.png',
    },
    {
      id: 'torneo-madrid-open-1',
      clubId: 'club-madrid-1',
      organizerId: adminUser.id,
      name: 'Madrid Padel Open — Categoría A',
      description:
        'Torneo de alto nivel en Madrid. Solo para jugadores de categoría A y Open. Sistema suizo con cuadro final.',
      sport: 'padel' as const,
      format: 'swiss' as const,
      type: 'pairs' as const,
      category: 'A' as const,
      maxParticipants: 24,
      currentParticipants: 18,
      entryFee: 60,
      currency: 'EUR',
      prizeInfo: '1ro: €800 + trofeo | 2do: €400 | 3ro: €200',
      location: 'Madrid Padel Premium',
      registrationStart: new Date(),
      registrationEnd: addDays(5),
      startDate: addDays(12),
      endDate: addDays(13),
      status: 'open' as const,
      sponsorId: sponsorHead.id,
      sponsorLogoUrl: 'https://example.com/logos/head.png',
    },
    // ── En curso ──────────────────────────────────────────────────────────────
    {
      id: 'torneo-medellin-en-curso',
      clubId: 'club-medellin-1',
      organizerId: adminUser.id,
      name: 'Liga El Poblado — Temporada 2026',
      description: 'Liga mensual de El Poblado en curso. Categoría B1-B2.',
      sport: 'padel' as const,
      format: 'round_robin' as const,
      type: 'pairs' as const,
      category: 'B2' as const,
      maxParticipants: 12,
      currentParticipants: 12,
      entryFee: 80000,
      currency: 'COP',
      prizeInfo: 'Trofeos y medallas para top 3',
      location: 'El Poblado Padel, Medellín',
      registrationStart: addDays(-20),
      registrationEnd: addDays(-14),
      startDate: addDays(-7),
      endDate: addDays(7),
      status: 'in_progress' as const,
    },
    // ── Finalizados ───────────────────────────────────────────────────────────
    {
      id: 'torneo-cali-finalizado',
      clubId: 'club-cali-1',
      organizerId: adminUser.id,
      name: 'Copa Cali Padel — Abril 2026',
      description: 'Primer torneo de Racketly en Cali. ¡Gran éxito!',
      sport: 'padel' as const,
      format: 'elimination' as const,
      type: 'pairs' as const,
      category: 'C1' as const,
      maxParticipants: 8,
      currentParticipants: 8,
      entryFee: 60000,
      currency: 'COP',
      prizeInfo: 'Trofeos + noche gratis en el club',
      location: 'Cali Padel & Pickle',
      registrationStart: addDays(-45),
      registrationEnd: addDays(-35),
      startDate: addDays(-30),
      endDate: addDays(-29),
      status: 'completed' as const,
    },
  ]

  for (const t of tournaments) {
    await prisma.tournament.upsert({
      where: { id: t.id },
      update: {},
      create: t,
    })
  }

  console.log(`  ✅ ${tournaments.length} torneos (2 abiertos, 1 en curso, 1 finalizado)`)

  // ════════════════════════════════════════════════════════════════════════════
  // 9. PARTIDOS CON MARCADORES (para el torneo en curso y finalizado)
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🎯 Creando partidos y marcadores...')

  const p = createdPlayers // alias corto

  // Partidos del torneo en curso (Medellín)
  const matchesMedellin = [
    {
      tournamentId: 'torneo-medellin-en-curso',
      round: 1,
      player1Id: p['carlos.pro@racketly.app'],
      player2Id: p['laura.amateur@racketly.app'],
      score: [
        { player1: 6, player2: 3 },
        { player1: 6, player2: 4 },
      ],
      winnerId: p['carlos.pro@racketly.app'],
      status: 'completed' as const,
      isLive: false,
      startedAt: addDays(-6),
      finishedAt: addDays(-6),
    },
    {
      tournamentId: 'torneo-medellin-en-curso',
      round: 1,
      player1Id: p['ana.pro@racketly.app'],
      player2Id: p['juan.amateur@racketly.app'],
      score: [
        { player1: 6, player2: 2 },
        { player1: 6, player2: 1 },
      ],
      winnerId: p['ana.pro@racketly.app'],
      status: 'completed' as const,
      isLive: false,
      startedAt: addDays(-6),
      finishedAt: addDays(-6),
    },
    {
      tournamentId: 'torneo-medellin-en-curso',
      round: 2,
      player1Id: p['carlos.pro@racketly.app'],
      player2Id: p['ana.pro@racketly.app'],
      score: [
        { player1: 7, player2: 6 },
        { player1: 5, player2: 7 },
        { player1: 7, player2: 5 },
      ],
      winnerId: p['carlos.pro@racketly.app'],
      status: 'completed' as const,
      isLive: false,
      startedAt: addDays(-3),
      finishedAt: addDays(-3),
    },
    // Partido en VIVO ahora mismo
    {
      tournamentId: 'torneo-medellin-en-curso',
      round: 3,
      player1Id: p['miguel.pro@racketly.app'],
      player2Id: p['valentina@racketly.app'],
      score: [
        { player1: 6, player2: 4 },
        { player1: 3, player2: 2 },
      ],
      status: 'in_progress' as const,
      isLive: true,
      startedAt: new Date(),
    },
    // Partido programado
    {
      tournamentId: 'torneo-medellin-en-curso',
      round: 3,
      player1Id: p['carlos.pro@racketly.app'],
      player2Id: p['sofia.pro@racketly.app'],
      score: [],
      status: 'scheduled' as const,
      isLive: false,
      scheduledAt: addDays(2),
    },
  ]

  for (const match of matchesMedellin) {
    const { score, ...rest } = match
    await prisma.match.create({ data: { ...rest, score: score as any } })
  }

  console.log('  ✅ Partidos creados (incluyendo 1 en VIVO)')

  // ════════════════════════════════════════════════════════════════════════════
  // 10. ELO HISTORY (historial de cambios de ranking)
  // ════════════════════════════════════════════════════════════════════════════

  console.log('📈 Creando historial de ELO...')

  // Simulamos historial de ELO de los últimos 30 días para jugadores clave
  const eloHistoryData: object[] = []
  const eloJourney = [
    {
      playerId: p['carlos.pro@racketly.app'],
      deltas: [+18, +24, -12, +22, +16, -8, +30, +20, +14, -6],
    },
    {
      playerId: p['ana.pro@racketly.app'],
      deltas: [+22, -14, +18, +26, -10, +20, -8, +24, +18, +12],
    },
    {
      playerId: p['miguel.pro@racketly.app'],
      deltas: [+14, +20, -16, +18, +12, +24, -10, +16, +22, -8],
    },
  ]

  for (const journey of eloJourney) {
    let currentElo = 1500
    for (let i = 0; i < journey.deltas.length; i++) {
      const delta = journey.deltas[i]
      eloHistoryData.push({
        playerId: journey.playerId,
        matchId: null, // historial simulado sin partido específico
        sport: 'padel',
        eloBefore: currentElo,
        eloAfter: currentElo + delta,
        delta,
        createdAt: addDays(-(10 - i) * 3),
      })
      currentElo += delta
    }
  }

  await prisma.eloHistory.createMany({ data: eloHistoryData as any[], skipDuplicates: true })
  console.log(`  ✅ ${eloHistoryData.length} registros de ELO history`)

  // ════════════════════════════════════════════════════════════════════════════
  // 11. FIND A PARTNER — Solicitudes abiertas
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🤝 Creando solicitudes Find a Partner...')

  await prisma.matchRequest.createMany({
    data: [
      {
        requesterId: p['camila@racketly.app'],
        sport: 'padel',
        levelMin: 'C1',
        levelMax: 'B3',
        city: 'Bogotá',
        maxDistanceKm: 15,
        preferredDate: dateStr(1),
        timePreference: 'tarde (4pm-8pm)',
        message:
          '¡Hola! Busco pareja para mañana en la tarde. Tengo cancha reservada en Bogotá Padel Club. Nivel C1, jugando hace 1 año.',
        status: 'open',
        expiresAt: addDays(3),
      },
      {
        requesterId: p['alejandro@racketly.app'],
        sport: 'padel',
        levelMin: 'C2',
        levelMax: 'C1',
        city: 'Ciudad de México',
        maxDistanceKm: 20,
        preferredDate: dateStr(2),
        timePreference: 'mañana (8am-12pm)',
        message: 'Busco compañero para dobles el fin de semana. Zona Polanco / Santa Fe.',
        status: 'open',
        expiresAt: addDays(5),
      },
      {
        requesterId: p['roberto@racketly.app'],
        sport: 'pickleball',
        levelMin: 'C3',
        levelMax: 'C1',
        city: 'Barcelona',
        maxDistanceKm: 10,
        preferredDate: dateStr(3),
        timePreference: 'flexible',
        message:
          "Looking for a pickleball partner in Barcelona. Any level welcome, I'm still learning!",
        status: 'open',
        expiresAt: addDays(7),
      },
      {
        requesterId: p['isabella@racketly.app'],
        sport: 'pickleball',
        levelMin: 'C3',
        levelMax: 'B2',
        city: 'Miami',
        maxDistanceKm: 25,
        preferredDate: dateStr(1),
        timePreference: 'morning (7am-11am)',
        message:
          'Looking for doubles partner for tomorrow morning. I play at Brickell center regularly.',
        status: 'open',
        expiresAt: addDays(2),
      },
    ],
    skipDuplicates: true,
  })

  console.log('  ✅ 4 solicitudes Find a Partner')

  // ════════════════════════════════════════════════════════════════════════════
  // 12. COMUNIDAD — Grupos, Posts, Comentarios
  // ════════════════════════════════════════════════════════════════════════════

  console.log('👥 Creando comunidad...')

  const groups = [
    {
      id: 'group-tecnica-padel',
      name: 'Técnica de Pádel',
      category: 'technique' as const,
      sport: 'padel' as const,
      memberCount: 1243,
      description:
        'Todo sobre la técnica: golpes, posición, postura. Comparte tus videos y recibe feedback.',
    },
    {
      id: 'group-tactica-padel',
      name: 'Táctica y Estrategia',
      category: 'tactics' as const,
      sport: 'padel' as const,
      memberCount: 987,
      description: 'Análisis táctico, sistemas de juego, posicionamiento en cancha.',
    },
    {
      id: 'group-palas-reviews',
      name: 'Reseñas de Palas y Paletas',
      category: 'gear' as const,
      sport: 'padel' as const,
      memberCount: 2156,
      description: 'El grupo más completo de reviews de palas de pádel y paletas de pickleball.',
    },
    {
      id: 'group-pickleball-latam',
      name: 'Pickleball LATAM',
      category: 'general' as const,
      sport: 'pickleball' as const,
      memberCount: 634,
      description: 'La comunidad de pickleball más grande de Latinoamérica.',
    },
    {
      id: 'group-pickleball-usa',
      name: 'Pickleball USA & Canada',
      category: 'general' as const,
      sport: 'pickleball' as const,
      memberCount: 3421,
      description: 'The largest pickleball community on Racketly. Tips, tournaments, courts.',
    },
    {
      id: 'group-competicion-b',
      name: 'Categoría B — Competición',
      category: 'competition' as const,
      sport: 'padel' as const,
      memberCount: 789,
      description:
        'Para jugadores de categoría B1, B2 y B3. Organiza partidos y debates sobre torneos.',
    },
    {
      id: 'group-instructores',
      name: 'Red de Instructores',
      category: 'technique' as const,
      sport: 'both' as const,
      memberCount: 312,
      description:
        'Comunidad exclusiva para entrenadores certificados. Comparte metodologías y recursos.',
    },
    {
      id: 'group-clubs-managers',
      name: 'Gestores de Clubs',
      category: 'clubs' as const,
      sport: 'padel' as const,
      memberCount: 128,
      description: 'Para managers y dueños de clubs. Revenue, operaciones, marketing.',
    },
  ]

  for (const g of groups) {
    await prisma.group.upsert({
      where: { id: g.id },
      update: {},
      create: { ...g, isPrivate: false },
    })
  }

  // Posts de la comunidad
  const postsData = [
    {
      authorId: p['pablo.instructor@racketly.app'],
      type: 'text' as const,
      content:
        '🎾 TÉCNICA | El error más común en la bandeja: ¿Por qué falla tu bandeja?\n\nDespués de analizar cientos de vídeos de mis alumnos, el 80% comete el mismo error: van HACIA la pelota en lugar de esperar que llegue.\n\nLa bandeja perfecta requiere:\n1️⃣ Posición de espera con raqueta alta\n2️⃣ Girarse de lado al preparar\n3️⃣ Impacto en el punto más alto posible\n4️⃣ Acompañar hacia abajo, nunca cortar\n\n¿Cuál es tu mayor dificultad con la bandeja? 👇',
      sportTag: 'padel' as const,
      groupId: 'group-tecnica-padel',
      likesCount: 234,
      commentsCount: 48,
      isPremium: false,
    },
    {
      authorId: p['john.coach@racketly.app'],
      type: 'text' as const,
      content:
        "🏸 THE THIRD SHOT DROP — Why it's the most important shot in pickleball\n\nIf you're struggling to move from the baseline to the kitchen, you NEED to master the third shot drop.\n\nKey points:\n✅ Start low, finish low\n✅ Hit with an open face, not closed\n✅ Target: 1-2 feet past the kitchen line\n✅ Practice 50 a day minimum\n\nPro tip: Record yourself from the side. Most people think they're hitting soft but they're actually pushing. The drop should feel almost effortless. 🎯\n\n#pickleball #pickleballtips #thirdshot",
      sportTag: 'pickleball' as const,
      groupId: 'group-pickleball-usa',
      likesCount: 445,
      commentsCount: 89,
      isPremium: false,
    },
    {
      authorId: p['carlos.pro@racketly.app'],
      type: 'text' as const,
      content:
        '¡RESEÑA! 🎾 Bullpadel Hack 03 — Semana 1 de prueba\n\nLlevaba tiempo queriendo probar esta pala y por fin lo hice. Mis primeras impresiones:\n\n👍 PROS:\n• Control excepcional en defensa\n• Salida de bola muy limpia\n• Peso perfectamente distribuido (365g)\n• El marco de carbono 12K marca la diferencia en globos\n\n👎 CONTRAS:\n• Le cuesta un poco en remates muy potentes\n• El grip original es algo corto para mi mano\n• Precio elevado (~€200)\n\nPara jugadores de categoría B que priorizan el control sobre la potencia, es una pala TOP. 9/10 ⭐\n\n¿Alguien más la ha probado? ¡Comparten sus impresiones!',
      sportTag: 'padel' as const,
      groupId: 'group-palas-reviews',
      likesCount: 187,
      commentsCount: 62,
      isPremium: false,
    },
    {
      authorId: p['valentina@racketly.app'],
      type: 'text' as const,
      content:
        '🏸 Empezando con el pickleball después de 5 años de pádel...\n\nHace 3 semanas fui a una clínica de pickleball en Bogotá casi de casualidad. ¡Y me enamoré!\n\nLo que me sorprendió:\n- El kitchen game (área de no-voleo) es fascinante tácticamente\n- Es mucho más social y accesible que el pádel\n- La transición desde el pádel es más fácil de lo que pensaba\n- Los torneos de pickleball en LATAM están explotando\n\n¿Algún padelero que haya dado el salto? ¿Cómo fue su experiencia? 🙋‍♀️',
      sportTag: 'pickleball' as const,
      groupId: 'group-pickleball-latam',
      likesCount: 98,
      commentsCount: 31,
      isPremium: false,
    },
    {
      authorId: p['maria.coach@racketly.app'],
      type: 'text' as const,
      content:
        '🎓 CONTENIDO PREMIUM | Análisis táctico: El sistema 4-2 en defensa\n\nEsta semana en mi canal premium subo el vídeo más completo que he grabado: el análisis completo del sistema defensivo 4-2 que usan los mejores pares del circuito.\n\nCubro:\n• Cuándo usar el 4-2 vs el 3-3\n• Posiciones exactas en cada bola del rival\n• Transición a ataque desde el 4-2\n• 5 errores comunes al defender\n\nPara suscriptores Pro, disponible ahora. Para el resto, habrá un resumen gratuito el próximo lunes. 📹',
      sportTag: 'padel' as const,
      groupId: 'group-tactica-padel',
      likesCount: 156,
      commentsCount: 23,
      isPremium: true,
    },
    {
      authorId: p['david.pro@racketly.app'],
      type: 'text' as const,
      content:
        "📊 My pickleball stats after 6 months on Racketly:\n\n🏆 Tournaments: 8 played, 3 wins\n📈 ELO: 1480 → 1720 (+240 points)\n🎯 Win rate: 71%\n⚡ Longest streak: 7 wins\n\nBiggest improvement: my kitchen game. Started tracking my unforced errors and realized 60% came from the transition zone. Now I take the ball earlier and commit to the kitchen more decisively.\n\nRacketly's stats tracker has been a game changer for analyzing my game 📲\n\nWhat's your biggest improvement this year? Drop it below 👇",
      sportTag: 'pickleball' as const,
      groupId: 'group-pickleball-usa',
      likesCount: 312,
      commentsCount: 54,
      isPremium: false,
    },
  ]

  const createdPosts: { id: string }[] = []
  for (const post of postsData) {
    const created = await prisma.post.create({ data: post })
    createdPosts.push(created)
  }

  // Comentarios
  await prisma.comment.createMany({
    data: [
      {
        postId: createdPosts[0].id,
        authorId: p['laura.amateur@racketly.app'],
        content:
          '¡Exactamente mi problema! Llevo meses sin entender por qué mi bandeja siempre iba a la red. ¿Tienes algún ejercicio específico para practicar la posición de espera?',
        likesCount: 18,
      },
      {
        postId: createdPosts[0].id,
        authorId: p['alejandro@racketly.app'],
        content:
          'El punto 3 me cambió el juego completamente. Antes remataba en el punto más bajo y ahora espero y la bola sale mucho mejor. Gracias Pablo!',
        likesCount: 12,
      },
      {
        postId: createdPosts[1].id,
        authorId: p['isabella@racketly.app'],
        content:
          "I've been working on this for 3 months. The key for me was slowing down my backswing completely. Once I did that the drop started landing consistently.",
        likesCount: 34,
      },
      {
        postId: createdPosts[2].id,
        authorId: p['sofia.pro@racketly.app'],
        content:
          'La probé hace 2 semanas y coincido totalmente en el control. Para mí la mejor en defensa dentro del precio. La paleta original también me pareció corta, cambié al grip de cuero de Bullpadel y mejoró mucho.',
        likesCount: 28,
      },
    ],
    skipDuplicates: true,
  })

  console.log(`  ✅ ${groups.length} grupos + ${postsData.length} posts + comentarios`)

  // ════════════════════════════════════════════════════════════════════════════
  // 13. RESEÑAS DE EQUIPAMIENTO
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🏷️  Creando reseñas de palas...')

  await prisma.gearReview.createMany({
    data: [
      {
        reviewerId: p['carlos.pro@racketly.app'],
        brand: 'Bullpadel',
        model: 'Hack 03',
        sport: 'padel',
        rating: 9,
        reviewText:
          'Control excepcional y salida de bola limpia. Perfecta para jugadores de categoría B que priorizan la técnica sobre la potencia. El marco de carbono 12K marca la diferencia.',
        photos: [],
        verifiedPurchase: true,
      },
      {
        reviewerId: p['sofia.pro@racketly.app'],
        brand: 'HEAD',
        model: 'Delta Pro 2026',
        sport: 'padel',
        rating: 8,
        reviewText:
          'Muy buena pala para categoría A-B1. Tiene potencia y buen control. El punto dulce es amplio. Quizás le falta algo de tacto en bolas difíciles vs la Bullpadel, pero en ataque es superior.',
        photos: [],
        verifiedPurchase: true,
      },
      {
        reviewerId: p['david.pro@racketly.app'],
        brand: 'Selkirk',
        model: 'VANGUARD Power Air Epic',
        sport: 'pickleball',
        rating: 10,
        reviewText:
          "The best paddle I've ever played with. The power combined with control at the kitchen is unmatched. The carbon fiber face gives incredible spin. Worth every penny at $230. My tournament paddle without question.",
        photos: [],
        verifiedPurchase: true,
      },
      {
        reviewerId: p['john.coach@racketly.app'],
        brand: 'Franklin',
        model: 'Ben Johns Signature',
        sport: 'pickleball',
        rating: 9,
        reviewText:
          'Great paddle for intermediate to advanced players. The polymer core is soft enough for dinking but has enough pop for drives. Excellent for players transitioning from tennis.',
        photos: [],
        verifiedPurchase: false,
      },
    ],
    skipDuplicates: true,
  })

  console.log('  ✅ 4 reseñas de equipamiento')

  // ════════════════════════════════════════════════════════════════════════════
  // 14. ACADEMIA — Cursos y Lecciones
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🎓 Creando cursos de academia...')

  const courses = [
    {
      id: 'curso-padel-principiantes',
      instructorId: p['maria.coach@racketly.app'],
      title: 'Pádel desde Cero: De Principiante a C2',
      description:
        'El curso más completo para aprender pádel desde cero. Aprende todos los golpes básicos, la táctica inicial y los errores a evitar. Más de 1200 alumnos ya lo han completado.',
      sport: 'padel' as const,
      level: 'beginner' as const,
      type: 'video' as const,
      price: 0,
      currency: 'COP',
      isPremium: false,
      thumbnailUrl: 'https://example.com/courses/padel-principiantes.jpg',
      durationHours: 6.5,
      language: 'es',
      ratingAvg: 4.8,
      totalReviews: 312,
      isPublished: true,
    },
    {
      id: 'curso-padel-intermedio',
      instructorId: p['pablo.instructor@racketly.app'],
      title: 'Pádel Categoría B: Domina la Bandeja y el Smash',
      description:
        'Curso avanzado para jugadores de categoría C1 que quieren subir a B. Análisis técnico en vídeo, ejercicios con contador y clases tácticas de posicionamiento.',
      sport: 'padel' as const,
      level: 'intermediate' as const,
      type: 'video' as const,
      price: 49,
      currency: 'USD',
      isPremium: true,
      thumbnailUrl: 'https://example.com/courses/padel-intermedio.jpg',
      durationHours: 12,
      language: 'es',
      ratingAvg: 4.9,
      totalReviews: 187,
      isPublished: true,
    },
    {
      id: 'curso-padel-tactica-avanzada',
      instructorId: p['pablo.instructor@racketly.app'],
      title: 'Táctica Avanzada: Sistemas de Juego para Categoría A',
      description:
        'Para jugadores de categoría B1-A que quieren alcanzar el siguiente nivel. Análisis de partidos profesionales, sistemas ofensivos y defensivos, y preparación mental para torneos.',
      sport: 'padel' as const,
      level: 'advanced' as const,
      type: 'video' as const,
      price: 89,
      currency: 'USD',
      isPremium: true,
      thumbnailUrl: 'https://example.com/courses/padel-tactica.jpg',
      durationHours: 18,
      language: 'es',
      ratingAvg: 4.95,
      totalReviews: 94,
      isPublished: true,
    },
    {
      id: 'curso-pickleball-beginners',
      instructorId: p['john.coach@racketly.app'],
      title: 'Pickleball Fundamentals: Start Playing Today',
      description:
        "Complete beginner's guide to pickleball. Learn the rules, scoring, basic strokes, and kitchen strategy. Perfect for tennis, padel or racquetball players making the transition.",
      sport: 'pickleball' as const,
      level: 'beginner' as const,
      type: 'video' as const,
      price: 0,
      currency: 'USD',
      isPremium: false,
      thumbnailUrl: 'https://example.com/courses/pickleball-beginners.jpg',
      durationHours: 4,
      language: 'en',
      ratingAvg: 4.7,
      totalReviews: 445,
      isPublished: true,
    },
    {
      id: 'curso-pickleball-advanced',
      instructorId: p['john.coach@racketly.app'],
      title: 'Advanced Pickleball: From 4.0 to 5.0',
      description:
        'Designed for serious competitive players. Master erne shots, around-the-post shots, ATP, stacking strategies, and tournament mental game. Used by PPA Tour players.',
      sport: 'pickleball' as const,
      level: 'advanced' as const,
      type: 'video' as const,
      price: 129,
      currency: 'USD',
      isPremium: true,
      thumbnailUrl: 'https://example.com/courses/pickleball-advanced.jpg',
      durationHours: 22,
      language: 'en',
      ratingAvg: 5.0,
      totalReviews: 278,
      isPublished: true,
    },
    {
      id: 'curso-padel-pickleball-transicion',
      instructorId: p['maria.coach@racketly.app'],
      title: 'De Pádel a Pickleball: Guía de Transición',
      description:
        'Específicamente diseñado para padeleros. Entiende las diferencias técnicas y tácticas, aprovecha tus fortalezas del pádel y corrige los malos hábitos que te perjudicarán.',
      sport: 'pickleball' as const,
      level: 'beginner' as const,
      type: 'hybrid' as const,
      price: 35,
      currency: 'USD',
      isPremium: true,
      thumbnailUrl: 'https://example.com/courses/padel-a-pickleball.jpg',
      durationHours: 8,
      language: 'es',
      ratingAvg: 4.85,
      totalReviews: 156,
      isPublished: true,
    },
  ]

  for (const course of courses) {
    await prisma.course.upsert({ where: { id: course.id }, update: {}, create: course })
  }

  // Lecciones para el curso gratuito de pádel
  await prisma.lesson.createMany({
    data: [
      {
        courseId: 'curso-padel-principiantes',
        title: 'Introducción: El pádel y sus reglas',
        orderIndex: 1,
        videoDurationSeconds: 480,
        isFreePreview: true,
        description: 'Historia del pádel, reglas básicas, puntuación y el terreno de juego.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'El grip y la postura básica',
        orderIndex: 2,
        videoDurationSeconds: 720,
        isFreePreview: true,
        description: 'Cómo coger la pala correctamente y la postura inicial.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'El drive de derecha',
        orderIndex: 3,
        videoDurationSeconds: 960,
        isFreePreview: false,
        description: 'Técnica completa del golpe de derecha. Práctica con pared.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'El drive de revés',
        orderIndex: 4,
        videoDurationSeconds: 840,
        isFreePreview: false,
        description: 'Técnica del revés a una y dos manos.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'El servicio',
        orderIndex: 5,
        videoDurationSeconds: 1080,
        isFreePreview: false,
        description: 'Reglas del saque y los 3 tipos de servicio más usados.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'La volea básica',
        orderIndex: 6,
        videoDurationSeconds: 780,
        isFreePreview: false,
        description: 'Posición en la red y técnica de la volea.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'El globo defensivo',
        orderIndex: 7,
        videoDurationSeconds: 660,
        isFreePreview: false,
        description: 'El globo como herramienta defensiva fundamental.',
      },
      {
        courseId: 'curso-padel-principiantes',
        title: 'Primeros sistemas tácticos',
        orderIndex: 8,
        videoDurationSeconds: 1200,
        isFreePreview: false,
        description: 'Posicionamiento básico en cancha, laterales y centro.',
      },
      // Pickleball beginners
      {
        courseId: 'curso-pickleball-beginners',
        title: 'Welcome to Pickleball',
        orderIndex: 1,
        videoDurationSeconds: 360,
        isFreePreview: true,
        description: 'Why pickleball is the fastest growing sport and what to expect.',
      },
      {
        courseId: 'curso-pickleball-beginners',
        title: 'Rules, Scoring & Court Layout',
        orderIndex: 2,
        videoDurationSeconds: 720,
        isFreePreview: true,
        description: 'Complete rules walkthrough. Kitchen, NVZ, double bounce rule.',
      },
      {
        courseId: 'curso-pickleball-beginners',
        title: 'The Dink Shot',
        orderIndex: 3,
        videoDurationSeconds: 900,
        isFreePreview: false,
        description: 'The most important shot in pickleball. Cross-court and straight dinks.',
      },
      {
        courseId: 'curso-pickleball-beginners',
        title: 'Serving & Return',
        orderIndex: 4,
        videoDurationSeconds: 780,
        isFreePreview: false,
        description: 'Underhand serve rules and return strategy.',
      },
      {
        courseId: 'curso-pickleball-beginners',
        title: 'The Third Shot Drop',
        orderIndex: 5,
        videoDurationSeconds: 1080,
        isFreePreview: false,
        description: 'Why and how to execute the third shot drop consistently.',
      },
    ],
    skipDuplicates: true,
  })

  console.log(`  ✅ ${courses.length} cursos + lecciones`)

  // ════════════════════════════════════════════════════════════════════════════
  // 15. INSCRIPCIONES EN CURSOS
  // ════════════════════════════════════════════════════════════════════════════

  await prisma.enrollment.createMany({
    data: [
      {
        userId: p['camila@racketly.app'],
        courseId: 'curso-padel-principiantes',
        progressPercent: 87,
        lastLessonId: undefined,
      },
      {
        userId: p['andrés@racketly.app'],
        courseId: 'curso-padel-principiantes',
        progressPercent: 45,
      },
      {
        userId: p['nuevo@racketly.app'],
        courseId: 'curso-padel-principiantes',
        progressPercent: 12,
      },
      {
        userId: p['laura.amateur@racketly.app'],
        courseId: 'curso-padel-intermedio',
        progressPercent: 60,
      },
      {
        userId: p['juan.amateur@racketly.app'],
        courseId: 'curso-padel-intermedio',
        progressPercent: 30,
      },
      {
        userId: p['valentina@racketly.app'],
        courseId: 'curso-padel-pickleball-transicion',
        progressPercent: 100,
        completedAt: addDays(-5),
      },
      {
        userId: p['roberto@racketly.app'],
        courseId: 'curso-pickleball-beginners',
        progressPercent: 80,
      },
      {
        userId: p['isabella@racketly.app'],
        courseId: 'curso-pickleball-beginners',
        progressPercent: 100,
        completedAt: addDays(-10),
      },
      {
        userId: p['david.pro@racketly.app'],
        courseId: 'curso-pickleball-advanced',
        progressPercent: 55,
      },
    ],
    skipDuplicates: true,
  })

  console.log('  ✅ Inscripciones en cursos')

  // ════════════════════════════════════════════════════════════════════════════
  // 16. GAMIFICACIÓN — Badges y Misiones
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🏅 Creando badges y misiones...')

  const badges = [
    {
      code: 'welcome',
      name: 'Bienvenido a Racketly',
      description: 'Creaste tu cuenta en Racketly',
      iconUrl: '🎉',
      conditionType: 'signup',
      conditionValue: 1,
      xpReward: 25,
    },
    {
      code: 'first_booking',
      name: 'Primera Reserva',
      description: 'Reservaste tu primera cancha',
      iconUrl: '📅',
      conditionType: 'bookings',
      conditionValue: 1,
      xpReward: 100,
    },
    {
      code: 'ten_bookings',
      name: 'Habitual',
      description: 'Reservaste 10 canchas',
      iconUrl: '📆',
      conditionType: 'bookings',
      conditionValue: 10,
      xpReward: 300,
    },
    {
      code: 'first_match',
      name: 'Primer Partido',
      description: 'Jugaste tu primer partido',
      iconUrl: '🎾',
      conditionType: 'matches',
      conditionValue: 1,
      xpReward: 50,
    },
    {
      code: 'ten_matches',
      name: 'Veterano',
      description: 'Jugaste 10 partidos',
      iconUrl: '🏅',
      conditionType: 'matches',
      conditionValue: 10,
      xpReward: 200,
    },
    {
      code: 'fifty_matches',
      name: 'Guerrero',
      description: 'Jugaste 50 partidos',
      iconUrl: '⚔️',
      conditionType: 'matches',
      conditionValue: 50,
      xpReward: 500,
    },
    {
      code: 'first_win',
      name: 'Primera Victoria',
      description: 'Ganaste tu primer partido',
      iconUrl: '🏆',
      conditionType: 'wins',
      conditionValue: 1,
      xpReward: 100,
    },
    {
      code: 'win_streak_3',
      name: 'Buen Momento',
      description: '3 victorias seguidas',
      iconUrl: '🔥',
      conditionType: 'streak',
      conditionValue: 3,
      xpReward: 200,
    },
    {
      code: 'win_streak_5',
      name: 'En Racha',
      description: '5 victorias consecutivas',
      iconUrl: '🚀',
      conditionType: 'streak',
      conditionValue: 5,
      xpReward: 500,
    },
    {
      code: 'win_streak_10',
      name: 'Imparable',
      description: '10 victorias consecutivas',
      iconUrl: '⚡',
      conditionType: 'streak',
      conditionValue: 10,
      xpReward: 1500,
    },
    {
      code: 'first_tournament',
      name: 'Competidor',
      description: 'Participaste en tu primer torneo',
      iconUrl: '🎯',
      conditionType: 'tournaments',
      conditionValue: 1,
      xpReward: 150,
    },
    {
      code: 'tournament_win',
      name: 'Campeón',
      description: 'Ganaste un torneo',
      iconUrl: '👑',
      conditionType: 'tourn_wins',
      conditionValue: 1,
      xpReward: 1000,
    },
    {
      code: 'five_clubs',
      name: 'Explorador',
      description: 'Jugaste en 5 clubs distintos',
      iconUrl: '🗺️',
      conditionType: 'clubs',
      conditionValue: 5,
      xpReward: 400,
    },
    {
      code: 'community_post',
      name: 'Voz de la Comunidad',
      description: 'Publicaste tu primer post',
      iconUrl: '📢',
      conditionType: 'posts',
      conditionValue: 1,
      xpReward: 50,
    },
    {
      code: 'community_100',
      name: 'Influencer',
      description: '100 likes en tus publicaciones',
      iconUrl: '❤️',
      conditionType: 'likes',
      conditionValue: 100,
      xpReward: 300,
    },
    {
      code: 'course_complete',
      name: 'Estudioso',
      description: 'Completaste tu primer curso',
      iconUrl: '📚',
      conditionType: 'courses',
      conditionValue: 1,
      xpReward: 200,
    },
    {
      code: 'find_partner',
      name: 'Sociable',
      description: 'Encontraste pareja de juego',
      iconUrl: '🤝',
      conditionType: 'partners',
      conditionValue: 1,
      xpReward: 100,
    },
    {
      code: 'elo_1200',
      name: 'En Progreso',
      description: 'Alcanzaste 1200 ELO',
      iconUrl: '📊',
      conditionType: 'elo',
      conditionValue: 1200,
      xpReward: 250,
    },
    {
      code: 'elo_1400',
      name: 'Competitivo',
      description: 'Alcanzaste 1400 ELO',
      iconUrl: '📈',
      conditionType: 'elo',
      conditionValue: 1400,
      xpReward: 500,
    },
    {
      code: 'elo_1600',
      name: 'Élite',
      description: 'Alcanzaste 1600 ELO — ¡Eres de los mejores!',
      iconUrl: '🌟',
      conditionType: 'elo',
      conditionValue: 1600,
      xpReward: 1000,
    },
    {
      code: 'level_5',
      name: 'Nivel 5',
      description: 'Alcanzaste el nivel 5 en Racketly',
      iconUrl: '⭐',
      conditionType: 'level',
      conditionValue: 5,
      xpReward: 300,
    },
    {
      code: 'level_10',
      name: 'Nivel 10',
      description: '¡Nivel 10! Eres parte de la élite',
      iconUrl: '🌠',
      conditionType: 'level',
      conditionValue: 10,
      xpReward: 1000,
    },
    {
      code: 'padel_pickleball',
      name: 'Dos Deportes',
      description: 'Jugaste pádel y pickleball en Racketly',
      iconUrl: '🎽',
      conditionType: 'both_sports',
      conditionValue: 1,
      xpReward: 200,
    },
    {
      code: 'multi_country',
      name: 'Global',
      description: 'Jugaste en 2 países distintos',
      iconUrl: '🌎',
      conditionType: 'countries',
      conditionValue: 2,
      xpReward: 600,
    },
  ]

  for (const badge of badges) {
    await prisma.badge.upsert({ where: { code: badge.code }, update: {}, create: badge })
  }

  // Misiones activas
  const missions = [
    {
      title: 'Reserva esta semana',
      description: 'Haz una reserva de cancha esta semana',
      xpReward: 50,
      isRecurring: true,
      endDate: addDays(7),
    },
    {
      title: '3 partidos en mayo',
      description: 'Juega 3 partidos durante el mes de mayo',
      xpReward: 200,
      isRecurring: false,
      endDate: addDays(20),
    },
    {
      title: 'Conoce un club nuevo',
      description: 'Reserva en un club en el que nunca hayas jugado',
      xpReward: 150,
      isRecurring: false,
    },
    {
      title: 'Comparte en la comunidad',
      description: 'Publica algo en la comunidad esta semana',
      xpReward: 75,
      isRecurring: true,
      endDate: addDays(7),
    },
    {
      title: 'Completa una lección',
      description: 'Termina al menos una lección de academia',
      xpReward: 100,
      isRecurring: true,
      endDate: addDays(14),
    },
    {
      title: 'Torneo del mes',
      description: 'Inscríbete en un torneo durante mayo',
      xpReward: 300,
      isRecurring: false,
      endDate: addDays(20),
    },
    {
      title: 'Reto Find a Partner',
      description: 'Usa Find a Partner para organizar un partido',
      xpReward: 120,
      isRecurring: false,
      endDate: addDays(30),
    },
    {
      title: 'Streak de 3 victorias',
      description: 'Gana 3 partidos consecutivos',
      xpReward: 250,
      isRecurring: false,
    },
  ]

  for (const mission of missions) {
    await prisma.mission.create({ data: { ...mission, isRecurring: mission.isRecurring ?? false } })
  }

  // Asignar badges a los jugadores top
  const badgeAssignments = [
    {
      userId: p['carlos.pro@racketly.app'],
      codes: [
        'welcome',
        'first_booking',
        'ten_bookings',
        'first_match',
        'ten_matches',
        'fifty_matches',
        'first_win',
        'win_streak_5',
        'first_tournament',
        'tournament_win',
        'elo_1400',
        'elo_1600',
        'level_10',
        'community_post',
      ],
    },
    {
      userId: p['ana.pro@racketly.app'],
      codes: [
        'welcome',
        'first_booking',
        'ten_bookings',
        'first_match',
        'ten_matches',
        'fifty_matches',
        'first_win',
        'win_streak_3',
        'first_tournament',
        'elo_1400',
        'elo_1600',
        'community_post',
      ],
    },
    {
      userId: p['pablo.instructor@racketly.app'],
      codes: [
        'welcome',
        'first_booking',
        'ten_bookings',
        'first_match',
        'ten_matches',
        'fifty_matches',
        'first_win',
        'win_streak_10',
        'first_tournament',
        'tournament_win',
        'elo_1600',
        'community_100',
        'course_complete',
        'level_10',
      ],
    },
    {
      userId: p['laura.amateur@racketly.app'],
      codes: [
        'welcome',
        'first_booking',
        'first_match',
        'ten_matches',
        'first_win',
        'first_tournament',
        'elo_1200',
        'community_post',
        'course_complete',
      ],
    },
    {
      userId: p['valentina@racketly.app'],
      codes: [
        'welcome',
        'first_booking',
        'first_match',
        'first_win',
        'elo_1200',
        'padel_pickleball',
        'course_complete',
        'community_post',
      ],
    },
    {
      userId: p['david.pro@racketly.app'],
      codes: [
        'welcome',
        'first_booking',
        'ten_bookings',
        'first_match',
        'ten_matches',
        'first_win',
        'win_streak_5',
        'first_tournament',
        'elo_1400',
        'padel_pickleball',
      ],
    },
    { userId: p['nuevo@racketly.app'], codes: ['welcome'] },
  ]

  for (const assignment of badgeAssignments) {
    const badgeRecords = await prisma.badge.findMany({ where: { code: { in: assignment.codes } } })
    for (const badge of badgeRecords) {
      await prisma.userBadge.upsert({
        where: { userId_badgeId: { userId: assignment.userId, badgeId: badge.id } },
        update: {},
        create: { userId: assignment.userId, badgeId: badge.id, notified: true },
      })
    }
  }

  console.log(`  ✅ ${badges.length} badges + ${missions.length} misiones`)

  // ════════════════════════════════════════════════════════════════════════════
  // 17. FOLLOWS (conexiones sociales)
  // ════════════════════════════════════════════════════════════════════════════

  const followPairs = [
    [p['carlos.pro@racketly.app'], p['pablo.instructor@racketly.app']],
    [p['ana.pro@racketly.app'], p['pablo.instructor@racketly.app']],
    [p['laura.amateur@racketly.app'], p['maria.coach@racketly.app']],
    [p['laura.amateur@racketly.app'], p['pablo.instructor@racketly.app']],
    [p['juan.amateur@racketly.app'], p['carlos.pro@racketly.app']],
    [p['valentina@racketly.app'], p['john.coach@racketly.app']],
    [p['nuevo@racketly.app'], p['carlos.pro@racketly.app']],
    [p['nuevo@racketly.app'], p['maria.coach@racketly.app']],
    [p['roberto@racketly.app'], p['john.coach@racketly.app']],
    [p['isabella@racketly.app'], p['john.coach@racketly.app']],
    [p['david.pro@racketly.app'], p['john.coach@racketly.app']],
  ]

  await prisma.follow.createMany({
    data: followPairs.map(([followerId, followingId]) => ({
      followerId,
      followingId,
      followingType: 'user',
    })),
    skipDuplicates: true,
  })

  console.log(`  ✅ ${followPairs.length} conexiones sociales`)

  // ════════════════════════════════════════════════════════════════════════════
  // MEMBERSHIP PLANS
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🎫 Creando planes de membresía...')

  const membershipPlansData = [
    // Madrid — 2 plans
    {
      id: 'plan-madrid-basico',
      clubId: 'club-madrid-1',
      name: 'Membresía Básica',
      description: '1 sesión diaria incluida. Ideal para jugadores habituales.',
      price: 49,
      currency: 'EUR',
      sessionsPerDay: 1,
      priceExtraSession: 0,
      isActive: true,
    },
    {
      id: 'plan-madrid-premium',
      clubId: 'club-madrid-1',
      name: 'Membresía Premium',
      description: '2 sesiones diarias incluidas + descuento en sesiones extra.',
      price: 79,
      currency: 'EUR',
      sessionsPerDay: 2,
      priceExtraSession: 0,
      isActive: true,
    },
    // Barcelona — 2 plans
    {
      id: 'plan-barcelona-basico',
      clubId: 'club-barcelona-1',
      name: 'Membresía Mensual',
      description: '1 sesión diaria incluida en cualquier pista.',
      price: 59,
      currency: 'EUR',
      sessionsPerDay: 1,
      priceExtraSession: 0,
      isActive: true,
    },
    {
      id: 'plan-barcelona-vip',
      clubId: 'club-barcelona-1',
      name: 'Membresía VIP Beach',
      description: '2 sesiones diarias + acceso prioritario a pistas de playa.',
      price: 99,
      currency: 'EUR',
      sessionsPerDay: 2,
      priceExtraSession: 0,
      isActive: true,
    },
  ]

  for (const plan of membershipPlansData) {
    await prisma.clubMembershipPlan.upsert({
      where: { id: plan.id },
      update: {},
      create: plan,
    })
  }

  console.log(`  ✅ ${membershipPlansData.length} planes de membresía`)

  // ════════════════════════════════════════════════════════════════════════════
  // CLUB ADMINS — multi-admin por grupo de clubs
  // ════════════════════════════════════════════════════════════════════════════

  console.log('🔑 Creando administradores de club...')

  // Obtener IDs de usuarios que serán admins (ya creados arriba)
  const carlosUser = await prisma.user.findUnique({ where: { email: 'carlos.pro@racketly.app' } })
  const miguelUser = await prisma.user.findUnique({ where: { email: 'miguel.pro@racketly.app' } })
  const juanUser = await prisma.user.findUnique({ where: { email: 'juan.amateur@racketly.app' } })
  const lauraUser = await prisma.user.findUnique({ where: { email: 'laura.amateur@racketly.app' } })

  const clubAdminsData = [
    // Grupo A: Carlos + Miguel → Bogotá 1, Bogotá 2, Medellín
    {
      id: 'ca-carlos-bog1',
      userId: carlosUser!.id,
      clubId: 'club-bogota-1',
      role: 'owner' as const,
    },
    {
      id: 'ca-carlos-bog2',
      userId: carlosUser!.id,
      clubId: 'club-bogota-2',
      role: 'owner' as const,
    },
    {
      id: 'ca-carlos-med',
      userId: carlosUser!.id,
      clubId: 'club-medellin-1',
      role: 'owner' as const,
    },
    {
      id: 'ca-miguel-bog1',
      userId: miguelUser!.id,
      clubId: 'club-bogota-1',
      role: 'admin' as const,
    },
    {
      id: 'ca-miguel-bog2',
      userId: miguelUser!.id,
      clubId: 'club-bogota-2',
      role: 'admin' as const,
    },
    {
      id: 'ca-miguel-med',
      userId: miguelUser!.id,
      clubId: 'club-medellin-1',
      role: 'admin' as const,
    },
    // Grupo B: Juan + Laura → Cali, Madrid
    { id: 'ca-juan-cali', userId: juanUser!.id, clubId: 'club-cali-1', role: 'owner' as const },
    { id: 'ca-juan-madrid', userId: juanUser!.id, clubId: 'club-madrid-1', role: 'owner' as const },
    { id: 'ca-laura-cali', userId: lauraUser!.id, clubId: 'club-cali-1', role: 'admin' as const },
    {
      id: 'ca-laura-madrid',
      userId: lauraUser!.id,
      clubId: 'club-madrid-1',
      role: 'admin' as const,
    },
    // Admin global → todos los clubs
    { id: 'ca-admin-bog1', userId: adminUser.id, clubId: 'club-bogota-1', role: 'admin' as const },
    { id: 'ca-admin-bog2', userId: adminUser.id, clubId: 'club-bogota-2', role: 'admin' as const },
    { id: 'ca-admin-med', userId: adminUser.id, clubId: 'club-medellin-1', role: 'admin' as const },
    { id: 'ca-admin-cali', userId: adminUser.id, clubId: 'club-cali-1', role: 'admin' as const },
    { id: 'ca-admin-mad', userId: adminUser.id, clubId: 'club-madrid-1', role: 'admin' as const },
    {
      id: 'ca-admin-bcn',
      userId: adminUser.id,
      clubId: 'club-barcelona-1',
      role: 'admin' as const,
    },
    { id: 'ca-admin-cdmx', userId: adminUser.id, clubId: 'club-cdmx-1', role: 'admin' as const },
    { id: 'ca-admin-miami', userId: adminUser.id, clubId: 'club-miami-1', role: 'admin' as const },
  ]

  for (const ca of clubAdminsData) {
    await prisma.clubAdmin.upsert({
      where: { id: ca.id },
      update: {},
      create: ca,
    })
  }

  console.log(`  ✅ ${clubAdminsData.length} registros ClubAdmin`)

  // ════════════════════════════════════════════════════════════════════════════
  // RESUMEN FINAL
  // ════════════════════════════════════════════════════════════════════════════

  console.log('\n' + '═'.repeat(60))
  console.log('🎉  SEED COMPLETADO EXITOSAMENTE')
  console.log('═'.repeat(60))
  console.log(`
📊 Datos creados:
   • ${clubsData.length} clubs (CO, ES, MX, US)
   • ${createdCourts.length} canchas
   • ${allSlots.length} time slots (14 días)
   • ${playersData.length} jugadores
   • ${tournaments.length} torneos
   • ${matchesMedellin.length} partidos (1 en VIVO)
   • ${courses.length} cursos de academia
   • ${groups.length} grupos de comunidad
   • ${postsData.length} posts
   • ${badges.length} badges + ${missions.length} misiones
   • 3 sponsors + 3 campañas de anuncios
   • ${membershipPlansData.length} planes de membresía (2 clubs)

🔐 Credenciales de acceso:
   ┌─────────────────────────────────────────────────────┐
   │ Admin:      admin@racketly.app    / Admin2026!      │
   │ Instructor: pablo.instructor@     / Test2026!       │
   │ Pro:        carlos.pro@           / Test2026!       │
   │ Amateur:    laura.amateur@        / Test2026!       │
   │ Free:       nuevo@racketly.app    / Test2026!       │
   └─────────────────────────────────────────────────────┘
   (todos los emails terminan en @racketly.app)
  `)
}

main()
  .catch((e) => {
    console.error('❌ Seed falló:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
