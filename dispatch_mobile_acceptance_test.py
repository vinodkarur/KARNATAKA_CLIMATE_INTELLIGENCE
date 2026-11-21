"""Automated Dispatcher for Android Physical Device Web Push Acceptance Test."""

import sys
import json
import logging
from pathlib import Path

# Add project root and backend to path
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))
sys.path.insert(0, str(PROJECT_ROOT))

from database.db import get_db_connection
from services.notification_service import get_notification_service, VAPID_PEM_PATH, VAPID_PUBLIC_KEY, VAPID_CLAIMS_SUB
from pywebpush import webpush, WebPushException

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("android_push_test")

EXACT_REQUIRED_MESSAGE = "KARNATAKA CLIMATE INTELLIGENCE — TEST ALERT. This is a notification delivery test. No real emergency is occurring."

def inspect_subscriptions():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT id, user_id, district, endpoint, p256dh_key, auth_token, user_agent, is_active, subscribed_at, last_delivery_at
        FROM push_subscriptions
        ORDER BY id DESC
    """)
    rows = cursor.fetchall()
    cursor.close()
    conn.close()
    return rows

def dispatch_to_subscription(sub, alert_id="ALERT-TEST-ANDROID-001"):
    endpoint = sub["endpoint"]
    p256dh = sub.get("p256dh_key") or sub.get("p256dh")
    auth = sub.get("auth_token") or sub.get("auth")
    district = sub.get("district", "Vijayapura")
    
    payload = json.dumps({
        "title": "🚨 KARNATAKA CLIMATE INTELLIGENCE",
        "body": EXACT_REQUIRED_MESSAGE,
        "message": EXACT_REQUIRED_MESSAGE,
        "alert_id": alert_id,
        "district": district,
        "severity": "CRITICAL ALERT",
        "url": "/alerts",
        "is_test": True
    })

    print(f"\n--- DISPATCHING TO SUBSCRIPTION #{sub['id']} ---")
    print(f"Target District: {district}")
    print(f"User ID: {sub.get('user_id')}")
    print(f"User Agent: {sub.get('user_agent')}")
    # Never log full sensitive token/keys
    masked_endp = endpoint[:35] + "..." + endpoint[-10:] if len(endpoint) > 45 else endpoint
    print(f"Endpoint: {masked_endp}")
    print(f"Key Presence: p256dh={'PRESENT (' + str(len(p256dh)) + ' chars)' if p256dh else 'MISSING'}, auth={'PRESENT (' + str(len(auth)) + ' chars)' if auth else 'MISSING'}")
    print(f"Payload Message: {EXACT_REQUIRED_MESSAGE}")

    if not any(gw in endpoint for gw in ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"]):
        print("Note: Endpoint is a local browser/mock subscription.")
        return {"status": "STAGED_IN_APP", "code": 200, "message": "Staged in-app notification"}

    if not p256dh or not auth:
        print("ERROR: Missing cryptographic keys for Web Push encryption.")
        return {"status": "FAILED_MISSING_KEYS", "code": 400, "error": "Missing p256dh or auth token"}

    sub_info = {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth
        }
    }

    try:
        resp = webpush(
            subscription_info=sub_info,
            data=payload,
            vapid_private_key=str(VAPID_PEM_PATH),
            vapid_claims={"sub": VAPID_CLAIMS_SUB}
        )
        print(f"Provider HTTP Response Status: {resp.status_code}")
        print(f"Provider Acceptance Status: {'ACCEPTED (HTTP ' + str(resp.status_code) + ' Created)' if resp.status_code == 201 else 'CODE ' + str(resp.status_code)}")

        # Update last_delivery_at in database
        try:
            conn = get_db_connection()
            cur = conn.cursor()
            cur.execute("UPDATE push_subscriptions SET last_delivery_at = CURRENT_TIMESTAMP WHERE id = %s", (sub["id"],))
            cur.execute("""
                INSERT INTO notification_delivery_logs (alert_id, channel, district, total_recipients, delivered_count, failed_count, delivery_status, executed_by)
                VALUES (%s, 'web_push', %s, 1, 1, 0, 'DELIVERED', 'DISPATCHER_TEST')
            """, (alert_id, district))
            conn.commit()
            cur.close()
            conn.close()
        except Exception as db_err:
            print("DB log error:", db_err)

        return {"status": "PROVIDER_ACCEPTED", "code": resp.status_code, "body": resp.text}
    except WebPushException as wpe:
        code = getattr(getattr(wpe, "response", None), "status_code", None)
        text = getattr(getattr(wpe, "response", None), "text", str(wpe))
        print(f"Provider HTTP Response Status: {code}")
        print(f"Provider Response Details: {text}")
        return {"status": "PROVIDER_ERROR", "code": code, "error": text}
    except Exception as ex:
        print(f"Exception during dispatch: {ex}")
        return {"status": "FAILED", "code": 500, "error": str(ex)}
    except WebPushException as wpe:
        code = getattr(getattr(wpe, "response", None), "status_code", None)
        text = getattr(getattr(wpe, "response", None), "text", str(wpe))
        print(f"Provider HTTP Response Status: {code}")
        print(f"Provider Response Details: {text}")
        return {"status": "PROVIDER_ERROR", "code": code, "error": text}
    except Exception as ex:
        print(f"Exception during dispatch: {ex}")
        return {"status": "FAILED", "code": 500, "error": str(ex)}

def run_acceptance():
    print("=" * 70)
    print("KARNATAKA CLIMATE INTELLIGENCE — ANDROID ACCEPTANCE DISPATCHER")
    print(f"Active VAPID Public Key: {VAPID_PUBLIC_KEY}")
    print("=" * 70)
    
    subs = inspect_subscriptions()
    print(f"\nTotal subscriptions registered in MySQL: {len(subs)}")
    active_subs = [s for s in subs if s.get("is_active") == 1]
    print(f"Active subscriptions: {len(active_subs)}")

    android_subs = [
        s for s in active_subs 
        if "android" in (s.get("user_agent") or "").lower() 
        or "fcm.googleapis.com" in s.get("endpoint", "")
        or "mobile" in (s.get("user_agent") or "").lower()
    ]
    print(f"Android / FCM subscriptions: {len(android_subs)}")

    if not android_subs:
        print("\nNo physical Android device subscription is currently active in MySQL.")
        print("Latest 3 active subscriptions:")
        for s in active_subs[:3]:
            print(f"  ID={s['id']} User={s['user_id']} Dist={s['district']} Endp={s['endpoint'][:40]}... UA={s['user_agent'][:50] if s['user_agent'] else 'N/A'}")
        return None

    results = []
    for s in android_subs:
        res = dispatch_to_subscription(s)
        results.append((s, res))
    return results

if __name__ == "__main__":
    run_acceptance()
