"""Automated Database Initialization and Data Loader for elnino_karnataka_db.

Executes schema.sql on MySQL, creates tables and indexes, and populates
weather_climate_data with historical records from Karnataka_Weather_Cleaned.csv.
Also verifies local SQLite fallback database tables.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
import pandas as pd

PROJECT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(PROJECT / "backend"))

from database.db import get_db_config, get_db_connection, SQLITE_PATH, _init_sqlite


def init_mysql():
    print("=" * 60)
    print("  MySQL Initialization & Data Population")
    print("=" * 60)
    config = get_db_config()
    print(f"Connecting to MySQL at {config['host']}:{config['port']} as user '{config['user']}'...")

    try:
        import mysql.connector
        # Connect without specifying database to create it if missing
        admin_config = config.copy()
        admin_config.pop("database", None)
        conn = mysql.connector.connect(**admin_config)
        cursor = conn.cursor()

        schema_file = Path(__file__).resolve().parent / "schema.sql"
        if not schema_file.exists():
            print(f"Error: Schema file not found at {schema_file}")
            return False

        print(f"Reading schema from {schema_file.name}...")
        with open(schema_file, "r", encoding="utf-8") as f:
            sql_statements = f.read().split(";")

        for stmt in sql_statements:
            clean_stmt = stmt.strip()
            if clean_stmt:
                try:
                    cursor.execute(clean_stmt)
                except mysql.connector.Error as e:
                    # Ignore harmless drop/exists warnings
                    if "already exists" not in str(e).lower():
                        print(f"  Note on SQL: {e}")

        conn.commit()
        print("  [OK] MySQL schema and tables verified.")

        # Reconnect to elnino_karnataka_db
        cursor.execute("USE `elnino_karnataka_db`")

        # Check if weather_climate_data already has rows
        cursor.execute("SELECT COUNT(*) FROM `weather_climate_data`")
        count = cursor.fetchone()[0]
        if count > 0:
            print(f"  [OK] weather_climate_data already contains {count:,} records.")
        else:
            cleaned_csv = PROJECT / "datasets" / "processed" / "Karnataka_Weather_Cleaned.csv"
            if cleaned_csv.exists():
                print(f"Populating weather_climate_data from {cleaned_csv.name}...")
                df = pd.read_csv(cleaned_csv)
                insert_sql = """
                    INSERT INTO weather_climate_data
                    (Date, Year, Month, Day, Min_Temperature, Max_Temperature,
                     Mean_Temperature, Rainfall, ONI, Season, Condition)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """
                records = []
                for _, row in df.iterrows():
                    records.append((
                        str(row.get("Date")),
                        int(row.get("Year", 0)),
                        int(row.get("Month", 0)),
                        int(row.get("Day", 0)),
                        float(row.get("Min_Temperature")) if pd.notna(row.get("Min_Temperature")) else None,
                        float(row.get("Max_Temperature")) if pd.notna(row.get("Max_Temperature")) else None,
                        float(row.get("Mean_Temperature", 0.0)),
                        float(row.get("Rainfall", 0.0)),
                        float(row.get("ONI", 0.0)),
                        str(row.get("Season", "")),
                        str(row.get("Condition", "Neutral")),
                    ))
                cursor.executemany(insert_sql, records)
                conn.commit()
                print(f"  [OK] Successfully imported {len(records):,} weather records into MySQL.")

        cursor.close()
        conn.close()
        return True
    except Exception as e:
        print(f"  [!] MySQL setup encountered: {e}")
        print("  Hint: Configure valid MYSQL_PASSWORD in backend/.env to connect MySQL.")
        return False


def init_sqlite():
    print("\n" + "=" * 60)
    print("  Local SQLite Fallback Verification")
    print("=" * 60)
    _init_sqlite()
    print(f"  [OK] Local SQLite verified at {SQLITE_PATH.name}")
    return True


if __name__ == "__main__":
    mysql_ok = init_mysql()
    init_sqlite()
    print("\nDatabase initialization complete.")
