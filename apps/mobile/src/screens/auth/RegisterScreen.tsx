import React, { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
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
  displayName: z.string().min(3, 'Mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmPassword: z.string(),
  sport: z.enum(['padel', 'pickleball', 'both']),
  city: z.string().min(2, 'Ingresa tu ciudad'),
  country: z.string().min(2, 'Elige tu país'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Las contraseñas no coinciden',
  path: ['confirmPassword'],
})
type FormData = z.infer<typeof schema>

const SPORTS = [
  { value: 'padel',      label: '🎾 Pádel' },
  { value: 'pickleball', label: '🏸 Pickleball' },
  { value: 'both',       label: '⚡ Ambos' },
] as const

// Mismo catálogo que EditProfileScreen — mantenerlos en sync si se agrega un país.
const COUNTRY_OPTIONS = [
  { value: 'CO', label: 'Colombia 🇨🇴' },
  { value: 'ES', label: 'España 🇪🇸' },
  { value: 'MX', label: 'México 🇲🇽' },
  { value: 'AR', label: 'Argentina 🇦🇷' },
  { value: 'US', label: 'Estados Unidos 🇺🇸' },
  { value: 'CL', label: 'Chile 🇨🇱' },
  { value: 'PE', label: 'Perú 🇵🇪' },
]

export function RegisterScreen({ navigation }: { navigation: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const { setAuth } = useAuthStore()

  const { control, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { sport: 'padel', country: 'CO' },
  })

  const selectedSport = watch('sport')
  const selectedCountry = watch('country')

  const [_request, response, promptAsync] = Google.useAuthRequest({
    clientId:        process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
    iosClientId:     process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  })

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response
      if (authentication?.accessToken) handleGoogleRegister(authentication.accessToken)
    }
  }, [response])

  const handleGoogleRegister = async (accessToken: string) => {
    setGoogleLoading(true)
    try {
      const res = await authApi.googleLogin(accessToken)
      const { user, accessToken: jwt, refreshToken } = res.data.data
      await setAuth(user, jwt, refreshToken)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo registrar con Google')
    } finally {
      setGoogleLoading(false)
    }
  }

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      const res = await authApi.register({
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        sport: data.sport,
        city: data.city,
        country: data.country,
      })
      const { user, accessToken, refreshToken } = res.data.data
      await setAuth(user, accessToken, refreshToken)
    } catch (err: any) {
      Alert.alert('Error al registrarse', err.response?.data?.error || 'Inténtalo de nuevo')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={16} color={colors.primary300} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <View style={styles.logoBadge}>
            <Text style={styles.logo}>🎾</Text>
          </View>
          <Text style={styles.title}>Crea tu cuenta</Text>
          <Text style={styles.subtitle}>Gratis para siempre</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>

          {/* Google register */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
            onPress={() => promptAsync()}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color="#374151" />
            ) : (
              <>
                <Text style={styles.googleIcon}>G</Text>
                <Text style={styles.googleBtnText}>Registrarse con Google</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>o con email</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Nombre */}
          <Controller control={control} name="displayName" render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Nombre en la app</Text>
              <TextInput
                style={[styles.input, errors.displayName && styles.inputError]}
                placeholder="Ej: Carlos Padel"
                placeholderTextColor="#9ca3af"
                value={value} onChangeText={onChange}
              />
              {errors.displayName && <Text style={styles.error}>{errors.displayName.message}</Text>}
            </View>
          )} />

          {/* Email */}
          <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, errors.email && styles.inputError]}
                placeholder="tu@email.com"
                placeholderTextColor="#9ca3af"
                keyboardType="email-address" autoCapitalize="none"
                value={value} onChangeText={onChange}
              />
              {errors.email && <Text style={styles.error}>{errors.email.message}</Text>}
            </View>
          )} />

          {/* Contraseña */}
          <Controller control={control} name="password" render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={[styles.input, errors.password && styles.inputError]}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor="#9ca3af"
                secureTextEntry value={value} onChangeText={onChange}
                autoComplete="off"
                textContentType="oneTimeCode"
                importantForAutofill="no"
              />
              {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}
            </View>
          )} />

          {/* Confirmar */}
          <Controller control={control} name="confirmPassword" render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Confirmar contraseña</Text>
              <TextInput
                style={[styles.input, errors.confirmPassword && styles.inputError]}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry value={value} onChangeText={onChange}
                autoComplete="off"
                textContentType="oneTimeCode"
                importantForAutofill="no"
              />
              {errors.confirmPassword && <Text style={styles.error}>{errors.confirmPassword.message}</Text>}
            </View>
          )} />

          {/* Ciudad */}
          <Controller control={control} name="city" render={({ field: { onChange, value } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>Ciudad</Text>
              <TextInput
                style={[styles.input, errors.city && styles.inputError]}
                placeholder="Ej: Bogotá"
                placeholderTextColor="#9ca3af"
                value={value} onChangeText={onChange}
              />
              {errors.city && <Text style={styles.error}>{errors.city.message}</Text>}
            </View>
          )} />

          {/* País */}
          <Controller control={control} name="country" render={({ field: { onChange } }) => {
            const selected = COUNTRY_OPTIONS.find((c) => c.value === selectedCountry)
            return (
              <View style={styles.field}>
                <Text style={styles.label}>País</Text>
                <TouchableOpacity
                  style={styles.selector}
                  onPress={() => setShowCountryPicker(!showCountryPicker)}
                >
                  <Text style={styles.selectorText}>{selected?.label ?? selectedCountry}</Text>
                  <Text style={styles.selectorArrow}>{showCountryPicker ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showCountryPicker && (
                  <View style={styles.pickerList}>
                    {COUNTRY_OPTIONS.map((c) => (
                      <TouchableOpacity
                        key={c.value}
                        style={[styles.pickerItem, selectedCountry === c.value && styles.pickerItemActive]}
                        onPress={() => { onChange(c.value); setShowCountryPicker(false) }}
                      >
                        <Text style={[styles.pickerItemText, selectedCountry === c.value && styles.pickerItemTextActive]}>
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )
          }} />

          {/* Deporte */}
          <Controller control={control} name="sport" render={({ field: { onChange } }) => (
            <View style={styles.field}>
              <Text style={styles.label}>¿Qué deporte juegas?</Text>
              <View style={styles.sportRow}>
                {SPORTS.map((s) => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.sportBtn, selectedSport === s.value && styles.sportBtnActive]}
                    onPress={() => onChange(s.value)}
                  >
                    <Text style={[styles.sportBtnText, selectedSport === s.value && styles.sportBtnTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )} />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading
              ? <ActivityIndicator color={colors.white} />
              : <Text style={styles.submitBtnText}>Crear cuenta gratis →</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>
              ¿Ya tienes cuenta? <Text style={{ color: '#059669', fontWeight: '700' }}>Inicia sesión</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            Al registrarte aceptas nuestros{' '}
            <Text style={{ color: '#059669' }}>Términos de uso</Text> y{' '}
            <Text style={{ color: '#059669' }}>Política de privacidad</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primaryDark },
  scroll: { flexGrow: 1, paddingBottom: spacing['4xl'] },
  header: { alignItems: 'center', paddingTop: 60, paddingBottom: spacing['3xl'], paddingHorizontal: spacing['2xl'] },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginBottom: spacing.lg },
  backText: { color: colors.primary300, fontSize: fontSize.base },
  logoBadge: {
    width: 64, height: 64, borderRadius: radius.xl, backgroundColor: colors.primary500,
    alignItems: 'center', justifyContent: 'center', ...shadow.md,
  },
  logo: { fontSize: 30 },
  title: { fontSize: fontSize['2xl'], fontWeight: '900', color: colors.white, marginTop: spacing.md },
  subtitle: { fontSize: fontSize.sm, color: colors.primary300, marginTop: spacing.xs },
  form: { backgroundColor: colors.white, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing['2xl'], gap: spacing.lg, flexGrow: 1 },
  field: { gap: spacing.xs + 2 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray700 },
  input: { borderWidth: 1.5, borderColor: colors.gray200, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: fontSize.base, color: colors.textPrimary },
  inputError: { borderColor: colors.red500 },
  error: { fontSize: fontSize.xs, color: colors.red500 },
  selector: {
    backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg,
    borderWidth: 1.5, borderColor: colors.gray200,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  selectorText: { fontSize: fontSize.base, color: colors.textPrimary },
  selectorArrow: { fontSize: fontSize.xs, color: colors.gray400 },
  pickerList: {
    backgroundColor: colors.white, borderRadius: radius.md, marginTop: 4,
    borderWidth: 1.5, borderColor: colors.gray200, overflow: 'hidden',
  },
  pickerItem: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray100 },
  pickerItemActive: { backgroundColor: colors.primary50 },
  pickerItemText: { fontSize: fontSize.base, color: colors.gray700 },
  pickerItemTextActive: { color: colors.primary600, fontWeight: '700' },
  sportRow: { flexDirection: 'row', gap: spacing.sm },
  sportBtn: { flex: 1, paddingVertical: spacing.md - 2, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.gray200, alignItems: 'center' },
  sportBtnActive: { backgroundColor: colors.primary600, borderColor: colors.primary600 },
  sportBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.gray500 },
  sportBtnTextActive: { color: colors.white },
  submitBtn: { backgroundColor: colors.primary600, borderRadius: radius.md, paddingVertical: spacing.lg - 2, alignItems: 'center', marginTop: spacing.xs },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  loginLink: { textAlign: 'center', fontSize: fontSize.sm, color: colors.gray500 },
  terms: { textAlign: 'center', fontSize: fontSize.xs, color: colors.gray400, lineHeight: 16 },
  googleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm + 2,
    borderWidth: 1.5, borderColor: colors.gray200, borderRadius: radius.md,
    paddingVertical: spacing.lg - 3, backgroundColor: colors.white,
  },
  googleIcon: { fontSize: 16, fontWeight: '900', color: '#4285F4' },
  googleBtnText: { fontSize: fontSize.base, fontWeight: '600', color: colors.gray700 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.gray200 },
  dividerText: { fontSize: fontSize.xs, color: colors.gray400, fontWeight: '500' },
})
