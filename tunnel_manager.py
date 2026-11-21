import subprocess
import time
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
CLOUDFLARED_BIN = PROJECT_ROOT / "cloudflared.exe"
TUNNEL_FILE = PROJECT_ROOT / "tunnel_url.txt"

def start_cloudflare_tunnel():
    print(f"Starting Cloudflare Quick Tunnel on http://127.0.0.1:5000...")
    cmd = [
        str(CLOUDFLARED_BIN),
        "tunnel",
        "--url", "http://127.0.0.1:5000",
        "--no-autoupdate"
    ]
    
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    tunnel_url = None
    start = time.time()
    
    while time.time() - start < 30:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            time.sleep(0.1)
            continue
        print(line.rstrip())
        match = re.search(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com", line)
        if match:
            tunnel_url = match.group(0)
            break
            
    if tunnel_url:
        print("\n" + "=" * 60)
        print("CLOUDFLARE SECURE HTTPS TUNNEL ESTABLISHED:")
        print(f"URL: {tunnel_url}")
        print("=" * 60 + "\n")
        TUNNEL_FILE.write_text(tunnel_url, encoding="utf-8")
        sys.stdout.flush()
        # Drain stdout in a loop so buffer never fills up
        for extra in iter(proc.stdout.readline, ""):
            pass
        proc.wait()
    else:
        print("Failed to capture Cloudflare tunnel URL within 30s.")
        proc.terminate()

if __name__ == "__main__":
    start_cloudflare_tunnel()
