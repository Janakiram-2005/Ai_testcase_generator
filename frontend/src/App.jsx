import { useState, useCallback, useRef } from 'react'
import {
  Zap,
  Copy,
  Download,
  ChevronDown,
  Shield,
  Code2,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react'
import CodeEditor from './components/CodeEditor.jsx'
import RequirementsPanel from './components/RequirementsPanel.jsx'
import ResultPanel from './components/ResultPanel.jsx'

// ── Default demo code snippets ──────────────────────────────────────────────
const DEMO_CODE = {
  python: `def authenticate_user(username, password):
    """Validate credentials and return a session token."""
    if not username or not password:
        raise ValueError("Username and password are required.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    # Simulated DB lookup
    stored_hash = get_password_hash(username)
    if not verify_hash(password, stored_hash):
        raise AuthenticationError("Invalid credentials.")
    return generate_session_token(username)


def calculate_discount(price, discount_pct):
    """Apply a percentage discount to a price."""
    if price < 0:
        raise ValueError("Price cannot be negative.")
    if not (0 <= discount_pct <= 100):
        raise ValueError("Discount must be between 0 and 100.")
    return round(price * (1 - discount_pct / 100), 2)


def parse_json_payload(raw_json):
    """Parse and validate an API JSON payload."""
    import json
    data = json.loads(raw_json)
    required_fields = ["user_id", "action", "timestamp"]
    for field in required_fields:
        if field not in data:
            raise KeyError(f"Missing required field: {field}")
    return data
`,

  javascript: `function authenticateUser(username, password) {
  // Validate credentials and return a session token
  if (!username || !password) {
    throw new Error('Username and password are required.');
  }
  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  const storedHash = getPasswordHash(username);
  if (!verifyHash(password, storedHash)) {
    throw new AuthenticationError('Invalid credentials.');
  }
  return generateSessionToken(username);
}

const calculateDiscount = (price, discountPct) => {
  if (price < 0) throw new RangeError('Price cannot be negative.');
  if (discountPct < 0 || discountPct > 100) {
    throw new RangeError('Discount must be between 0 and 100.');
  }
  return Math.round(price * (1 - discountPct / 100) * 100) / 100;
};

function parseJsonPayload(rawJson) {
  const data = JSON.parse(rawJson);
  const requiredFields = ['user_id', 'action', 'timestamp'];
  for (const field of requiredFields) {
    if (!(field in data)) {
      throw new Error(\`Missing required field: \${field}\`);
    }
  }
  return data;
}
`,
}

// ── Toast system ─────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)

  const show = useCallback((message, type = 'info') => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ message, type, id: Date.now() })
    timerRef.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const dismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast(null)
  }, [])

  return { toast, show, dismiss }
}

// ── Toast component ───────────────────────────────────────────────────────────
function Toast({ toast, onDismiss }) {
  if (!toast) return null
  const icons = {
    error:   <AlertCircle size={16} />,
    success: <CheckCircle2 size={16} />,
    info:    <Info size={16} />,
  }
  return (
    <div
      key={toast.id}
      className={`toast toast-${toast.type}`}
      role="alert"
      onClick={onDismiss}
      style={{ cursor: 'pointer' }}
    >
      {icons[toast.type]}
      <span>{toast.message}</span>
    </div>
  )
}

