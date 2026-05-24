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

def get_active_model() -> str:
    """
    Returns the configured OLLAMA_MODEL if it is pulled,
    otherwise falls back to the first available pulled model.
    If Ollama is unreachable or no models are pulled, returns OLLAMA_MODEL.
    """
    try:
        url = OLLAMA_URL.replace("/api/generate", "/api/tags")
        resp = requests.get(url, timeout=3)
        if resp.status_code == 200:
            models_data = resp.json().get("models", [])
            pulled_names = [m.get("name") for m in models_data if m.get("name")]
            # Check for exact match or name-only match (e.g. "gemma2" vs "gemma2:latest")
            for name in pulled_names:
                if name == OLLAMA_MODEL or name.split(":")[0] == OLLAMA_MODEL:
                    return name
            # If not found, fall back to the first available model
            if pulled_names:
                fallback = pulled_names[0]
                log.info("Configured model %s not found. Falling back to %s.", OLLAMA_MODEL, fallback)
                return fallback
    except Exception as exc:
        log.warning("Could not query pulled models: %s. Using default %s.", exc, OLLAMA_MODEL)
    return OLLAMA_MODEL


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


def parse_requirements(requirements: str, language: str, profile: str) -> list[str]:
    """
    Ask the local Ollama model for AI-generated edge cases.
    Returns an empty list (graceful degradation) if Ollama is unavailable or fails.
    """
    if not requirements.strip():
        log.info("No requirements text provided — skipping Ollama call.")
        return []

    prompt = _build_ollama_prompt(requirements, language, profile)
    payload = {
        "model": get_active_model(),
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

    log.info(
        "Generate request — language=%s profile=%s code_len=%d req_len=%d",
        language, profile, len(code), len(requirements),
    )

    # Step 1: AI edge cases (non-blocking failure)
    ai_edge_cases = parse_requirements(requirements, language, profile)
    ollama_available = len(ai_edge_cases) > 0 or not requirements.strip()

    # Step 2: AST-based test synthesis
    try:
        generated_tests = parse_and_generate(
            code=code,
            language=language,
            ai_edge_cases=ai_edge_cases,
            profile=profile,
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
            "functions_found": generated_tests.count("def test_")
            + generated_tests.count("test("),
        }
    )


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
