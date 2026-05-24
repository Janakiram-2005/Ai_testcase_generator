import Editor from '@monaco-editor/react'
import { FlaskConical, Sparkles } from 'lucide-react'

/**
 * ResultPanel — read-only Monaco editor that shows generated tests.
 * Props:
 *   value          {string}   — generated test code
 *   language       {string}   — "python" | "javascript"
 *   edgeCases      {string[]} — AI-generated edge case titles
 *   ollamaAvailable {boolean}
 *   isLoading      {boolean}
 */
export default function ResultPanel({ value, language, edgeCases, ollamaAvailable, isLoading }) {
  const monacoLang = language === 'javascript' ? 'javascript' : 'python'
  const isEmpty = !value && !isLoading

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <FlaskConical size={14} className="text-brand-400" />
          <span className="panel-label">Generated Test Suite</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Ollama indicator */}
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                ollamaAvailable ? 'bg-green-400 animate-pulse-slow' : 'bg-slate-600'
              }`}
            />
            <span className="text-xs text-slate-500">
              {ollamaAvailable ? 'Ollama ✓' : 'Ollama offline'}
            </span>
          </div>

          {/* Edge case count badge */}
          {edgeCases.length > 0 && (
            <span className="badge badge-purple">
              <Sparkles size={10} />
              {edgeCases.length} AI cases
            </span>
          )}
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 relative">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-800/80 backdrop-blur-sm">
            <div className="relative">
              <div className="w-14 h-14 border-2 border-brand-500/20 rounded-full" />
              <div className="absolute inset-0 w-14 h-14 border-2 border-transparent border-t-brand-500 rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-brand-400 font-semibold text-sm">Generating Tests…</p>
              <p className="text-slate-600 text-xs mt-1">AST parsing + AI edge cases</p>
            </div>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none z-10">
            <div className="w-16 h-16 rounded-2xl bg-brand-950/60 border border-brand-800/40 flex items-center justify-center">
              <FlaskConical size={28} className="text-brand-600" />
            </div>
            <p className="text-slate-500 text-sm font-medium">Generated tests will appear here</p>
            <p className="text-slate-700 text-xs">Paste code, set options, and click Generate</p>
          </div>
        )}

        {/* Monaco read-only editor */}
        <div className="monaco-container">
          <Editor
            height="100%"
            language={monacoLang}
            value={value || ''}
            theme="vs-dark"
            options={{
              readOnly: true,
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              lineNumbers: 'on',
              renderLineHighlight: 'none',
              padding: { top: 12, bottom: 12 },
              smoothScrolling: true,
              scrollbar: {
                verticalScrollbarSize: 6,
                horizontalScrollbarSize: 6,
              },
              domReadOnly: true,
              contextmenu: false,
            }}
            loading={<div />}
          />
        </div>
      </div>

      {/* AI Edge Cases list */}
      {edgeCases.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/5 px-4 py-3 animate-fade-in">
          <p className="panel-label mb-2 flex items-center gap-1.5">
            <Sparkles size={10} />
            AI-Detected Edge Cases
          </p>
          <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {edgeCases.map((ec, i) => (
              <span
                key={i}
                className="text-xs px-2 py-1 rounded-md bg-brand-950/70 border border-brand-800/40 text-brand-300"
              >
                {ec}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
