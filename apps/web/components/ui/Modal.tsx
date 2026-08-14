'use client'

import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const MAX_WIDTH = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
} as const

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  maxWidth?: keyof typeof MAX_WIDTH
  /** z-index del overlay — solo hace falta subirlo cuando este modal se abre encima de otro. */
  zIndex?: number
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
  /**
   * Para contenido que ya trae su propio layout de scroll (ej. una grilla ancha con
   * header sticky): el Modal deja de imponer `p-6` + scroll en el contenedor exterior
   * y los children pasan a controlar su propio padding y su propio `overflow-y-auto`
   * interno. El shell (overlay, header con título/cerrar, Escape) se mantiene igual.
   */
  noPadding?: boolean
}

// Reemplaza los ~32 bloques `fixed inset-0 bg-black/40 ...` repetidos a mano por el
// dashboard (uno distinto por página) — mismo overlay, mismo header con botón de
// cerrar, mismo comportamiento de teclado (Escape), en un solo lugar.
export function Modal({ open, onClose, title, maxWidth = 'lg', zIndex = 50, children, footer, className, noPadding = false }: ModalProps) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4"
      style={{ zIndex }}
      onClick={onClose}
    >
      <div
        className={cn(
          'bg-white rounded-3xl w-full',
          noPadding ? 'max-h-[90vh] flex flex-col overflow-hidden' : 'max-h-[92vh] overflow-y-auto',
          MAX_WIDTH[maxWidth],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between p-6 border-b border-gray-100 shrink-0">
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Cerrar">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {noPadding ? children : <div className="p-6">{children}</div>}

        {footer && <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 shrink-0">{footer}</div>}
      </div>
    </div>
  )
}
