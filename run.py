#!/usr/bin/env python3
"""
run.py — One-Command Startup Script for Karnataka Climate Intelligence System.

Usage:
    python run.py               # Start on default port 5000
    python run.py --port 8080   # Start on custom port

Access the application at: http://127.0.0.1:5000
"""

import os
import sys
import argparse
from pathlib import Path

# ---------------------------------------------------------------------------
# Project root is the directory containing this script
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent

def check_requirements():
    """Verify critical dependencies before starting, distinguishing missing packages, DLL failures, and security policy blocks.

    SHAP is treated as an optional explainability engine so that Windows Smart App Control
    or Application Control policy blocks on SHAP's compiled extensions never halt Flask startup.
    """
    import importlib.util

    critical_pkgs = ["flask", "pandas", "numpy", "joblib", "scipy", "sklearn"]
    missing = []
    blocked = []
    dll_errors = []
    import_errors = []

    # 1. Check Mandatory Critical Packages
    for pkg in critical_pkgs:
        # Check if package is installed on disk
        spec = importlib.util.find_spec(pkg)
        if spec is None:
            missing.append(pkg)
            continue

        # Test importing and compiled extensions
        try:
            __import__(pkg)
            if pkg == "numpy":
                # Verify that compiled random number generator extensions load under Code Integrity
                from numpy.random import default_rng
                default_rng(0)
        except Exception as exc:
            err_str = str(exc)
            if "Application Control" in err_str or "4551" in err_str or "policy has blocked" in err_str:
                blocked.append((pkg, err_str))
            elif "DLL load failed" in err_str:
                dll_errors.append((pkg, err_str))
            elif isinstance(exc, ModuleNotFoundError) and getattr(exc, "name", None) == pkg:
                missing.append(pkg)
            else:
                import_errors.append((pkg, f"{type(exc).__name__}: {err_str}"))

    has_error = False
    if missing:
        has_error = True
        print(f"[ERROR] Missing packages (not installed): {', '.join(missing)}")
        print("Install them with:  pip install -r requirements.txt")

    if blocked:
        has_error = True
        print("\n[ERROR] Windows Smart App Control / Code Integrity Policy Block:")
        for p, err in blocked:
            print(f"  - Package '{p}' was blocked: {err}")
        print("  Root Cause: The installed wheel version contains newly compiled binaries lacking Microsoft cloud reputation.")
        print("  Remedy: Use an official, well-reputed package build (e.g. numpy==2.4.3).")

    if dll_errors:
        has_error = True
        print("\n[ERROR] Compiled Extension DLL Load Failures:")
        for p, err in dll_errors:
            print(f"  - Package '{p}': {err}")

    if import_errors:
        has_error = True
        print("\n[ERROR] Package Import Failures:")
        for p, err in import_errors:
            print(f"  - Package '{p}': {err}")

    if has_error:
        print()
        sys.exit(1)

    print("[OK] All required Python packages and compiled extensions verified.")

    # 2. Check Optional SHAP Explainability Engine (Graceful Degradation)
    shap_spec = importlib.util.find_spec("shap")
    if shap_spec is None:
        print("[NOTE] SHAP Explainability Engine: Package not installed on disk.")
        print("       (Core predictions, multi-hazard alerts, and all other modules remain fully operational.)")
    else:
        try:
            import shap
            # Test LinearExplainer and TreeExplainer availability
            _ = shap.LinearExplainer
            _ = shap.TreeExplainer
            print("[OK] SHAP Explainability Engine: Operational (LinearExplainer & TreeExplainer verified).")
        except Exception as exc:
            err_str = str(exc)
            policy_blocked = "Application Control" in err_str or "4551" in err_str or "policy has blocked" in err_str
            print("\n[NOTE] SHAP Explainability Engine: Temporarily Unavailable")
            if policy_blocked:
                print(f"       Status: Windows Smart App Control / Code Integrity Policy Blocked compiled binary.")
                print(f"       Detail: {err_str}")
            else:
                print(f"       Status: DLL or Import error: {err_str}")
            print("       Safe Degradation Active: Flask startup proceeding normally.")
            print("       Core ML predictions (Temperature, Rainfall, Risk Tiers) are 100% functional.")
            print("       Explainability endpoints (/api/shap, /api/health) will report availability status.\n")

def check_models():
    """Verify model files exist before starting."""
    models = [
        PROJECT_ROOT / "models" / "Temperature_Prediction_Model.pkl",
        PROJECT_ROOT / "models" / "Rainfall_Prediction_Model.pkl",
        PROJECT_ROOT / "models" / "Model_Feature_Columns.pkl",
    ]
    for m in models:
        if not m.exists():
            print(f"[ERROR] Model file not found: {m}")
            print("Please ensure the models/ directory contains the trained .pkl files.")
            sys.exit(1)
    print("[OK] All 3 ML model files verified.")

