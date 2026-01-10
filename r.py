import os
import sys
import ast
import re
import shutil
import subprocess
from pathlib import Path

EXTS = (".py", ".js", ".ejs", ".ts", ".jsx")

# ---------------- window title (windows only) ----------------
def set_terminal_title(title):
    try:
        os.system(f"title {title}")
    except:
        pass

# ---------------- sound ----------------
try:
    import winsound
    def beep(level=1):
        freq = {1: 800, 2: 1200, 3: 1600}[level]
        winsound.Beep(freq, 300)
except:
    def beep(level=1):
        print("\a", end="")

# ---------------- helpers ----------------
def say(msg):
    print(msg)

def read_block(prompt):
    say(prompt)
    say("paste text, then press Enter + Ctrl+Z + Enter")
    data = sys.stdin.read()
    if data.strip().lower() in ("exit", "quit", "e"):
        say("exiting safely")
        sys.exit(0)
    return data

def normalize(s):
    return re.sub(r"\s+", " ", s.strip())

def get_files(base):
    out = []
    for r, _, fs in os.walk(base):
        for f in fs:
            if f.lower().endswith(EXTS):
                out.append(Path(r) / f)
    return out

# ---------------- analysis ----------------
def extract_variables(code):
    names = set()
    for m in re.finditer(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b", code):
        names.add(m.group(1))
    return names

def count_imports(code, suffix):
    if suffix == ".py":
        return len(re.findall(r"^\s*(import|from)\s+", code, re.M))
    return len(re.findall(r"\b(require\s*\(|import\s+)", code))

# ---------------- syntax checks ----------------
def check_python(code):
    try:
        ast.parse(code)
        return True
    except:
        return False

def check_node(path):
    try:
        subprocess.run(
            ["node", "--check", str(path)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True
        )
        return True
    except:
        return False

# ---------------- main ----------------
def main():
    set_terminal_title("Safe Block Replace – Low Hallucination Tool")

    base = Path.cwd()
    files = get_files(base)

    say("safe block replace tool")
    say("scanning folder: " + str(base))
    say(f"files found: {len(files)}")
    say("type exit / quit / e anytime")

    while True:
        old = read_block("\nPASTE OLD CODE BLOCK:")
        old_norm = normalize(old)

        matches = []

        for f in files:
            try:
                text = f.read_text(encoding="utf-8")
                lines = text.splitlines()

                n = old.count("\n") + 1
                for i in range(len(lines) - n + 1):
                    block = "\n".join(lines[i:i+n])
                    if normalize(block) == old_norm:
                        matches.append((f, block))
            except:
                pass

        if not matches:
            say("no match found")
            continue

        beep(2)
        say("WARNING. block found in multiple places." if len(matches) > 1 else "block found")

        for i, (f, _) in enumerate(matches, 1):
            say(f"{i}. {f}")

        if len(matches) > 1:
            while True:
                choice = input("choose file number or 0 to cancel: ").strip()
                if choice.isdigit():
                    c = int(choice)
                    if c == 0:
                        break
                    if 1 <= c <= len(matches):
                        target = matches[c-1]
                        break
            if choice == "0":
                say("change cancelled")
                continue
        else:
            target = matches[0]

        new = read_block("\nPASTE NEW CODE BLOCK:")

        old_vars = extract_variables(old)
        new_vars = extract_variables(new)

        if old_vars != new_vars:
            beep(3)
            say("WARNING. VARIABLE NAMES CHANGED.")
            say("CHANGE BLOCKED.")
            continue

        f, old_block = target
        original = f.read_text(encoding="utf-8")

        old_imports = count_imports(old_block, f.suffix)
        new_imports = count_imports(new, f.suffix)

        if new_imports < old_imports:
            beep(2)
            say("WARNING. IMPORT COUNT REDUCED.")
            ans = input("continue? yes or no: ").strip().lower()
            if ans != "yes":
                say("change cancelled")
                continue

        backup = f.with_suffix(f.suffix + ".bak")
        shutil.copyfile(f, backup)

        updated = original.replace(old_block, new)
        f.write_text(updated, encoding="utf-8")

        ok = True
        if f.suffix == ".py":
            ok = check_python(updated)
        else:
            ok = check_node(f)

        if not ok:
            shutil.copyfile(backup, f)
            beep(3)
            say("ERROR. SYNTAX CHECK FAILED.")
            say("ROLLBACK COMPLETE.")
            continue

        beep(1)
        say("change applied successfully")

if __name__ == "__main__":
    main()
