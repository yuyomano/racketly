import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

// expo-secure-store no tiene implementación nativa en web (su build .web.js es un
// stub `{}` sin funciones) — cualquier llamada a SecureStore.getItemAsync/etc. en
// web lanza de inmediato, lo cual rompía silenciosamente el interceptor de axios
// y el guardado de sesión (setAuth) en el preview de Expo Web. En nativo (iOS/Android)
// se sigue usando SecureStore tal cual, con cifrado real.
export const storage = {
  getItemAsync: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      try { return localStorage.getItem(key) } catch { return null }
    }
    return SecureStore.getItemAsync(key)
  },
  setItemAsync: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try { localStorage.setItem(key, value) } catch { /* ignorar (modo privado, etc.) */ }
      return
    }
    return SecureStore.setItemAsync(key, value)
  },
  deleteItemAsync: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      try { localStorage.removeItem(key) } catch { /* ignorar */ }
      return
    }
    return SecureStore.deleteItemAsync(key)
  },
}
