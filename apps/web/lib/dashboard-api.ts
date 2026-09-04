/**
 * Cliente de API para el Club Dashboard
 * Llama directamente a los servicios (desde el servidor Next.js)
 */

const BOOKING_URL = process.env.BOOKING_SERVICE_URL || 'http://localhost:3002'
const TOURNAMENT_URL = process.env.TOURNAMENT_SERVICE_URL || 'http://localhost:3003'

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const json = await res.json()
  return json.data as T
}

// ─── Club ────────────────────────────────────────────────────────────────────

export async function getClub(clubId: string) {
  return get<any>(`${BOOKING_URL}/api/clubs/${clubId}`)
}

export async function getClubs() {
  return get<any[]>(`${BOOKING_URL}/api/clubs`)
}

// ─── Bookings ────────────────────────────────────────────────────────────────

export async function getClubBookings(clubId: string) {
  return get<any[]>(`${BOOKING_URL}/api/bookings/club/${clubId}`)
}

// ─── Stats ───────────────────────────────────────────────────────────────────

export interface ClubStats {
  period: number
  totalBookings: number
  confirmedBookings: number
  cancelledBookings: number
  pendingBookings: number
  totalRevenue: number
  byDay: { date: string; bookings: number; revenue: number }[]
  courtOccupancy: {
    id: string
    name: string
    sport: string
    slotsToday: number
    bookedToday: number
    pct: number
  }[]
  todayBookings: any[]
}

export async function getClubStats(clubId: string, period = 7): Promise<ClubStats> {
  return get<ClubStats>(`${BOOKING_URL}/api/clubs/${clubId}/stats?period=${period}`)
}

// ─── Courts ──────────────────────────────────────────────────────────────────

export async function getCourtSlots(courtId: string) {
  return get<any[]>(`${BOOKING_URL}/api/courts/${courtId}/slots`)
}

// ─── Tournaments ─────────────────────────────────────────────────────────────

export async function getClubTournaments(clubId: string) {
  return get<any[]>(`${TOURNAMENT_URL}/api/tournaments?clubId=${clubId}`)
}

export async function getRankings(params?: string) {
  return get<any[]>(`${TOURNAMENT_URL}/api/rankings${params ? '?' + params : ''}`)
}
