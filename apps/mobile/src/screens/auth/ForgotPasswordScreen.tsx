import React, { useState } from 'react'
import {
  View,
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
import { Ionicons } from '@expo/vector-icons'
import { authApi } from '../../services/api'
import { colors, radius, spacing, fontSize } from '../../theme'

const schema = z.object({
  email: z.string().email('Email inválido'),
})
type FormData = z.infer<typeof schema>

export function ForgotPasswordScreen({ navigation }: { navigation: any }) {
  const [isLoading, setIsLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setIsLoading(true)
    try {
      await authApi.forgotPassword(data.email)
      setSent(true)
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo procesar la solicitud')
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
        <View style={styles.logoContainer}>
          <Ionicons name="lock-open-outline" size={48} color={colors.court600} />
          <Text variant="display" style={styles.title}>
            ¿Olvidaste tu contraseña?
          </Text>
          <Text style={styles.subtitle}>
            Ingresa tu email y te enviaremos un link para restablecerla.
          </Text>
        </View>

        <View style={styles.form}>
          {sent ? (
            <Text style={styles.successText}>
              Si el email está registrado, revisa tu bandeja de entrada para continuar.
            </Text>
          ) : (
            <>
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

              <TouchableOpacity
                style={[styles.submitBtn, isLoading && styles.submitBtnDisabled]}
                onPress={handleSubmit(onSubmit)}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.submitBtnText}>Enviar link</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.backLink}>Volver a iniciar sesión</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing['2xl'] },
  logoContainer: { alignItems: 'center', marginBottom: spacing['3xl'], gap: spacing.sm },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '900',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
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
  successText: { fontSize: fontSize.base, color: colors.court600, textAlign: 'center' },
  submitBtn: {
    flexDirection: 'row',
    backgroundColor: colors.court600,
    borderRadius: radius.md,
    paddingVertical: spacing.lg - 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  backLink: {
    textAlign: 'center',
    fontSize: fontSize.sm,
    color: colors.ink500,
  },
})