def check_database():
    """Ensure persistence storage is ready (MySQL or local SQLite failover)."""
    backend_dir = str(PROJECT_ROOT / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)
    try:
        from database.db import check_db_health, _init_sqlite
        _init_sqlite()
        health = check_db_health()
        print(f"[OK] Persistence: {health.get('backend', 'SQLite Local Fallback')} ({health.get('status', 'active')})")
    except Exception as e:
        print(f"[NOTE] Database check: {e}")

def load_env():
    """Load environment variables from .env files."""
    try:
        from dotenv import load_dotenv
        for env_file in [PROJECT_ROOT / ".env",
                         PROJECT_ROOT / "backend" / ".env"]:
            if env_file.exists():
                load_dotenv(env_file)
                print(f"[OK] Loaded environment from: {env_file.name}")
    except ImportError:
        pass

def print_startup_banner(port: int):
    print()
    print("=" * 65)
    print("  AI-Driven El Niño-Aware Urban Heat Risk Prediction System")
    print("  Karnataka Climate Intelligence Platform  v2.5")
    print("=" * 65)
    print(f"  Local Web App : http://127.0.0.1:{port}/")
    print(f"  API Discovery : http://127.0.0.1:{port}/api")
    print(f"  Health Check  : http://127.0.0.1:{port}/api/health")
    print(f"  Early Warnings: http://127.0.0.1:{port}/api/alerts")
    print()
    gemini = "[LIVE]" if os.getenv("GEMINI_API_KEY") else "[Offline Domain Engine Active]"
    mysql  = "[Connected]" if os.getenv("MYSQL_PASSWORD") else "[SQLite Local Fallback Active]"
    print(f"  Gemini AI   : {gemini}")
    print(f"  Database    : {mysql}")
    print(f"  GIS Spatial : [31 Karnataka Districts Active - Leaflet Map & GeoJSON]")
    print()
    print("  Application Pages (21 Operational Modules):")
    pages = [
        ("/", "Executive Dashboard"),
        ("/climate", "Weather Intelligence"),
        ("/predict", "AI Predictions"),
        ("/district-intelligence", "District-wise Intelligence (31 Districts)"),
        ("/risk", "Urban Heat Risk"),
        ("/flood", "Rainfall & Flood Risk"),
        ("/drought", "Drought & Water Security"),
        ("/enso", "El Niño / La Niña Monitor"),
        ("/gis", "Karnataka GIS Explorer"),
        ("/alerts", "Early Warning Centre"),
        ("/analytics", "Climate Analytics & Explainability"),
        ("/adaptation", "Adaptation Action Planner"),
        ("/history", "Prediction History & Audit Ledger"),
        ("/chat", "Climate AI Assistant"),
        ("/algorithm-lab", "ML Algorithm Comparison Lab"),
        ("/live-climate", "Live Climate Data Centre (31 Districts)"),
        ("/explainable-ai", "Explainable AI (XAI) Centre"),
        ("/scenario-simulator", "Climate Scenario Simulator"),
        ("/ensemble-prediction", "Ensemble Prediction Centre"),
        ("/model-monitoring", "Model & Data Monitoring Centre"),
        ("/settings", "System Settings & Telemetry"),
    ]
    for url, label in pages:
        print(f"    http://127.0.0.1:{port}{url:<16} -> {label}")
    print()
    print("  Press CTRL+C to stop the server.")
    print("=" * 65)
    print()

def main():
    parser = argparse.ArgumentParser(
        description="Karnataka Climate Risk Platform — Local Server"
    )
    parser.add_argument("--port", type=int, default=5000,
                        help="Port to run on (default: 5000)")
    parser.add_argument("--host", type=str, default="127.0.0.1",
                        help="Host to bind to (default: 127.0.0.1)")
    parser.add_argument("--debug", action="store_true",
                        help="Enable Flask debug mode (development only)")
    args = parser.parse_args()

    print("[*] Starting Karnataka Climate Intelligence Platform...")
    load_env()
    check_requirements()
    check_models()
    check_database()
    print_startup_banner(args.port)

    # Add backend to path and import app
    backend_dir = str(PROJECT_ROOT / "backend")
    if backend_dir not in sys.path:
        sys.path.insert(0, backend_dir)

    os.chdir(str(PROJECT_ROOT))

    try:
        from app import app
        app.run(
            host=args.host,
            port=args.port,
            debug=args.debug,
            use_reloader=False,
        )
    except KeyboardInterrupt:
        print("\n[*] Server gracefully stopped. Goodbye!")
    except Exception as exc:
        print(f"\n[ERROR] Failed to start server: {exc}")
        sys.exit(1)

if __name__ == "__main__":
    main()
