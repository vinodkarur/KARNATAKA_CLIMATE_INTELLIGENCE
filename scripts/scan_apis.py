import os
import re
import urllib.request
import json

api_calls = set()
for fname in sorted(os.listdir('frontend/static/js')):
    if fname.endswith('.js'):
        p = os.path.join('frontend/static/js', fname)
        with open(p, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        matches = re.findall(r'[\'"](/api/[a-zA-Z0-9_\-\/]+)', content)
        for m in matches:
            if not m.endswith(('.js', '.css', '.png', '.jpg', '.geojson')):
                api_calls.add(m)

print(f"Discovered {len(api_calls)} distinct API endpoints in frontend JS:")
results = []
for ep in sorted(api_calls):
    url = f"http://127.0.0.1:5000{ep}"
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        res = urllib.request.urlopen(req)
        code = res.getcode()
        body = res.read().decode('utf-8')
        try:
            parsed = json.loads(body)
            keys = list(parsed.keys())[:4] if isinstance(parsed, dict) else f"list({len(parsed)})"
            results.append((ep, code, "JSON", keys))
        except:
            results.append((ep, code, "RAW", len(body)))
    except urllib.error.HTTPError as e:
        results.append((ep, e.code, "HTTPError", str(e)))
    except Exception as e:
        results.append((ep, "ERR", "Exception", str(e)))

for ep, code, kind, info in results:
    print(f"{ep:35} -> {code} [{kind}] {info}")
