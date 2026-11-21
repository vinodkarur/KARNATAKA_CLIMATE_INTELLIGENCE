"""Database schema migrations for Karnataka Climate Intelligence & Emergency Platform.

Safely applies idempotent CREATE TABLE IF NOT EXISTS migrations to MySQL and fallback SQLite.
Preserves all existing tables and historical data records.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

try:
    from database.db import get_db_connection
except ImportError:
    from backend.database.db import get_db_connection

logger = logging.getLogger("db_migrations")

MIGRATION_STATEMENTS = [
    # 1. Users Table
    """
    CREATE TABLE IF NOT EXISTS `users` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `full_name` VARCHAR(150) NOT NULL,
        `email` VARCHAR(190) NOT NULL UNIQUE,
        `mobile_number` VARCHAR(25) NULL,
        `password_hash` VARCHAR(255) NOT NULL,
        `role` VARCHAR(30) NOT NULL DEFAULT 'USER',
        `primary_district` VARCHAR(100) NOT NULL DEFAULT 'Bengaluru Urban',
        `locality` VARCHAR(150) NULL,
        `is_active` TINYINT(1) NOT NULL DEFAULT 1,
        `consent_given` TINYINT(1) NOT NULL DEFAULT 1,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_user_email` (`email`),
        KEY `idx_user_role` (`role`),
        KEY `idx_user_district` (`primary_district`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,

    # 2. User Notification Preferences Table
    """
    CREATE TABLE IF NOT EXISTS `user_notification_preferences` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `user_id` BIGINT NOT NULL,
        `push_enabled` TINYINT(1) NOT NULL DEFAULT 1,
        `email_enabled` TINYINT(1) NOT NULL DEFAULT 1,
        `sms_enabled` TINYINT(1) NOT NULL DEFAULT 0,
        `min_severity` VARCHAR(20) NOT NULL DEFAULT 'ORANGE',
        `hazard_types` VARCHAR(255) NOT NULL DEFAULT 'HEAVY_RAINFALL,FLOOD_RISK,EXTREME_HEAT,THUNDERSTORM_LIGHTNING,STRONG_WINDS',
        `quiet_hours_enabled` TINYINT(1) NOT NULL DEFAULT 0,
        `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        UNIQUE KEY `idx_user_pref` (`user_id`),
        CONSTRAINT `fk_pref_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,

    # 3. Web Push Subscriptions Table
    """
    CREATE TABLE IF NOT EXISTS `push_subscriptions` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `user_id` BIGINT NULL,
        `district` VARCHAR(100) NOT NULL DEFAULT 'Bengaluru Urban',
        `endpoint` TEXT NOT NULL,
        `p256dh_key` VARCHAR(255) NOT NULL,
        `auth_token` VARCHAR(255) NOT NULL,
        `user_agent` VARCHAR(255) NULL,
        `is_active` TINYINT(1) NOT NULL DEFAULT 1,
        `subscribed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `last_delivery_at` TIMESTAMP NULL,
        PRIMARY KEY (`id`),
        KEY `idx_push_district` (`district`),
        KEY `idx_push_user` (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,

    # 4. Emergency Warnings Lifecycle Table
    """
    CREATE TABLE IF NOT EXISTS `emergency_warnings` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `alert_id` VARCHAR(100) NOT NULL UNIQUE,
        `district` VARCHAR(100) NOT NULL,
        `hazard_id` VARCHAR(50) NOT NULL,
        `hazard_category` VARCHAR(100) NOT NULL,
        `severity` VARCHAR(30) NOT NULL,
        `severity_code` VARCHAR(10) NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `observed_or_predicted_value` VARCHAR(255) NULL,
        `threshold_value` VARCHAR(255) NULL,
        `rationale` TEXT NOT NULL,
        `recommended_actions` TEXT NOT NULL,
        `status` VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
        `issue_time` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `valid_until` TIMESTAMP NULL,
        `broadcast_status` VARCHAR(30) NOT NULL DEFAULT 'PENDING',
        `approved_by` VARCHAR(100) NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_warn_alert_id` (`alert_id`),
        KEY `idx_warn_district` (`district`),
        KEY `idx_warn_severity` (`severity_code`),
        KEY `idx_warn_status` (`status`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,

    # 5. Notification Queue Table
    """
    CREATE TABLE IF NOT EXISTS `notification_queue` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `alert_id` VARCHAR(100) NOT NULL,
        `channel` VARCHAR(30) NOT NULL,
        `recipient` VARCHAR(255) NOT NULL,
        `district` VARCHAR(100) NOT NULL,
        `title` VARCHAR(255) NOT NULL,
        `message_body` TEXT NOT NULL,
        `status` VARCHAR(30) NOT NULL DEFAULT 'QUEUED',
        `attempts` INT NOT NULL DEFAULT 0,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `delivered_at` TIMESTAMP NULL,
        PRIMARY KEY (`id`),
        KEY `idx_queue_status` (`status`),
        KEY `idx_queue_alert` (`alert_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,

    # 6. Notification Delivery Logs Table
    """
    CREATE TABLE IF NOT EXISTS `notification_delivery_logs` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `notification_id` VARCHAR(64) NULL,
        `alert_id` VARCHAR(100) NOT NULL,
        `user_id` BIGINT NULL,
        `subscription_id` BIGINT NULL,
        `hazard_type` VARCHAR(100) NULL,
        `severity` VARCHAR(50) NULL,
        `channel` VARCHAR(30) NOT NULL,
        `district` VARCHAR(100) NOT NULL,
        `total_recipients` INT NOT NULL DEFAULT 0,
        `delivered_count` INT NOT NULL DEFAULT 0,
        `failed_count` INT NOT NULL DEFAULT 0,
        `delivery_status` VARCHAR(50) NOT NULL,
        `provider_response` TEXT NULL,
        `error_details` TEXT NULL,
        `executed_by` VARCHAR(100) NOT NULL,
        `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        `delivered_at` TIMESTAMP NULL,
        `logged_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_del_alert` (`alert_id`),
        KEY `idx_del_status` (`delivery_status`),
        KEY `idx_del_user` (`user_id`),
        KEY `idx_del_sub` (`subscription_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,

    # 7. Admin & Security Audit Logs Table
    """
    CREATE TABLE IF NOT EXISTS `admin_audit_logs` (
        `id` BIGINT NOT NULL AUTO_INCREMENT,
        `admin_user` VARCHAR(100) NOT NULL,
        `action` VARCHAR(100) NOT NULL,
        `resource_type` VARCHAR(50) NOT NULL,
        `resource_id` VARCHAR(100) NULL,
        `details` TEXT NULL,
        `ip_address` VARCHAR(45) NULL,
        `logged_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (`id`),
        KEY `idx_audit_admin` (`admin_user`),
        KEY `idx_audit_action` (`action`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    """,
]

SQLITE_MIGRATION_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        mobile_number TEXT,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        primary_district TEXT NOT NULL DEFAULT 'Bengaluru Urban',
        locality TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        consent_given INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        push_enabled INTEGER NOT NULL DEFAULT 1,
        email_enabled INTEGER NOT NULL DEFAULT 1,
        sms_enabled INTEGER NOT NULL DEFAULT 0,
        min_severity TEXT NOT NULL DEFAULT 'ORANGE',
        hazard_types TEXT NOT NULL DEFAULT 'HEAVY_RAINFALL,FLOOD_RISK,EXTREME_HEAT,THUNDERSTORM_LIGHTNING,STRONG_WINDS',
        quiet_hours_enabled INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        district TEXT NOT NULL DEFAULT 'Bengaluru Urban',
        endpoint TEXT NOT NULL,
        p256dh_key TEXT NOT NULL,
        auth_token TEXT NOT NULL,
        user_agent TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_delivery_at TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS emergency_warnings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT NOT NULL UNIQUE,
        district TEXT NOT NULL,
        hazard_id TEXT NOT NULL,
        hazard_category TEXT NOT NULL,
        severity TEXT NOT NULL,
        severity_code TEXT NOT NULL,
        title TEXT NOT NULL,
        observed_or_predicted_value TEXT,
        threshold_value TEXT,
        rationale TEXT NOT NULL,
        recommended_actions TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        issue_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        valid_until TIMESTAMP,
        broadcast_status TEXT NOT NULL DEFAULT 'PENDING',
        approved_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS notification_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT NOT NULL,
        channel TEXT NOT NULL,
        recipient TEXT NOT NULL,
        district TEXT NOT NULL,
        title TEXT NOT NULL,
        message_body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'QUEUED',
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS notification_delivery_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id TEXT,
        alert_id TEXT NOT NULL,
        user_id INTEGER,
        subscription_id INTEGER,
        hazard_type TEXT,
        severity TEXT,
        channel TEXT NOT NULL,
        district TEXT NOT NULL,
        total_recipients INTEGER NOT NULL DEFAULT 0,
        delivered_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        delivery_status TEXT NOT NULL,
        provider_response TEXT,
        error_details TEXT,
        executed_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """,
]


def run_database_migrations() -> Dict[str, Any]:
    """Execute all idempotent migrations against the active database."""
    conn = get_db_connection()
    is_mysql = not hasattr(conn, "total_changes")
    stmts = MIGRATION_STATEMENTS if is_mysql else SQLITE_MIGRATION_STATEMENTS

    success_count = 0
    errors: List[str] = []

    try:
        cursor = conn.cursor()
        for stmt in stmts:
            stmt_clean = stmt.strip()
            if not stmt_clean:
                continue
            try:
                cursor.execute(stmt_clean)
                success_count += 1
            except Exception as ex:
                err_str = str(ex)
                # Ignore table already exists or constraint already exists
                if "already exists" not in err_str.lower() and "duplicate" not in err_str.lower():
                    errors.append(err_str)
                    logger.warning(f"Migration statement notice: {ex}")

        conn.commit()
        if hasattr(cursor, "close"):
            cursor.close()
        if hasattr(conn, "close"):
            conn.close()

    except Exception as fatal_ex:
        errors.append(str(fatal_ex))
        logger.error(f"Migration execution error: {fatal_ex}")

    return {
        "status": "success" if not errors else "partial",
        "backend": "MySQL" if is_mysql else "SQLite",
        "applied_tables_count": success_count,
        "errors": errors,
    }
