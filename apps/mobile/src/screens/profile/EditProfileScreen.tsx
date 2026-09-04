import React, { useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../store/auth.store'
import { profileApi } from '../../services/api'
import { BackButton } from '../../components/ui/BackButton'
import { PadelIcon, PickleballIcon } from '../../components/ui/SportIcons'
import { colors } from '../../theme'

type Sport = 'padel' | 'pickleball' | 'both'

const SPORT_OPTIONS: { value: Sport; label: string }[] = [
  { value: 'padel', label: 'Pádel' },
  { value: 'pickleball', label: 'Pickleball' },
  { value: 'both', label: 'Ambos deportes' },
]

const COUNTRY_OPTIONS = [
  { value: 'CO', label: 'Colombia 🇨🇴' },
  { value: 'ES', label: 'España 🇪🇸' },
  { value: 'MX', label: 'México 🇲🇽' },
  { value: 'AR', label: 'Argentina 🇦🇷' },
  { value: 'US', label: 'Estados Unidos 🇺🇸' },
  { value: 'CL', label: 'Chile 🇨🇱' },
  { value: 'PE', label: 'Perú 🇵🇪' },
]

export function EditProfileScreen({ navigation }: { navigation: any }) {
  const { user, updateProfile } = useAuthStore()
  const profile = user?.profile
  const qc = useQueryClient()

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [bio, setBio] = useState(profile?.bio ?? '')
  const [city, setCity] = useState(profile?.city ?? '')
  const [country, setCountry] = useState(profile?.country ?? 'CO')
  const [sport, setSport] = useState<Sport>((profile?.sport as Sport) ?? 'padel')
  const [showCountryPicker, setShowCountryPicker] = useState(false)

  const mutation = useMutation({
    mutationFn: () => profileApi.updateProfile({ displayName, bio, city, country, sport }),
    onSuccess: (res) => {
      // Actualiza el store con los nuevos datos del perfil
      updateProfile(res.data.data)
      qc.invalidateQueries({ queryKey: ['profile'] })
      Alert.alert('Perfil actualizado', 'Tus cambios se guardaron correctamente.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    },
    onError: (e: any) => {
      Alert.alert('Error', e.response?.data?.error || 'No se pudo actualizar el perfil.')
    },
  })

  function handleSave() {
    if (displayName.trim().length < 2) {
      Alert.alert('Error', 'El nombre debe tener al menos 2 caracteres.')
      return
    }
    if (city.trim().length < 2) {
      Alert.alert('Error', 'Ingresa tu ciudad.')
      return
    }
    mutation.mutate()
  }

  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.value === country)

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.backBtn}>
            <BackButton onPress={() => navigation.goBack()} />
          </View>
          <Text style={styles.title}>Editar Perfil</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={mutation.isPending}
            style={styles.saveBtn}
          >
            {mutation.isPending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.saveBtnText}>Guardar</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Avatar placeholder */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={36} color={colors.white} />
          </View>
          <Text style={styles.avatarHint}>Próximamente: subir foto</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {/* Nombre */}
          <View style={styles.field}>
            <Text style={styles.label}>Nombre para mostrar</Text>
            <TextInput
              style={styles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Tu nombre en la app"
              placeholderTextColor={colors.ink400}
              maxLength={50}
            />
            <Text style={styles.charCount}>{displayName.length}/50</Text>
          </View>

          {/* Bio */}
          <View style={styles.field}>
            <Text style={styles.label}>Bio (opcional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Cuéntanos algo sobre ti..."
              placeholderTextColor={colors.ink400}
              multiline
              numberOfLines={3}
              maxLength={300}
            />
            <Text style={styles.charCount}>{bio.length}/300</Text>
          </View>

          {/* Ciudad */}
          <View style={styles.field}>
            <Text style={styles.label}>Ciudad</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              placeholder="Tu ciudad"
              placeholderTextColor={colors.ink400}
            />
          </View>

          {/* País */}
          <View style={styles.field}>
            <Text style={styles.label}>País</Text>
            <TouchableOpacity
              style={styles.selector}
              onPress={() => setShowCountryPicker(!showCountryPicker)}
            >
              <Text style={styles.selectorText}>{selectedCountry?.label ?? country}</Text>
              <Ionicons
                name={showCountryPicker ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={colors.ink400}
              />
            </TouchableOpacity>
            {showCountryPicker && (
              <View style={styles.pickerList}>
                {COUNTRY_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.pickerItem, country === c.value && styles.pickerItemActive]}
                    onPress={() => {
                      setCountry(c.value)
                      setShowCountryPicker(false)
                    }}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        country === c.value && styles.pickerItemTextActive,
                      ]}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Deporte */}
          <View style={styles.field}>
            <Text style={styles.label}>Deporte favorito</Text>
            <View style={styles.sportRow}>
              {SPORT_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.value}
                  style={[styles.sportBtn, sport === s.value && styles.sportBtnActive]}
                  onPress={() => setSport(s.value)}
                >
                  {s.value === 'padel' ? (
                    <PadelIcon
                      size={22}
                      color={sport === s.value ? colors.court600 : colors.ink400}
                    />
                  ) : s.value === 'pickleball' ? (
                    <PickleballIcon
                      size={22}
                      color={sport === s.value ? colors.court600 : colors.ink400}
                    />
                  ) : (
                    <Ionicons
                      name="flash"
                      size={22}
                      color={sport === s.value ? colors.court600 : colors.ink400}
                    />
                  )}
                  <Text style={[styles.sportLabel, sport === s.value && styles.sportLabelActive]}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* ELO info (solo lectura) */}
        <View style={styles.eloCard}>
          <View style={styles.eloCardTitleRow}>
            <Ionicons name="stats-chart" size={16} color={colors.textPrimary} />
            <Text style={styles.eloCardTitle}>Estadísticas (solo lectura)</Text>
          </View>
          <View style={styles.eloRow}>
            <View style={styles.eloItem}>
              <Text style={styles.eloValue}>{profile?.eloPadel ?? 1000}</Text>
              <Text style={styles.eloLabel}>ELO Pádel</Text>
            </View>
            <View style={styles.eloItem}>
              <Text style={styles.eloValue}>{profile?.eloPickleball ?? 1000}</Text>
              <Text style={styles.eloLabel}>ELO Pickleball</Text>
            </View>
            <View style={styles.eloItem}>
              <Text style={styles.eloValue}>{profile?.level ?? 1}</Text>
              <Text style={styles.eloLabel}>Nivel</Text>
            </View>
            <View style={styles.eloItem}>
              <Text style={styles.eloValue}>{profile?.xpPoints ?? 0}</Text>
              <Text style={styles.eloLabel}>XP</Text>
            </View>
          </View>
          <Text style={styles.eloHint}>
            El ELO y XP se actualizan automáticamente tras partidos y torneos.
          </Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  // Header
  header: {
    backgroundColor: colors.court900,
    paddingTop: 60,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { padding: 4, marginRight: 12 },
  backText: { color: colors.court300, fontSize: 24, fontWeight: '300' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.white },
  saveBtn: {
    backgroundColor: colors.court500,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveBtnText: { color: colors.white, fontWeight: '700', fontSize: 14 },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: 24, backgroundColor: colors.court900 },
  avatarCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.court500,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.court300,
  },
  avatarHint: { color: colors.court300, fontSize: 12, marginTop: 8 },

  // Form
  form: { padding: 16, gap: 4 },
  field: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 8 },
  input: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1.5,
    borderColor: colors.ink100,
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: colors.ink400, textAlign: 'right', marginTop: 4 },

  // Country selector
  selector: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: colors.ink100,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorText: { fontSize: 15, color: colors.textPrimary },
  pickerList: {
    backgroundColor: colors.white,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: colors.ink100,
    overflow: 'hidden',
  },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: colors.ink100 },
  pickerItemActive: { backgroundColor: colors.court50 },
  pickerItemText: { fontSize: 15, color: colors.ink700 },
  pickerItemTextActive: { color: colors.court600, fontWeight: '700' },

  // Sport selector
  sportRow: { flexDirection: 'row', gap: 8 },
  sportBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.ink100,
    gap: 4,
  },
  sportBtnActive: { backgroundColor: colors.court50, borderColor: colors.court600 },
  sportLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '600', textAlign: 'center' },
  sportLabelActive: { color: colors.court600 },

  // ELO card (read-only)
  eloCard: {
    margin: 16,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.ink100,
  },
  eloCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  eloCardTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  eloRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  eloItem: { alignItems: 'center' },
  eloValue: { fontSize: 20, fontWeight: '900', color: colors.court600 },
  eloLabel: { fontSize: 11, color: colors.ink400, marginTop: 2 },
  eloHint: { fontSize: 11, color: colors.ink400, textAlign: 'center', fontStyle: 'italic' },
})
