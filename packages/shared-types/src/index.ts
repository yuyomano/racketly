// ─── Enums ───────────────────────────────────────────────────────────────────

export enum Sport {
  PADEL = 'padel',
  PICKLEBALL = 'pickleball',
}

export enum SubscriptionTier {
  FREE = 'free',
  AMATEUR = 'amateur',
  PRO = 'pro',
  INSTRUCTOR = 'instructor',
  CLUB_STARTER = 'club_starter',
  CLUB_PRO = 'club_pro',
}

export enum PlayerCategory {
  C4 = 'C4',
  C3 = 'C3',
  C2 = 'C2',
  C1 = 'C1',
  B3 = 'B3',
  B2 = 'B2',
  B1 = 'B1',
  A = 'A',
  OPEN = 'Open',
}

export enum TournamentFormat {
  ROUND_ROBIN = 'round_robin',
  ELIMINATION = 'elimination',
  GROUPS_BRACKET = 'groups_bracket',
  SWISS = 'swiss',
}

export enum TournamentType {
  PAIRS = 'pairs',
  TEAMS = 'teams',
  INDIVIDUAL = 'individual',
  MIXED = 'mixed',
}

export enum TournamentStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum BookingStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show',
}

export enum PaymentProvider {
  STRIPE = 'stripe',
  MERCADOPAGO = 'mercadopago',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum CourseType {
  VIDEO = 'video',
  PRESENTIAL = 'presential',
  HYBRID = 'hybrid',
}

export enum CourseLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  PRO = 'pro',
}

export enum PostType {
  TEXT = 'text',
  PHOTO = 'photo',
  VIDEO = 'video',
  REEL = 'reel',
  POLL = 'poll',
}

export enum GroupCategory {
  TECHNIQUE = 'technique',
  TACTICS = 'tactics',
  GEAR = 'gear',
  CLUBS = 'clubs',
  COMPETITION = 'competition',
  GENERAL = 'general',
}

export enum MatchStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  WALKOVER = 'walkover',
  CANCELLED = 'cancelled',
}

export enum NotificationType {
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_REMINDER = 'booking_reminder',
  BOOKING_CANCELLED = 'booking_cancelled',
  TOURNAMENT_REGISTERED = 'tournament_registered',
  TOURNAMENT_DRAW = 'tournament_draw',
  MATCH_SCHEDULED = 'match_scheduled',
  MATCH_RESULT = 'match_result',
  PARTNER_REQUEST = 'partner_request',
  PARTNER_ACCEPTED = 'partner_accepted',
  COURT_AVAILABLE = 'court_available',
  NEW_FOLLOWER = 'new_follower',
  NEW_COMMENT = 'new_comment',
  NEW_LIKE = 'new_like',
  ELO_CHANGE = 'elo_change',
  BADGE_EARNED = 'badge_earned',
  LEVEL_UP = 'level_up',
}

export enum CancellationPolicy {
  FLEXIBLE = 'flexible', // Reembolso hasta 24h antes
  MODERATE = 'moderate', // Reembolso hasta 48h antes
  STRICT = 'strict', // Sin reembolso
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
  pagination?: Pagination
}

export interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface GeoLocation {
  latitude: number
  longitude: number
}

export interface OpeningHours {
  [day: string]: { open: string; close: string } | null
}

export interface SetScore {
  player1: number
  player2: number
  tiebreak?: { player1: number; player2: number }
}

// ─── User & Profiles ─────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  phone?: string
  subscriptionTier: SubscriptionTier
  createdAt: string
  updatedAt: string
}

export interface PlayerProfile {
  userId: string
  displayName: string
  avatarUrl?: string
  bio?: string
  sport: Sport | 'both'
  country: string
  city: string
  location?: GeoLocation
  eloPadel: number
  eloPickleball: number
  category: PlayerCategory
  xpPoints: number
  level: number
  badges: string[]
  stats: PlayerStats
}

export interface PlayerStats {
  totalMatches: number
  wins: number
  losses: number
  winRate: number
  currentStreak: number
  bestStreak: number
  tournamentsPlayed: number
  tournamentsWon: number
}

export interface InstructorProfile {
  userId: string
  displayName: string
  avatarUrl?: string
  bio?: string
  verified: boolean
  certifications: string[]
  specialty: string[]
  sport: Sport | 'both'
  hourlyRate: number
  currency: string
  country: string
  city: string
  ratingAvg: number
  totalReviews: number
}

export interface ClubProfile {
  id: string
  name: string
  description?: string
  country: string
  city: string
  address: string
  location: GeoLocation
  photos: string[]
  subscriptionTier: SubscriptionTier
  verified: boolean
  contactEmail?: string
  phone?: string
  website?: string
  openingHours: OpeningHours
  sports: Sport[]
  amenities: string[]
  ratingAvg: number
  totalReviews: number
}

// ─── Courts & Bookings ────────────────────────────────────────────────────────