// ── Styled Select helper ──────────────────────────────────────────────────────
function StyledSelect({ id, value, onChange, children }) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'bg-surface-700 border border-white/10 text-slate-200',
          'text-sm rounded-lg px-3 py-2 cursor-pointer',
          'hover:border-brand-600/60 focus:border-brand-500 focus:outline-none',
          'transition-colors duration-150',
        ].join(' ')}
      >
        {children}
      </select>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [language, setLanguage]           = useState('python')
  const [profile, setProfile]             = useState('standard')
  const [code, setCode]                   = useState(DEMO_CODE['python'])
  const [requirements, setRequirements]   = useState('')
  const [generatedTests, setGeneratedTests] = useState('')
  const [isLoading, setIsLoading]         = useState(false)
  const [edgeCases, setEdgeCases]         = useState([])
  const [ollamaAvailable, setOllamaAvailable] = useState(false)

  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  // Switch demo code when language changes
  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang)
    setCode(DEMO_CODE[lang])
    setGeneratedTests('')
    setEdgeCases([])
  }, [])

  // ── Generate handler ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!code.trim()) {
      showToast('Please paste some source code before generating.', 'error')
      return
    }
    setIsLoading(true)
    setGeneratedTests('')
    setEdgeCases([])

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language, requirements, profile }),
      })

      const data = await res.json()

      if (!res.ok) {
        showToast(data.error || `Server error ${res.status}`, 'error')
        return
      }

      setGeneratedTests(data.tests || '')
      setEdgeCases(data.edge_cases || [])
      setOllamaAvailable(data.ollama_available ?? false)

      const fnCount = data.functions_found || 0
      const aiCount = (data.edge_cases || []).length

      if (data.ollama_available ?? false) {
        if (aiCount > 0) {
          showToast(
            `✓ ${fnCount} test function${fnCount !== 1 ? 's' : ''} generated with ${aiCount} AI edge cases.`,
            'success',
          )
        } else {
          showToast(
            `✓ ${fnCount} test function${fnCount !== 1 ? 's' : ''} generated successfully.`,
            'success',
          )
        }
      } else {
        showToast(
          `✓ ${fnCount} test function${fnCount !== 1 ? 's' : ''} generated (Ollama offline — AST only).`,
          'info',
        )
      }
    } catch (err) {
      showToast('Network error. Is the Flask server running?', 'error')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [code, language, requirements, profile, showToast])

  // ── Copy handler ─────────────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    if (!generatedTests) {
      showToast('Nothing to copy yet.', 'info')
      return
    }
    try {
      await navigator.clipboard.writeText(generatedTests)
      showToast('Copied to clipboard!', 'success')
    } catch {
      showToast('Clipboard access denied.', 'error')
    }
  }, [generatedTests, showToast])

  // ── Download handler ─────────────────────────────────────────────────────────
  const handleDownload = useCallback(() => {
    if (!generatedTests) {
      showToast('Nothing to download yet.', 'info')
      return
    }
    const ext  = language === 'javascript' ? 'js' : 'py'
    const name = `generated_tests.${ext}`

    const blob = new Blob([generatedTests], { type: 'text/plain;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    showToast(`Downloaded ${name}`, 'success')
  }, [generatedTests, language, showToast])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-mesh" style={{ background: '#0d0f1a' }}>

      {/* ── Ambient background orbs ── */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none overflow-hidden"
        style={{ zIndex: 0 }}
      >
        <div
          className="absolute rounded-full blur-3xl opacity-20"
          style={{
            width: 600, height: 600,
            top: -200, left: -100,
            background: 'radial-gradient(circle, #4f46e5, transparent 70%)',
          }}
        />
        <div
          className="absolute rounded-full blur-3xl opacity-10"
          style={{
            width: 500, height: 500,
            bottom: -100, right: -100,
            background: 'radial-gradient(circle, #c084fc, transparent 70%)',
          }}
        />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-white/5 flex-shrink-0"
        style={{ background: 'rgba(13,15,26,0.85)', backdropFilter: 'blur(12px)' }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center flex-shrink-0 glow-brand">
            <Zap size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-none gradient-text">
              AI Test Case Generator
            </h1>
            <p className="text-xs text-slate-600 mt-0.5">Privacy-First · Local AI · AST-Powered</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          {/* Language */}
          <div className="flex items-center gap-2">
            <label htmlFor="lang-select" className="text-xs text-slate-500 font-medium hidden sm:block">
              Language
            </label>
            <StyledSelect
              id="lang-select"
              value={language}
              onChange={handleLanguageChange}
            >
              <option value="python">🐍 Python</option>
              <option value="javascript">⚡ JavaScript</option>
            </StyledSelect>
          </div>

          {/* Profile */}
          <div className="flex items-center gap-2">
            <label htmlFor="profile-select" className="text-xs text-slate-500 font-medium hidden sm:block">
              Profile
            </label>
            <StyledSelect
              id="profile-select"
              value={profile}
              onChange={setProfile}
            >
              <option value="standard">🔵 Standard</option>
              <option value="security">🔴 Security</option>
            </StyledSelect>
          </div>

          {/* Security badge */}
          {profile === 'security' && (
            <span className="badge badge-orange hidden md:inline-flex">
              <Shield size={10} />
              Security Fuzzing
            </span>
          )}
        </div>
      </header>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 grid grid-cols-2 gap-3 p-3 min-h-0">

        {/* ── Left column ── */}
        <div className="flex flex-col gap-3 min-h-0">

          {/* Code editor panel */}
          <div className="flex-1 glass-card flex flex-col min-h-0" style={{ minHeight: 0 }}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Code2 size={14} className="text-brand-400" />
                <span className="panel-label">Source Code</span>
              </div>
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
                <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
              </div>
            </div>
            <div className="flex-1 min-h-0">
              <CodeEditor value={code} onChange={setCode} language={language} />
            </div>
          </div>

          {/* Requirements panel */}
          <div
            className="glass-card flex flex-col flex-shrink-0 overflow-hidden"
            style={{ height: '220px' }}
          >
            <RequirementsPanel value={requirements} onChange={setRequirements} />
          </div>
        </div>

        {/* ── Right column — Results ── */}
        <div className="glass-card flex flex-col min-h-0">
          <ResultPanel
            value={generatedTests}
            language={language}
            edgeCases={edgeCases}
            ollamaAvailable={ollamaAvailable}
            isLoading={isLoading}
          />
        </div>
      </main>

      {/* ── Action bar (footer) ─────────────────────────────────────────────── */}
      <footer
        className="relative z-10 flex items-center justify-between px-6 py-3 border-t border-white/5 flex-shrink-0 gap-3"
        style={{ background: 'rgba(13,15,26,0.85)', backdropFilter: 'blur(12px)' }}
      >
        {/* Left: info */}
        <p className="text-xs text-slate-600 hidden sm:block">
          Your code is processed <strong className="text-slate-500">locally</strong> — nothing leaves your machine.
        </p>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            id="btn-copy"
            className="btn btn-secondary"
            onClick={handleCopy}
            disabled={!generatedTests || isLoading}
            title="Copy generated tests to clipboard"
          >
            <Copy size={14} />
            <span className="hidden sm:inline">Copy</span>
          </button>

          <button
            id="btn-download"
            className="btn btn-secondary"
            onClick={handleDownload}
            disabled={!generatedTests || isLoading}
            title="Download test file"
          >
            <Download size={14} />
            <span className="hidden sm:inline">Download .{language === 'javascript' ? 'js' : 'py'}</span>
          </button>

          <button
            id="btn-generate"
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={isLoading}
            title="Generate test cases"
          >
            {isLoading ? (
              <>
                <div className="spinner" />
                Generating…
              </>
            ) : (
              <>
                <Zap size={14} strokeWidth={2.5} />
                Generate Tests
              </>
            )}
          </button>
        </div>
      </footer>

      {/* ── Toast ── */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
