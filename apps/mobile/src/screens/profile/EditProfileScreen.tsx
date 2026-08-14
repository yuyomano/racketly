import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../store/auth.store'
import { profileApi } from '../../services/api'
import { BackButton } from '../../components/ui/BackButton'
import { colors } from '../../theme'

type Sport = 'padel' | 'pickleball' | 'both'

const SPORT_OPTIONS: { value: Sport; label: string; emoji: string }[] = [
  { value: 'padel',      label: 'Pádel',           emoji: '🎾' },
  { value: 'pickleball', label: 'Pickleball',       emoji: '🏸' },
  { value: 'both',       label: 'Ambos deportes',   emoji: '⚡' },
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
    mutationFn: () =>
      profileApi.updateProfile({ displayName, bio, city, country, sport }),
    onSuccess: (res) => {
      // Actualiza el store con los nuevos datos del perfil
      updateProfile(res.data.data)
      qc.invalidateQueries({ queryKey: ['profile'] })
      Alert.alert('✅ Perfil actualizado', 'Tus cambios se guardaron correctamente.', [
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
          <View style={styles.backBtn}><BackButton onPress={() => navigation.goBack()} /></View>
          <Text style={styles.title}>Editar Perfil</Text>
          <TouchableOpacity
            onPress={handleSave}
            disabled={mutation.isPending}
            style={styles.saveBtn}
          >
            {mutation.isPending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.saveBtnText}>Guardar</Text>
            }
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
              placeholderTextColor="#9ca3af"
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
              placeholderTextColor="#9ca3af"
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
              placeholderTextColor="#9ca3af"
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
              <Text style={styles.selectorArrow}>{showCountryPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showCountryPicker && (
              <View style={styles.pickerList}>
                {COUNTRY_OPTIONS.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[styles.pickerItem, country === c.value && styles.pickerItemActive]}
                    onPress={() => { setCountry(c.value); setShowCountryPicker(false) }}
                  >
                    <Text style={[styles.pickerItemText, country === c.value && styles.pickerItemTextActive]}>
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
                  <Text style={styles.sportEmoji}>{s.emoji}</Text>
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
          <Text style={styles.eloCardTitle}>📊 Estadísticas (solo lectura)</Text>
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
          <Text style={styles.eloHint}>El ELO y XP se actualizan automáticamente tras partidos y torneos.</Text>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },

  // Header
  header: {
    backgroundColor: '#064e3b', paddingTop: 60, paddingBottom: 16,
    paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center',
  },
  backBtn: { padding: 4, marginRight: 12 },
  backText: { color: '#6ee7b7', fontSize: 24, fontWeight: '300' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: '#fff' },
  saveBtn: {
    backgroundColor: '#10b981', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8, minWidth: 80, alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Avatar
  avatarSection: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#064e3b' },
  avatarCircle: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: '#10b981', alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#6ee7b7',
  },
  avatarEmoji: { fontSize: 40 },
  avatarHint: { color: '#6ee7b7', fontSize: 12, marginTop: 8 },

  // Form
  form: { padding: 16, gap: 4 },
  field: { marginBottom: 20 },
  label: { fontSize: 12, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    fontSize: 15, color: '#111827',
    borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 4 },

  // Country selector
  selector: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    borderWidth: 1.5, borderColor: '#e5e7eb',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  selectorText: { fontSize: 15, color: '#111827' },
  selectorArrow: { fontSize: 12, color: '#9ca3af' },
  pickerList: {
    backgroundColor: '#fff', borderRadius: 12, marginTop: 4,
    borderWidth: 1.5, borderColor: '#e5e7eb', overflow: 'hidden',
  },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickerItemActive: { backgroundColor: '#f0fdf4' },
  pickerItemText: { fontSize: 15, color: '#374151' },
  pickerItemTextActive: { color: '#059669', fontWeight: '700' },

  // Sport selector
  sportRow: { flexDirection: 'row', gap: 8 },
  sportBtn: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 12,
    alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb',
  },
  sportBtnActive: { backgroundColor: '#f0fdf4', borderColor: '#059669' },
  sportEmoji: { fontSize: 22, marginBottom: 4 },
  sportLabel: { fontSize: 11, color: '#6b7280', fontWeight: '600', textAlign: 'center' },
  sportLabelActive: { color: '#059669' },

  // ELO card (read-only)
  eloCard: {
    margin: 16, backgroundColor: '#fff', borderRadius: 16,
    padding: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  eloCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 14 },
  eloRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  eloItem: { alignItems: 'center' },
  eloValue: { fontSize: 20, fontWeight: '900', color: '#059669' },
  eloLabel: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  eloHint: { fontSize: 11, color: '#9ca3af', textAlign: 'center', fontStyle: 'italic' },
})
