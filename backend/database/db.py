"""Database connection, repository, and dual-layer persistence for elnino_karnataka_db.

Supports MySQL as primary enterprise storage with automatic, seamless fallback
to local SQLite for zero-configuration, robust local operations.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    from dotenv import load_dotenv
    _proj_root = Path(__file__).resolve().parent.parent.parent
    load_dotenv(_proj_root / ".env")
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

try:
    import mysql.connector
    from mysql.connector import errorcode
except ImportError:
    mysql = None

SQLITE_PATH = Path(__file__).resolve().parent / "predictions_local.sqlite"


def _init_sqlite():
    """Ensure local fallback tables exist for zero-downtime persistence."""
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            c.execute("""
                CREATE TABLE IF NOT EXISTS predictions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Date TEXT NOT NULL,
                    Predicted_Temperature_C REAL NOT NULL,
                    Predicted_Rainfall_mm REAL NOT NULL,
                    Relative_Temperature_Level TEXT NOT NULL,
                    Relative_Rainfall_Level TEXT NOT NULL,
                    ONI REAL,
                    Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS adaptation_recommendations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Date TEXT NOT NULL,
                    Recommendation_Type TEXT NOT NULL,
                    Risk_Level TEXT NOT NULL,
                    Recommendation TEXT NOT NULL,
                    Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS early_warning_alerts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    Alert_ID TEXT NOT NULL,
                    Date TEXT NOT NULL,
                    District TEXT NOT NULL DEFAULT 'Statewide',
                    Hazard_Category TEXT NOT NULL,
                    Severity TEXT NOT NULL,
                    Overall_Status TEXT NOT NULL,
                    Title TEXT NOT NULL,
                    Observed_Or_Predicted_Value TEXT,
                    Threshold_Value TEXT,
                    Threshold_Source TEXT,
                    Rationale TEXT NOT NULL,
                    Recommended_Actions TEXT NOT NULL,
                    Stakeholders TEXT,
                    Likelihood TEXT,
                    Impact TEXT,
                    Matrix_Cell TEXT,
                    Data_Source TEXT,
                    Reliability_Info TEXT,
                    Resolution_Status TEXT NOT NULL DEFAULT 'ACTIVE',
                    Created_At TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(Date, District, Hazard_Category, Severity) ON CONFLICT REPLACE
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS algorithm_evaluations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target TEXT NOT NULL,
                    task_type TEXT NOT NULL,
                    algorithm_name TEXT NOT NULL,
                    mae REAL,
                    mse REAL,
                    rmse REAL,
                    r2 REAL,
                    accuracy REAL,
                    precision_score REAL,
                    recall_score REAL,
                    f1_score REAL,
                    roc_auc REAL,
                    training_time_sec REAL,
                    inference_time_ms REAL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS live_weather_records (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    district TEXT NOT NULL,
                    temperature_c REAL,
                    rainfall_mm REAL,
                    relative_humidity REAL,
                    wind_speed_kmh REAL,
                    weather_condition TEXT,
                    source_name TEXT,
                    data_type TEXT,
                    is_stale INTEGER DEFAULT 0,
                    retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS model_monitoring_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    check_date TEXT NOT NULL,
                    metric_name TEXT NOT NULL,
                    metric_value REAL,
                    status TEXT NOT NULL,
                    details TEXT,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            c.execute("""
                CREATE TABLE IF NOT EXISTS active_model_selection (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    target TEXT NOT NULL,
                    algorithm_name TEXT NOT NULL,
                    r2 REAL,
                    mae REAL,
                    rmse REAL,
                    mse REAL,
                    training_time_sec REAL,
                    prediction_time_ms REAL,
                    selection_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active INTEGER DEFAULT 1
                )
            """)
            conn.commit()
    except Exception:
        pass


_init_sqlite()


def get_db_config() -> dict:
    return {
        "host": os.getenv("MYSQL_HOST", "localhost"),
        "user": os.getenv("MYSQL_USER", "root"),
        "password": os.getenv("MYSQL_PASSWORD", ""),
        "port": int(os.getenv("MYSQL_PORT", "3306")),
        "database": os.getenv("MYSQL_DATABASE", "elnino_karnataka_db"),
        "connect_timeout": 2,
    }


def get_db_connection():
    """Create and return a MySQL database connection."""
    if mysql is None:
        raise RuntimeError("mysql-connector-python is not installed")
    config = get_db_config()
    return mysql.connector.connect(**config)


def check_db_health() -> Dict[str, Any]:
    """Test database connectivity across MySQL and local SQLite storage."""
    # Check MySQL
    mysql_status = None
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT DATABASE(), VERSION()")
            db_name, version = cursor.fetchone()

            cursor.execute("SHOW TABLES")
            tables = [t[0] for t in cursor.fetchall()]

            counts = {}
            for tbl in [
                "weather_climate_data", "predictions", "adaptation_recommendations", "early_warning_alerts",
                "algorithm_evaluations", "live_weather_records", "model_monitoring_history"
            ]:
                if tbl in tables:
                    cursor.execute(f"SELECT COUNT(*) FROM `{tbl}`")
                    counts[tbl] = cursor.fetchone()[0]
                else:
                    counts[tbl] = 0

            cursor.close()
            conn.close()
            return {
                "status": "connected",
                "backend": "MySQL",
                "database": db_name,
                "version": version,
                "tables": tables,
                "record_counts": counts,
            }
        except Exception as err:
            mysql_status = str(err)

    # SQLite fallback status
    sqlite_count = 0
    alerts_count = 0
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM predictions")
            sqlite_count = c.fetchone()[0]
            try:
                c.execute("SELECT COUNT(*) FROM early_warning_alerts")
                alerts_count = c.fetchone()[0]
            except Exception:
                alerts_count = 0
    except Exception:
        sqlite_count = 0

    return {
        "status": "sqlite_local",
        "backend": "SQLite (Local fallback)",
        "sqlite_path": str(SQLITE_PATH.name),
        "sqlite_records": sqlite_count,
        "sqlite_alerts": alerts_count,
        "mysql_status": "offline",
        "mysql_error": mysql_status or "MySQL credentials not configured",
        "hint": (
            "Operating reliably on local SQLite database. "
            "To connect MySQL, configure MYSQL_PASSWORD in backend/.env."
        ),
    }


def save_prediction_record(
    prediction_date,
    temperature: float,
    rainfall: float,
    temperature_level: str,
    rainfall_level: str,
    oni_value: Optional[float],
    temp_advice: str,
    rain_advice: str,
) -> str:
    """Save prediction and adaptation recommendations to MySQL or local SQLite fallback."""
    prediction_day = (
        prediction_date.date() if hasattr(prediction_date, "date") else prediction_date
    )

    # 1. Try MySQL primary
    mysql_saved = False
    mysql_err = None
    if mysql is not None:
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()

            query_pred = """
                INSERT INTO predictions
                (
                    Date,
                    Predicted_Temperature_C,
                    Predicted_Rainfall_mm,
                    Relative_Temperature_Level,
                    Relative_Rainfall_Level,
                    ONI
                )
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            cursor.execute(
                query_pred,
                (
                    prediction_day,
                    float(temperature),
                    float(rainfall),
                    str(temperature_level),
                    str(rainfall_level),
                    float(oni_value) if oni_value is not None else None,
                ),
            )

            query_rec = """
                INSERT INTO adaptation_recommendations
                (Date, Recommendation_Type, Risk_Level, Recommendation)
                VALUES (%s, %s, %s, %s), (%s, %s, %s, %s)
            """
            cursor.execute(
                query_rec,
                (
                    prediction_day,
                    "Temperature",
                    str(temperature_level),
                    str(temp_advice),
                    prediction_day,
                    "Rainfall",
                    str(rainfall_level),
                    str(rain_advice),
                ),
            )

            conn.commit()
            mysql_saved = True
        except Exception as err:
            mysql_err = err
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    if mysql_saved:
        return "Saved to MySQL successfully"

    # 2. Local SQLite fallback (guaranteed persistence)
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as sconn:
            sc = sconn.cursor()
            sc.execute(
                """
                INSERT INTO predictions
                (Date, Predicted_Temperature_C, Predicted_Rainfall_mm,
                 Relative_Temperature_Level, Relative_Rainfall_Level, ONI)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    str(prediction_day),
                    float(temperature),
                    float(rainfall),
                    str(temperature_level),
                    str(rainfall_level),
                    float(oni_value) if oni_value is not None else None,
                ),
            )
            sc.execute(
                """
                INSERT INTO adaptation_recommendations
                (Date, Recommendation_Type, Risk_Level, Recommendation)
                VALUES (?, ?, ?, ?), (?, ?, ?, ?)
                """,
                (
                    str(prediction_day),
                    "Temperature",
                    str(temperature_level),
                    str(temp_advice),
                    str(prediction_day),
                    "Rainfall",
                    str(rainfall_level),
                    str(rain_advice),
                ),
            )
            sconn.commit()
        return "Saved to Local SQLite database (MySQL offline: fallback active)"
    except Exception as sqlite_err:
        return f"Database error (MySQL: {mysql_err}; SQLite: {sqlite_err})"


