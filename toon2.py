import os
import json
import sqlite3
import subprocess

# ==========================================
#                SETTINGS
# ==========================================
OUTPUT_FILE = "snapshot_of_project.json"
AZURE_APP_NAME = "law-gpt9-test"
RESOURCE_GROUP = "poona_student"

# Folders to skip completely
IGNORE_FOLDERS = {
    "node_modules", 
    ".git", 
    "__pycache__", 
    ".vscode",
    "dist",
    "build"
}

# File extensions to skip
IGNORE_EXTENSIONS = {
    ".jsonl", ".pkl", ".bin", ".dll", ".so", ".exe", 
    ".shm", ".wal", ".zip", ".tar", ".gz"
}

# Max size to read for normal text files (1 MB)
MAX_FULL_READ_BYTES = 1_000_000 

# ==========================================
#          SYSTEM & PROJECT INFO
# ==========================================

def get_system_info():
    """Captures Node, Git, and Folder Tree."""
    info = {}
    try:
        # 1. Basic Versions
        info["node_version"] = subprocess.check_output(["node", "-v"], shell=True).decode().strip()
        info["git_remote"] = subprocess.check_output(["git", "remote", "get-url", "origin"], shell=True).decode().strip()
        info["current_branch"] = subprocess.check_output(["git", "rev-parse", "--abbrev-ref", "HEAD"], shell=True).decode().strip()
        
        # 2. Folder Tree (visual map of the project)
        print("  -> generating folder tree...")
        tree = []
        for root, dirs, files in os.walk("."):
            dirs[:] = [d for d in dirs if d not in IGNORE_FOLDERS]
            level = root.replace(".", "").count(os.sep)
            indent = " " * 4 * (level)
            tree.append(f"{indent}{os.path.basename(root)}/")
            sub_indent = " " * 4 * (level + 1)
            for f in files:
                if os.path.splitext(f)[1] not in IGNORE_EXTENSIONS:
                    tree.append(f"{sub_indent}{f}")
        info["folder_tree"] = "\n".join(tree)

    except Exception as e:
        info["error"] = f"Some system info could not be retrieved: {str(e)}"
    return info

def get_azure_info():
    """Captures Azure App Settings via AZ CLI."""
    try:
        cmd = f'az webapp config appsettings list --name {AZURE_APP_NAME} --resource-group {RESOURCE_GROUP}'
        result = subprocess.check_output(cmd, shell=True).decode().strip()
        return json.loads(result)
    except:
        return "Azure info not available. (Run 'az login' first)."

# ==========================================
#           ORIGINAL LOGIC HELPERS
# ==========================================

def read_text(path, max_bytes=MAX_FULL_READ_BYTES):
    """Reads normal text files."""
    try:
        if os.path.getsize(path) > max_bytes:
            return f"<File too large: {os.path.getsize(path)} bytes. Skipped content.>", False
        with open(path, "rb") as f:
            data = f.read(max_bytes + 1)
        if len(data) > max_bytes:
            return "<File larger than 1MB. Content truncated.>", False
        try:
            return data.decode("utf-8", errors="strict"), False
        except UnicodeDecodeError:
            return "<Binary File - Content Skipped>", True
    except Exception as e:
        return f"<Error reading file: {str(e)}>", False

def get_json_sample(path):
    """Reads a sample of a JSON file if it is large."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        output = ["--- JSON SUMMARY ---"]
        if isinstance(data, list):
            output.append(f"Type: List, Count: {len(data)} items")
            output.append(json.dumps(data[:1], indent=2))
        elif isinstance(data, dict):
            output.append(f"Type: Object, Keys: {list(data.keys())}")
            small_sample = {k: data[k] for k in list(data.keys())[:3]}
            output.append(json.dumps(small_sample, indent=2))
        return "\n".join(output)
    except Exception as e:
        return f"<Error parsing JSON: {str(e)}>"

def get_sqlite_schema(path):
    """Extracts Table Names, Columns, and Row Samples."""
    output = ["--- SQLITE SCHEMA REPORT ---"]
    conn = None
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True) 
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = cursor.fetchall()
        if not tables:
            output.append("Result: Empty Database")
        for table_name in tables:
            t_name = table_name[0]
            output.append(f"\nTABLE: {t_name}")
            cursor.execute(f"PRAGMA table_info({t_name})")
            columns = [col[1] for col in cursor.fetchall()]
            output.append(f"  Columns: {columns}")
            cursor.execute(f"SELECT COUNT(*) FROM {t_name}")
            output.append(f"  Total Rows: {cursor.fetchone()[0]}")
            cursor.execute(f"SELECT * FROM {t_name} LIMIT 1")
            output.append(f"  Sample Row: {str(cursor.fetchone())[:200]}...")
    except Exception as e:
        output.append(f"Error reading DB: {str(e)}")
    finally:
        if conn: conn.close()
    return "\n".join(output)

def make_snapshot(root_dir, script_path):
    records = []
    # 1. Capture All Metadata first
    records.append({
        "type": "project_metadata",
        "system": get_system_info(),
        "azure": get_azure_info()
    })

    print(f"Scanning directory: {root_dir} ...")
    for dirpath, dirnames, filenames in os.walk(root_dir):
        dirnames[:] = [d for d in dirnames if d not in IGNORE_FOLDERS]
        for fn in filenames:
            full_path = os.path.join(dirpath, fn)
            if os.path.abspath(full_path) == script_path or fn == OUTPUT_FILE:
                continue
            ext = os.path.splitext(fn)[1].lower()
            if ext in IGNORE_EXTENSIONS:
                continue
            rel_path = os.path.relpath(full_path, root_dir).replace("\\", "/")
            content = ""
            if ext in [".sqlite", ".sqlite3", ".db"]:
                content = get_sqlite_schema(full_path)
            elif ext == ".json" and os.path.getsize(full_path) > 500_000:
                content = get_json_sample(full_path)
            else:
                content, is_binary = read_text(full_path)
                if is_binary:
                    content = f"[Binary File] ({ext}) - content skipped"
            records.append({"path": rel_path, "content": content})
    return records

# ==========================================
#                 MAIN RUN
# ==========================================
if __name__ == "__main__":
    try:
        data = make_snapshot(os.getcwd(), os.path.abspath(__file__))
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("-" * 40)
        print(f"✅ Success! Snapshot created with Folder Tree.")
        print(f"   Files included: {len(data)}")
        print("-" * 40)
    except Exception as e:
        print(f"❌ Critical Error: {str(e)}")