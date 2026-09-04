import Link from 'next/link'
import { Calendar, Trophy, Radio, Users, GraduationCap, UserPlus } from 'lucide-react'
import { PadelIcon } from '@/components/ui/SportIcons'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2 text-ink-900">
          <PadelIcon size={22} />
          <span className="font-display text-xl font-black tracking-tight">Racketly</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/register"
            className="bg-court-600 hover:bg-court-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          >
            Crear cuenta
          </Link>
        </div>
      </nav>

      {/* Hero — texto a la izquierda, marcador real como pieza visual a la derecha.
          Único tratamiento oscuro de la página, contenido dentro de una tarjeta. */}
      <section className="max-w-6xl mx-auto px-6 pt-12 pb-24 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-black text-ink-900 leading-[1.1] tracking-tight">
            Tu club de pádel y pickleball, en un solo lugar.
          </h1>
          <p className="text-lg text-ink-600 mt-6 max-w-md leading-relaxed">
            Reserva pistas en segundos, compite en torneos con marcador en vivo y encuentra pareja
            de juego a tu nivel.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 mt-8">
            <Link
              href="/clubs"
              className="bg-court-600 hover:bg-court-700 text-white px-6 py-3.5 rounded-xl text-sm font-semibold text-center transition-colors"
            >
              Reservar una pista
            </Link>
            <Link
              href="/register"
              className="border border-ink-200 text-ink-700 hover:bg-ink-50 px-6 py-3.5 rounded-xl text-sm font-semibold text-center transition-colors"
            >
              Crear cuenta gratis
            </Link>
          </div>
        </div>

        {/* Marcador — el único momento oscuro del sistema, contenido en una tarjeta */}
        <div className="bg-ink-900 rounded-2xl p-8 text-white">
          <div className="flex items-center justify-between mb-6">
            <span className="text-xs font-medium text-ink-300">Pista 3 · Pádel</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-ball-500">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-ball-500" />
              En vivo
            </span>
          </div>
          <div className="space-y-4 font-score">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate pr-4">García / Ruiz</span>
              <span className="font-display text-2xl font-bold tracking-wide">
                6&nbsp;&nbsp;4&nbsp;&nbsp;7
              </span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink-300 truncate pr-4">Beltrán / Soto</span>
              <span className="font-display text-2xl font-bold text-ball-500 tracking-wide">
                3&nbsp;&nbsp;6&nbsp;&nbsp;6
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features — separadas por línea, no tarjetas idénticas con sombra */}
      <section className="border-t border-ink-100">
        <div className="max-w-6xl mx-auto px-6 py-20 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12">
          {features.map((f) => (
            <div key={f.title}>
              <f.icon className="w-5 h-5 text-court-600" strokeWidth={2} />
              <h3 className="font-display text-ink-900 font-bold text-base mt-3">{f.title}</h3>
              <p className="text-ink-500 text-sm leading-relaxed mt-1.5">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Stats — misma gramática visual que StatCard: regla superior + número tabular */}
      <section className="border-t border-ink-100 bg-ink-50/60">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="border-t-2 border-court-500 pt-4">
              <div className="font-display font-score text-3xl font-black text-ink-900">
                {s.value}
              </div>
              <div className="text-ink-500 text-sm mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-8 text-sm text-ink-400">
        © 2026 Racketly. Todos los deportes de raqueta, una sola comunidad.
      </footer>
    </main>
  )
}

const features = [
  {
    icon: Calendar,
    title: 'Reserva en minutos',
    description:
      'Encuentra una pista libre cerca de ti, elige el horario y paga desde el móvil. El QR de acceso llega directo a tu reserva.',
  },
  {
    icon: Trophy,
    title: 'Torneos y ligas',
    description:
      'Organiza torneos por eliminación directa, round robin o sistema suizo, y sigue las llaves en tiempo real.',
  },
  {
    icon: Radio,
    title: 'Marcador en vivo',
    description:
      'Anota el marcador punto a punto durante el partido. Quien lo sigue desde fuera ve el resultado actualizarse al instante.',
  },
  {
    icon: UserPlus,
    title: 'Encuentra pareja',
    description: 'Busca compañeros de tu nivel y tu zona por ranking ELO y disponibilidad horaria.',
  },
  {
    icon: Users,
    title: 'Comunidad',
    description:
      'Comparte vídeos de tus jugadas, valora palas y aprende de otros jugadores del club.',
  },
  {
    icon: GraduationCap,
    title: 'Clases y academia',
    description:
      'Apúntate a clases con profesores certificados, presenciales o en vídeo bajo demanda.',
  },
]

const stats = [
  { value: '500+', label: 'Clubs asociados' },
  { value: '50K+', label: 'Jugadores activos' },
  { value: '10K+', label: 'Partidos al mes' },
  { value: '15+', label: 'Países' },
]
