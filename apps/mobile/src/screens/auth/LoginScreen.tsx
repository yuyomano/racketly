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

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña muy corta'),
})
type FormData = z.infer<typeof schema>

export function LoginScreen({ navigation }: { navigation: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { setAuth } = useAuthStore()

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const handleGooglePress = async () => {
    setGoogleLoading(true)
    try {
      const accessToken = await signInWithGoogle()
      const res = await authApi.googleLogin(accessToken)
      const { user, accessToken: jwt, refreshToken } = res.data.data
      await setAuth(user, jwt, refreshToken)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || err.message || 'No se pudo iniciar sesión con Google')
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
      <View style={styles.inner}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={logoIcon} style={styles.logoImage} />
          <Text variant="display" style={styles.logoText}>
            Racketly
          </Text>
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
                  <Ionicons
                    name="mail-outline"
                    size={17}
                    color={colors.ink400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="tu@email.com"
                    placeholderTextColor={colors.ink400}
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
                  <Ionicons
                    name="lock-closed-outline"
                    size={17}
                    color={colors.ink400}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={colors.ink400}
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
              <Text style={styles.submitBtnText}>Entrar</Text>
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
            onPress={handleGooglePress}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.ink700} />
            ) : (
              <>
                <AntDesign name="google" size={16} color="#4285F4" />
                <Text style={styles.googleBtnText}>Continuar con Google</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLink}>
              ¿No tienes cuenta?{' '}
              <Text style={{ color: colors.court600, fontWeight: '700' }}>Regístrate gratis</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  logoContainer: { alignItems: 'center', marginBottom: spacing['3xl'] },
  logoImage: { width: 64, height: 64 },
  logoText: {
    fontSize: fontSize['3xl'],
    fontWeight: '900',
    color: colors.textPrimary,
    marginTop: spacing.md,
    letterSpacing: -0.5,
  },
  logoSub: { fontSize: fontSize.sm, color: colors.textMuted, marginTop: spacing.xs },
  form: {
    backgroundColor: colors.white,
    borderRadius: radius['2xl'],
    padding: spacing['2xl'],
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  fieldContainer: { gap: spacing.xs + 2 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink700 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.ink200,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
  },
  inputIcon: {},
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: fontSize.base,
    color: colors.textPrimary,
  },
  inputError: { borderColor: colors.referee500 },
  errorText: { fontSize: fontSize.xs, color: colors.referee500 },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: colors.court600,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  registerLink: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    color: colors.ink500,
    marginTop: spacing.xs,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.ink200 },
  dividerText: { fontSize: fontSize.xs, color: colors.ink400, fontWeight: '500' },
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
})
