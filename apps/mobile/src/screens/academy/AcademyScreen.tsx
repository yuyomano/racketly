import React, { useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { academyApi } from '../../services/api'
import type { Course } from '@racketly/shared-types'
import { Badge } from '../../components/ui/Badge'
import { SportIcon } from '../../components/ui/SportIcons'

const LEVELS = ['all', 'beginner', 'intermediate', 'advanced', 'pro']
const LEVEL_LABELS: Record<string, string> = {
  all: 'Todos', beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado', pro: 'Pro',
}

export function AcademyScreen({ navigation }: { navigation: any }) {
  const [level, setLevel] = useState('all')
  const [sport, setSport] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['courses', { level, sport }],
    queryFn: () => academyApi.getCourses({ level: level === 'all' ? undefined : level, sport: sport || undefined }),
    select: (res) => res.data.data as Course[],
  })

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎓 Academia</Text>
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
        <ActivityIndicator size="large" color="#059669" style={{ marginTop: 40 }} />
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
                  {item.isPremium && <Badge tone="amber">⭐ Premium</Badge>}
                </View>
                <Text style={styles.courseTitle}>{item.title}</Text>
                <Text style={styles.instructorName}>
                  por {(item as any).instructor?.displayName || 'Instructor'}
                  {(item as any).instructor?.ratingAvg > 0 && ` · ⭐ ${(item as any).instructor.ratingAvg.toFixed(1)}`}
                </Text>
                <View style={styles.courseMeta}>
                  <Text style={styles.metaText}>🎬 {(item as any)._count?.lessons || 0} lecciones</Text>
                  <Text style={styles.metaText}>⏱ {item.durationHours}h</Text>
                  {item.price > 0 ? (
                    <Text style={styles.coursePrice}>{item.price} {item.currency}</Text>
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
  beginner: 'emerald', intermediate: 'blue', advanced: 'amber', pro: 'violet',
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { backgroundColor: '#064e3b', paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20 },
  title: { color: '#fff', fontSize: 22, fontWeight: '900' },
  subtitle: { color: '#6ee7b7', fontSize: 13, marginTop: 2 },
  levelFilters: { paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  levelChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#f3f4f6' },
  levelChipActive: { backgroundColor: '#059669' },
  levelText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  levelTextActive: { color: '#fff' },
  courseCard: { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2, flexDirection: 'row' },
  courseThumb: { width: 90, backgroundColor: '#064e3b', alignItems: 'center', justifyContent: 'center' },
  courseThumbEmoji: { fontSize: 36 },
  courseInfo: { flex: 1, padding: 12 },
  courseHeader: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelBadgeText: { fontSize: 10, fontWeight: '700', color: '#374151' },
  premiumBadge: { backgroundColor: '#fffbeb', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  premiumText: { fontSize: 10, color: '#92400e', fontWeight: '700' },
  courseTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 3 },
  instructorName: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  courseMeta: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaText: { fontSize: 11, color: '#9ca3af' },
  coursePrice: { fontSize: 12, color: '#7c3aed', fontWeight: '700' },
  freeText: { fontSize: 12, color: '#059669', fontWeight: '700' },
})
