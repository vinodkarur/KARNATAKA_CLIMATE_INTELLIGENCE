import sys
sys.path.insert(0, 'backend')
from database.db import get_db_connection
from services.notification_service import get_notification_service

print("=== AUDIT 10: DISTRICT-BASED AFFECTED-USER SUBSCRIBER MATCHING ===")

conn = get_db_connection()
cursor = conn.cursor(dictionary=True)

# Register test push subscriptions for 4 distinct sectors
test_subs = [
    (901, "Bengaluru Urban", "https://fcm.googleapis.com/fcm/send/sub_bengaluru_01", "key1", "auth1"),
    (902, "Ballari", "https://fcm.googleapis.com/fcm/send/sub_ballari_01", "key2", "auth2"),
    (903, "Mysuru", "https://fcm.googleapis.com/fcm/send/sub_mysuru_01", "key3", "auth3"),
    (904, "Statewide", "https://fcm.googleapis.com/fcm/send/sub_statewide_01", "key4", "auth4"),
]

for uid, dist, endp, k, a in test_subs:
    cursor.execute("""
        INSERT INTO push_subscriptions (user_id, district, endpoint, p256dh_key, auth_token, is_active)
        VALUES (%s, %s, %s, %s, %s, 1)
        ON DUPLICATE KEY UPDATE district = VALUES(district), is_active = 1
    """, (uid, dist, endp, k, a))
conn.commit()

notif_svc = get_notification_service()

# Test 1: Query for Bengaluru Urban
subs_blr = notif_svc._get_affected_subscribers("Bengaluru Urban")
blr_endpoints = [s["endpoint"] for s in subs_blr]
print(f"Test 1 - Query 'Bengaluru Urban': Matched {len(subs_blr)} subscribers.")
assert "https://fcm.googleapis.com/fcm/send/sub_bengaluru_01" in blr_endpoints
assert "https://fcm.googleapis.com/fcm/send/sub_statewide_01" in blr_endpoints
assert "https://fcm.googleapis.com/fcm/send/sub_ballari_01" not in blr_endpoints
assert "https://fcm.googleapis.com/fcm/send/sub_mysuru_01" not in blr_endpoints
print("  -> PASSED: Bengaluru Urban + Statewide matched. Ballari and Mysuru properly isolated.")

# Test 2: Query for Ballari
subs_bal = notif_svc._get_affected_subscribers("Ballari")
bal_endpoints = [s["endpoint"] for s in subs_bal]
print(f"Test 2 - Query 'Ballari': Matched {len(subs_bal)} subscribers.")
assert "https://fcm.googleapis.com/fcm/send/sub_ballari_01" in bal_endpoints
assert "https://fcm.googleapis.com/fcm/send/sub_statewide_01" in bal_endpoints
assert "https://fcm.googleapis.com/fcm/send/sub_bengaluru_01" not in bal_endpoints
print("  -> PASSED: Ballari + Statewide matched. Bengaluru Urban properly isolated.")

# Test 3: Query Statewide
subs_all = notif_svc._get_affected_subscribers("Statewide")
all_endpoints = [s["endpoint"] for s in subs_all]
print(f"Test 3 - Query 'Statewide': Matched {len(subs_all)} subscribers.")
assert len(subs_all) >= 4
print("  -> PASSED: Statewide query matched all active sectors.")

# Clean up test subscriptions
cursor.execute("DELETE FROM push_subscriptions WHERE user_id >= 900")
conn.commit()
cursor.close()
conn.close()

print("\nAudit 10 Completed Successfully.")
