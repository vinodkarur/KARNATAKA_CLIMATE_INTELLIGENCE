"""Safe Production Database Exporter for Karnataka Climate Intelligence Platform.

Exports the complete elnino_karnataka_db schema and all data tables into a
reproducible, idempotent UTF-8 SQL script for deployment to Cloud MySQL.
Preserves all user records, password hashes, foreign keys, and indexes.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

# Add backend directory to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database.db import get_db_connection, mask_connection_config, get_db_config


def export_database(output_path: Path | None = None) -> Path:
    if output_path is None:
        output_path = Path(__file__).resolve().parent / "elnino_karnataka_db_production_export.sql"

    print("=" * 65)
    print("  Karnataka Climate Intelligence — Database Production Exporter")
    print("=" * 65)

    config = get_db_config()
    safe_info = mask_connection_config(config)
    print(f"Connecting to source database: {safe_info['host']}:{safe_info['port']}/{safe_info['database']}...")

    start_time = time.time()
    conn = get_db_connection(use_pool=False)
    cursor = conn.cursor()

    cursor.execute("SHOW TABLES")
    tables = [r[0] for r in cursor.fetchall()]
    print(f"Found {len(tables)} tables to export: {', '.join(tables)}")

    total_records_exported = 0
    table_stats = {}

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("-- ==============================================================\n")
        f.write("-- PRODUCTION DATABASE EXPORT: elnino_karnataka_db\n")
        f.write("-- Karnataka Climate Intelligence & Emergency Response Platform\n")
        f.write(f"-- Generated At: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}\n")
        f.write("-- ==============================================================\n\n")
        f.write("SET FOREIGN_KEY_CHECKS = 0;\n")
        f.write("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';\n")
        f.write("SET NAMES utf8mb4;\n")
        f.write("SET CHARACTER SET utf8mb4;\n\n")

        for table in tables:
            cursor.execute(f"SHOW CREATE TABLE `{table}`")
            raw_create = cursor.fetchone()[1]
            # Ensure idempotent creation
            create_sql = raw_create.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS")
            f.write(f"-- -------------------------------------------------------------\n")
            f.write(f"-- Table schema: `{table}`\n")
            f.write(f"-- -------------------------------------------------------------\n")
            f.write(f"{create_sql};\n\n")

            cursor.execute(f"SELECT COUNT(*) FROM `{table}`")
            row_count = cursor.fetchone()[0]
            table_stats[table] = row_count
            total_records_exported += row_count

            if row_count == 0:
                f.write(f"-- Table `{table}` has 0 records\n\n")
                print(f"  [EXPORT] `{table}`: 0 rows")
                continue

            print(f"  [EXPORT] `{table}`: {row_count:,} rows...")
            f.write(f"-- Dumping {row_count} records for `{table}`\n")

            cursor.execute(f"SELECT * FROM `{table}`")
            col_names = [d[0] for d in cursor.description]
            col_header = ", ".join([f"`{c}`" for c in col_names])

            batch = []
            batch_size = 500
            for row in cursor:
                vals = []
                for val in row:
                    if val is None:
                        vals.append("NULL")
                    elif isinstance(val, (int, float)):
                        vals.append(str(val))
                    elif isinstance(val, bytes):
                        vals.append(f"0x{val.hex()}")
                    else:
                        escaped = str(val).replace("\\", "\\\\").replace("'", "\\'").replace("\r", "\\r").replace("\n", "\\n")
                        vals.append(f"'{escaped}'")
                batch.append(f"({', '.join(vals)})")

                if len(batch) >= batch_size:
                    f.write(f"INSERT INTO `{table}` ({col_header}) VALUES\n" + ",\n".join(batch) + ";\n")
                    batch = []

            if batch:
                f.write(f"INSERT INTO `{table}` ({col_header}) VALUES\n" + ",\n".join(batch) + ";\n")
            f.write("\n")

        f.write("SET FOREIGN_KEY_CHECKS = 1;\n")

    cursor.close()
    conn.close()

    elapsed = time.time() - start_time
    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print("=" * 65)
    print(f"[SUCCESS] Export completed in {elapsed:.2f}s")
    print(f"File created : {output_path}")
    print(f"File size     : {file_size_mb:.2f} MB")
    print(f"Total tables  : {len(tables)}")
    print(f"Total rows    : {total_records_exported:,}")
    print("=" * 65)
    return output_path


if __name__ == "__main__":
    export_database()