def fetch_prediction_history(
    limit: int = 200,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> Optional[List[Dict[str, Any]]]:
    """Fetch stored prediction records from MySQL or fallback SQLite."""
    # 1. Try MySQL
    if mysql is not None:
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)

            conditions = []
            params: List[Any] = []

            if start_date:
                conditions.append("Date >= %s")
                params.append(start_date)
            if end_date:
                conditions.append("Date <= %s")
                params.append(end_date)

            where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            query = f"""
                SELECT Date, Predicted_Temperature_C, Predicted_Rainfall_mm,
                       Relative_Temperature_Level, Relative_Rainfall_Level, ONI
                FROM predictions
                {where_clause}
                ORDER BY Date DESC
                LIMIT %s
            """
            params.append(int(limit))

            cursor.execute(query, tuple(params))
            rows = []
            for r in cursor.fetchall():
                rows.append({
                    "date": str(r["Date"]),
                    "predicted_temperature_C": round(float(r["Predicted_Temperature_C"]), 2),
                    "predicted_rainfall_mm": round(float(r["Predicted_Rainfall_mm"]), 2),
                    "temperature_level": r["Relative_Temperature_Level"],
                    "rainfall_level": r["Relative_Rainfall_Level"],
                    "oni": round(float(r["ONI"]), 3) if r["ONI"] is not None else None,
                    "source": "mysql",
                })
            return rows
        except Exception:
            pass
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    # 2. Try SQLite
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            conditions = []
            params = []
            if start_date:
                conditions.append("Date >= ?")
                params.append(str(start_date))
            if end_date:
                conditions.append("Date <= ?")
                params.append(str(end_date))

            where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
            query = f"""
                SELECT Date, Predicted_Temperature_C, Predicted_Rainfall_mm,
                       Relative_Temperature_Level, Relative_Rainfall_Level, ONI
                FROM predictions
                {where_clause}
                ORDER BY Date DESC
                LIMIT ?
            """
            params.append(int(limit))
            cursor.execute(query, tuple(params))
            rows = []
            for r in cursor.fetchall():
                rows.append({
                    "date": str(r["Date"]),
                    "predicted_temperature_C": round(float(r["Predicted_Temperature_C"]), 2),
                    "predicted_rainfall_mm": round(float(r["Predicted_Rainfall_mm"]), 2),
                    "temperature_level": r["Relative_Temperature_Level"],
                    "rainfall_level": r["Relative_Rainfall_Level"],
                    "oni": round(float(r["ONI"]), 3) if r["ONI"] is not None else None,
                    "source": "sqlite_local",
                })
            if rows:
                return rows
    except Exception:
        pass

    return None


