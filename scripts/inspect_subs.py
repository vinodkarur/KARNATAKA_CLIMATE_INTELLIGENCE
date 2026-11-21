from backend.database.db import get_db_connection

conn = get_db_connection()
cursor = conn.cursor(dictionary=True)
cursor.execute("SELECT id, user_id, district, endpoint, user_agent, is_active, subscribed_at FROM push_subscriptions ORDER BY id DESC")
rows = cursor.fetchall()
print(f"Total: {len(rows)}")
for r in rows:
    print(f"ID: {r['id']} | User: {r['user_id']} | District: {r['district']} | Active: {r['is_active']} | Time: {r['subscribed_at']}")
    print(f"  Endpoint: {r['endpoint'][:60]}")
    print(f"  User-Agent: {r['user_agent']}")
cursor.close()
conn.close()
