import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
import { authApi } from './api'

// Pide permiso, obtiene el Expo push token (no FCM nativo — evita requerir build/config
// nativa de Firebase, ver notification-service) y lo registra en el backend. Se llama
// justo después de un login exitoso; si algo falla (sin permiso, sin projectId, error de
// red) se ignora silenciosamente — el push es un complemento del email, nunca bloqueante.
export async function registerForPushNotifications(): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      const { status: requested } = await Notifications.requestPermissionsAsync()
      status = requested
    }
    if (status !== 'granted') return

    const projectId = Constants.expoConfig?.extra?.eas?.projectId
    if (!projectId) {
      console.warn('[push] Falta extra.eas.projectId en app.json — no se puede obtener el token')
      return
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId })
    await authApi.updatePushToken(token)
  } catch (err) {
    console.warn('[push] No se pudo registrar el push token:', err)
  }
}
