import axios, { InternalAxiosRequestConfig } from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000'

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor: agregar token automáticamente
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor: refresh token automático
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = await SecureStore.getItemAsync('refreshToken')
        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken })
        await SecureStore.setItemAsync('accessToken', data.data.accessToken)
        if (data.data.refreshToken) {
          await SecureStore.setItemAsync('refreshToken', data.data.refreshToken)
        }
        original.headers.Authorization = `Bearer ${data.data.accessToken}`
        return api(original)
      } catch {
        // Refresh falló → logout
        await SecureStore.deleteItemAsync('accessToken')
        await SecureStore.deleteItemAsync('refreshToken')
      }
    }
    return Promise.reject(error)
  }
)

// ─── API helpers ─────────────────────────────────────────────────────────────

export const authApi = {
  register: (data: object) => api.post('/api/auth/register', data),
  login: (email: string, password: string) => api.post('/api/auth/login', { email, password }),
  googleLogin: (accessToken: string) => api.post('/api/auth/google', { accessToken }),
  me: () => api.get('/api/auth/me'),
  logout: (refreshToken?: string) => api.post('/api/auth/logout', { refreshToken }),
  updatePushToken: (pushToken: string) => api.patch('/api/auth/me', { pushToken }),
}

export const profileApi = {
  getProfile: (userId: string) => api.get(`/api/profile/${userId}`),
  getStats: (userId: string) => api.get(`/api/profile/${userId}/stats`),
  updateProfile: (data: {
    displayName?: string
    city?: string
    country?: string
    sport?: 'padel' | 'pickleball' | 'both'
    avatarUrl?: string
    bio?: string
  }) => api.put('/api/profile', data),
}

export const clubsApi = {
  search: (params: object) => api.get('/api/clubs', { params }),
  getById: (id: string) => api.get(`/api/clubs/${id}`),
  getAvailability: (id: string, date: string) =>
    api.get(`/api/clubs/${id}/availability`, { params: { date } }),
}

export const bookingsApi = {
  create: (data: object) => api.post('/api/bookings', data),
  confirm: (id: string, data: object) => api.post(`/api/bookings/${id}/confirm`, data),
  cancel: (id: string) => api.delete(`/api/bookings/${id}`),
  getById: (id: string) => api.get(`/api/bookings/${id}`),
  myBookings: (userId: string) => api.get(`/api/bookings/user/${userId}`),
  updatePlayers: (id: string, players: object[]) =>
    api.patch(`/api/bookings/${id}/players`, { players }),
  markPlayerPaid: (bookingId: string, userId: string) =>
    api.patch(`/api/bookings/${bookingId}/players/${userId}/pay`, {}),
  leaveBooking: (bookingId: string, userId: string) =>
    api.delete(`/api/bookings/${bookingId}/players/${userId}`, { data: { issueCredit: true } }),
  submitMatch: (
    bookingId: string,
    data: { team1: string[]; team2: string[]; sets: { player1: number; player2: number }[] }
  ) => api.post(`/api/bookings/${bookingId}/match`, data),
  getMatch: (bookingId: string) => api.get(`/api/bookings/${bookingId}/match`),
  confirmMatch: (bookingId: string) => api.post(`/api/bookings/${bookingId}/match/confirm`, {}),
  disputeMatch: (bookingId: string) => api.post(`/api/bookings/${bookingId}/match/dispute`, {}),
}

export const usersApi = {
  search: (q: string, excludeId?: string) =>
    api.get('/api/users/search', { params: { q, excludeId, limit: 8 } }),
}

export const creditsApi = {
  getUserCredit: (userId: string, clubId: string) =>
    api.get(`/api/credits/user/${userId}`, { params: { clubId } }),
}

export const membershipsApi = {
  getClubPlans: (clubId: string) => api.get(`/api/clubs/${clubId}/membership-plans`),
  getPricing: (params: { userId: string; slotId: string; clubId: string }) =>
    api.get('/api/memberships/pricing', { params }),
  getMyMemberships: (userId: string) => api.get(`/api/memberships/user/${userId}`),
  subscribe: (data: { userId: string; planId: string }) =>
    api.post('/api/memberships/subscribe', data),
  cancel: (membershipId: string) => api.delete(`/api/memberships/${membershipId}/cancel`),
}

export const tournamentsApi = {
  list: (params: object) => api.get('/api/tournaments', { params }),
  getById: (id: string) => api.get(`/api/tournaments/${id}`),
  register: (id: string, data: object) => api.post(`/api/tournaments/${id}/register`, data),
  withdraw: (id: string, participantId: string) =>
    api.delete(`/api/tournaments/${id}/participants/${participantId}`),
  getBracket: (id: string) => api.get(`/api/tournaments/${id}/bracket`),
  getGroups: (id: string) => api.get(`/api/tournaments/${id}/groups`),
}

export const matchesApi = {
  getById: (id: string) => api.get(`/api/matches/${id}`),
}

export const rankingsApi = {
  get: (params: object) => api.get('/api/rankings', { params }),
  eloHistory: (userId: string) => api.get(`/api/rankings/elo-history/${userId}`),
}

export const partnerApi = {
  createRequest: (data: object) => api.post('/api/match-requests', data),
  listRequests: (params: object) => api.get('/api/match-requests', { params }),
  apply: (id: string, data: object) => api.post(`/api/match-requests/${id}/apply`, data),
  mine: (userId: string) => api.get('/api/match-requests/mine', { params: { userId } }),
  respond: (applicationId: string, status: 'accepted' | 'rejected') =>
    api.put(`/api/match-requests/applications/${applicationId}/respond`, { status }),
}

export const communityApi = {
  getFeed: (params: object) => api.get('/api/posts', { params }),
  createPost: (data: object) => api.post('/api/posts', data),
  likePost: (id: string, userId: string) => api.post(`/api/posts/${id}/like`, { userId }),
  getComments: (postId: string) => api.get(`/api/posts/${postId}/comments`),
  addComment: (postId: string, data: object) => api.post(`/api/posts/${postId}/comments`, data),
  getGroups: (params: object) => api.get('/api/groups', { params }),
  joinGroup: (id: string, userId: string) => api.post(`/api/groups/${id}/join`, { userId }),
}

export const classesApi = {
  list: (clubId: string, params?: object) =>
    api.get(`/api/classes/${clubId}`, { params: { upcoming: '1', ...params } }),
  book: (
    slotId: string,
    data: { studentUserId: string; studentName: string; clubId?: string; pay?: boolean }
  ) => api.post(`/api/classes/${slotId}/book`, data),
  cancelBooking: (bookingId: string) => api.delete(`/api/classes/bookings/${bookingId}`),
}

export const academyApi = {
  getCourses: (params: object) => api.get('/api/courses', { params }),
  getCourse: (id: string) => api.get(`/api/courses/${id}`),
  enroll: (id: string, userId: string) => api.post(`/api/courses/${id}/enroll`, { userId }),
  getInstructors: (params: object) => api.get('/api/instructors', { params }),
}
