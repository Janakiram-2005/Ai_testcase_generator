"""
app.py — Privacy-First AI Test Case Generator
Flask backend: serves compiled React, handles /api/generate.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path

import requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

from ast_parser import parse_and_generate

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

FRONTEND_DIST = Path(__file__).parent / "frontend" / "dist"

app = Flask(__name__, static_folder=str(FRONTEND_DIST), static_url_path="")
CORS(app, resources={r"/api/*": {"origins": "*"}})

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/generate")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma2")
OLLAMA_TIMEOUT = int(os.environ.get("OLLAMA_TIMEOUT", "60"))


# ---------------------------------------------------------------------------
# Ollama integration
# ---------------------------------------------------------------------------

def get_active_model(preferred_model: str = None) -> str:
    """
    Returns the configured OLLAMA_MODEL (or preferred_model if specified) if it is pulled,
    otherwise falls back to the first available pulled model.
    If Ollama is unreachable or no models are pulled, returns the fallback base.
    """
    base_model = preferred_model or OLLAMA_MODEL
    try:
        url = OLLAMA_URL.replace("/api/generate", "/api/tags")
        resp = requests.get(url, timeout=3)
        if resp.status_code == 200:
            models_data = resp.json().get("models", [])
            pulled_names = [m.get("name") for m in models_data if m.get("name")]
            # Check for exact match or name-only match (e.g. "gemma2" vs "gemma2:latest")
            for name in pulled_names:
                if name == base_model or name.split(":")[0] == base_model:
                    return name
            # If not found, fall back to the first available model
            if pulled_names:
                fallback = pulled_names[0]
                log.info("Configured model %s not found. Falling back to %s.", base_model, fallback)
                return fallback
    except Exception as exc:
        log.warning("Could not query pulled models: %s. Using default %s.", exc, base_model)
    return base_model


def _build_ollama_prompt(requirements: str, language: str, profile: str) -> str:
    return (
        f"You are a senior QA engineer. A developer has provided the following requirements:\n\n"
        f'"""\n{requirements}\n"""\n\n'
        f"Language under test: {language}. Security profile: {profile}.\n\n"
        f"Return ONLY a valid JSON array of strings. Each string is one distinct edge-case "
        f"scenario title (max 15 words) that a test suite should cover. "
        f"Do NOT include any prose, markdown fences, or explanation — only the raw JSON array.\n\n"
        f"Example output:\n"
        f'["Empty input returns default value", "Negative numbers raise ValueError", '
        f'"Unicode strings are handled without crash"]\n\n'
        f"Now produce the JSON array for the requirements above:"
    )


def parse_requirements(requirements: str, language: str, profile: str, preferred_model: str = None) -> list[str]:
    """
    Ask the local Ollama model for AI-generated edge cases.
    Returns an empty list (graceful degradation) if Ollama is unavailable or fails.
    """
    if not requirements.strip():
        log.info("No requirements text provided — skipping Ollama call.")
        return []

    prompt = _build_ollama_prompt(requirements, language, profile)
    payload = {
        "model": get_active_model(preferred_model),
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.4},
    }

    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
        resp.raise_for_status()
        raw_response: str = resp.json().get("response", "")
        log.info("Ollama raw response (first 200 chars): %s", raw_response[:200])

        # Strip markdown code fences if the model added them
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = "\n".join(cleaned.splitlines()[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[: cleaned.rfind("```")]
        cleaned = cleaned.strip()

        # Locate the JSON array
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start == -1 or end == -1:
            log.warning("No JSON array found in Ollama response.")
            return []

        edge_cases: list = json.loads(cleaned[start : end + 1])
        if not isinstance(edge_cases, list):
            return []
        # Ensure all items are strings
        return [str(item) for item in edge_cases if item]

    except requests.exceptions.ConnectionError:
        log.warning(
            "Ollama is not reachable at %s. Falling back to AST-only tests.", OLLAMA_URL
        )
        return []
    except requests.exceptions.Timeout:
        log.warning("Ollama request timed out after %ds. Falling back.", OLLAMA_TIMEOUT)
        return []
    except requests.exceptions.HTTPError as exc:
        log.warning("Ollama HTTP error: %s. Falling back.", exc)
        return []
    except json.JSONDecodeError as exc:
        log.warning("Could not parse Ollama response as JSON: %s", exc)
        return []
    except Exception as exc:  # noqa: BLE001
        log.exception("Unexpected error calling Ollama: %s", exc)
        return []


def analyze_vulnerabilities(code: str, requirements: str, language: str, preferred_model: str = None) -> dict:
    """
    Analyze the code using Ollama to identify vulnerabilities, correctness, and consequences.
    """
    fallback = {"fully_correct": False, "vulnerabilities": [], "consequences": []}
    if not code.strip():
        return fallback

    model = get_active_model(preferred_model)
    prompt = (
        f"Analyze the following code for vulnerabilities under the context of these requirements:\n\n"
        f"Requirements:\n{requirements}\n\n"
        f"Code under test:\n{code}\n\n"
        f"Return ONLY a valid JSON object with the following fields:\n"
        f"1. 'fully_correct': boolean (true if the code has absolutely zero security bugs, edge-case flaws, or vulnerability errors; false otherwise).\n"
        f"2. 'vulnerabilities': array of strings (the list of specific vulnerabilities or bugs found).\n"
        f"3. 'consequences': array of strings (2-3 concise lines describing the logical consequences/error propagation flowchart, e.g. ['Input Bypass ➔ Privilege Escalation ➔ Database Breach', 'No Null Check ➔ Segment Fault ➔ Service Crash']).\n"
        f"Do NOT include any code fences, markdown, or text outside the JSON object."
    )

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.2},
    }

    try:
        resp = requests.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()

        # clean code fences
        if raw.startswith("```"):
            raw = "\n".join(raw.splitlines()[1:])
        if raw.endswith("```"):
            raw = raw[: raw.rfind("```")]
        raw = raw.strip()

        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1:
            return fallback

        analysis = json.loads(raw[start : end + 1])
        return {
            "fully_correct": bool(analysis.get("fully_correct", False)),
            "vulnerabilities": list(analysis.get("vulnerabilities", [])),
            "consequences": list(analysis.get("consequences", [])),
        }
    except Exception as exc:
        log.warning("Vulnerability analysis failed: %s", exc)
        return fallback


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------

@app.route("/api/generate", methods=["POST"])
def generate():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON."}), 400

    code: str = data.get("code", "").strip()
    language: str = data.get("language", "python").strip().lower()
    requirements: str = data.get("requirements", "").strip()
    profile: str = data.get("profile", "standard").strip().lower()

    # Smart detection: If requirements is empty, but code looks like plain text requirements
    if not requirements and code:
        lines = [line.strip() for line in code.splitlines() if line.strip()]
        if lines:
            bullets = ("-", "*", "•", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.")
            bullet_count = sum(1 for line in lines if line.startswith(bullets))
            code_markers = ("def ", "function", "const ", "let ", "var ", "=", "import ", "from ")
            has_code_markers = any(marker in code for marker in code_markers)
            
            if bullet_count >= len(lines) * 0.5 or not has_code_markers:
                log.info("Plain text requirements detected in code field. Treating as requirements.")
                requirements = code

    # Validation
    if not code:
        return jsonify({"error": "The 'code' field is required and cannot be empty."}), 400
    if language not in ("python", "javascript"):
        return jsonify({"error": "language must be 'python' or 'javascript'."}), 400
    if profile not in ("standard", "security"):
        return jsonify({"error": "profile must be 'standard' or 'security'."}), 400

    selected_model: str = data.get("model", "").strip()

    log.info(
        "Generate request — language=%s profile=%s model=%s code_len=%d req_len=%d",
        language, profile, selected_model, len(code), len(requirements),
    )

    # Step 1: AI edge cases (non-blocking failure)
    ai_edge_cases = parse_requirements(requirements, language, profile, preferred_model=selected_model)
    ollama_available = len(ai_edge_cases) > 0 or not requirements.strip()

    # Step 2: Vulnerability Analysis
    analysis = analyze_vulnerabilities(code, requirements, language, preferred_model=selected_model)

    # Step 3: AST-based test synthesis
    try:
        generated_tests = parse_and_generate(
            code=code,
            language=language,
            ai_edge_cases=ai_edge_cases,
            profile=profile,
            fully_correct=analysis.get("fully_correct", False),
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except Exception as exc:  # noqa: BLE001
        log.exception("AST parsing failed: %s", exc)
        return jsonify({"error": "Internal error during AST parsing. Check server logs."}), 500

    return jsonify(
        {
            "tests": generated_tests,
            "edge_cases": ai_edge_cases,
            "ollama_available": ollama_available,
            "functions_found": generated_tests.count("def test_") + generated_tests.count("test("),
            "fully_correct": analysis.get("fully_correct", False),
            "vulnerabilities": analysis.get("vulnerabilities", []),
            "consequences": analysis.get("consequences", []),
        }
    )


@app.route("/api/models", methods=["GET"])
def get_models():
    """Fetch available models in Ollama."""
    try:
        url = OLLAMA_URL.replace("/api/generate", "/api/tags")
        resp = requests.get(url, timeout=3)
        if resp.status_code == 200:
            models_data = resp.json().get("models", [])
            names = [m.get("name") for m in models_data if m.get("name")]
            return jsonify({"models": names})
    except Exception as exc:
        log.warning("Failed to fetch Ollama models: %s", exc)
    return jsonify({"models": []})


@app.route("/api/fetch_github", methods=["GET"])
def fetch_github():
    """Fetch raw code from standard public GitHub URL."""
    github_url = request.args.get("url", "").strip()
    if not github_url:
        return jsonify({"error": "URL parameter is required."}), 400

    # Translate normal GitHub blob link into the raw content address
    # e.g., github.com/user/repo/blob/branch/file.py -> raw.githubusercontent.com/user/repo/branch/file.py
    if "github.com" in github_url and "/blob/" in github_url:
        raw_url = github_url.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/")
    else:
        raw_url = github_url

    try:
        resp = requests.get(raw_url, timeout=10)
        resp.raise_for_status()
        return jsonify({"content": resp.text, "url": raw_url})
    except Exception as exc:
        log.warning("Failed to fetch from GitHub URL: %s", exc)
        return jsonify({"error": f"Failed to fetch file content: {exc}"}), 422



@app.route("/api/health", methods=["GET"])
def health():
    """Simple health-check endpoint."""
    ollama_ok = False
    try:
        r = requests.get(OLLAMA_URL.replace("/api/generate", "/"), timeout=3)
        ollama_ok = r.status_code < 500
    except Exception:  # noqa: BLE001
        pass

    return jsonify({"status": "ok", "ollama_reachable": ollama_ok})


# ---------------------------------------------------------------------------
# SPA catch-all (serve React for every non-API route)
# ---------------------------------------------------------------------------

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_spa(path: str):
    # API routes must not fall through here
    if path.startswith("api/"):
        return jsonify({"error": "Not found."}), 404

    target = FRONTEND_DIST / path
    if path and target.exists():
        return send_from_directory(str(FRONTEND_DIST), path)

    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return send_from_directory(str(FRONTEND_DIST), "index.html")

    return (
        "<h1>Frontend not built yet.</h1>"
        "<p>Run <code>cd frontend && npm install && npm run build</code> first.</p>",
        200,
    )


# ---------------------------------------------------------------------------
# Global error handlers
# ---------------------------------------------------------------------------

@app.errorhandler(404)
def not_found(_err):
    return jsonify({"error": "Resource not found."}), 404


@app.errorhandler(405)
def method_not_allowed(_err):
    return jsonify({"error": "Method not allowed."}), 405


@app.errorhandler(500)
def internal_error(err):
    log.exception("Unhandled 500: %s", err)
    return jsonify({"error": "An unexpected server error occurred."}), 500


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
