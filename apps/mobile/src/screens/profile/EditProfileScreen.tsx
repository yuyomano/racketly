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
  Image,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { Text } from '../../components/ui/Text'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../store/auth.store'
import { profileApi, authApi } from '../../services/api'
import { BackButton } from '../../components/ui/BackButton'
import { PadelIcon, PickleballIcon } from '../../components/ui/SportIcons'
import { colors } from '../../theme'

type PreferredSide = 'derecha' | 'reves' | ''

const SIDE_OPTIONS: { value: PreferredSide; label: string }[] = [
  { value: '', label: 'Sin definir' },
  { value: 'derecha', label: 'Derecha' },
  { value: 'reves', label: 'Revés' },
]

type Gender = 'masculino' | 'femenino' | 'prefiero_no_decir' | ''

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: '', label: 'Sin definir' },
  { value: 'masculino', label: 'Masculino' },
  { value: 'femenino', label: 'Femenino' },
  { value: 'prefiero_no_decir', label: 'No quiero decir' },
]

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
  const [preferredSide, setPreferredSide] = useState<PreferredSide>(
    (profile?.preferredSide as PreferredSide) ?? ''
  )
  const [gender, setGender] = useState<Gender>((profile?.gender as Gender) ?? '')
  const [instagramHandle, setInstagramHandle] = useState(profile?.instagramHandle ?? '')
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? '')
  const [plusCode, setPlusCode] = useState(profile?.plusCode ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [birthDate, setBirthDate] = useState(user?.birthDate ?? '')
  const [avatarUri, setAvatarUri] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const mutation = useMutation({
    mutationFn: async () => {
      const [profileRes] = await Promise.all([
        profileApi.updateProfile({
          displayName,
          bio,
          city,
          country,
          sport,
          preferredSide: preferredSide || null,
          gender: gender || null,
          instagramHandle: instagramHandle || null,
          whatsapp: whatsapp || null,
          plusCode: plusCode || null,
        }),
        authApi.updateAccount({ phone: phone || null, birthDate: birthDate || null }),
      ])
      return profileRes
    },
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

  async function handlePickAvatar() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos para subir el avatar.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled) return

    const asset = result.assets[0]
    setAvatarUri(asset.uri)
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('file', {
        uri: asset.uri,
        name: asset.fileName ?? 'avatar.jpg',
        type: asset.mimeType ?? 'image/jpeg',
      } as any)
      const res = await profileApi.uploadAvatar(formData)
      updateProfile(res.data.data)
      qc.invalidateQueries({ queryKey: ['profile'] })
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'No se pudo subir la foto.')
    } finally {
      setUploadingAvatar(false)
    }
  }

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

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity
            style={styles.avatarCircle}
            onPress={handlePickAvatar}
            disabled={uploadingAvatar}
          >
            {avatarUri || profile?.avatarUrl ? (
              <Image
                source={{ uri: avatarUri ?? profile?.avatarUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <Ionicons name="person" size={36} color={colors.white} />
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator size="small" color={colors.white} />
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={14} color={colors.white} />
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Toca para cambiar tu foto</Text>
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

          {/* Lado de juego */}
          <View style={styles.field}>
            <Text style={styles.label}>Lado de juego</Text>
            <View style={styles.sportRow}>
              {SIDE_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.value || 'none'}
                  style={[styles.sideBtn, preferredSide === s.value && styles.sportBtnActive]}
                  onPress={() => setPreferredSide(s.value)}
                >
                  <Text
                    style={[
                      styles.sportLabel,
                      preferredSide === s.value && styles.sportLabelActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Género */}
          <View style={styles.field}>
            <Text style={styles.label}>Género</Text>
            <View style={styles.sportRow}>
              {GENDER_OPTIONS.map((g) => (
                <TouchableOpacity
                  key={g.value || 'none'}
                  style={[styles.sideBtn, gender === g.value && styles.sportBtnActive]}
                  onPress={() => setGender(g.value)}
                >
                  <Text style={[styles.sportLabel, gender === g.value && styles.sportLabelActive]}>
                    {g.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Celular */}
          <View style={styles.field}>
            <Text style={styles.label}>Celular</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 809 555 0000"
              placeholderTextColor={colors.ink400}
              keyboardType="phone-pad"
            />
          </View>

          {/* Fecha de nacimiento */}
          <View style={styles.field}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput
              style={styles.input}
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder="AAAA-MM-DD"
              placeholderTextColor={colors.ink400}
            />
          </View>

          {/* Instagram */}
          <View style={styles.field}>
            <Text style={styles.label}>Instagram</Text>
            <TextInput
              style={styles.input}
              value={instagramHandle}
              onChangeText={setInstagramHandle}
              placeholder="@usuario"
              placeholderTextColor={colors.ink400}
              autoCapitalize="none"
            />
          </View>

          {/* WhatsApp */}
          <View style={styles.field}>
            <Text style={styles.label}>WhatsApp</Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="+1 809 555 0000"
              placeholderTextColor={colors.ink400}
              keyboardType="phone-pad"
            />
          </View>

          {/* Ubicación (Plus Code) */}
          <View style={styles.field}>
            <Text style={styles.label}>Ubicación (Plus Code)</Text>
            <TextInput
              style={styles.input}
              value={plusCode}
              onChangeText={setPlusCode}
              placeholder="796RWF8Q+WF"
              placeholderTextColor={colors.ink400}
              autoCapitalize="characters"
            />
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
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%', borderRadius: 44 },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.court600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
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
  sideBtn: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.ink100,
  },
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
