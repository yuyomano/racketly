import React, { useState } from 'react'
import { View, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Text } from '../../components/ui/Text'
import { Ionicons } from '@expo/vector-icons'
import { useQuery } from '@tanstack/react-query'
import { academyApi } from '../../services/api'
import type { Course } from '@racketly/shared-types'
import { Badge } from '../../components/ui/Badge'
import { SportIcon } from '../../components/ui/SportIcons'
import { colors } from '../../theme'

const LEVELS = ['all', 'beginner', 'intermediate', 'advanced', 'pro']
const LEVEL_LABELS: Record<string, string> = {
  all: 'Todos',
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
  pro: 'Pro',
}

export function AcademyScreen({ navigation }: { navigation: any }) {
  const [level, setLevel] = useState('all')
  const [sport, setSport] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['courses', { level, sport }],
    queryFn: () =>
      academyApi.getCourses({
        level: level === 'all' ? undefined : level,
        sport: sport || undefined,
      }),
    select: (res) => res.data.data as Course[],
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Academia</Text>
        <Text style={styles.subtitle}>Aprende con los mejores instructores</Text>
      </View>

      {/* Level filter */}
      <FlatList
        horizontal
        data={LEVELS}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.levelFilters}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.levelChip, level === item && styles.levelChipActive]}
            onPress={() => setLevel(item)}
          >
            <Text style={[styles.levelText, level === item && styles.levelTextActive]}>
              {LEVEL_LABELS[item]}
            </Text>
          </TouchableOpacity>
        )}
      />

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.court600} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, gap: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.courseCard}
              onPress={() => navigation.navigate('CourseDetail', { courseId: item.id })}
            >
              <View style={styles.courseThumb}>
                <SportIcon sport={item.sport} size={28} />
              </View>
              <View style={styles.courseInfo}>
                <View style={styles.courseHeader}>
                  <Badge tone={levelTones[item.level]}>{LEVEL_LABELS[item.level]}</Badge>
                  {item.isPremium && (
                    <Badge
                      tone="amber"
                      icon={<Ionicons name="star" size={11} color={colors.trophy700} />}
                    >
                      Premium
                    </Badge>
                  )}
                </View>
                <Text style={styles.courseTitle}>{item.title}</Text>
                <View style={styles.instructorRow}>
                  <Text style={styles.instructorName}>
                    por {(item as any).instructor?.displayName || 'Instructor'}
                  </Text>
                  {(item as any).instructor?.ratingAvg > 0 && (
                    <View style={styles.ratingRow}>
                      <Ionicons name="star" size={11} color={colors.trophy600} />
                      <Text style={styles.instructorName}>
                        {(item as any).instructor.ratingAvg.toFixed(1)}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={styles.courseMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="film-outline" size={12} color={colors.ink400} />
                    <Text style={styles.metaText}>
                      {(item as any)._count?.lessons || 0} lecciones
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={12} color={colors.ink400} />
                    <Text style={styles.metaText}>{item.durationHours}h</Text>
                  </View>
                  {item.price > 0 ? (
                    <Text style={styles.coursePrice}>
                      {item.price} {item.currency}
                    </Text>
                  ) : (
                    <Text style={styles.freeText}>Gratis</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  )
}

const levelTones: Record<string, 'emerald' | 'blue' | 'amber' | 'violet'> = {
  beginner: 'emerald',
  intermediate: 'blue',
  advanced: 'amber',
  pro: 'violet',
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    backgroundColor: colors.court900,
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  title: { color: colors.white, fontSize: 22, fontWeight: '900' },
  subtitle: { color: colors.court300, fontSize: 13, marginTop: 2 },
  levelFilters: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.ink100,
  },
  levelChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: colors.ink50,
  },
  levelChipActive: { backgroundColor: colors.court600 },
  levelText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  levelTextActive: { color: colors.white },
  courseCard: {
    backgroundColor: colors.white,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
  },
  courseThumb: {
    width: 90,
    backgroundColor: colors.court900,
    alignItems: 'center',
    justifyContent: 'center',
  },
  courseInfo: { flex: 1, padding: 12 },
  courseHeader: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  courseTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  instructorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  instructorName: { fontSize: 12, color: colors.textMuted },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  courseMeta: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, color: colors.ink400 },
  coursePrice: { fontSize: 12, color: colors.trophy700, fontWeight: '700' },
  freeText: { fontSize: 12, color: colors.court600, fontWeight: '700' },
})
