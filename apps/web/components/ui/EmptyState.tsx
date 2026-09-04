import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-ink-50 border border-ink-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-ink-400" strokeWidth={1.75} />
      </div>
      <p className="font-semibold text-ink-700 text-sm">{title}</p>
      {/* text-gray-400 sobre blanco daba ~2.5:1 (falla AA); ink-500 pasa manteniendo el tono secundario */}
      {description && <p className="text-sm text-ink-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
