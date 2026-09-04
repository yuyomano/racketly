import { cn } from '@/lib/utils'
import { inputBaseClass } from './Input'

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(inputBaseClass, 'resize-none', className)} {...props} />
}