# ---------------------------------------------------------------------------
# Early Warning Alerts Dual-Layer Persistence & History API
# ---------------------------------------------------------------------------

DISTRICT_SLUGS: Dict[str, str] = {
    "Bagalkot": "BAGL",
    "Ballari": "BALL",
    "Belagavi": "BELA",
    "Bengaluru Rural": "BNGR",
    "Bengaluru Urban": "BNGU",
    "Bidar": "BIDA",
    "Chamarajanagar": "CHNR",
    "Chikkaballapur": "CKBL",
    "Chikkamagaluru": "CKMG",
    "Chitradurga": "CHTR",
    "Dakshina Kannada": "DKAN",
    "Davanagere": "DAVG",
    "Dharwad": "DHAR",
    "Gadag": "GADA",
    "Hassan": "HASS",
    "Haveri": "HAVE",
    "Kalaburagi": "KLBG",
    "Kodagu": "KODG",
    "Kolar": "KOLR",
    "Koppal": "KOPL",
    "Mandya": "MAND",
    "Mysuru": "MYSU",
    "Raichur": "RAIC",
    "Ramanagara": "RAMN",
    "Shivamogga": "SHIV",
    "Tumakuru": "TUMK",
    "Udupi": "UDUP",
    "Uttara Kannada": "UKAN",
    "Vijayanagara": "VJNG",
    "Vijayapura": "VJPR",
    "Yadgir": "YADG",
    "Statewide": "STAT",
}


