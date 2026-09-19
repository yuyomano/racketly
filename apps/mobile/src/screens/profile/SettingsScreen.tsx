import React, { useState } from 'react'
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Switch,
  TextInput,
  Alert,
  ScrollView,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { useMutation } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { authApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { colors, spacing, radius, fontSize } from '../../theme'

export function SettingsScreen({ navigation }: { navigation: any }) {
  const { user, logout } = useAuthStore()
  const [language, setLanguage] = useState<'es' | 'en'>((user?.language as 'es' | 'en') ?? 'es')
  const [units, setUnits] = useState<'km' | 'mi'>(user?.units ?? 'km')
  const [pushEnabled, setPushEnabled] = useState(user?.pushEnabled ?? true)
  const [isPrivate, setIsPrivate] = useState(user?.profileVisibility === 'private')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')

  const updateSettings = useMutation({
    mutationFn: authApi.updateSettings,
  })

  const deleteAccount = useMutation({
    mutationFn: () => authApi.deleteAccount(deletePassword || undefined),
    onSuccess: () => logout(),
    onError: () => Alert.alert('Error', 'No se pudo eliminar la cuenta. Revisa tu contraseña.'),
  })

  const confirmDelete = () => {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es permanente. Se eliminarán tus datos personales y no podrás recuperar tu cuenta.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => deleteAccount.mutate() },
      ]
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.title}>Configuración</Text>
      </View>

      <View style={{ padding: 16, gap: 16 }}>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Idioma</Text>
          <Text style={styles.helperText}>
            El idioma de la app aún es solo en español; esta preferencia se guarda para cuando esté
            disponible.
          </Text>
          <View style={styles.optionRow}>
            {(['es', 'en'] as const).map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[styles.optionBtn, language === lang && styles.optionBtnActive]}
                onPress={() => {
                  setLanguage(lang)
                  updateSettings.mutate({ language: lang })
                }}
              >
                <Text style={[styles.optionText, language === lang && styles.optionTextActive]}>
                  {lang === 'es' ? 'Español' : 'English'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Notificaciones push</Text>
              <Text style={styles.helperText}>Recibe alertas de canchas, rivales y torneos</Text>
            </View>
            <Switch
              value={pushEnabled}
              onValueChange={(v) => {
                setPushEnabled(v)
                updateSettings.mutate({ pushEnabled: v })
              }}
              trackColor={{ true: colors.court500, false: colors.ink100 }}
            />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Unidades de distancia</Text>
          <View style={styles.optionRow}>
            {(['km', 'mi'] as const).map((u) => (
              <TouchableOpacity
                key={u}
                style={[styles.optionBtn, units === u && styles.optionBtnActive]}
                onPress={() => {
                  setUnits(u)
                  updateSettings.mutate({ units: u })
                }}
              >
                <Text style={[styles.optionText, units === u && styles.optionTextActive]}>
                  {u === 'km' ? 'Kilómetros' : 'Millas'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Perfil privado</Text>
              <Text style={styles.helperText}>
                Solo tú puedes ver tu perfil, estadísticas y actividad
              </Text>
            </View>
            <Switch
              value={isPrivate}
              onValueChange={(v) => {
                setIsPrivate(v)
                updateSettings.mutate({ profileVisibility: v ? 'private' : 'public' })
              }}
              trackColor={{ true: colors.court500, false: colors.ink100 }}
            />
          </View>
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.referee500} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <View style={styles.dangerCard}>
          <Text style={styles.dangerTitle}>Eliminar cuenta</Text>
          <Text style={styles.helperText}>
            Se anonimizarán tus datos personales de forma permanente. No podrás deshacer esta
            acción.
          </Text>
          {showDeleteConfirm ? (
            <>
              <TextInput
                style={styles.passwordInput}
                placeholder="Confirma tu contraseña"
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                value={deletePassword}
                onChangeText={setDeletePassword}
              />
              <View style={styles.optionRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowDeleteConfirm(false)}
                >
                  <Text style={styles.optionText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
                  <Text style={styles.deleteBtnText}>Eliminar cuenta</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <TouchableOpacity
              style={styles.deleteBtnOutline}
              onPress={() => setShowDeleteConfirm(true)}
            >
              <Text style={styles.deleteBtnOutlineText}>Eliminar mi cuenta</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.court900,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 2 },
  title: { color: colors.white, fontSize: 22, fontWeight: '900' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.ink100,
    gap: 8,
  },
  sectionTitle: { fontSize: fontSize.base, fontWeight: '800', color: colors.textPrimary },
  helperText: { fontSize: fontSize.sm, color: colors.textMuted },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  optionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink100,
    alignItems: 'center',
  },
  optionBtnActive: { backgroundColor: colors.court50, borderColor: colors.court500 },
  optionText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textMuted },
  optionTextActive: { color: colors.court700 },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.referee100,
    backgroundColor: colors.white,
  },
  logoutText: { color: colors.referee500, fontWeight: '700', fontSize: fontSize.base },
  dangerCard: {
    backgroundColor: colors.referee50,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.referee100,
    gap: 8,
  },
  dangerTitle: { fontSize: fontSize.base, fontWeight: '800', color: colors.referee500 },
  passwordInput: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink100,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.ink100,
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  deleteBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.referee500,
  },
  deleteBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  deleteBtnOutline: {
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.referee500,
    alignItems: 'center',
  },
  deleteBtnOutlineText: { color: colors.referee500, fontWeight: '700', fontSize: fontSize.sm },
})
