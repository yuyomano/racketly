'use client'

// Se activa solo si el propio layout raíz (app/layout.tsx) revienta al renderizar —
// por eso tiene que traer su propio <html>/<body>, Next no puede reusar el layout roto.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#042b22', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
          <div style={{ textAlign: 'center', color: 'white' }}>
            <p style={{ fontSize: 40, marginBottom: 8 }}>🎾</p>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Algo salió mal</h1>
            <p style={{ fontSize: 14, color: '#a7f3d0', marginBottom: 20 }}>
              Hubo un error inesperado al cargar Racketly. Intenta de nuevo.
            </p>
            <button
              onClick={reset}
              style={{ background: '#10b981', color: 'white', fontWeight: 700, padding: '10px 24px', borderRadius: 12, border: 'none', cursor: 'pointer' }}
            >
              Reintentar
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
