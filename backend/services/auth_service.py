"""Enterprise User Authentication & Role-Based Access Control Service.

Implements secure registration, login, session tokens, password hashing via Werkzeug scrypt,
login rate limiting, and server-side RBAC for USER, ADMIN, and SUPER_ADMIN roles.
"""

from __future__ import annotations

import logging
import re
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from werkzeug.security import generate_password_hash, check_password_hash

try:
    from database.db import get_db_connection
    from services.district_service import DISTRICT_REGISTRY
except ImportError:
    from backend.database.db import get_db_connection
    from backend.services.district_service import DISTRICT_REGISTRY

logger = logging.getLogger("auth_service")

# Login Rate Limiting (in-memory tracking)
LOGIN_ATTEMPTS: Dict[str, List[float]] = {}
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_PERIOD_SEC = 900  # 15 minutes


class AuthService:
    """User management, authentication and authorization engine."""

    def __init__(self):
        self._ensure_default_accounts()

    def register_user(
        self,
        full_name: str,
        email: str,
        password: str,
        confirm_password: Optional[str] = None,
        mobile_number: Optional[str] = None,
        primary_district: str = "Bengaluru Urban",
        locality: Optional[str] = None,
        role: str = "USER",
        consent_given: bool = True,
    ) -> Dict[str, Any]:
        """Validate, hash, and persist a new user account."""
        # 1. Validation
        full_name = str(full_name).strip()
        email = str(email).strip().lower()

        if not full_name or len(full_name) < 2:
            return {"status": "error", "message": "Full name must be at least 2 characters."}

        email_pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
        if not re.match(email_pattern, email):
            return {"status": "error", "message": "Please enter a valid email address."}

        if confirm_password is not None and password != confirm_password:
            return {"status": "error", "message": "Passwords do not match."}

        if not password or len(password) < 8:
            return {"status": "error", "message": "Password must be at least 8 characters in length."}

        # Check district validity
        if primary_district not in DISTRICT_REGISTRY:
            primary_district = "Bengaluru Urban"

        role = role.upper()
        if role not in ("USER", "ADMIN", "SUPER_ADMIN"):
            role = "USER"

        # 2. Check if user already exists
        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()

        try:
            sql_check = "SELECT id FROM users WHERE email = %s" if is_mysql else "SELECT id FROM users WHERE email = ?"
            cursor.execute(sql_check, (email,))
            if cursor.fetchone():
                return {"status": "error", "message": "An account with this email address already exists."}

            # 3. Hash password securely
            pw_hash = generate_password_hash(password, method="scrypt")

            # 4. Insert User
            sql_insert = (
                """
                INSERT INTO users (full_name, email, mobile_number, password_hash, role, primary_district, locality, consent_given)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """ if is_mysql else """
                INSERT INTO users (full_name, email, mobile_number, password_hash, role, primary_district, locality, consent_given)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """
            )
            cursor.execute(sql_insert, (
                full_name, email, mobile_number or "", pw_hash, role, primary_district, locality or "", 1 if consent_given else 0
            ))
            user_id = cursor.lastrowid
            conn.commit()

            # 5. Insert Default Notification Preferences
            sql_pref = (
                """
                INSERT INTO user_notification_preferences (user_id, push_enabled, email_enabled, min_severity, hazard_types)
                VALUES (%s, 1, 1, 'ORANGE', 'HEAVY_RAINFALL,FLOOD_RISK,EXTREME_HEAT,THUNDERSTORM_LIGHTNING,STRONG_WINDS')
                """ if is_mysql else """
                INSERT INTO user_notification_preferences (user_id, push_enabled, email_enabled, min_severity, hazard_types)
                VALUES (?, 1, 1, 'ORANGE', 'HEAVY_RAINFALL,FLOOD_RISK,EXTREME_HEAT,THUNDERSTORM_LIGHTNING,STRONG_WINDS')
                """
            )
            try:
                cursor.execute(sql_pref, (user_id,))
                conn.commit()
            except Exception:
                pass

            return {
                "status": "success",
                "message": "Account created successfully.",
                "user": {
                    "id": user_id,
                    "full_name": full_name,
                    "email": email,
                    "role": role,
                    "primary_district": primary_district,
                    "locality": locality,
                }
            }

        except Exception as ex:
            logger.error(f"User registration error: {ex}")
            return {"status": "error", "message": f"Database error: {str(ex)}"}
        finally:
            if hasattr(cursor, "close"):
                cursor.close()
            if hasattr(conn, "close"):
                conn.close()

    def authenticate_user(
        self,
        email: str,
        password: str,
        ip_address: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Authenticate user credentials with rate limit defense and audit logging."""
        email = str(email).strip().lower()
        now = time.time()

        # Check rate limit
        rate_key = f"{ip_address or '0.0.0.0'}_{email}"
        recent_failures = [t for t in LOGIN_ATTEMPTS.get(rate_key, []) if now - t < LOCKOUT_PERIOD_SEC]
        LOGIN_ATTEMPTS[rate_key] = recent_failures

        if len(recent_failures) >= MAX_FAILED_ATTEMPTS:
            remaining = int((LOCKOUT_PERIOD_SEC - (now - recent_failures[0])) / 60)
            return {
                "status": "error",
                "message": f"Account temporarily locked due to multiple failed login attempts. Please retry in {remaining} minutes.",
                "is_locked": True,
            }

        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()

        try:
            sql_find = "SELECT id, full_name, email, password_hash, role, primary_district, locality, is_active FROM users WHERE email = %s" if is_mysql else "SELECT id, full_name, email, password_hash, role, primary_district, locality, is_active FROM users WHERE email = ?"
            cursor.execute(sql_find, (email,))
            row = cursor.fetchone()

            if not row:
                LOGIN_ATTEMPTS.setdefault(rate_key, []).append(now)
                return {"status": "error", "message": "Invalid email address or password."}

            user_id, full_name, u_email, pw_hash, role, district, locality, is_active = row

            if not is_active:
                return {"status": "error", "message": "This account has been disabled by an administrator."}

            # Verify password
            if not check_password_hash(pw_hash, password):
                LOGIN_ATTEMPTS.setdefault(rate_key, []).append(now)
                return {"status": "error", "message": "Invalid email address or password."}

            # Clear failed login attempts on success
            if rate_key in LOGIN_ATTEMPTS:
                del LOGIN_ATTEMPTS[rate_key]

            # Create session payload
            session_token = secrets.token_hex(32)

            # Log login audit
            try:
                sql_audit = "INSERT INTO admin_audit_logs (admin_user, action, resource_type, resource_id, details, ip_address) VALUES (%s, 'USER_LOGIN', 'USER', %s, 'Successful authentication', %s)" if is_mysql else "INSERT INTO admin_audit_logs (admin_user, action, resource_type, resource_id, details, ip_address) VALUES (?, 'USER_LOGIN', 'USER', ?, 'Successful authentication', ?)"
                cursor.execute(sql_audit, (email, str(user_id), ip_address or "127.0.0.1"))
                conn.commit()
            except Exception:
                pass

            return {
                "status": "success",
                "message": "Login successful.",
                "token": session_token,
                "user": {
                    "id": user_id,
                    "full_name": full_name,
                    "email": u_email,
                    "role": role,
                    "primary_district": district,
                    "locality": locality,
                    "is_admin": role in ("ADMIN", "SUPER_ADMIN"),
                }
            }

        except Exception as ex:
            logger.error(f"Authentication error: {ex}")
            return {"status": "error", "message": f"Authentication system error: {str(ex)}"}
        finally:
            if hasattr(cursor, "close"):
                cursor.close()
            if hasattr(conn, "close"):
                conn.close()

    def get_user_profile(self, user_id: int) -> Optional[Dict[str, Any]]:
        """Fetch complete user profile and notification preferences."""
        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()

        try:
            sql_u = "SELECT id, full_name, email, mobile_number, role, primary_district, locality, created_at FROM users WHERE id = %s" if is_mysql else "SELECT id, full_name, email, mobile_number, role, primary_district, locality, created_at FROM users WHERE id = ?"
            cursor.execute(sql_u, (user_id,))
            u_row = cursor.fetchone()
            if not u_row:
                return None

            sql_pref = "SELECT push_enabled, email_enabled, sms_enabled, min_severity, hazard_types, quiet_hours_enabled FROM user_notification_preferences WHERE user_id = %s" if is_mysql else "SELECT push_enabled, email_enabled, sms_enabled, min_severity, hazard_types, quiet_hours_enabled FROM user_notification_preferences WHERE user_id = ?"
            cursor.execute(sql_pref, (user_id,))
            p_row = cursor.fetchone()

            prefs = {
                "push_enabled": bool(p_row[0]) if p_row else True,
                "email_enabled": bool(p_row[1]) if p_row else True,
                "sms_enabled": bool(p_row[2]) if p_row else False,
                "min_severity": p_row[3] if p_row else "ORANGE",
                "hazard_types": (p_row[4] if p_row else "HEAVY_RAINFALL,FLOOD_RISK,EXTREME_HEAT").split(","),
                "quiet_hours_enabled": bool(p_row[5]) if p_row else False,
            }

            return {
                "id": u_row[0],
                "full_name": u_row[1],
                "email": u_row[2],
                "mobile_number": u_row[3],
                "role": u_row[4],
                "primary_district": u_row[5],
                "locality": u_row[6],
                "created_at": str(u_row[7]),
                "is_admin": u_row[4] in ("ADMIN", "SUPER_ADMIN"),
                "preferences": prefs,
            }
        except Exception as ex:
            logger.error(f"Error fetching profile: {ex}")
            return None
        finally:
            if hasattr(cursor, "close"):
                cursor.close()
            if hasattr(conn, "close"):
                conn.close()

    def update_user_profile(
        self,
        user_id: int,
        full_name: str,
        mobile_number: Optional[str] = None,
        primary_district: str = "Bengaluru Urban",
        locality: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Update user profile metadata."""
        if primary_district not in DISTRICT_REGISTRY:
            primary_district = "Bengaluru Urban"

        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()

        try:
            sql_up = "UPDATE users SET full_name = %s, mobile_number = %s, primary_district = %s, locality = %s WHERE id = %s" if is_mysql else "UPDATE users SET full_name = ?, mobile_number = ?, primary_district = ?, locality = ? WHERE id = ?"
            cursor.execute(sql_up, (full_name, mobile_number or "", primary_district, locality or "", user_id))
            conn.commit()
            return {"status": "success", "message": "Profile updated successfully."}
        except Exception as ex:
            return {"status": "error", "message": str(ex)}
        finally:
            if hasattr(cursor, "close"):
                cursor.close()
            if hasattr(conn, "close"):
                conn.close()

    def update_notification_preferences(
        self,
        user_id: int,
        push_enabled: bool,
        email_enabled: bool,
        sms_enabled: bool,
        min_severity: str = "ORANGE",
        hazard_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Update user notification channels and severity threshold."""
        hazard_str = ",".join(hazard_types) if hazard_types else "HEAVY_RAINFALL,FLOOD_RISK,EXTREME_HEAT,THUNDERSTORM_LIGHTNING,STRONG_WINDS"
        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()

        try:
            sql_upsert = (
                """
                INSERT INTO user_notification_preferences (user_id, push_enabled, email_enabled, sms_enabled, min_severity, hazard_types)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE push_enabled=%s, email_enabled=%s, sms_enabled=%s, min_severity=%s, hazard_types=%s
                """ if is_mysql else """
                INSERT OR REPLACE INTO user_notification_preferences (user_id, push_enabled, email_enabled, sms_enabled, min_severity, hazard_types)
                VALUES (?, ?, ?, ?, ?, ?)
                """
            )
            if is_mysql:
                cursor.execute(sql_upsert, (
                    user_id, 1 if push_enabled else 0, 1 if email_enabled else 0, 1 if sms_enabled else 0, min_severity, hazard_str,
                    1 if push_enabled else 0, 1 if email_enabled else 0, 1 if sms_enabled else 0, min_severity, hazard_str
                ))
            else:
                cursor.execute(sql_upsert, (
                    user_id, 1 if push_enabled else 0, 1 if email_enabled else 0, 1 if sms_enabled else 0, min_severity, hazard_str
                ))
            conn.commit()
            return {"status": "success", "message": "Notification preferences saved."}
        except Exception as ex:
            return {"status": "error", "message": str(ex)}
        finally:
            if hasattr(cursor, "close"):
                cursor.close()
            if hasattr(conn, "close"):
                conn.close()

    def get_registered_users_stats(self) -> Dict[str, Any]:
        """Return total users count and district distribution for admin overview."""
        conn = get_db_connection()
        is_mysql = not hasattr(conn, "total_changes")
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT COUNT(*) FROM users")
            total = cursor.fetchone()[0]

            cursor.execute("SELECT primary_district, COUNT(*) FROM users GROUP BY primary_district ORDER BY COUNT(*) DESC LIMIT 10")
            dist_counts = {r[0]: r[1] for r in cursor.fetchall()}

            cursor.execute("SELECT COUNT(*) FROM push_subscriptions WHERE is_active = 1")
            push_subscribers = cursor.fetchone()[0]

            return {
                "total_users": total,
                "active_push_subscribers": push_subscribers,
                "top_districts": dist_counts,
            }
        except Exception as ex:
            logger.error(f"User stats error: {ex}")
            return {"total_users": 0, "active_push_subscribers": 0, "top_districts": {}}
        finally:
            if hasattr(cursor, "close"):
                cursor.close()
            if hasattr(conn, "close"):
                conn.close()

    def _ensure_default_accounts(self) -> None:
        """Ensure default administrator and emergency officer accounts exist."""
        try:
            # Create default admin if not exists
            self.register_user(
                full_name="State Disaster Management Administrator",
                email="admin@karnataka-emergency.gov.in",
                password="Admin@KCI2026!",
                mobile_number="9845012345",
                primary_district="Bengaluru Urban",
                locality="Vidhana Soudha / Disaster Management Cell",
                role="ADMIN",
            )
            # Create default citizen test account
            self.register_user(
                full_name="Citizen User (Bengaluru)",
                email="citizen@karnataka-emergency.gov.in",
                password="Citizen@KCI2026!",
                mobile_number="9845054321",
                primary_district="Bengaluru Urban",
                locality="Indiranagar",
                role="USER",
            )
        except Exception as ex:
            logger.debug(f"Default accounts notice: {ex}")


_AUTH_SERVICE: Optional[AuthService] = None


def get_auth_service() -> AuthService:
    global _AUTH_SERVICE
    if _AUTH_SERVICE is None:
        _AUTH_SERVICE = AuthService()
    return _AUTH_SERVICE