export interface Court {
  id: string
  clubId: string
  name: string
  sport: Sport
  surface: string
  isIndoor: boolean
  capacity: 2 | 4
  isActive: boolean
  photos: string[]
  sponsorId?: string
}

export interface TimeSlot {
  id: string
  courtId: string
  date: string
  startTime: string
  endTime: string
  basePrice: number
  peakPrice: number
  currency: string
  isAvailable: boolean
  sponsorId?: string
}

export interface Booking {
  id: string
  slotId: string
  userId: string
  status: BookingStatus
  players: BookingPlayer[]
  amountPaid: number
  currency: string
  paymentProvider: PaymentProvider
  paymentStatus: PaymentStatus
  qrCode?: string
  qrExpiresAt?: string
  cancelledAt?: string
  refundAmount?: number
  createdAt: string
}

export interface BookingPlayer {
  userId?: string
  displayName: string
  isGuest: boolean
}

// ─── Tournaments ──────────────────────────────────────────────────────────────

export interface Tournament {
  id: string
  clubId?: string
  organizerId: string
  name: string
  description?: string
  sport: Sport
  format: TournamentFormat
  type: TournamentType
  category: PlayerCategory
  maxParticipants: number
  currentParticipants: number
  entryFee: number
  currency: string
  prizeInfo?: string
  registrationStart: string
  registrationEnd: string
  startDate: string
  endDate: string
  status: TournamentStatus
  sponsorId?: string
  sponsorLogoUrl?: string
  location: string
}

export interface Match {
  id: string
  tournamentId: string
  round: number
  courtId?: string
  scheduledAt?: string
  startedAt?: string
  finishedAt?: string
  score: SetScore[]
  winnerId?: string
  refereeId?: string
  status: MatchStatus
  isLive: boolean
}

export interface EloHistory {
  id: string
  playerId: string
  matchId: string
  sport: Sport
  eloBefore: number
  eloAfter: number
  delta: number
  createdAt: string
}

// ─── Community ────────────────────────────────────────────────────────────────

export interface Post {
  id: string
  authorId: string
  type: PostType
  content: string
  mediaUrls: string[]
  sportTag?: Sport
  groupId?: string
  likesCount: number
  commentsCount: number
  isPremium: boolean
  isLikedByMe?: boolean
  createdAt: string
}

export interface Comment {
  id: string
  postId: string
  authorId: string
  content: string
  likesCount: number
  parentId?: string
  createdAt: string
}

export interface Group {
  id: string
  name: string
  description?: string
  category: GroupCategory
  sport?: Sport
  memberCount: number
  isPrivate: boolean
  coverUrl?: string
  isMember?: boolean
}

export interface GearReview {
  id: string
  reviewerId: string
  brand: string
  model: string
  sport: Sport
  rating: number
  reviewText: string
  photos: string[]
  verifiedPurchase: boolean
  createdAt: string
}

// ─── Academy ──────────────────────────────────────────────────────────────────

export interface Course {
  id: string
  instructorId: string
  title: string
  description: string
  sport: Sport
  level: CourseLevel
  type: CourseType
  price: number
  currency: string
  isPremium: boolean
  thumbnailUrl: string
  durationHours: number
  language: string
  lessonsCount: number
  enrollmentsCount: number
  ratingAvg: number
  createdAt: string
}

export interface Lesson {
  id: string
  courseId: string
  title: string
  orderIndex: number
  videoDurationSeconds: number
  isFreePreview: boolean
  description?: string
  isCompleted?: boolean
}

export interface InstructorSession {
  id: string
  instructorId: string
  title: string
  sport: Sport
  level: CourseLevel
  clubId?: string
  locationDescription: string
  date: string
  startTime: string
  durationMinutes: number
  maxStudents: number
  pricePerPerson: number
  currency: string
  bookedCount: number
  status: string
}

// ─── Find a Partner ───────────────────────────────────────────────────────────

export interface MatchRequest {
  id: string
  requesterId: string
  sport: Sport
  levelMin: PlayerCategory
  levelMax: PlayerCategory
  city: string
  maxDistanceKm: number
  preferredDate?: string
  timePreference?: string
  courtId?: string
  message?: string
  status: string
  expiresAt: string
  createdAt: string
  applicationsCount: number
}

// ─── Gamification ─────────────────────────────────────────────────────────────

export interface Badge {
  id: string
  code: string
  name: string
  description: string
  iconUrl: string
  xpReward: number
  earnedAt?: string
}

export interface Mission {
  id: string
  title: string
  description: string
  sport?: Sport
  xpReward: number
  badgeId?: string
  startDate?: string
  endDate?: string
  isRecurring: boolean
  progress?: number
  isCompleted?: boolean
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  body: string
  data?: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

// ─── Ads ──────────────────────────────────────────────────────────────────────

export interface AdCampaign {
  id: string
  sponsorId: string
  sponsorName: string
  sponsorLogoUrl: string
  type: string
  imageUrl?: string
  linkUrl?: string
  targetSport?: Sport
}
