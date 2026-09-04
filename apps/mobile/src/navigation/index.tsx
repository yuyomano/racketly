import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { Ionicons } from '@expo/vector-icons'
import { View, ActivityIndicator } from 'react-native'
import { useAuthStore } from '../store/auth.store'
import { colors } from '../theme'

// Screens — Auth
import { LoginScreen } from '../screens/auth/LoginScreen'
import { RegisterScreen } from '../screens/auth/RegisterScreen'

// Screens — Booking
import { HomeScreen } from '../screens/booking/HomeScreen'
import { ClubDetailScreen } from '../screens/booking/ClubDetailScreen'
import { BookingScreen } from '../screens/booking/BookingScreen'
import { MyBookingsScreen } from '../screens/booking/MyBookingsScreen'
import { MyMembershipsScreen } from '../screens/booking/MyMembershipsScreen'

// Screens — Tournaments
import { TournamentsScreen } from '../screens/tournaments/TournamentsScreen'
import { TournamentDetailScreen } from '../screens/tournaments/TournamentDetailScreen'
import { FindPartnerScreen } from '../screens/tournaments/FindPartnerScreen'
import { LiveScoringScreen } from '../screens/tournaments/LiveScoringScreen'

// Nota: TournamentDetail se registra también en el stack de Reservas. Se navega a ella
// desde ClubDetailScreen (torneos de un club) y React Navigation busca el nombre de
// pantalla hacia arriba en el árbol si no lo encuentra en el stack actual — sin este
// registro duplicado, terminaba saltando al tab de Torneos en vez de quedarse en el
// flujo de Reservas.

// Screens — Community / Academy / Profile
import { CommunityScreen } from '../screens/community/CommunityScreen'
import { CreatePostScreen } from '../screens/community/CreatePostScreen'
import { PostDetailScreen } from '../screens/community/PostDetailScreen'
import { AcademyScreen } from '../screens/academy/AcademyScreen'
import { ProfileScreen } from '../screens/profile/ProfileScreen'
import { EditProfileScreen } from '../screens/profile/EditProfileScreen'

const Tab = createBottomTabNavigator()
const Stack = createNativeStackNavigator()

function BookingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="ClubDetail" component={ClubDetailScreen} />
      <Stack.Screen name="Booking" component={BookingScreen} />
      <Stack.Screen name="MyBookings" component={MyBookingsScreen} />
      <Stack.Screen name="MyMemberships" component={MyMembershipsScreen} />
      <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
    </Stack.Navigator>
  )
}

function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommunityFeed" component={CommunityScreen} />
      <Stack.Screen name="CreatePost" component={CreatePostScreen} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} />
    </Stack.Navigator>
  )
}

function TournamentsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="TournamentsList" component={TournamentsScreen} />
      <Stack.Screen name="TournamentDetail" component={TournamentDetailScreen} />
      <Stack.Screen name="FindPartner" component={FindPartnerScreen} />
      <Stack.Screen name="LiveScoring" component={LiveScoringScreen} />
    </Stack.Navigator>
  )
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64,
          paddingTop: 6,
        },
        tabBarActiveTintColor: colors.court600,
        tabBarInactiveTintColor: colors.ink400,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', paddingBottom: 4 },
      }}
    >
      <Tab.Screen
        name="Reservas"
        component={BookingStack}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Torneos"
        component={TournamentsStack}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'trophy' : 'trophy-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Comunidad"
        component={CommunityStack}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Academia"
        component={AcademyScreen}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'school' : 'school-outline'} size={22} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'person' : 'person-outline'} size={22} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  )
}

function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ProfileHome" component={ProfileScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
    </Stack.Navigator>
  )
}

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore()

  if (isLoading)
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: '#042b22',
        }}
      >
        <ActivityIndicator size="large" color={colors.court500} />
      </View>
    )

  return <NavigationContainer>{isAuthenticated ? <MainTabs /> : <AuthStack />}</NavigationContainer>
}
