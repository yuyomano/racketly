import { create } from 'zustand'
import * as SecureStore from 'expo-secure-store'
import type { User, PlayerProfile } from '@racketly/shared-types'
import { registerForPushNotifications } from '../services/push.service'
import { authApi } from '../services/api'

interface AuthState {
  user: (User & { profile?: PlayerProfile }) | null
  accessToken: string | null
  isLoading: boolean
  isAuthenticated: boolean

  setAuth: (
    user: User & { profile?: PlayerProfile },
    accessToken: string,
    refreshToken: string
  ) => Promise<void>
  logout: () => Promise<void>
  loadStoredAuth: () => Promise<void>
  updateProfile: (profile: PlayerProfile) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isLoading: true,
  isAuthenticated: false,

  setAuth: async (user, accessToken, refreshToken) => {
    await SecureStore.setItemAsync('accessToken', accessToken)
    await SecureStore.setItemAsync('refreshToken', refreshToken)
    await SecureStore.setItemAsync('user', JSON.stringify(user))
    set({ user, accessToken, isAuthenticated: true })
    registerForPushNotifications() // best-effort, no bloquea el login
  },

  logout: async () => {
    const refreshToken = await SecureStore.getItemAsync('refreshToken')
    try {
      // Revoca el refresh token en el servidor — sin esto, "cerrar sesión" era
      // puramente cosmético y el token seguía siendo válido hasta expirar.
      await authApi.logout(refreshToken ?? undefined)
    } catch {
      // best-effort: si el server no responde, igual limpiamos la sesión local
    }
    await SecureStore.deleteItemAsync('accessToken')
    await SecureStore.deleteItemAsync('refreshToken')
    await SecureStore.deleteItemAsync('user')
    set({ user: null, accessToken: null, isAuthenticated: false })
  },

  loadStoredAuth: async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken')
      const userStr = await SecureStore.getItemAsync('user')
      if (token && userStr) {
        set({ accessToken: token, user: JSON.parse(userStr), isAuthenticated: true })
      }
    } catch {
      // Token inválido, limpiar
    } finally {
      set({ isLoading: false })
    }
  },

  updateProfile: (profile) =>
    set((state) => ({
      user: state.user ? { ...state.user, profile } : null,
    })),
}))
