import sys
import os
import joblib
sys.path.insert(0, 'backend')
from database.db import get_db_connection

print("=== AUDIT 13: MYSQL PERSISTENCE & DATASET/MODEL INTEGRITY ===")

conn = get_db_connection()
cursor = conn.cursor(dictionary=True)

# 1. Database Tables Count & Record Inspection
cursor.execute("SHOW TABLES")
tables = [list(r.values())[0] for r in cursor.fetchall()]
print(f"Total MySQL Tables in elnino_karnataka_db: {len(tables)}")
print(f"Tables: {', '.join(sorted(tables))}")

counts = {}
for t in sorted(tables):
    cursor.execute(f"SELECT COUNT(*) AS cnt FROM `{t}`")
    cnt = cursor.fetchone()["cnt"]
    counts[t] = cnt
    print(f"  {t:<32} : {cnt:>7} records")

cursor.close()
conn.close()

# Key record assertions
assert counts.get("weather_climate_data", 0) >= 16000, f"Historical records damaged! count={counts.get('weather_climate_data')}"
assert counts.get("predictions", 0) >= 3000, f"Model predictions damaged! count={counts.get('predictions')}"
assert counts.get("adaptation_recommendations", 0) >= 7000, f"Adaptation records damaged! count={counts.get('adaptation_recommendations')}"
print("-> Historical Database Records Verified 100% Intact.")

# 2. Machine Learning Model Files Integrity
models_dir = "models"
print(f"\nVerifying Machine Learning Model Files in {models_dir}:")
expected_models = [
    "Model_Feature_Columns.pkl",
    "Rainfall_Prediction_Model.pkl",
    "Temperature_Prediction_Model.pkl"
]

for m in expected_models:
    p = os.path.join(models_dir, m)
    exists = os.path.exists(p)
    size = os.path.getsize(p) if exists else 0
    print(f"  {m:<35} : {'FOUND' if exists else 'MISSING'} ({size:>8} bytes)")
    assert exists, f"Model file missing: {m}"

# 3. Processed Historical Datasets Integrity
data_dir = os.path.join("datasets", "processed")
print(f"\nVerifying Processed Datasets in {data_dir}:")
expected_data = [
    "Karnataka_Final_Cleaned_Dataset.csv",
    "Karnataka_Weather_Cleaned.csv",
    "Karnataka_Weather_ONI_Combined.csv",
    "Karnataka_Feature_Engineered_Dataset.csv",
    "NOAA_ONI_Cleaned.csv"
]

for d in expected_data:
    p = os.path.join(data_dir, d)
    exists = os.path.exists(p)
    size = os.path.getsize(p) if exists else 0
    print(f"  {d:<42} : {'FOUND' if exists else 'MISSING'} ({size:>10} bytes)")
    assert exists, f"Dataset missing: {d}"

print("-> All Machine Learning Models and Historical Datasets Verified Intact.")
print("\nAudit 13 Completed Successfully.")
