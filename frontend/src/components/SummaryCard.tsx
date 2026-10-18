interface SummaryCardProps {
  label: string
  value: number | string
  hint: string
  isActive?: boolean
  onClick?: () => void
  highlight?: boolean
}

export default function SummaryCard({
  label,
  value,
  hint,
  isActive = false,
  onClick,
  highlight = false,
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
      className={`relative flex flex-col justify-between rounded-lg border bg-white p-4 transition-all duration-150 ${
        isActive
          ? 'border-[#B85D3B] bg-[#FBF0EA]/30 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-[#B85D3B]'
          : highlight
          ? 'border-[#E8C8BC] hover:border-[#B85D3B] shadow-[0_1px_2px_rgba(0,0,0,0.03)]'
          : 'border-[#E2E1DC] hover:border-[#D5D4CE] shadow-[0_1px_2px_rgba(0,0,0,0.02)]'
      } ${isClickable ? 'cursor-pointer hover:bg-[#FAFAF9]' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold tracking-wider text-[#63625D] uppercase">
          {label}
        </span>
        {highlight && (
          <span className="inline-flex size-2 rounded-full bg-[#B85D3B]" aria-label="Requires attention" />
        )}
      </div>

      <div>
        <p className="text-2xl font-semibold tabular-nums text-[#242520] tracking-tight">
          {value}
        </p>
        <p className="mt-1 text-xs text-[#63625D] leading-normal">{hint}</p>
      </div>

      {isClickable && (
        <div className="mt-3 pt-2 border-t border-[#F0EFEA] flex items-center justify-between text-[11px] font-medium text-[#63625D]">
          <span>{isActive ? 'Filtered' : 'Filter queue'}</span>
          <svg
            className={`size-3 transition-transform ${isActive ? 'text-[#B85D3B]' : 'text-[#9C9A93]'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </li>
  )
}
