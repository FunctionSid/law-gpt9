import os
import json
import sqlite3
import subprocess
import re
from datetime import datetime
import hashlib
import time
from jsonschema import validate, Draft202012Validator
from jsonschema.exceptions import ValidationError

# ==================================================
# SETTINGS
# ==================================================
OUTPUT_FILE = "ai_project_snapshot.json"
AZURE_APP_NAME = "law-gpt9-test"
RESOURCE_GROUP = "poona_student"
IGNORE_FOLDERS = {
    "node_modules", ".git", "__pycache__", ".vscode", "dist", "build"
}
IGNORE_EXTENSIONS = {
    ".bin", ".exe", ".dll", ".so", ".zip", ".tar", ".gz",
    ".pkl", ".jsonl", ".wal", ".shm"
}
MAX_TEXT_BYTES = 1_000_000  # 1 MB
ENTRY_POINT_NAMES = {
    "server.js", "app.js", "index.js", "main.js"
}
IMPORT_RE = re.compile(
    r"""(?:import\s+.*?\s+from\s+['"](.+?)['"]|require\(\s*['"](.+?)['"]\s*\))"""
)
LOG_FILES = {"error.log", "app.log", "debug.log"}  # Customizable log file names

# ==================================================
# PATH NORMALIZATION (OS-NEUTRAL)
# ==================================================
def normalize_path(path, root):
    rel = os.path.relpath(path, root)
    return rel.replace("\\", "/")

# ==================================================
# AI CONTRACT
# ==================================================
def ai_contract():
    return {
        "purpose": "authoritative project snapshot for AI analysis and bug resolution",
        "rules": [
            "this json is the only source of truth",
            "do not assume anything not present here",
            "do not invent skipped or missing content",
            "ask for missing information before answering",
            "paths, roles, and dependencies are authoritative",
            "all paths are POSIX-style and relative to project root",
            "dependency graph must be followed strictly",
            "environment variables contain keys only, never secrets",
            "do not infer runtime behavior—request execution if needed",
            "for bugs, reference exact paths or lines from content",
            "if data is outdated (check timestamps), request refresh",
            "report uncertainties based on 'certainty' fields",
            "use hashes to verify file integrity if re-checking"
        ]
    }

# ==================================================
# SAFE COMMAND EXECUTION
# ==================================================
def safe_cmd(cmd):
    try:
        return subprocess.check_output(cmd, shell=True).decode().strip()
    except:
        return None

# ==================================================
# PROJECT METADATA
# ==================================================
def project_metadata():
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "node_version": safe_cmd("node -v"),
        "git_remote": safe_cmd("git remote get-url origin"),
        "git_branch": safe_cmd("git rev-parse --abbrev-ref HEAD")
    }

# ==================================================
# FOLDER TREE
# ==================================================
def folder_tree(root):
    tree = []
    for r, d, f in os.walk(root):
        d[:] = [x for x in d if x not in IGNORE_FOLDERS]
        level = r.replace(root, "").count(os.sep)
        indent = " " * level
        tree.append(f"{indent}{os.path.basename(r)}/")
        for file in f:
            if os.path.splitext(file)[1] not in IGNORE_EXTENSIONS:
                tree.append(f"{indent} {file}")
    return tree

# ==================================================
# FILE ROLE DETECTION
# ==================================================
def detect_role(path):
    p = path.lower()
    if p.endswith("package.json") or p.endswith(".env"):
        return "config"
    if "route" in p:
        return "route"
    if "controller" in p:
        return "controller"
    if "service" in p:
        return "service"
    if "model" in p or "db" in p:
        return "database"
    if p.endswith(".test.js"):
        return "test"
    if any(p.endswith(log) for log in LOG_FILES):
        return "log"
    return "unknown"

# ==================================================
# FILE CONTENT READ
# ==================================================
def read_text_file(path):
    try:
        size = os.path.getsize(path)
        if size > MAX_TEXT_BYTES:
            return None, f"too_large ({size} bytes)"
        with open(path, "rb") as f:
            data = f.read()
        try:
            return data.decode("utf-8"), None
        except UnicodeDecodeError:
            return None, "binary"
    except Exception as e:
        return None, f"error: {str(e)}"

# ==================================================
# SQLITE SCHEMA
# ==================================================
def sqlite_schema(path):
    result = []
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cur = conn.cursor()
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        for (table,) in cur.fetchall():
            cur.execute(f"PRAGMA table_info({table})")
            cols = [c[1] for c in cur.fetchall()]
            result.append({
                "table": table,
                "columns": cols,
                "certainty": "explicit"
            })
    except Exception as e:
        result.append({"error": str(e), "certainty": "failed"})
    finally:
        try:
            conn.close()
        except:
            pass
    return result

# ==================================================
# PACKAGE.JSON DEPENDENCIES
# ==================================================
def extract_package_dependencies(root):
    pkg_path = os.path.join(root, "package.json")
    if not os.path.exists(pkg_path):
        return None
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "dependencies": list(data.get("dependencies", {}).keys()),
            "devDependencies": list(data.get("devDependencies", {}).keys()),
            "certainty": "explicit"
        }
    except Exception as e:
        return {
            "error": str(e),
            "certainty": "failed"
        }

