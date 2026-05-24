import React from 'react'
import Editor from '@monaco-editor/react'
import { FlaskConical, Sparkles, ShieldAlert, CheckCircle2 } from 'lucide-react'

/**
 * ResultPanel — read-only Monaco editor that shows generated tests,
 * plus glowing threat indicators and visual consequence flowcharts.
 */
export default function ResultPanel({
  value,
  language,
  edgeCases,
  ollamaAvailable,
  isLoading,
  vulnerabilities = [],
  consequences = [],
  fullyCorrect = false,
}) {
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

        <div className="flex items-center gap-2 flex-wrap justify-end">
          {/* Correction / Vulnerability Status badges */}
          {fullyCorrect && (
            <span className="badge badge-green font-bold text-xs">
              <CheckCircle2 size={10} />
              Fully Correct & Secure
            </span>
          )}

          {!fullyCorrect && vulnerabilities.length > 0 && (
            <span className="badge badge-orange font-bold text-xs animate-pulse-slow">
              <ShieldAlert size={10} />
              Vulnerable ({vulnerabilities.length})
            </span>
          )}

          {/* Ollama indicator */}
          <div className="flex items-center gap-1.5 ml-1">
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
      <div className="flex-1 relative min-h-0">
        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-surface-800/85 backdrop-blur-sm">
            <div className="relative">
              <div className="w-14 h-14 border-2 border-brand-500/20 rounded-full" />
              <div className="absolute inset-0 w-14 h-14 border-2 border-transparent border-t-brand-500 rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-brand-400 font-semibold text-sm">Generating Tests…</p>
              <p className="text-slate-600 text-xs mt-1">AST parsing + AI threat intelligence</p>
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
            <p className="text-slate-700 text-xs">Load a preset or paste code, then click Generate</p>
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

      {/* Visual Consequence Flowcharts */}
      {consequences.length > 0 && (
        <div className="flex-shrink-0 border-t border-white/5 px-4 py-3 bg-red-950/5 animate-fade-in max-h-36 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          <p className="panel-label mb-2 flex items-center gap-1.5 text-orange-400">
            <ShieldAlert size={12} />
            Vulnerability Consequence Flow
          </p>
          <div className="flex flex-col gap-2">
            {consequences.map((flow, idx) => {
              const steps = flow.split(/➔|->/).map(s => s.strip ? s.strip() : s.trim())
              return (
                <div key={idx} className="flex items-center gap-2 overflow-x-auto py-1" style={{ scrollbarWidth: 'none' }}>
                  {steps.map((step, sIdx) => (
                    <React.Fragment key={sIdx}>
                      {sIdx > 0 && (
                        <span className="text-orange-500/50 font-bold animate-pulse-slow">➔</span>
                      )}
                      <span className="text-xs px-2.5 py-1 rounded-md bg-surface-700/80 border border-white/10 font-mono text-slate-300 shadow-sm whitespace-nowrap">
                        {step}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}

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
