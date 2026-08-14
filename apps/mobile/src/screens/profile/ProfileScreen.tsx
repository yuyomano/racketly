import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '../../store/auth.store'
import { eloToCategory, xpForNextLevel } from '@racketly/utils'
import { colors, radius, spacing, fontSize, shadow } from '../../theme'

export function ProfileScreen({ navigation }: { navigation: any }) {
  const { user, logout } = useAuthStore()
  const profile = user?.profile

  if (!profile) return null

  const levelProgress = xpForNextLevel(profile.xpPoints)
  const category = eloToCategory(profile.eloPadel)

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EditProfile')}>
          <Ionicons name="pencil" size={13} color={colors.white} />
          <Text style={styles.editBtnText}>Editar</Text>
        </TouchableOpacity>
        <View style={styles.avatarContainer}>
          <Ionicons name="person" size={36} color={colors.white} />
        </View>
        <Text style={styles.displayName}>{profile.displayName}</Text>
        <View style={styles.locationRow}>
          <Ionicons name="location" size={12} color={colors.primary300} />
          <Text style={styles.location}>{profile.city}, {profile.country}</Text>
        </View>

        {/* ELO & Categoría */}
        <View style={styles.eloRow}>
          <View style={styles.eloCard}>
            <Text style={styles.eloValue}>{profile.eloPadel}</Text>
            <Text style={styles.eloLabel}>ELO Pádel</Text>
          </View>
          <View style={styles.categoryCard}>
            <Text style={styles.categoryValue}>{category}</Text>
            <Text style={styles.categoryLabel}>Categoría</Text>
          </View>
          <View style={styles.eloCard}>
            <Text style={styles.eloValue}>{profile.eloPickleball}</Text>
            <Text style={styles.eloLabel}>ELO Pickle</Text>
          </View>
        </View>
      </View>

      {/* XP Progress */}
      <View style={styles.xpCard}>
        <View style={styles.xpHeader}>
          <View style={styles.xpTitleRow}>
            <Ionicons name="flash" size={15} color={colors.amber500} />
            <Text style={styles.xpTitle}>Nivel {profile.level}</Text>
          </View>
          <Text style={styles.xpPoints}>{profile.xpPoints} XP</Text>
        </View>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${levelProgress.percent}%` }]} />
        </View>
        <Text style={styles.progressText}>{levelProgress.percent}% hacia nivel {profile.level + 1}</Text>
      </View>

      {/* Subscription */}
      <View style={styles.subscriptionCard}>
        <Text style={styles.subTitle}>
          {user?.subscriptionTier === 'free' ? '🆓 Plan Gratuito' : `⭐ Plan ${user?.subscriptionTier}`}
        </Text>
        {user?.subscriptionTier === 'free' && (
          <TouchableOpacity style={styles.upgradeBtn} onPress={() => navigation.navigate('Premium')}>
            <Text style={styles.upgradeBtnText}>Mejorar a Premium</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.white} />
          </TouchableOpacity>
        )}
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        {menuItems.map((item, i) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]}
            onPress={() => item.route && navigation.navigate(item.tab ?? item.route, item.tab ? { screen: item.route } : undefined)}
          >
            <View style={styles.menuIconWrap}>
              <Ionicons name={item.icon} size={17} color={colors.primary600} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.gray300} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
        <Ionicons name="log-out-outline" size={16} color={colors.red500} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const menuItems: { icon: keyof typeof Ionicons.glyphMap; label: string; route?: string; tab?: string }[] = [
  { icon: 'calendar-outline',     label: 'Mis reservas',            route: 'MyBookings',      tab: 'Reservas' },
  { icon: 'pricetag-outline',     label: 'Mis membresías',          route: 'MyMemberships',   tab: 'Reservas' },
  { icon: 'trophy-outline',       label: 'Mis torneos',             route: 'TournamentsList', tab: 'Torneos' },
  { icon: 'people-outline',       label: 'Find a Partner',          route: 'FindPartner',     tab: 'Torneos' },
  { icon: 'ribbon-outline',       label: 'Insignias y logros' },
  { icon: 'stats-chart-outline',  label: 'Estadísticas detalladas' },
  { icon: 'notifications-outline', label: 'Notificaciones' },
  { icon: 'settings-outline',     label: 'Configuración' },
]

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { backgroundColor: colors.primary900, paddingTop: 60, paddingBottom: spacing['2xl'], alignItems: 'center', paddingHorizontal: spacing.xl },
  editBtn: {
    position: 'absolute', top: 60, right: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
  },
  editBtnText: { color: colors.white, fontSize: fontSize.sm, fontWeight: '600' },
  avatarContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary500, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, ...shadow.md },
  displayName: { color: colors.white, fontSize: fontSize.xl + 2, fontWeight: '900' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.lg },
  location: { color: colors.primary300, fontSize: fontSize.sm },
  eloRow: { flexDirection: 'row', gap: spacing.md },
  eloCard: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: radius.md, padding: spacing.md, alignItems: 'center', minWidth: 80 },
  eloValue: { color: colors.white, fontSize: fontSize.xl, fontWeight: '900' },
  eloLabel: { color: colors.primary300, fontSize: fontSize.xs - 1, marginTop: 2 },
  categoryCard: { backgroundColor: colors.primary500, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', minWidth: 80 },
  categoryValue: { color: colors.white, fontSize: fontSize.xl, fontWeight: '900' },
  categoryLabel: { color: colors.primary100, fontSize: fontSize.xs - 1, marginTop: 2 },
  xpCard: { margin: spacing.lg, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm },
  xpHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm + 2 },
  xpTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  xpTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  xpPoints: { fontSize: fontSize.sm, color: colors.primary600, fontWeight: '700' },
  progressBar: { height: 8, backgroundColor: colors.gray200, borderRadius: 4, marginBottom: spacing.xs + 2 },
  progressFill: { height: 8, backgroundColor: colors.primary600, borderRadius: 4 },
  progressText: { fontSize: fontSize.xs, color: colors.gray400 },
  subscriptionCard: { marginHorizontal: spacing.lg, backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, ...shadow.sm },
  subTitle: { fontSize: fontSize.base, fontWeight: '700', color: colors.textPrimary },
  upgradeBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm + 2, backgroundColor: colors.primary600, borderRadius: radius.sm + 2, paddingVertical: spacing.sm + 2 },
  upgradeBtnText: { color: colors.white, fontWeight: '700', fontSize: fontSize.sm },
  menu: { margin: spacing.lg, backgroundColor: colors.white, borderRadius: radius.lg, overflow: 'hidden', ...shadow.sm },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.gray100, gap: spacing.md },
  menuIconWrap: { width: 32, height: 32, borderRadius: radius.sm, backgroundColor: colors.primary50, alignItems: 'center', justifyContent: 'center' },
  menuLabel: { flex: 1, fontSize: fontSize.base, color: colors.textPrimary },
  logoutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.xs, margin: spacing.lg, marginTop: spacing.xs, padding: spacing.lg },
  logoutText: { color: colors.red500, fontWeight: '600', fontSize: fontSize.base },
})
