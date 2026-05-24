"""
ast_parser.py — Tree-sitter AST Engine
Traverses source code ASTs to extract function signatures and synthesize test cases.
Supports Python and JavaScript without hardcoded string manipulation.
"""

from __future__ import annotations
import textwrap
from typing import Any

import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
from tree_sitter import Language, Parser, Node


# ---------------------------------------------------------------------------
# Language registry
# ---------------------------------------------------------------------------

_LANGUAGE_MAP: dict[str, Any] = {
    "python": tspython.language(),
    "javascript": tsjavascript.language(),
}


def _get_parser(language: str) -> Parser:
    lang_obj = _LANGUAGE_MAP.get(language.lower())
    if lang_obj is None:
        raise ValueError(f"Unsupported language: {language!r}. Choose 'python' or 'javascript'.")
    return Parser(Language(lang_obj))


# ---------------------------------------------------------------------------
# Fuzzing argument helpers
# ---------------------------------------------------------------------------

_STANDARD_ARGS_PYTHON = ["None", "0", '""', "[]", "{}"]
_STANDARD_ARGS_JS = ["null", "0", '""', "[]", "{}"]
_SECURITY_ARGS = [
    "\"' OR 1=1 --\"",
    '"<script>alert(1)</script>"',
    '"A" * 10000',
    '"\\x00\\x00\\x00"',
    '"-1"',
]


def _fuzz_args(count: int, profile: str, language: str) -> list[str]:
    """Return *count* fuzzed argument strings appropriate for the profile."""
    if profile == "security":
        pool = _SECURITY_ARGS
    else:
        pool = _STANDARD_ARGS_PYTHON if language == "python" else _STANDARD_ARGS_JS

    if count == 0:
        return []
    # cycle through pool values to fill *count* slots
    return [pool[i % len(pool)] for i in range(count)]


# ---------------------------------------------------------------------------
# AST node traversal helpers
# ---------------------------------------------------------------------------

