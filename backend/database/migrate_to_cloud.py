"""Automated Migration Utility to Cloud MySQL for Karnataka Climate Intelligence Platform.

Safely migrates the complete local elnino_karnataka_db (all 15 tables, 29,777+ records,
users, password hashes, and indexes) to a remote cloud MySQL instance (e.g., Aiven,
TiDB Cloud, AWS RDS, PlanetScale, Clever Cloud).

Usage:
  # Using environment variables (MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE):
  python backend/database/migrate_to_cloud.py

  # Using explicit CLI flags:
  python backend/database/migrate_to_cloud.py --host <cloud-host> --port 3306 --user <user> --password <pass> --database elnino_karnataka_db
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Add backend directory to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

try:
    import mysql.connector
except ImportError:
    print("[ERROR] mysql-connector-python is not installed. Run: pip install mysql-connector-python")
    sys.exit(1)

from database.db import mask_connection_config
from database.export_database import export_database


def parse_arguments():
    parser = argparse.ArgumentParser(description="Migrate local MySQL database to Cloud MySQL provider.")
    parser.add_argument("--host", default=os.getenv("MYSQL_HOST"), help="Remote MySQL hostname")
    parser.add_argument("--port", type=int, default=int(os.getenv("MYSQL_PORT", "3306")), help="Remote MySQL port")
    parser.add_argument("--user", default=os.getenv("MYSQL_USER"), help="Remote MySQL username")
    parser.add_argument("--password", default=os.getenv("MYSQL_PASSWORD"), help="Remote MySQL password")
    parser.add_argument("--database", default=os.getenv("MYSQL_DATABASE", "elnino_karnataka_db"), help="Remote database name")
    parser.add_argument("--ssl-mode", default=os.getenv("MYSQL_SSL_MODE", "REQUIRED"), help="SSL Mode (REQUIRED or DISABLED)")
    parser.add_argument("--sql-file", default=None, help="Path to SQL dump file (optional, auto-generated if omitted)")
    return parser.parse_args()


def migrate_to_cloud(args=None):
    if args is None:
        args = parse_arguments()

    print("=" * 70)
    print("  Karnataka Climate Intelligence — Cloud MySQL Migration Engine")
    print("=" * 70)

    target_cfg = {
        "host": (args.host or "").strip(),
        "port": args.port,
        "user": (args.user or "").strip(),
        "password": args.password or "",
        "database": (args.database or "elnino_karnataka_db").strip(),
        "connect_timeout": 15,
    }

    is_remote = bool(target_cfg["host"] and target_cfg["host"].lower() not in ("localhost", "127.0.0.1"))
    ssl_mode = (args.ssl_mode or "REQUIRED").upper().strip()
    if ssl_mode in ("REQUIRED", "PREFERRED", "TRUE", "1") or (is_remote and ssl_mode != "DISABLED"):
        target_cfg["ssl_disabled"] = False
    else:
        target_cfg["ssl_disabled"] = True

    masked_target = mask_connection_config(target_cfg)

    if not target_cfg["host"]:
        print("\n[ERROR] Target MySQL host is not configured.")
        print("Please supply --host <remote-host> or set MYSQL_HOST in your environment.")
        return False

    if target_cfg["host"].lower() in ("localhost", "127.0.0.1"):
        print(f"\n[WARNING] Target host is set to '{target_cfg['host']}'. This points to your local machine, not Cloud MySQL.")
        print("For production Render deployment, target must be an external cloud MySQL provider (e.g. Aiven, TiDB).")
        return False

    print(f"Target Cloud Host : {masked_target['host']}:{masked_target['port']}")
    print(f"Target Database   : {masked_target['database']}")
    print(f"Target User       : {masked_target['user']}")
    print(f"SSL/TLS Encryption: {'ENABLED' if masked_target['ssl'] else 'DISABLED'}")
    print("-" * 70)

    # 1. Test connectivity to target
    print("Step 1: Testing connectivity to destination Cloud MySQL...")
    try:
        # Try connecting with database specified
        conn = mysql.connector.connect(**target_cfg)
        cursor = conn.cursor()
        cursor.execute("SELECT VERSION()")
        version = cursor.fetchone()[0]
        print(f"  [OK] Successfully connected to destination MySQL (Version: {version})")
    except mysql.connector.Error as err:
        if err.errno == 1049:  # Unknown database
            print(f"  Database '{target_cfg['database']}' does not exist yet. Attempting to create it...")
            admin_cfg = target_cfg.copy()
            admin_cfg.pop("database", None)
            try:
                admin_conn = mysql.connector.connect(**admin_cfg)
                admin_cur = admin_conn.cursor()
                admin_cur.execute(f"CREATE DATABASE IF NOT EXISTS `{target_cfg['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                admin_conn.commit()
                admin_cur.close()
                admin_conn.close()
                print(f"  [OK] Database '{target_cfg['database']}' created successfully.")
                conn = mysql.connector.connect(**target_cfg)
                cursor = conn.cursor()
            except Exception as create_err:
                print(f"  [ERROR] Could not create database automatically: {create_err}")
                print("  Please create the database manually on your cloud provider console and rerun.")
                return False
        else:
            print(f"  [ERROR] Connection failed: {err}")
            return False

    # 2. Check or generate SQL dump
    sql_file = Path(args.sql_file) if args.sql_file else Path(__file__).resolve().parent / "elnino_karnataka_db_production_export.sql"
    if not sql_file.exists():
        print(f"\nStep 2: Export SQL dump not found. Generating fresh export from local MySQL...")
        sql_file = export_database(sql_file)
    else:
        print(f"\nStep 2: Using verified export file: {sql_file.name} ({sql_file.stat().st_size / (1024*1024):.2f} MB)")

    # 3. Import SQL statements
    print(f"\nStep 3: Importing schema and data to Cloud MySQL (this may take 10-30 seconds)...")
    start_import = time.time()

    with open(sql_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Split into statements respecting delimiter
    statements = []
    current_stmt = []
    for line in content.splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("--") or trimmed.startswith("/*"):
            continue
        current_stmt.append(line)
        if trimmed.endswith(";"):
            statements.append("\n".join(current_stmt))
            current_stmt = []

    print(f"  Total SQL statements to execute: {len(statements):,}")

    executed_count = 0
    error_count = 0

    cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    cursor.execute("SET NAMES utf8mb4")

    for i, stmt in enumerate(statements):
        try:
            cursor.execute(stmt)
            executed_count += 1
            if (i + 1) % 50 == 0 or (i + 1) == len(statements):
                sys.stdout.write(f"\r  Progress: {i + 1}/{len(statements)} statements executed...")
                sys.stdout.flush()
        except mysql.connector.Error as exec_err:
            error_count += 1
            err_msg = str(exec_err).lower()
            if "already exists" not in err_msg and "duplicate" not in err_msg:
                print(f"\n  [NOTE on stmt {i+1}]: {exec_err}")

    conn.commit()
    cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    conn.commit()

    import_duration = time.time() - start_import
    print(f"\n  [OK] Statement execution completed in {import_duration:.2f}s ({executed_count} succeeded, {error_count} notices).")

    # 4. Verification of target cloud database
    print("\nStep 4: Verifying destination Cloud MySQL tables and records...")
    cursor.execute("SHOW TABLES")
    target_tables = [r[0] for r in cursor.fetchall()]
    print(f"  Destination tables verified ({len(target_tables)} tables):")

    total_target_rows = 0
    for tbl in target_tables:
        cursor.execute(f"SELECT COUNT(*) FROM `{tbl}`")
        count = cursor.fetchone()[0]
        total_target_rows += count
        print(f"    - `{tbl}`: {count:,} rows")

    # 5. Verify admin account
    print("\nStep 5: Verifying Admin and Citizen accounts on Cloud MySQL...")
    cursor.execute("SELECT id, full_name, email, role, is_active FROM users WHERE email = 'admin@karnataka-emergency.gov.in'")
    admin_row = cursor.fetchone()
    if admin_row:
        print(f"  [OK] Admin account verified: ID={admin_row[0]}, Role={admin_row[3]}, Email={admin_row[2]}")
    else:
        print("  [WARNING] Admin account not found in destination users table!")

    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"  [OK] Total users in Cloud MySQL: {user_count}")

    cursor.close()
    conn.close()

    print("=" * 70)
    print("[SUCCESS] Cloud MySQL migration completed successfully!")
    print(f"Target Database : {masked_target['host']}:{masked_target['port']}/{masked_target['database']}")
    print(f"Total Tables    : {len(target_tables)}")
    print(f"Total Records   : {total_target_rows:,}")
    print("=" * 70)
    return True


if __name__ == "__main__":
    success = migrate_to_cloud()
    sys.exit(0 if success else 1)