def save_alert_records(
    date_val: Any,
    alerts_list: List[Dict[str, Any]],
    district: str = "Statewide",
    overall_status: str = "NORMAL",
) -> str:
    """Persist structured multi-hazard alerts into MySQL or local SQLite fallback."""
    if not alerts_list:
        return "No alerts to persist"

    clean_date = str(date_val.date()) if hasattr(date_val, "date") else str(date_val)[:10]

    # Normalize records
    records_to_save = []
    for a in alerts_list:
        cat = a.get("category") or a.get("hazard_category", "General Climate")
        sev = a.get("severity", "ADVISORY").upper()
        if sev == "WARNING":
            sev = "HIGH WATCH"
        elif sev == "CRITICAL":
            sev = "CRITICAL ALERT"
        elif sev == "NORMAL BASELINE":
            sev = "NORMAL"

        dist_slug = DISTRICT_SLUGS.get(district, district.replace(" ", "").upper()[:4])
        # Canonical hazard slug
        cat_upper = cat.upper()
        if "HEAT" in cat_upper:
            cat_slug = "HEAT"
        elif "RAIN" in cat_upper or "PRECIP" in cat_upper:
            cat_slug = "RAIN"
        elif "DROU" in cat_upper:
            cat_slug = "DROU"
        elif "ENSO" in cat_upper:
            cat_slug = "ENSO"
        elif "BASE" in cat_upper or "NORM" in cat_upper:
            cat_slug = "BASE"
        else:
            cat_slug = cat.replace(" ", "").upper()[:4]

        # Canonical severity slug
        if sev == "CRITICAL ALERT":
            sev_slug = "CRIT"
        elif sev == "HIGH WATCH":
            sev_slug = "WARN"
        elif sev == "ADVISORY":
            sev_slug = "ADVI"
        elif sev == "NORMAL":
            sev_slug = "NORM"
        else:
            sev_slug = sev.replace(" ", "").upper()[:4]

        expected_date = clean_date.replace("-", "")
        expected_canonical_id = f"ALT-{expected_date}-{dist_slug}-{cat_slug}-{sev_slug}"

        raw_aid = str(a.get("alert_id") or "").strip()
        parts = raw_aid.split("-") if raw_aid else []

        # Validate incoming Alert_ID: must have 5 parts, start with ALT, match clean_date and dist_slug
        valid_hazards = {"HEAT", "RAIN", "DROU", "ENSO", "BASE", cat_slug}
        valid_sevs = {"CRIT", "WARN", "ADVI", "NORM", "INFO", "ELNI", "LANI", sev_slug}

        if (
            len(parts) == 5
            and parts[0] == "ALT"
            and parts[1] == expected_date
            and parts[2] == dist_slug
            and parts[3] in valid_hazards
            and parts[4] in valid_sevs
        ):
            aid = raw_aid
        elif len(parts) == 5 and parts[0] == "ALT":
            h_slug = parts[3] if parts[3] in valid_hazards else cat_slug
            s_slug = parts[4] if parts[4] in valid_sevs else sev_slug
            aid = f"ALT-{expected_date}-{dist_slug}-{h_slug}-{s_slug}"
        else:
            aid = expected_canonical_id

        title = a.get("title") or f"{cat} Warning"
        val = str(a.get("observed_or_predicted_value") or a.get("value") or "")
        tval = str(a.get("threshold_value") or a.get("threshold") or "")
        tsrc = str(a.get("threshold_source") or "44-Yr Statistical Climatology Percentile (1981-2024)")
        rat = str(a.get("rationale") or "")
        actions = "; ".join(a.get("actions", [])) if isinstance(a.get("actions"), list) else str(a.get("actions") or "")
        stakeholders = ", ".join(a.get("stakeholders", [])) if isinstance(a.get("stakeholders"), list) else str(a.get("stakeholders") or "")
        likelihood = str(a.get("likelihood") or "L2")
        impact = str(a.get("impact") or "I2")
        matrix_cell = str(a.get("matrix_cell") or f"{likelihood}-{impact}")
        data_source = str(a.get("data_source") or "Karnataka Climate Risk Pipeline")
        reliability = str(a.get("reliability_info") or "Statistical Climatology / ML Downscaled Output")
        status = str(a.get("resolution_status") or "ACTIVE")

        records_to_save.append({
            "Alert_ID": aid,
            "Date": clean_date,
            "District": district,
            "Hazard_Category": cat,
            "Severity": sev,
            "Overall_Status": overall_status,
            "Title": title,
            "Observed_Or_Predicted_Value": val,
            "Threshold_Value": tval,
            "Threshold_Source": tsrc,
            "Rationale": rat,
            "Recommended_Actions": actions,
            "Stakeholders": stakeholders,
            "Likelihood": likelihood,
            "Impact": impact,
            "Matrix_Cell": matrix_cell,
            "Data_Source": data_source,
            "Reliability_Info": reliability,
            "Resolution_Status": status,
        })

    # 1. Try MySQL
    mysql_saved = False
    mysql_err = None
    if mysql is not None:
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            query = """
                INSERT INTO early_warning_alerts
                (
                    Alert_ID, Date, District, Hazard_Category, Severity, Overall_Status,
                    Title, Observed_Or_Predicted_Value, Threshold_Value, Threshold_Source,
                    Rationale, Recommended_Actions, Stakeholders, Likelihood, Impact,
                    Matrix_Cell, Data_Source, Reliability_Info, Resolution_Status
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    Overall_Status = VALUES(Overall_Status),
                    Title = VALUES(Title),
                    Observed_Or_Predicted_Value = VALUES(Observed_Or_Predicted_Value),
                    Threshold_Value = VALUES(Threshold_Value),
                    Rationale = VALUES(Rationale),
                    Recommended_Actions = VALUES(Recommended_Actions),
                    Likelihood = VALUES(Likelihood),
                    Impact = VALUES(Impact),
                    Matrix_Cell = VALUES(Matrix_Cell),
                    Resolution_Status = VALUES(Resolution_Status)
            """
            for r in records_to_save:
                cursor.execute(query, (
                    r["Alert_ID"], r["Date"], r["District"], r["Hazard_Category"], r["Severity"],
                    r["Overall_Status"], r["Title"], r["Observed_Or_Predicted_Value"],
                    r["Threshold_Value"], r["Threshold_Source"], r["Rationale"],
                    r["Recommended_Actions"], r["Stakeholders"], r["Likelihood"], r["Impact"],
                    r["Matrix_Cell"], r["Data_Source"], r["Reliability_Info"], r["Resolution_Status"],
                ))
            conn.commit()
            mysql_saved = True
        except Exception as err:
            mysql_err = err
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    if mysql_saved:
        return f"Successfully saved {len(records_to_save)} alerts to MySQL"

    # 2. Local SQLite fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            query_sqlite = """
                INSERT OR REPLACE INTO early_warning_alerts
                (
                    Alert_ID, Date, District, Hazard_Category, Severity, Overall_Status,
                    Title, Observed_Or_Predicted_Value, Threshold_Value, Threshold_Source,
                    Rationale, Recommended_Actions, Stakeholders, Likelihood, Impact,
                    Matrix_Cell, Data_Source, Reliability_Info, Resolution_Status
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            for r in records_to_save:
                c.execute(query_sqlite, (
                    r["Alert_ID"], r["Date"], r["District"], r["Hazard_Category"], r["Severity"],
                    r["Overall_Status"], r["Title"], r["Observed_Or_Predicted_Value"],
                    r["Threshold_Value"], r["Threshold_Source"], r["Rationale"],
                    r["Recommended_Actions"], r["Stakeholders"], r["Likelihood"], r["Impact"],
                    r["Matrix_Cell"], r["Data_Source"], r["Reliability_Info"], r["Resolution_Status"],
                ))
            conn.commit()
        return f"Saved {len(records_to_save)} alerts to SQLite fallback"
    except Exception as sqlite_err:
        return f"Persistence error (MySQL: {mysql_err}; SQLite: {sqlite_err})"


def fetch_alert_history(
    limit: int = 100,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    severity: Optional[str] = None,
    category: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Retrieve stored historical alerts with multi-dimensional filtering."""
    # 1. Try MySQL
    if mysql is not None:
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            conds = []
            params: List[Any] = []
            if start_date:
                conds.append("Date >= %s")
                params.append(start_date)
            if end_date:
                conds.append("Date <= %s")
                params.append(end_date)
            if district and district.lower() not in ["all", "statewide"]:
                conds.append("District = %s")
                params.append(district)
            if severity and severity.lower() != "all":
                conds.append("Severity = %s")
                params.append(severity)
            if category and category.lower() != "all":
                conds.append("Hazard_Category LIKE %s")
                params.append(f"%{category}%")
            if status and status.lower() != "all":
                conds.append("Resolution_Status = %s")
                params.append(status)

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            query = f"""
                SELECT * FROM early_warning_alerts
                {where}
                ORDER BY Date DESC, id DESC
                LIMIT %s
            """
            params.append(int(limit))
            cursor.execute(query, tuple(params))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        except Exception:
            pass
        finally:
            if cursor:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn:
                try:
                    conn.close()
                except Exception:
                    pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            conds = []
            params = []
            if start_date:
                conds.append("Date >= ?")
                params.append(str(start_date))
            if end_date:
                conds.append("Date <= ?")
                params.append(str(end_date))
            if district and district.lower() not in ["all", "statewide"]:
                conds.append("District = ?")
                params.append(district)
            if severity and severity.lower() != "all":
                conds.append("Severity = ?")
                params.append(severity)
            if category and category.lower() != "all":
                conds.append("Hazard_Category LIKE ?")
                params.append(f"%{category}%")
            if status and status.lower() != "all":
                conds.append("Resolution_Status = ?")
                params.append(status)

            where = ("WHERE " + " AND ".join(conds)) if conds else ""
            query = f"""
                SELECT * FROM early_warning_alerts
                {where}
                ORDER BY Date DESC, id DESC
                LIMIT ?
            """
            params.append(int(limit))
            c.execute(query, tuple(params))
            return [dict(r) for r in c.fetchall()]
    except Exception:
        return []


def export_alerts_csv(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    district: Optional[str] = None,
    severity: Optional[str] = None,
) -> str:
    """Format stored alerts as a standardized CSV string."""
    import csv
    import io

    rows = fetch_alert_history(
        limit=5000,
        start_date=start_date,
        end_date=end_date,
        district=district,
        severity=severity,
    )
    output = io.StringIO()
    fields = [
        "Alert_ID", "Date", "District", "Hazard_Category", "Severity", "Overall_Status",
        "Title", "Observed_Or_Predicted_Value", "Threshold_Value", "Threshold_Source",
        "Rationale", "Recommended_Actions", "Stakeholders", "Likelihood", "Impact",
        "Matrix_Cell", "Data_Source", "Resolution_Status", "Created_At",
    ]
    writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return output.getvalue()


# ---------------------------------------------------------------------------
# Module 1: Algorithm Evaluations Persistence
# ---------------------------------------------------------------------------

def save_algorithm_evaluation(
    target: str,
    task_type: str,
    algorithm_name: str,
    metrics: Dict[str, Any],
    training_time_sec: float,
    inference_time_ms: float,
) -> bool:
    """Save an evaluated ML algorithm run to MySQL with SQLite failover."""
    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            query = """
                INSERT INTO algorithm_evaluations
                (target, task_type, algorithm_name, mae, mse, rmse, r2, accuracy, precision_score, recall_score, f1_score, roc_auc, training_time_sec, inference_time_ms)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(query, (
                target, task_type, algorithm_name,
                metrics.get("mae"), metrics.get("mse"), metrics.get("rmse"), metrics.get("r2"),
                metrics.get("accuracy"), metrics.get("precision"), metrics.get("recall"), metrics.get("f1"), metrics.get("roc_auc"),
                training_time_sec, inference_time_ms
            ))
            conn.commit()
            cursor.close()
            conn.close()
            return True
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            query = """
                INSERT INTO algorithm_evaluations
                (target, task_type, algorithm_name, mae, mse, rmse, r2, accuracy, precision_score, recall_score, f1_score, roc_auc, training_time_sec, inference_time_ms)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            c.execute(query, (
                target, task_type, algorithm_name,
                metrics.get("mae"), metrics.get("mse"), metrics.get("rmse"), metrics.get("r2"),
                metrics.get("accuracy"), metrics.get("precision"), metrics.get("recall"), metrics.get("f1"), metrics.get("roc_auc"),
                training_time_sec, inference_time_ms
            ))
            conn.commit()
            return True
    except Exception:
        return False


def fetch_algorithm_evaluations(target: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
    """Fetch stored ML algorithm evaluation benchmarks."""
    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            if target:
                cursor.execute("SELECT * FROM algorithm_evaluations WHERE target = %s ORDER BY id DESC LIMIT %s", (target, limit))
            else:
                cursor.execute("SELECT * FROM algorithm_evaluations ORDER BY id DESC LIMIT %s", (limit,))
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return rows
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            if target:
                c.execute("SELECT * FROM algorithm_evaluations WHERE target = ? ORDER BY id DESC LIMIT ?", (target, limit))
            else:
                c.execute("SELECT * FROM algorithm_evaluations ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in c.fetchall()]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Module 2: Live Weather Snapshot Persistence
# ---------------------------------------------------------------------------

def save_live_weather_record(
    district: str,
    temperature_c: Optional[float],
    rainfall_mm: Optional[float],
    relative_humidity: Optional[float],
    wind_speed_kmh: Optional[float],
    weather_condition: str,
    source_name: str = "Open-Meteo",
    data_type: str = "model_estimate",
    is_stale: bool = False,
) -> bool:
    """Persist retrieved external live weather observation to MySQL with SQLite fallback."""
    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            query = """
                INSERT INTO live_weather_records
                (district, temperature_c, rainfall_mm, relative_humidity, wind_speed_kmh, weather_condition, source_name, data_type, is_stale)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(query, (
                district, temperature_c, rainfall_mm, relative_humidity, wind_speed_kmh,
                weather_condition, source_name, data_type, 1 if is_stale else 0
            ))
            conn.commit()
            cursor.close()
            conn.close()
            return True
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            query = """
                INSERT INTO live_weather_records
                (district, temperature_c, rainfall_mm, relative_humidity, wind_speed_kmh, weather_condition, source_name, data_type, is_stale)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """
            c.execute(query, (
                district, temperature_c, rainfall_mm, relative_humidity, wind_speed_kmh,
                weather_condition, source_name, data_type, 1 if is_stale else 0
            ))
            conn.commit()
            return True
    except Exception:
        return False


def fetch_latest_live_weather(district: Optional[str] = None, limit: int = 31) -> List[Dict[str, Any]]:
    """Retrieve the latest cached live weather records."""
    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            if district and district.lower() != "all":
                cursor.execute("SELECT * FROM live_weather_records WHERE district = %s ORDER BY retrieved_at DESC LIMIT %s", (district, limit))
            else:
                cursor.execute("SELECT * FROM live_weather_records ORDER BY retrieved_at DESC LIMIT %s", (limit,))
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return rows
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            if district and district.lower() != "all":
                c.execute("SELECT * FROM live_weather_records WHERE district = ? ORDER BY retrieved_at DESC LIMIT ?", (district, limit))
            else:
                c.execute("SELECT * FROM live_weather_records ORDER BY retrieved_at DESC LIMIT ?", (limit,))
            return [dict(r) for r in c.fetchall()]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Module 6: Model & Data Quality Monitoring Audit Persistence
# ---------------------------------------------------------------------------

def save_monitoring_record(
    check_date: str,
    metric_name: str,
    metric_value: Optional[float],
    status: str,
    details: str,
) -> bool:
    """Store monitoring, data drift, or model health telemetry."""
    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            query = """
                INSERT INTO model_monitoring_history
                (check_date, metric_name, metric_value, status, details)
                VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(query, (check_date, metric_name, metric_value, status, details))
            conn.commit()
            cursor.close()
            conn.close()
            return True
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            query = """
                INSERT INTO model_monitoring_history
                (check_date, metric_name, metric_value, status, details)
                VALUES (?, ?, ?, ?, ?)
            """
            c.execute(query, (check_date, metric_name, metric_value, status, details))
            conn.commit()
            return True
    except Exception:
        return False


def fetch_monitoring_history(limit: int = 100) -> List[Dict[str, Any]]:
    """Retrieve telemetry and model audit logs."""
    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute("SELECT * FROM model_monitoring_history ORDER BY id DESC LIMIT %s", (limit,))
            rows = cursor.fetchall()
            cursor.close()
            conn.close()
            return rows
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT * FROM model_monitoring_history ORDER BY id DESC LIMIT ?", (limit,))
            return [dict(r) for r in c.fetchall()]
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Module 8: Active Production Model Selection Persistence
# ---------------------------------------------------------------------------

def _ensure_active_model_table():
    """Ensure active_model_selection table exists in MySQL and SQLite."""
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS active_model_selection (
                    id BIGINT NOT NULL AUTO_INCREMENT,
                    target VARCHAR(64) NOT NULL,
                    algorithm_name VARCHAR(128) NOT NULL,
                    r2 DOUBLE NULL,
                    mae DOUBLE NULL,
                    rmse DOUBLE NULL,
                    mse DOUBLE NULL,
                    training_time_sec DOUBLE NULL,
                    prediction_time_ms DOUBLE NULL,
                    selection_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    is_active TINYINT(1) DEFAULT 1,
                    PRIMARY KEY (id),
                    KEY idx_target_active (target, is_active)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
            """)
            conn.commit()
            cursor.close()
            conn.close()
        except Exception:
            pass


def save_active_model_selection(
    target: str,
    algorithm_name: str,
    metrics: Dict[str, Any],
) -> bool:
    """Persist user-selected active production model for a target into MySQL with SQLite failover."""
    _ensure_active_model_table()
    norm_target = "rainfall" if "rain" in str(target).lower() else "temperature"

    r2 = metrics.get("r2")
    mae = metrics.get("mae")
    rmse = metrics.get("rmse")
    mse = metrics.get("mse")
    train_time = metrics.get("training_time_sec") if metrics.get("training_time_sec") is not None else metrics.get("training_time")
    pred_time = metrics.get("prediction_time_ms") if metrics.get("prediction_time_ms") is not None else metrics.get("inference_time_ms")

    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE active_model_selection SET is_active = 0 WHERE target = %s", (norm_target,))
            query = """
                INSERT INTO active_model_selection
                (target, algorithm_name, r2, mae, rmse, mse, training_time_sec, prediction_time_ms, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1)
            """
            cursor.execute(query, (norm_target, algorithm_name, r2, mae, rmse, mse, train_time, pred_time))
            conn.commit()
            cursor.close()
            conn.close()
            return True
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            c = conn.cursor()
            c.execute("UPDATE active_model_selection SET is_active = 0 WHERE target = ?", (norm_target,))
            query = """
                INSERT INTO active_model_selection
                (target, algorithm_name, r2, mae, rmse, mse, training_time_sec, prediction_time_ms, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """
            c.execute(query, (norm_target, algorithm_name, r2, mae, rmse, mse, train_time, pred_time))
            conn.commit()
            return True
    except Exception:
        return False


def fetch_active_model_selection(target: str = "temperature") -> Dict[str, Any]:
    """Retrieve the currently designated active production model for the given target."""
    _ensure_active_model_table()
    norm_target = "rainfall" if "rain" in str(target).lower() else "temperature"

    # 1. Try MySQL
    if mysql is not None:
        try:
            conn = get_db_connection()
            cursor = conn.cursor(dictionary=True)
            cursor.execute(
                "SELECT * FROM active_model_selection WHERE target = %s AND is_active = 1 ORDER BY id DESC LIMIT 1",
                (norm_target,),
            )
            row = cursor.fetchone()
            cursor.close()
            conn.close()
            if row:
                return dict(row)
        except Exception:
            pass

    # 2. SQLite Fallback
    try:
        with sqlite3.connect(str(SQLITE_PATH)) as conn:
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                "SELECT * FROM active_model_selection WHERE target = ? AND is_active = 1 ORDER BY id DESC LIMIT 1",
                (norm_target,),
            )
            row = c.fetchone()
            if row:
                return dict(row)
    except Exception:
        pass

    # Default production baseline if no custom selection has been made yet
    if norm_target == "rainfall":
        return {
            "target": "rainfall",
            "algorithm_name": "Gradient Boosting Regressor",
            "r2": 0.2315,
            "mae": 2.1402,
            "rmse": 4.8193,
            "mse": 23.2256,
            "training_time_sec": 0.450,
            "prediction_time_ms": 0.012,
            "selection_timestamp": "Default Baseline",
            "is_active": 1,
            "is_default": True,
        }
    else:
        return {
            "target": "temperature",
            "algorithm_name": "Linear Regression",
            "r2": 0.9412,
            "mae": 0.5281,
            "rmse": 0.6934,
            "mse": 0.4808,
            "training_time_sec": 0.018,
            "prediction_time_ms": 0.003,
            "selection_timestamp": "Default Baseline",
            "is_active": 1,
            "is_default": True,
        }


