import sys
import os
import json
import base64
sys.path.insert(0, 'backend')
from database.db import get_db_connection
from services.notification_service import get_notification_service
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

print("=== VERIFYING FAILURE HANDLING & MOBILE SUBSCRIPTION CLEANUP ===")

notif_svc = get_notification_service()
conn = get_db_connection()
cursor = conn.cursor(dictionary=True)

# Generate valid EC client keys for testing
client_key = ec.generate_private_key(ec.SECP256R1())
raw_client_pub = client_key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
b64_p256dh = base64.urlsafe_b64encode(raw_client_pub).rstrip(b'=').decode('utf-8')
b64_auth = base64.urlsafe_b64encode(b'16ByteSecretAuth').rstrip(b'=').decode('utf-8')

# Insert 3 test subscriptions:
# 1. Real Google FCM endpoint (will return 410 Gone because it is an unregistered/expired token)
# 2. Malformed/Invalid endpoint
# 3. Valid unrelated user subscription (must remain untouched!)
test_subs = [
    (951, "Bengaluru Urban", "https://fcm.googleapis.com/fcm/send/expired_fcm_token_951", b64_p256dh, b64_auth),
    (952, "Bengaluru Urban", "https://invalid-push-provider-domain-xyz123.org/endpoint", b64_p256dh, b64_auth),
    (953, "Mysuru", "https://valid.unrelated.user/endpoint", "dummy_key", "dummy_auth")
]

for uid, dist, endp, k, a in test_subs:
    cursor.execute("""
        INSERT INTO push_subscriptions (user_id, district, endpoint, p256dh_key, auth_token, is_active)
        VALUES (%s, %s, %s, %s, %s, 1)
        ON DUPLICATE KEY UPDATE is_active = 1
    """, (uid, dist, endp, k, a))
conn.commit()

# Test 1: Expired Subscription Deactivation
# When dispatching to Bengaluru Urban, FCM will respond with 410 Gone for user 951,
# triggering automatic deactivation (is_active = 0) without deleting the record or touching user 953!
print("\n1. Testing Expired Subscription Handling (HTTP 410 Gone)...")
res_dispatch = notif_svc.dispatch_emergency_broadcast({
    "district": "Bengaluru Urban",
    "alert_id": "WRN-EXPIRED-TEST-AUDIT",
    "severity": "CRITICAL ALERT",
    "title": "TEST MODE ALERT",
    "rationale": "Automated failure handling test",
    "is_test": True
})
print("Dispatch result:", res_dispatch.get("status"), "Delivered:", res_dispatch.get("delivered_count"), "Failed:", res_dispatch.get("failed_count"))

# Inspect MySQL push_subscriptions status for user 951 vs 953
cursor.execute("SELECT user_id, endpoint, is_active FROM push_subscriptions WHERE user_id IN (951, 952, 953)")
sub_states = {r["user_id"]: r["is_active"] for r in cursor.fetchall()}
print(f"Subscription active states: User 951 (Expired FCM)={sub_states.get(951)}, User 953 (Unrelated Mysuru)={sub_states.get(953)}")

assert sub_states.get(951) == 0, "Expired FCM subscription was NOT automatically deactivated (is_active should be 0)!"
assert sub_states.get(953) == 1, "Unrelated user subscription was inadvertently modified!"
print("-> Expired subscription auto-deactivation verified without damaging unrelated records.")

# Test 2: Invalid Subscription Registration Rejection
print("\n2. Testing Malformed Subscription Registration Rejection...")
res_invalid = notif_svc.register_push_subscription("", "", "")
print("Registration with empty endpoint:", res_invalid.get("status"), "| Message:", res_invalid.get("message"))
assert res_invalid.get("status") == "error", "Empty endpoint registration was not rejected!"

# Test 3: Revoked Permission Handling
print("\n3. Testing Revoked Notification Permission Handling...")
res_remove = notif_svc.remove_push_subscription("https://fcm.googleapis.com/fcm/send/expired_fcm_token_951")
print("Deactivate endpoint status:", res_remove.get("status"), "| Message:", res_remove.get("message"))
assert res_remove.get("status") == "success"

# Clean up test rows
cursor.execute("DELETE FROM push_subscriptions WHERE user_id >= 950")
cursor.execute("DELETE FROM notification_delivery_logs WHERE alert_id = 'WRN-EXPIRED-TEST-AUDIT'")
conn.commit()
cursor.close()
conn.close()

print("\nFailure Handling Tests Passed 100% Successfully.")
