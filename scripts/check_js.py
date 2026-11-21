import os
import re

def check_file(path):
    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Strip multi-line comments
    clean = re.sub(r'/\*.*?\*/', '', content, flags=re.DOTALL)
    # Strip single-line comments
    clean = re.sub(r'//.*', '', clean)
    
    # Check braces
    stack = []
    lines = clean.split('\n')
    for l_no, line in enumerate(lines, 1):
        for ch in line:
            if ch in '{[(':
                stack.append((ch, l_no))
            elif ch in '}])':
                if not stack:
                    print(f"EXTRA '{ch}' at line {l_no} in {path}")
                    return False
                top, top_line = stack.pop()
                expected = {'{': '}', '[': ']', '(': ')'}[top]
                if ch != expected:
                    print(f"Mismatched '{top}' (line {top_line}) with '{ch}' at line {l_no} in {path}")
                    return False
    if stack:
        print(f"Unclosed {stack[-1]} in {path} (total unclosed: {len(stack)})")
        return False
    return True

js_dir = 'frontend/static/js'
for fname in sorted(os.listdir(js_dir)):
    if fname.endswith('.js'):
        p = os.path.join(js_dir, fname)
        if check_file(p):
            print(f"{fname}: OK")
