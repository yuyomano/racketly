import { cn } from '@/lib/utils'
import { inputBaseClass } from './Input'

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBaseClass, 'bg-white', className)} {...props}>
      {children}
    </select>
  )
}
