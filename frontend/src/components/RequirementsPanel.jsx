import { FileText } from 'lucide-react'

/**
 * RequirementsPanel — styled textarea for pasting Jira tickets / plain-English specs.
 * Props:
 *   value    {string}
 *   onChange {function}
 */
export default function RequirementsPanel({ value, onChange }) {
  const charCount = value.length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-brand-400" />
          <span className="panel-label">Requirements / Jira Ticket</span>
        </div>
        <span className="text-xs text-slate-600 font-mono">
          {charCount.toLocaleString()} chars
        </span>
      </div>

      {/* Textarea */}
      <div className="flex-1 relative">
        <textarea
          id="requirements-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            'Paste your Jira ticket or plain English requirements here...\n\n' +
            'Example:\n' +
            '• The login function should reject empty passwords\n' +
            '• SQL injection attempts must raise an AuthError\n' +
            '• Unicode usernames (up to 255 chars) must be accepted'
          }
          className={[
            'w-full h-full resize-none bg-transparent',
            'text-slate-300 text-sm leading-relaxed font-mono',
            'px-4 py-3 outline-none',
            'placeholder:text-slate-600 placeholder:font-sans placeholder:text-xs',
            'transition-all duration-200',
            'focus:ring-0',
          ].join(' ')}
          style={{ scrollbarWidth: 'thin' }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
        />

        {/* Subtle focus glow via sibling — handled in CSS */}
        {value && (
          <div
            aria-hidden="true"
            className="absolute bottom-3 right-3 text-xs text-slate-700 select-none pointer-events-none"
          >
            {value.split('\n').length} line{value.split('\n').length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  )
}
