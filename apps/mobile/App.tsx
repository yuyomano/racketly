import 'react-native-gesture-handler'
import { useCallback, useEffect } from 'react'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import * as SplashScreen from 'expo-splash-screen'
import {
  useFonts as useArchivoFonts,
  Archivo_600SemiBold,
  Archivo_700Bold,
} from '@expo-google-fonts/archivo'
import {
  useFonts as usePlexFonts,
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans'
import { useAuthStore } from './src/store/auth.store'
import { RootNavigator } from './src/navigation'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
    mutations: { retry: 0 },
  },
})

SplashScreen.preventAutoHideAsync().catch(() => {})

function AppContent() {
  const { loadStoredAuth } = useAuthStore()

  useEffect(() => {
    loadStoredAuth()
  }, [])

  return <RootNavigator />
}

export default function App() {
  const [archivoLoaded] = useArchivoFonts({ Archivo_600SemiBold, Archivo_700Bold })
  const [plexLoaded] = usePlexFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  })
  const fontsLoaded = archivoLoaded && plexLoaded

  const onLayoutRootView = useCallback(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider onLayout={onLayoutRootView}>
        <StatusBar style="light" />
        <AppContent />
      </SafeAreaProvider>
    </QueryClientProvider>
  )
}
