import React, { useState } from 'react'
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Text } from '../../components/ui/Text'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { communityApi } from '../../services/api'
import { useAuthStore } from '../../store/auth.store'
import { BackButton } from '../../components/ui/BackButton'
import { PadelIcon, PickleballIcon } from '../../components/ui/SportIcons'
import { PostType } from '@racketly/shared-types'
import { colors } from '../../theme'

const SPORTS: { value: string | null; label: string }[] = [
  { value: null, label: 'General' },
  { value: 'padel', label: 'Pádel' },
  { value: 'pickleball', label: 'Pickleball' },
]

export function CreatePostScreen({ navigation }: { navigation: any }) {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [content, setContent] = useState('')
  const [sportTag, setSportTag] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () =>
      communityApi.createPost({
        authorId: user!.id,
        type: PostType.TEXT,
        content: content.trim(),
        sportTag: sportTag || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['community-feed'] })
      navigation.goBack()
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'No se pudo publicar'),
  })

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} light={false} />
        <Text style={styles.title}>Nueva publicación</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="¿Qué quieres compartir con la comunidad?"
          placeholderTextColor={colors.ink400}
          multiline
          autoFocus
          value={content}
          onChangeText={setContent}
        />

        <Text style={styles.label}>Deporte</Text>
        <View style={styles.sportRow}>
          {SPORTS.map((s) => (
            <TouchableOpacity
              key={s.label}
              style={[styles.sportChip, sportTag === s.value && styles.sportChipActive]}
              onPress={() => setSportTag(s.value)}
            >
              {s.value === 'padel' && (
                <PadelIcon
                  size={13}
                  color={sportTag === s.value ? colors.court700 : colors.ink500}
                />
              )}
              {s.value === 'pickleball' && (
                <PickleballIcon
                  size={13}
                  color={sportTag === s.value ? colors.court700 : colors.ink500}
                />
              )}
              <Text
                style={[styles.sportChipText, sportTag === s.value && styles.sportChipTextActive]}
              >
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.publishBtn,
            (!content.trim() || createMutation.isPending) && styles.publishBtnDisabled,
          ]}
          onPress={() => createMutation.mutate()}
          disabled={!content.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.publishBtnText}>Publicar</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink100,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink700 },
  form: { padding: 20, flex: 1 },
  input: {
    borderWidth: 1.5,
    borderColor: colors.ink100,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
    color: colors.textPrimary,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.ink700, marginTop: 20, marginBottom: 8 },
  sportRow: { flexDirection: 'row', gap: 8 },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.ink50,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  sportChipActive: { backgroundColor: colors.court50, borderColor: colors.court600 },
  sportChipText: { fontSize: 13, fontWeight: '600', color: colors.ink500 },
  sportChipTextActive: { color: colors.court700 },
  publishBtn: {
    backgroundColor: colors.court600,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 32,
  },
  publishBtnDisabled: { opacity: 0.5 },
  publishBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
})
