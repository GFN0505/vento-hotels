// Button, matching `.btn` in the designs (docs/design/export/vento.css).
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-sm border font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-pri-line focus-visible:border-brand disabled:cursor-not-allowed disabled:opacity-45',
  {
    variants: {
      variant: {
        default: 'border-border-strong bg-surface text-text hover:bg-surface-2',
        primary: 'border-pri bg-pri text-white hover:bg-pri-hover',
        ghost: 'border-transparent bg-transparent text-text-2 hover:bg-surface-3',
        danger: 'border-border-strong bg-surface text-ro hover:bg-surface-2',
      },
      size: {
        sm: 'h-7 px-2.5 text-sm',
        md: 'h-8 px-3 text-base',
        lg: 'h-10 px-4 text-md',
        xl: 'h-12 px-5 text-[15px]',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}
