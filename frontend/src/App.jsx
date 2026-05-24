import { useState, useCallback, useRef, useEffect } from 'react'
import {
  Zap,
  Copy,
  Download,
  Shield,
  Code2,
  CheckCircle2,
  AlertCircle,
  Info,
  Sun,
  Moon,
  LayoutGrid,
  ShieldAlert,
} from 'lucide-react'
import CodeEditor from './components/CodeEditor.jsx'
import RequirementsPanel from './components/RequirementsPanel.jsx'
import ResultPanel from './components/ResultPanel.jsx'

// ── Interactive Presets Menu definitions ─────────────────────────────────────
const DEMO_PRESETS = [
  {
    name: "🔢 Discount (Python - Secure)",
    code: `def calculate_discount(price, discount_pct):
    """Apply a percentage discount securely."""
    if price < 0:
        raise ValueError("Price cannot be negative.")
    if not (0 <= discount_pct <= 100):
        raise ValueError("Discount must be between 0 and 100.")
    return round(price * (1 - discount_pct / 100), 2)
`,
    requirements: "Accept positive float prices. Discount rate must be between 0% and 100%.",
    language: "python",
    profile: "standard",
    description: "A fully correct, secure calculation function. Verification will successfully bypass extra test generation."
  },
  {
    name: "💳 Process Payment (JS - Vulnerable)",
    code: `function processPayment(cardToken, amount) {
  // Vulnerable: no sanitization of cardToken, SQL-like query leakage, no bounds on amount
  db.execute("SELECT * FROM cards WHERE token = '" + cardToken + "'");
  if (amount == 0) {
    return { success: false };
  }
  return { success: true, txnId: "TXN_" + Math.random() };
}
`,
    requirements: "Analyze cardToken for SQL injection and check boundary bounds for zero/negative amounts.",
    language: "javascript",
    profile: "security",
    description: "A highly vulnerable payment module. Triggers full vulnerability analysis, threat paths, and fuzzed test cases."
  },
  {
    name: "📦 Data Pipeline (Python - Complex/Oversized)",
    code: `import csv
import json
import logging
from datetime import datetime

class DataPipelineException(Exception):
    pass

class EnterpriseDataPipeline:
    def __init__(self, config_json: str):
        self.config = json.loads(config_json)
        self.logger = logging.getLogger("Pipeline")

    def validate_schema(self, row: dict) -> bool:
        required = self.config.get("required_fields", [])
        for field in required:
            if field not in row or row[field] is None:
                return False
        return True

    def process_record(self, record_raw: str) -> dict:
        row = json.loads(record_raw)
        if not self.validate_schema(row):
            raise DataPipelineException("Schema validation failed.")
        
        # Transform data
        row["processed_at"] = datetime.utcnow().isoformat()
        row["status"] = "TRANSFORMED"
        
        # Sanitize Unicode tags
        tags = row.get("tags", [])
        sanitized = []
        for tag in tags:
            clean = str(tag).encode('ascii', 'ignore').decode('ascii').strip()
            if clean:
                sanitized.append(clean)
        row["tags"] = sanitized
        
        # Simulate business calculations
        value = float(row.get("amount", 0))
        tax_rate = float(self.config.get("tax_rate", 0.05))
        row["tax"] = round(value * tax_rate, 2)
        row["total"] = round(value + row["tax"], 2)
        
        return row
`,
    requirements: "Validate nested CSV schemas, sanitise Unicode tags, and test calculations for tax bounds.",
    language: "python",
    profile: "standard",
    description: "Oversized enterprise data pipeline (70+ lines) for testing AST traversal speed and dynamic model scaling."
  }
]

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

  // Premium Custom States
  const [theme, setTheme]                 = useState('dark')
  const [availableModels, setAvailableModels] = useState([])
  const [selectedModel, setSelectedModel] = useState('')
  const [vulnerabilities, setVulnerabilities] = useState([])
  const [consequences, setConsequences]   = useState([])
  const [fullyCorrect, setFullyCorrect]   = useState(false)

  // GitHub & File Upload states
  const [githubUrl, setGithubUrl] = useState('')
  const [isFetchingGithub, setIsFetchingGithub] = useState(false)

  const { toast, show: showToast, dismiss: dismissToast } = useToast()

  // File Upload handler
  const handleFileUpload = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target.result
      setCode(text)
      const ext = file.name.split('.').pop().toLowerCase()
      if (ext === 'py') {
        setLanguage('python')
      } else if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
        setLanguage('javascript')
      }
      showToast(`Uploaded and loaded: ${file.name}`, 'success')
    }
    reader.readAsText(file)
  }, [showToast])

  // GitHub fetch handler
  const handleGithubFetch = useCallback(async () => {
    if (!githubUrl.strip ? githubUrl.trim() : githubUrl.trim()) {
      showToast('Please enter a GitHub URL first.', 'error')
      return
    }
    setIsFetchingGithub(true)
    try {
      const res = await fetch(`/api/fetch_github?url=${encodeURIComponent(githubUrl)}`)
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Failed to fetch GitHub file', 'error')
        return
      }
      setCode(data.content || '')
      // Detect language from URL extension
      const ext = githubUrl.split('.').pop().toLowerCase()
      if (ext === 'py') {
        setLanguage('python')
      } else if (['js', 'jsx', 'ts', 'tsx'].includes(ext)) {
        setLanguage('javascript')
      }
      showToast('Successfully fetched file from GitHub!', 'success')
    } catch (err) {
      showToast('Network error fetching GitHub file.', 'error')
    } finally {
      setIsFetchingGithub(false)
    }
  }, [githubUrl, showToast])

  // Switch demo code when language changes
  const handleLanguageChange = useCallback((lang) => {
    setLanguage(lang)
    setCode(DEMO_CODE[lang])
    setGeneratedTests('')
    setEdgeCases([])
    setVulnerabilities([])
    setConsequences([])
    setFullyCorrect(false)
  }, [])

  // Fetch Ollama models list on mount
  useEffect(() => {
    const loadModels = async () => {
      try {
        const res = await fetch('/api/models')
        if (res.ok) {
          const data = await res.json()
          if (data.models && data.models.length > 0) {
            setAvailableModels(data.models)
            setSelectedModel(data.models[0])
          }
        }
      } catch (err) {
        console.error("Failed to query models:", err)
      }
    }
    loadModels()
  }, [])

  // Dual Theme toggler
  const toggleTheme = useCallback(() => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    document.documentElement.classList.toggle('light', nextTheme === 'light')
  }, [theme])

  // Select demo preset
  const handlePresetSelect = useCallback((presetName) => {
    const preset = DEMO_PRESETS.find(p => p.name === presetName)
    if (preset) {
      setCode(preset.code)
      setRequirements(preset.requirements)
      setLanguage(preset.language)
      setProfile(preset.profile)
      setGeneratedTests('')
      setEdgeCases([])
      setVulnerabilities([])
      setConsequences([])
      setFullyCorrect(false)
      showToast(`Loaded Preset: ${preset.name}`, 'info')
    }
  }, [showToast])

  // ── Generate handler ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!code.trim()) {
      showToast('Please paste some source code before generating.', 'error')
      return
    }
    setIsLoading(true)
    setGeneratedTests('')
    setEdgeCases([])
    setVulnerabilities([])
    setConsequences([])
    setFullyCorrect(false)

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          language,
          requirements,
          profile,
          model: selectedModel
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        showToast(data.error || `Server error ${res.status}`, 'error')
        return
      }

      setGeneratedTests(data.tests || '')
      setEdgeCases(data.edge_cases || [])
      setOllamaAvailable(data.ollama_available ?? false)
      setFullyCorrect(data.fully_correct ?? false)
      setVulnerabilities(data.vulnerabilities || [])
      setConsequences(data.consequences || [])

      const fnCount = data.functions_found || 0
      const aiCount = (data.edge_cases || []).length

      if (data.fully_correct) {
        showToast('✓ Success: Code is fully correct! Vulnerability and test generation bypassed.', 'success')
      } else if (data.ollama_available) {
        showToast(
          `✓ ${fnCount} test function${fnCount !== 1 ? 's' : ''} generated with ${aiCount} AI edge cases.`,
          'success',
        )
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
  }, [code, language, requirements, profile, selectedModel, showToast])

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
    <div className="flex flex-col h-screen bg-mesh" style={{ background: theme === 'dark' ? '#0d0f1a' : '#f8fafc', color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}>

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
        style={{ background: theme === 'dark' ? 'rgba(13,15,26,0.85)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}
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
            <p className="text-xs text-slate-500 mt-0.5">Privacy-First · Local AI · AST-Powered</p>
          </div>
        </div>

        {/* Dynamic Controls / Menus */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Preset Demos Selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="preset-select" className="text-xs text-slate-500 font-semibold hidden md:block">
              Presets
            </label>
            <StyledSelect
              id="preset-select"
              value=""
              onChange={handlePresetSelect}
            >
              <option value="" disabled>🚀 Select Demo Preset...</option>
              {DEMO_PRESETS.map((p, idx) => (
                <option key={idx} value={p.name}>{p.name}</option>
              ))}
            </StyledSelect>
          </div>

          {/* Model Selector */}
          {availableModels.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="model-select" className="text-xs text-slate-500 font-semibold hidden md:block">
                Model
              </label>
              <StyledSelect
                id="model-select"
                value={selectedModel}
                onChange={setSelectedModel}
              >
                {availableModels.map((m, idx) => (
                  <option key={idx} value={m}>🤖 {m}</option>
                ))}
              </StyledSelect>
            </div>
          )}

          {/* Language Selector */}
          <div className="flex items-center gap-2">
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
            <StyledSelect
              id="profile-select"
              value={profile}
              onChange={setProfile}
            >
              <option value="standard">🔵 Standard</option>
              <option value="security">🔴 Security</option>
            </StyledSelect>
          </div>

          {/* GitHub URL Scanner */}
          <div className="flex items-center gap-1 bg-surface-700/60 border border-white/10 rounded-lg px-2 py-1.5 focus-within:border-brand-500/50 transition-colors">
            <input
              type="text"
              placeholder="Paste GitHub file URL..."
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              className="bg-transparent text-xs outline-none text-slate-200 w-28 md:w-36 font-mono"
            />
            <button
              onClick={handleGithubFetch}
              disabled={isFetchingGithub}
              className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-500 text-white font-bold transition-all disabled:opacity-50"
              title="Scan public GitHub code file"
            >
              {isFetchingGithub ? "..." : "Scan URL"}
            </button>
          </div>

          {/* Local File Upload button */}
          <div className="flex items-center">
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".py,.js,.jsx,.ts,.tsx,.json"
              onChange={handleFileUpload}
            />
            <label
              htmlFor="file-upload"
              className="btn btn-secondary cursor-pointer py-1.5 px-2.5 text-xs flex items-center gap-1.5"
              title="Upload and load a local source file"
            >
              <span>📂</span>
              <span className="hidden sm:inline">Upload File</span>
            </label>
          </div>

          {/* Security badge */}
          {profile === 'security' && (
            <span className="badge badge-orange hidden lg:inline-flex">
              <Shield size={10} />
              Security Fuzzing
            </span>
          )}

          {/* Dual Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-surface-700/60 border border-white/10 hover:border-brand-500/50 text-slate-300 transition-colors"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
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
            vulnerabilities={vulnerabilities}
            consequences={consequences}
            fullyCorrect={fullyCorrect}
          />
        </div>
      </main>

      {/* ── Action bar (footer) ─────────────────────────────────────────────── */}
      <footer
        className="relative z-10 flex items-center justify-between px-6 py-3 border-t border-white/5 flex-shrink-0 gap-3"
        style={{ background: theme === 'dark' ? 'rgba(13,15,26,0.85)' : 'rgba(255,255,255,0.9)', backdropFilter: 'blur(12px)' }}
      >
        {/* Left: info */}
        <p className="text-xs text-slate-500 hidden sm:block">
          Your code is processed <strong className="text-slate-400">locally</strong> — nothing leaves your machine.
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
                Analyzing & Generating…
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
