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
    "server.js", "app.js", "index.js", "main.js", "chat.js"
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
# SQLITE SCHEMA AND EXTENSIONS
# ==================================================
def sqlite_schema(path):
    result = {
        "tables": [],
        "extensions": {
            "compile_options": [],
            "loaded_extensions": []
        },
        "vector_tables": [],
        "summary": "",
        "certainty": "explicit"
    }
    vector_loaded = False
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        cur = conn.cursor()

        # Get compile options
        cur.execute("PRAGMA compile_options;")
        result["extensions"]["compile_options"] = [row[0] for row in cur.fetchall()]

        # Get tables and schemas
        cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
        for (table,) in cur.fetchall():
            cur.execute(f"PRAGMA table_info({table})")
            cols = [c[1] for c in cur.fetchall()]
            result["tables"].append({
                "table": table,
                "columns": cols
            })

        # Check for specific extensions, e.g., vector (sqlite-vec)
        vec_version = None
        try:
            cur.execute("SELECT vec_version();")
            vec_version = cur.fetchone()[0]
            vector_loaded = True
        except sqlite3.OperationalError:
            pass  # Not loaded

        if vector_loaded:
            result["extensions"]["loaded_extensions"].append({
                "name": "sqlite-vec",
                "version": vec_version,
                "loaded": True
            })
        else:
            result["extensions"]["loaded_extensions"].append({
                "name": "sqlite-vec",
                "loaded": False
            })

        # For vector schema: since virtual tables are already in tables, no extra action needed.
        # If needed, we can query for virtual tables specifically.
        cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%USING vec0%'")
        vector_tables = cur.fetchall()
        if vector_tables:
            result["vector_tables"] = [{"table": t[0], "create_sql": t[1]} for t in vector_tables]

        num_tables = len(result["tables"])
        num_vector_tables = len(result["vector_tables"])
        result["summary"] = f"{num_tables} tables, {num_vector_tables} vector tables. Vector extension loaded: {vector_loaded}."

    except Exception as e:
        result = {
            "error": str(e),
            "summary": "Failed to load schema.",
            "certainty": "failed"
        }
    finally:
        try:
            conn.close()
        except:
            pass
    return result

# ==================================================
# INFER VECTOR SCHEMA FROM PYTHON SOURCES
# ==================================================
def infer_vector_schema_from_sources(source_files, db_path):
    inferred = []
    create_re = re.compile(r'CREATE\s+VIRTUAL\s+TABLE\s+(.+?)\s+USING\s+vec0\s*\((.*?)\)', re.IGNORECASE | re.DOTALL | re.MULTILINE)
    for src in source_files:
        if src["path"].endswith(".py") and "content" in src:
            content = src["content"]
            for match in create_re.finditer(content):
                table = match.group(1).strip().replace("'", "").replace('"', "")
                columns_str = match.group(2).strip()
                columns = [col.strip() for col in columns_str.split(',') if col.strip()]
                inferred.append({
                    "table": table,
                    "columns": columns,
                    "create_sql_snippet": match.group(0),
                    "from_file": src["path"],
                    "certainty": "inferred"
                })
    if inferred:
        num_inferred = len(inferred)
        return {
            "vector_tables_inferred": inferred,
            "summary": f"Inferred {num_inferred} vector tables from Python source files."
        }
    return None

# ==================================================
# PACKAGE.JSON DEPENDENCIES (FULL)
# ==================================================
def extract_package_dependencies(root):
    pkg_path = os.path.join(root, "package.json")
    if not os.path.exists(pkg_path):
        return None
    try:
        with open(pkg_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "dependencies": data.get("dependencies", {}),
            "devDependencies": data.get("devDependencies", {}),
            "engines": data.get("engines", {}),
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
# RUNTIME READINESS CHECK
# ==================================================
def runtime_readiness(package_info, node_version):
    readiness = {
        "node_compatibility": {
            "required": package_info.get("engines", {}).get("node", "not specified"),
            "current": node_version,
            "compatible": False,
            "note": ""
        },
        "native_modules": {
            "sqlite-vec": {"present": False},
            "better-sqlite3": {"present": False}
        },
        "puppeteer": {
            "present": False,
            "note": "If present, may be risky on Azure due to browser dependencies"
        },
        "express_version_5": {
            "present": False,
            "version": None,
            "note": "Express v5 is beta; check for stability"
        }
    }

    # Node compatibility
    required_node = readiness["node_compatibility"]["required"]
    if required_node != "not specified" and node_version:
        import semver
        try:
            readiness["node_compatibility"]["compatible"] = semver.match(node_version.lstrip('v'), required_node)
        except:
            readiness["node_compatibility"]["note"] = "Unable to parse semver"
    else:
        readiness["node_compatibility"]["note"] = "No engines.node specified or no current node version detected"

    # Native modules and others
    all_deps = {**package_info.get("dependencies", {}), **package_info.get("devDependencies", {})}
    for mod in ["sqlite-vec", "better-sqlite3"]:
        if mod in all_deps:
            readiness["native_modules"][mod]["present"] = True
            readiness["native_modules"][mod]["version"] = all_deps[mod]

    if "puppeteer" in all_deps:
        readiness["puppeteer"]["present"] = True
        readiness["puppeteer"]["version"] = all_deps["puppeteer"]

    if "express" in all_deps:
        expr_ver = all_deps["express"]
        if expr_ver.startswith("^5") or expr_ver.startswith("5") or expr_ver.startswith("~5"):
            readiness["express_version_5"]["present"] = True
            readiness["express_version_5"]["version"] = expr_ver

    return readiness

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
            "cloud": {"type": "object"},
            "runtime_readiness": {"type": "object"}
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
    package_deps = set()
    if package_info and isinstance(package_info, dict) and "dependencies" in package_info:
        package_deps = set(package_info["dependencies"].keys()) | set(package_info.get("devDependencies", {}).keys())
    
    metadata = project_metadata()
    snapshot = {
        "ai_contract": ai_contract(),
        "project_metadata": metadata,
        "folder_tree": folder_tree(root),
        "packages": package_info,
        "entry_points": [],
        "source_files": [],
        "dependency_graph": [],
        "databases": [],
        "skipped_files": [],
        "cloud": {
            "azure": azure_info()
        },
        "runtime_readiness": runtime_readiness(package_info or {}, metadata["node_version"])
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
    
    # Post-process databases for inferred vector schemas if necessary
    for db in snapshot["databases"]:
        schema = db.get("schema", {})
        needs_inference = False
        if "error" in schema:
            needs_inference = True
        elif "extensions" in schema:
            loaded_exts = schema["extensions"].get("loaded_extensions", [])
            vec_ext = next((ext for ext in loaded_exts if ext["name"] == "sqlite-vec"), None)
            if vec_ext and not vec_ext["loaded"]:
                needs_inference = True
        
        if needs_inference:
            inferred = infer_vector_schema_from_sources(snapshot["source_files"], db["path"])
            if inferred:
                if "inferred" not in schema:
                    schema["inferred"] = {}
                schema["inferred"].update(inferred)
                if "summary" in inferred:
                    if "summary" in schema:
                        schema["summary"] += " " + inferred["summary"]
                    else:
                        schema["summary"] = inferred["summary"]
    
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