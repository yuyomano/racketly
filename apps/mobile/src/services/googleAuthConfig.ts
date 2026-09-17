import { isRunningInExpoGo } from 'expo'

// expo-auth-session/providers/google (flujo OAuth vía browser) está deprecado y,
// para client IDs de tipo Android/iOS, Google rechaza el flujo con
// "Error 400: invalid_request" incluso con package name y SHA-1 correctos — esos
// tipos de cliente están pensados para el SDK nativo de Google Sign-In, no para
// un redirect por browser. Se usa @react-native-google-signin/google-signin en
// su lugar, que valida solo por package name + SHA-1 (ya registrados) y no
// depende de ningún redirect URI.
//
// Es un módulo nativo — no existe en Expo Go, solo en dev-client/standalone.
export async function signInWithGoogle(): Promise<string> {
  if (isRunningInExpoGo()) {
    throw new Error('Google Sign-In requiere un build nativo, no funciona en Expo Go')
  }
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = await import(
    '@react-native-google-signin/google-signin'
  )
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID })
  await GoogleSignin.hasPlayServices()
  const response = await GoogleSignin.signIn()
  if (!isSuccessResponse(response)) {
    throw new Error('Inicio de sesión con Google cancelado')
  }
  try {
    const { accessToken } = await GoogleSignin.getTokens()
    return accessToken
  } catch (err) {
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      throw new Error('Inicio de sesión con Google cancelado')
    }
    throw err
  }
}
