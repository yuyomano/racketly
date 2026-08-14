import type { LucideIcon } from 'lucide-react'

export function EmptyState({
  icon: Icon, title, description, action,
}: {
  icon: LucideIcon; title: string; description?: string; action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-gray-400" strokeWidth={1.75} />
      </div>
      <p className="font-semibold text-gray-700 text-sm">{title}</p>
      {description && <p className="text-sm text-gray-400 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
