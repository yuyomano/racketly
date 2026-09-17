import React, { useState } from 'react'
import {
  View,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Ionicons, AntDesign } from '@expo/vector-icons'
import { authApi } from '../../services/api'
import { signInWithGoogle } from '../../services/googleAuthConfig'
import { useAuthStore } from '../../store/auth.store'
import { colors, radius, spacing, fontSize } from '../../theme'
import logoIcon from '../../../assets/favicon.png'
import { PadelIcon, PickleballIcon } from '../../components/ui/SportIcons'

const schema = z
  .object({
    displayName: z.string().min(3, 'Mínimo 3 caracteres'),
    email: z.string().email('Email inválido'),
    password: z
      .string()
      .min(8, 'Mínimo 8 caracteres')
      .regex(/[A-Z]/, 'Debe contener al menos una mayúscula')
      .regex(/[0-9]/, 'Debe contener al menos un número'),
    confirmPassword: z.string(),
    country: z.string().length(2, 'Selecciona tu país'),
    city: z.string().min(2, 'Ciudad requerida'),
    sport: z.enum(['padel', 'pickleball', 'both']),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden',
    path: ['confirmPassword'],
  })
type FormData = z.infer<typeof schema>

const SPORTS = [
  { value: 'padel', label: 'Pádel' },
  { value: 'pickleball', label: 'Pickleball' },
  { value: 'both', label: 'Ambos' },
] as const

const COUNTRIES = [
  { value: 'DO', label: 'República Dominicana' },
  { value: 'CO', label: 'Colombia' },
  { value: 'MX', label: 'México' },
  { value: 'ES', label: 'España' },
  { value: 'AR', label: 'Argentina' },
  { value: 'US', label: 'Estados Unidos' },
] as const

