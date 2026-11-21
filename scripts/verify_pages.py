import urllib.request
import re

pages = ['/', '/login', '/user-dashboard', '/admin', '/alerts', '/gis', '/live-climate']
for path in pages:
    try:
        res = urllib.request.urlopen(f'http://127.0.0.1:5000{path}')
        html = res.read().decode('utf-8')
        title_match = re.search(r'<title>(.*?)</title>', html, re.IGNORECASE)
        title = title_match.group(1) if title_match else 'No Title'
        scripts = re.findall(r'<script\s+src=[\'"](.*?)[\'"]', html)
        print(f"{path:18} -> HTTP {res.getcode()} | Title: '{title}' | Scripts: {scripts}")
    except Exception as e:
        print(f"{path:18} -> ERROR: {e}")
