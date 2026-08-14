import { cn } from '@/lib/utils'

// Clase base compartida por Input/Select/Textarea — antes cada página redefinía
// su propia variante de estas mismas clases (ej. `inputCls` copy-pasteado en
// membresias/torneos/clases, o el ring en distinto tono/opacidad según el archivo).
export const inputBaseClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm transition-colors ' +
  'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-400 ' +
  'disabled:opacity-50 disabled:bg-gray-50'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBaseClass, className)} {...props} />
}
