interface SummaryCardProps {
  label: string
  value: number | string
  hint: string
  isActive?: boolean
  onClick?: () => void
}

export default function SummaryCard({
  label,
  value,
  hint,
  isActive = false,
  onClick,
}: SummaryCardProps) {
  const isClickable = Boolean(onClick)

  return (
    <li
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick?.()
              }
            }
          : undefined
      }
      className={`rounded-lg border px-4 py-3 transition-colors ${
        isActive
          ? 'border-accent bg-accent-soft/40 shadow-xs'
          : 'border-slate-200 bg-white hover:border-slate-300'
      } ${isClickable ? 'cursor-pointer' : ''}`}
    >
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">{hint}</p>
    </li>
  )
}
