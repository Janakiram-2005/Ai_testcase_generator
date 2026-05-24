import Editor from '@monaco-editor/react'

/**
 * CodeEditor — wraps @monaco-editor/react with vs-dark theme.
 * Props:
 *   value      {string}   — source code string
 *   onChange   {function} — called with new value on each edit
 *   language   {string}   — "python" | "javascript"
 */
export default function CodeEditor({ value, onChange, language }) {
  // Monaco uses "javascript" for JS (same name), and "python" for Python.
  const monacoLang = language === 'javascript' ? 'javascript' : 'python'

  return (
    <div className="monaco-container">
      <Editor
        height="100%"
        language={monacoLang}
        value={value}
        theme="vs-dark"
        onChange={(val) => onChange(val ?? '')}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          padding: { top: 12, bottom: 12 },
          smoothScrolling: true,
          cursorBlinking: 'phase',
          cursorSmoothCaretAnimation: 'on',
          contextmenu: true,
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
        loading={
          <div className="flex items-center justify-center h-full text-slate-500 text-sm gap-2">
            <div className="spinner" />
            <span>Loading editor…</span>
          </div>
        }
      />
    </div>
  )
}