def _node_text(node: Node, source: bytes) -> str:
    return source[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _collect_python_functions(root: Node, source: bytes) -> list[dict]:
    """DFS traversal to collect all function_definition nodes in Python AST."""
    results: list[dict] = []
    stack: list[Node] = [root]

    while stack:
        node = stack.pop()
        if node.type == "function_definition":
            name_node = node.child_by_field_name("name")
            params_node = node.child_by_field_name("parameters")

            func_name = _node_text(name_node, source) if name_node else "unknown"
            param_names = _extract_python_params(params_node, source)

            results.append({"name": func_name, "params": param_names})

        # push children in reverse so we process left-to-right
        for child in reversed(node.children):
            stack.append(child)

    return results


def _extract_python_params(params_node: Node | None, source: bytes) -> list[str]:
    """Extract individual parameter names from a Python parameters node."""
    if params_node is None:
        return []

    param_names: list[str] = []
    for child in params_node.children:
        if child.type in ("identifier",):
            name = _node_text(child, source)
            if name != "self" and name != "cls":
                param_names.append(name)
        elif child.type in ("typed_parameter", "default_parameter"):
            # first named child is the param identifier
            for subchild in child.children:
                if subchild.type == "identifier":
                    name = _node_text(subchild, source)
                    if name not in ("self", "cls"):
                        param_names.append(name)
                    break
        elif child.type in ("list_splat_pattern", "dictionary_splat_pattern"):
            # *args / **kwargs — still has an identifier child
            for subchild in child.children:
                if subchild.type == "identifier":
                    param_names.append(_node_text(subchild, source))
                    break

    return param_names


def _collect_js_functions(root: Node, source: bytes) -> list[dict]:
    """DFS traversal for JavaScript function-like nodes."""
    target_types = {
        "function_declaration",
        "function",
        "function_expression",
        "arrow_function",
        "method_definition",
    }
    results: list[dict] = []
    stack: list[Node] = [root]

    while stack:
        node = stack.pop()
        if node.type in target_types and node.is_named:
            name_node = node.child_by_field_name("name")
            params_node = node.child_by_field_name("parameters") or node.child_by_field_name("parameter")

            func_name = _node_text(name_node, source) if name_node else "<anonymous>"
            param_names = _extract_js_params(params_node, source)

            results.append({"name": func_name, "params": param_names})

        for child in reversed(node.children):
            stack.append(child)

    return results


def _extract_js_params(params_node: Node | None, source: bytes) -> list[str]:
    """Extract parameter names from a JavaScript formal_parameters node."""
    if params_node is None:
        return []

    param_names: list[str] = []
    for child in params_node.children:
        if child.type == "identifier":
            param_names.append(_node_text(child, source))
        elif child.type in (
            "assignment_pattern",           # param = default
            "rest_pattern",                 # ...rest
            "object_pattern",
            "array_pattern",
        ):
            # The first identifier inside destructured params
            for subchild in child.children:
                if subchild.type == "identifier":
                    param_names.append(_node_text(subchild, source))
                    break

    return param_names


# ---------------------------------------------------------------------------
# Test synthesis
# ---------------------------------------------------------------------------

def _build_python_tests(functions: list[dict], ai_edge_cases: list[str], profile: str) -> str:
    """Generate a pytest module string from extracted functions + AI edge cases."""
    lines: list[str] = [
        '"""',
        "Auto-generated test suite — Privacy-First AI Test Case Generator",
        '"""',
        "import pytest",
        "",
        "",
    ]

    for fn in functions:
        func_name = fn["name"]
        params = fn["params"]
        param_count = len(params)

        # --- Standard fuzz test ---
        fuzz_vals = _fuzz_args(param_count, profile, "python")
        call_args = ", ".join(fuzz_vals) if fuzz_vals else ""

        lines += [
            f"class Test_{func_name.capitalize()}:",
            "",
            f"    def test_{func_name}_with_fuzz_inputs(self):",
            f'        """Fuzz test with {profile} profile arguments."""',
            f"        # TODO: import or define `{func_name}` from your module",
            f"        with pytest.raises(Exception):",
            f"            {func_name}({call_args})",
            "",
        ]

        # --- One test per AI edge case ---
        for idx, edge_case in enumerate(ai_edge_cases):
            sanitised = edge_case.replace('"', '\\"')
            lines += [
                f"    def test_{func_name}_edge_case_{idx + 1}(self):",
                f'        """AI-generated edge case: {sanitised[:80]}"""',
                f"        # Edge case: {sanitised}",
                f"        # Verify the function handles this scenario correctly.",
                f"        result = {func_name}({call_args})",
                f"        assert result is not None  # refine assertion as needed",
                "",
            ]

        lines.append("")

    if not functions and ai_edge_cases:
        lines += [
            "class Test_StandaloneRequirements:",
            "",
        ]
        for idx, edge_case in enumerate(ai_edge_cases):
            sanitised = edge_case.replace('"', '\\"')
            lines += [
                f"    def test_requirement_case_{idx + 1}(self):",
                f'        """AI-generated edge case: {sanitised[:80]}"""',
                f"        # Requirement: {sanitised}",
                f"        # TODO: Implement test logic for this condition",
                f"        pass",
                "",
            ]

    return "\n".join(lines)


def _build_js_tests(functions: list[dict], ai_edge_cases: list[str], profile: str) -> str:
    """Generate a Jest test file string from extracted functions + AI edge cases."""
    lines: list[str] = [
        "/**",
        " * Auto-generated test suite — Privacy-First AI Test Case Generator",
        " */",
        "",
        "// TODO: update the import path to your module",
        "// const { functionName } = require('./your-module');",
        "",
        "describe('AI Test Case Generator — Generated Suite', () => {",
        "",
    ]

    for fn in functions:
        func_name = fn["name"]
        params = fn["params"]
        param_count = len(params)

        fuzz_vals = _fuzz_args(param_count, profile, "javascript")
        call_args = ", ".join(fuzz_vals) if fuzz_vals else ""

        lines += [
            f"  describe('{func_name}', () => {{",
            "",
            f"    test('throws or handles fuzz inputs ({profile} profile)', () => {{",
            f"      // Fuzz test — expects no silent failures",
            f"      expect(() => {func_name}({call_args})).not.toThrow();",
            f"    }});",
            "",
        ]

        for idx, edge_case in enumerate(ai_edge_cases):
            sanitised = edge_case.replace("'", "\\'").replace("\\", "\\\\")
            lines += [
                f"    test('edge case {idx + 1}: {sanitised[:60]}', () => {{",
                f"      // AI-generated edge case",
                f"      const result = {func_name}({call_args});",
                f"      expect(result).toBeDefined();",
                f"    }});",
                "",
            ]

        lines += [
            f"  }});",
            "",
        ]

    if not functions and ai_edge_cases:
        lines += [
            "  describe('Standalone Requirements', () => {",
            "",
        ]
        for idx, edge_case in enumerate(ai_edge_cases):
            sanitised = edge_case.replace("'", "\\'").replace("\\", "\\\\")
            lines += [
                f"    test('edge case {idx + 1}: {sanitised[:60]}', () => {{",
                f"      // AI-generated edge case: {sanitised}",
                f"      // TODO: Implement test logic for this condition",
                f"    }});",
                "",
            ]
        lines += [
            "  });",
            "",
        ]

    lines += ["});", ""]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_and_generate(
    code: str,
    language: str,
    ai_edge_cases: list[str],
    profile: str = "standard",
    fully_correct: bool = False,
) -> str:
    """
    Main entry point.
    Parse *code*, extract function signatures, and synthesise a test file.

    Args:
        code:          Source code to analyse.
        language:      "python" or "javascript".
        ai_edge_cases: Edge-case descriptions from the Ollama LLM.
        profile:       "standard" or "security".
        fully_correct: True if the code is verified as completely secure/correct.

    Returns:
        A string containing the full test-file source.
    """
    language = language.lower()
    
    parser = _get_parser(language)
    source_bytes = code.encode("utf-8")
    tree = parser.parse(source_bytes)
    root = tree.root_node

    if language == "python":
        functions = _collect_python_functions(root, source_bytes)
        test_code = _build_python_tests(functions, ai_edge_cases, profile)
    else:
        functions = _collect_js_functions(root, source_bytes)
        test_code = _build_js_tests(functions, ai_edge_cases, profile)

    # Prepend verification success header if fully correct
    if fully_correct:
        banner = (
            "# ===========================================================================\n"
            "# Verification Successful!\n"
            "# The function is analyzed as fully correct with 100% security coverage.\n"
            "# ===========================================================================\n\n"
            if language == "python"
            else
            "// ===========================================================================\n"
            "// Verification Successful!\n"
            "// The function is analyzed as fully correct with 100% security coverage.\n"
            "// ===========================================================================\n\n"
        )
        test_code = banner + test_code

    if not functions:
        header = (
            "# No function definitions were detected in the submitted code.\n"
            "# Please ensure the code contains top-level or class functions.\n\n"
            if language == "python"
            else "// No function definitions were detected in the submitted code.\n\n"
        )
        return header + test_code

    return test_code
