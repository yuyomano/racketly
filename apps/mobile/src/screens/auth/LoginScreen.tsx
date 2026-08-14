import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert
} from 'react-native'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import * as WebBrowser from 'expo-web-browser'
import * as Google from 'expo-auth-session/providers/google'
import { Ionicons } from '@expo/vector-icons'
import { authApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { colors, radius, spacing, fontSize, shadow } from '../../theme'

WebBrowser.maybeCompleteAuthSession()

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña muy corta'),
})
type FormData = z.infer<typeof schema>

export function LoginScreen({ navigation }: { navigation: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { setAuth } = useAuthStore()

  const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const [_request, response, promptAsync] = Google.useAuthRequest({
    clientId:         process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId:  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId:      process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  })

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response
      if (authentication?.accessToken) handleGoogleLogin(authentication.accessToken)
    }
  }, [response])

  const handleGoogleLogin = async (accessToken: string) => {
    setGoogleLoading(true)
    try {
      const res = await authApi.googleLogin(accessToken)
      const { user, accessToken: jwt, refreshToken } = res.data.data
      await setAuth(user, jwt, refreshToken)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo iniciar sesión con Google')
    } finally {
      setGoogleLoading(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const res = await authApi.login(data.email, data.password)
      const { user, accessToken, refreshToken } = res.data.data
      await setAuth(user, accessToken, refreshToken)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo iniciar sesión')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />

      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logo}>🎾</Text>
          </View>
          <Text style={styles.logoText}>Racketly</Text>
          <Text style={styles.logoSub}>El mundo del pádel y pickleball</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Email</Text>
                <View style={[styles.inputWrap, errors.email && styles.inputError]}>
                  <Ionicons name="mail-outline" size={17} color={colors.gray400} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="tu@email.com"
                    placeholderTextColor={colors.gray400}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={value}
                    onChangeText={onChange}
                  />
                </View>
                {errors.email && <Text style={styles.errorText}>{errors.email.message}</Text>}
              </View>
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <View style={styles.fieldContainer}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={[styles.inputWrap, errors.password && styles.inputError]}>
                  <Ionicons name="lock-closed-outline" size={17} color={colors.gray400} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.gray400}
                    secureTextEntry
                    value={value}
                    onChangeText={onChange}
                  />
                </View>
                {errors.password && <Text style={styles.errorText}>{errors.password.message}</Text>}
              </View>
            )}
          />

          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Entrar</Text>
                <Ionicons name="arrow-forward" size={17} color={colors.white} />
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o continúa con</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google button */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && styles.submitBtnDisabled]}
            onPress={() => promptAsync()}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.gray700} />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Continuar con Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>
              ¿No tienes cuenta? <Text style={{ color: colors.primary600, fontWeight: '700' }}>Regístrate gratis</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark, overflow: 'hidden' },
  glowTop: {
    position: 'absolute', top: -80, left: -80, width: 240, height: 240, borderRadius: 120,
    backgroundColor: colors.primary500, opacity: 0.12,
  },
  glowBottom: {
    position: 'absolute', bottom: -100, right: -100, width: 280, height: 280, borderRadius: 140,
    backgroundColor: colors.primary400, opacity: 0.08,
  },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  logoContainer: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logoBadge: {
    width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.primary500,
    alignItems: 'center', justifyContent: 'center', ...shadow.md,
  },
  logo: { fontSize: 30 },
  logoText: { fontSize: fontSize['3xl'], fontWeight: '900', color: colors.white, marginTop: spacing.md, letterSpacing: -0.5 },
  logoSub: { fontSize: fontSize.sm, color: colors.primary300, marginTop: spacing.xs },
  form: { backgroundColor: colors.white, borderRadius: radius['2xl'], padding: spacing['2xl'], gap: spacing.lg, ...shadow.lg },
  fieldContainer: { gap: spacing.xs + 2 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray700 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    borderWidth: 1.5, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: spacing.lg,
  },
  inputIcon: {},
  input: { flex: 1, paddingVertical: spacing.md, fontSize: fontSize.base, color: colors.textPrimary },
  inputError: { borderColor: colors.red500 },
  errorText: { fontSize: fontSize.xs, color: colors.red500 },
  submitBtn: {
    flexDirection: 'row', backgroundColor: colors.primary600, borderRadius: radius.md, paddingVertical: spacing.lg - 2,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xs,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  registerLink: { textAlign: 'center', fontSize: fontSize.sm, color: colors.gray500, marginTop: spacing.xs },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.gray200 },
  dividerText: { fontSize: fontSize.xs, color: colors.gray400, fontWeight: '500' },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm + 2,
    borderWidth: 1.5, borderColor: colors.gray200, borderRadius: radius.md,
    paddingVertical: spacing.lg - 3, backgroundColor: colors.white,
  },
  googleIcon: {
    fontSize: 16, fontWeight: '900', color: '#4285F4',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  googleBtnText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray700 },
})