export function RegisterScreen({ navigation }: { navigation: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [showCountryPicker, setShowCountryPicker] = useState(false)
  const { setAuth } = useAuthStore()

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { sport: 'padel', country: 'DO' },
  })

  const selectedSport = watch('sport')
  const selectedCountry = watch('country')

  const handleGooglePress = async () => {
    setGoogleLoading(true)
    try {
      const accessToken = await signInWithGoogle()
      const res = await authApi.googleLogin(accessToken)
      const { user, accessToken: jwt, refreshToken } = res.data.data
      await setAuth(user, jwt, refreshToken)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'No se pudo registrar con Google')
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
        country: data.country,
        city: data.city,
        sport: data.sport,
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
            <Ionicons name="arrow-back" size={16} color={colors.court300} />
            <Text style={styles.backText}>Volver</Text>
          </TouchableOpacity>
          <Image source={logoIcon} style={styles.logoImage} />
          <Text variant="display" style={styles.title}>
            Crea tu cuenta
          </Text>
          <Text style={styles.subtitle}>Gratis para siempre</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Google register */}
          <TouchableOpacity
            style={[styles.googleBtn, googleLoading && { opacity: 0.7 }]}
            onPress={handleGooglePress}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.ink600} />
            ) : (
              <>
                <AntDesign name="google" size={16} color="#4285F4" />
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
          <Controller
            control={control}
            name="displayName"
            render={({ field: { onChange, value } }) => (
              <View style={styles.field}>
                <Text style={styles.label}>Nombre en la app</Text>
                <TextInput
                  style={[styles.input, errors.displayName && styles.inputError]}
                  placeholder="Ej: Carlos Padel"
                  placeholderTextColor={colors.ink400}
                  value={value}
                  onChangeText={onChange}
                />
                {errors.displayName && (
                  <Text style={styles.error}>{errors.displayName.message}</Text>
                )}
              </View>
            )}
          />

          {/* Email */}
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[styles.input, errors.email && styles.inputError]}
                  placeholder="tu@email.com"
                  placeholderTextColor={colors.ink400}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                />
                {errors.email && <Text style={styles.error}>{errors.email.message}</Text>}
              </View>
            )}
          />

          {/* Contraseña */}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <View style={styles.field}>
                <Text style={styles.label}>Contraseña</Text>
                <TextInput
                  style={[styles.input, errors.password && styles.inputError]}
                  placeholder="Mínimo 8 caracteres"
                  placeholderTextColor={colors.ink400}
                  secureTextEntry
                  value={value}
                  onChangeText={onChange}
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                />
                {errors.password && <Text style={styles.error}>{errors.password.message}</Text>}
              </View>
            )}
          />

          {/* Confirmar */}
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, value } }) => (
              <View style={styles.field}>
                <Text style={styles.label}>Confirmar contraseña</Text>
                <TextInput
                  style={[styles.input, errors.confirmPassword && styles.inputError]}
                  placeholder="••••••••"
                  placeholderTextColor={colors.ink400}
                  secureTextEntry
                  value={value}
                  onChangeText={onChange}
                  autoComplete="off"
                  textContentType="oneTimeCode"
                  importantForAutofill="no"
                />
                {errors.confirmPassword && (
                  <Text style={styles.error}>{errors.confirmPassword.message}</Text>
                )}
              </View>
            )}
          />

          {/* País */}
          <Controller
            control={control}
            name="country"
            render={({ field: { onChange } }) => {
              const selected = COUNTRIES.find((c) => c.value === selectedCountry)
              return (
                <View style={styles.field}>
                  <Text style={styles.label}>País</Text>
                  <TouchableOpacity
                    style={styles.selector}
                    onPress={() => setShowCountryPicker(!showCountryPicker)}
                  >
                    <Text style={styles.selectorText}>{selected?.label ?? selectedCountry}</Text>
                    <Ionicons
                      name={showCountryPicker ? 'chevron-up' : 'chevron-down'}
                      size={16}
                      color={colors.ink400}
                    />
                  </TouchableOpacity>
                  {showCountryPicker && (
                    <View style={styles.pickerList}>
                      {COUNTRIES.map((c) => (
                        <TouchableOpacity
                          key={c.value}
                          style={[
                            styles.pickerItem,
                            selectedCountry === c.value && styles.pickerItemActive,
                          ]}
                          onPress={() => {
                            onChange(c.value)
                            setShowCountryPicker(false)
                          }}
                        >
                          <Text
                            style={[
                              styles.pickerItemText,
                              selectedCountry === c.value && styles.pickerItemTextActive,
                            ]}
                          >
                            {c.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  {errors.country && <Text style={styles.error}>{errors.country.message}</Text>}
                </View>
              )
            }}
          />

          {/* Ciudad */}
          <Controller
            control={control}
            name="city"
            render={({ field: { onChange, value } }) => (
              <View style={styles.field}>
                <Text style={styles.label}>Ciudad</Text>
                <TextInput
                  style={[styles.input, errors.city && styles.inputError]}
                  placeholder="Ej: Santo Domingo"
                  placeholderTextColor={colors.ink400}
                  value={value}
                  onChangeText={onChange}
                />
                {errors.city && <Text style={styles.error}>{errors.city.message}</Text>}
              </View>
            )}
          />

          {/* Deporte */}
          <Controller
            control={control}
            name="sport"
            render={({ field: { onChange } }) => (
              <View style={styles.field}>
                <Text style={styles.label}>¿Qué deporte juegas?</Text>
                <View style={styles.sportRow}>
                  {SPORTS.map((s) => {
                    const active = selectedSport === s.value
                    const iconColor = active ? colors.white : colors.ink500
                    return (
                      <TouchableOpacity
                        key={s.value}
                        style={[styles.sportBtn, active && styles.sportBtnActive]}
                        onPress={() => onChange(s.value)}
                      >
                        {s.value === 'padel' ? (
                          <PadelIcon size={15} color={iconColor} />
                        ) : s.value === 'pickleball' ? (
                          <PickleballIcon size={15} color={iconColor} />
                        ) : (
                          <Ionicons name="shuffle-outline" size={16} color={iconColor} />
                        )}
                        <Text style={[styles.sportBtnText, active && styles.sportBtnTextActive]}>
                          {s.label}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>
            )}
          />

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.submitBtnText}>Crear cuenta gratis</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>
              ¿Ya tienes cuenta?{' '}
              <Text style={{ color: colors.court600, fontWeight: '700' }}>Inicia sesión</Text>
            </Text>
          </TouchableOpacity>

          <Text style={styles.terms}>
            Al registrarte aceptas nuestros{' '}
            <Text style={{ color: colors.court600 }}>Términos de uso</Text> y{' '}
            <Text style={{ color: colors.court600 }}>Política de privacidad</Text>
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, paddingBottom: spacing['4xl'] },
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingBottom: spacing['3xl'],
    paddingHorizontal: spacing['2xl'],
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    marginBottom: spacing.lg,
  },
  backText: { color: colors.ink600, fontSize: fontSize.base },
  logoImage: { width: 64, height: 64 },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  form: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radius['2xl'],
    borderTopRightRadius: radius['2xl'],
    padding: spacing['2xl'],
    gap: spacing.lg,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  field: { gap: spacing.xs + 2 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink700 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.ink200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  inputError: { borderColor: colors.referee500 },
  error: { fontSize: fontSize.xs, color: colors.referee500 },
  selector: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.ink200,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorText: { fontSize: fontSize.base, color: colors.textPrimary },
  pickerList: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: colors.ink200,
    overflow: 'hidden',
  },
  pickerItem: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.ink100 },
  pickerItemActive: { backgroundColor: colors.court50 },
  pickerItemText: { fontSize: fontSize.base, color: colors.ink700 },
  pickerItemTextActive: { color: colors.court600, fontWeight: '700' },
  sportRow: { flexDirection: 'row', gap: spacing.sm },
  sportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.ink200,
  },
  sportBtnActive: { backgroundColor: colors.court600, borderColor: colors.court600 },
  sportBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink500 },
  sportBtnTextActive: { color: colors.white },
  submitBtn: {
    backgroundColor: colors.court600,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  loginLink: { textAlign: 'center', fontSize: fontSize.sm, color: colors.ink500 },
  terms: { textAlign: 'center', fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm + 2,
    borderWidth: 1.5,
    borderColor: colors.ink200,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 3,
    backgroundColor: colors.white,
  },
  googleBtnText: { fontSize: fontSize.base, fontWeight: '600', color: colors.ink700 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.ink200 },
  dividerText: { fontSize: fontSize.xs, color: colors.ink400, fontWeight: '500' },
})
