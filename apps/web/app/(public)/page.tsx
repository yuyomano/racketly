import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-950">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black text-white tracking-tight">🎾 Racketly</span>
        </div>
        <div className="flex gap-4">
          <Link href="/login" className="text-emerald-200 hover:text-white transition-colors">Entrar</Link>
          <Link href="/register" className="bg-white text-emerald-900 px-4 py-2 rounded-full text-sm font-semibold hover:bg-emerald-50 transition-colors">
            Registrarse
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center gap-2 bg-emerald-700/50 text-emerald-200 px-4 py-1.5 rounded-full text-sm mb-6">
          <span>🏓</span> Pádel + Pickleball — Una sola plataforma
        </div>
        <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">
          Juega. Compite.<br />
          <span className="text-emerald-400">Conéctate.</span>
        </h1>
        <p className="text-xl text-emerald-200 mb-10 max-w-2xl mx-auto">
          Reserva pistas, crea torneos, encuentra pareja de juego y aprende con los mejores instructores.
          Todo en un solo lugar.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register" className="bg-emerald-400 hover:bg-emerald-300 text-emerald-950 px-8 py-4 rounded-full text-lg font-bold transition-colors shadow-lg">
            Empieza gratis →
          </Link>
          <Link href="/clubs" className="border border-emerald-400 text-emerald-200 hover:bg-emerald-800/50 px-8 py-4 rounded-full text-lg font-semibold transition-colors">
            Ver clubs cerca
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((f) => (
          <div key={f.title} className="bg-emerald-800/40 backdrop-blur border border-emerald-700/50 rounded-2xl p-6 hover:bg-emerald-800/60 transition-colors">
            <div className="text-3xl mb-3">{f.icon}</div>
            <h3 className="text-white font-bold text-lg mb-2">{f.title}</h3>
            <p className="text-emerald-300 text-sm leading-relaxed">{f.description}</p>
          </div>
        ))}
      </section>

      {/* Stats */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="bg-emerald-400 rounded-3xl p-12 text-center">
          <h2 className="text-3xl font-black text-emerald-950 mb-10">
            La comunidad más grande de pádel y pickleball
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label}>
                <div className="text-4xl font-black text-emerald-900">{s.value}</div>
                <div className="text-emerald-800 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-emerald-600 text-sm py-8">
        © 2026 Racketly · Todos los deportes de raqueta, una sola comunidad
      </footer>
    </main>
  )
}

const features = [
  { icon: '📅', title: 'Reserva en segundos', description: 'Encuentra pista disponible cerca de ti, elige horario y paga en segundos. QR de acceso automático.' },
  { icon: '🏆', title: 'Torneos y ligas', description: 'Compite en torneos por club o interclub. Round robin, eliminación directa, sistema suizo.' },
  { icon: '⚡', title: 'Live scoring', description: 'Marcador en tiempo real durante tus partidos. Los espectadores siguen el partido en vivo.' },
  { icon: '🤝', title: 'Find a Partner', description: 'Encuentra pareja de juego de tu nivel en tu zona. Matchmaking inteligente por ELO y disponibilidad.' },
  { icon: '👥', title: 'Comunidad activa', description: 'Comparte videos, tácticas, reseñas de palas. Aprende de los mejores jugadores.' },
  { icon: '🎓', title: 'Academia online', description: 'Cursos de instructores certificados. Videos a demanda y clases presenciales en tu ciudad.' },
]

const stats = [
  { value: '500+', label: 'Clubs asociados' },
  { value: '50K+', label: 'Jugadores activos' },
  { value: '10K+', label: 'Partidos/mes' },
  { value: '15+', label: 'Países' },
]