# ==================================================
# DEPENDENCY GRAPH (FILES + PACKAGES)
# ==================================================
def extract_dependencies(file_path, content, root, package_deps):
    internal = set()
    external = set()
    base_dir = os.path.dirname(file_path)
    for match in IMPORT_RE.findall(content):
        ref = match[0] or match[1]
        if ref.startswith("."):
            joined = os.path.normpath(os.path.join(base_dir, ref))
            internal.add(joined.replace("\\", "/"))
        else:
            if ref in package_deps:
                external.add(ref)
    return {
        "internal": sorted(internal),
        "external": sorted(external),
        "certainty": "explicit"
    }

# ==================================================
# AZURE INFO
# ==================================================
def azure_info():
    try:
        raw = subprocess.check_output(
            f"az webapp config appsettings list --name {AZURE_APP_NAME} --resource-group {RESOURCE_GROUP}",
            shell=True
        ).decode()
        return {
            "source": "az cli",
            "login_state": "logged_in",
            "app_settings": json.loads(raw)
        }
    except:
        return {
            "source": "az cli",
            "login_state": "not_logged_in",
            "app_settings": None
        }

# ==================================================
# JSON SCHEMA VALIDATION
# ==================================================
def validate_snapshot(snapshot):
    schema = {
        "type": "object",
        "properties": {
            "ai_contract": {"type": "object"},
            "project_metadata": {"type": "object"},
            "folder_tree": {"type": "array", "items": {"type": "string"}},
            "packages": {"type": ["object", "null"]},
            "entry_points": {"type": "array", "items": {"type": "string"}},
            "source_files": {"type": "array", "items": {"type": "object"}},
            "dependency_graph": {"type": "array", "items": {"type": "object"}},
            "databases": {"type": "array", "items": {"type": "object"}},
            "skipped_files": {"type": "array", "items": {"type": "object"}},
            "cloud": {"type": "object"}
        },
        "required": ["ai_contract", "project_metadata", "folder_tree"]
    }
    try:
        validate(instance=snapshot, schema=schema, cls=Draft202012Validator)
        return True
    except ValidationError as e:
        print(f"JSON validation error: {str(e)}")
        return False

# ==================================================
# SNAPSHOT BUILDER
# ==================================================
def build_snapshot(root):
    package_info = extract_package_dependencies(root)
    package_deps = set(package_info["dependencies"] + package_info["devDependencies"]) if package_info and isinstance(package_info, dict) else set()
    snapshot = {
        "ai_contract": ai_contract(),
        "project_metadata": project_metadata(),
        "folder_tree": folder_tree(root),
        "packages": package_info,
        "entry_points": [],
        "source_files": [],
        "dependency_graph": [],
        "databases": [],
        "skipped_files": [],
        "cloud": {
            "azure": azure_info()
        }
    }
    for r, d, f in os.walk(root):
        d[:] = [x for x in d if x not in IGNORE_FOLDERS]
        for file in f:
            full = os.path.join(r, file)
            if file == OUTPUT_FILE:
                continue
            ext = os.path.splitext(file)[1].lower()
            rel = normalize_path(full, root)
            if ext in IGNORE_EXTENSIONS:
                snapshot["skipped_files"].append({
                    "path": rel,
                    "reason": "ignored_extension"
                })
                continue
            mtime = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(os.path.getmtime(full)))
            if file in ENTRY_POINT_NAMES:
                snapshot["entry_points"].append(rel)
            if ext in [".sqlite", ".sqlite3", ".db"]:
                schema_data = sqlite_schema(full)
                file_hash = hashlib.sha256(open(full, "rb").read()).hexdigest()
                snapshot["databases"].append({
                    "path": rel,
                    "schema": schema_data,
                    "hash_sha256": file_hash,
                    "last_modified": mtime
                })
                continue
            content, skip_reason = read_text_file(full)
            if skip_reason:
                snapshot["skipped_files"].append({
                    "path": rel,
                    "reason": skip_reason
                })
                continue
            role = detect_role(rel)
            file_hash = hashlib.sha256(content.encode("utf-8")).hexdigest() if content else None
            if file in LOG_FILES:
                # Sample last 50 lines for logs
                lines = content.splitlines()
                sampled_content = "\n".join(lines[-50:]) if len(lines) > 50 else content
                snapshot["source_files"].append({
                    "path": rel,
                    "role": "log",
                    "content": sampled_content,
                    "note": "Sampled last 50 lines; full content may be larger",
                    "hash_sha256": file_hash,
                    "last_modified": mtime
                })
            else:
                snapshot["source_files"].append({
                    "path": rel,
                    "role": role,
                    "content": content,
                    "hash_sha256": file_hash,
                    "last_modified": mtime
                })
            if ext in [".js", ".ts"]:
                snapshot["dependency_graph"].append({
                    "file": rel,
                    "dependencies": extract_dependencies(
                        rel, content, root, package_deps
                    ),
                    "dependency_type": "static_imports",
                    "certainty": "explicit"
                })
    if not validate_snapshot(snapshot):
        raise ValueError("Snapshot failed validation - check errors above")
    return snapshot

# ==================================================
# MAIN
# ==================================================
if __name__ == "__main__":
    snapshot = build_snapshot(os.getcwd())
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)
    print("✅ Ultimate AI snapshot created:", OUTPUT_FILE)