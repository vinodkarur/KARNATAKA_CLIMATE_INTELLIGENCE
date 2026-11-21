import sys
import json
import urllib.request
import urllib.error

print("=== AUDIT 6: REGISTRATION, LOGIN, LOGOUT & PROTECTED ROUTES ===")

BASE_URL = "http://127.0.0.1:5000"

def post_json(url, payload):
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data_bytes, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())

def get_json(url):
    req = urllib.request.Request(url)
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read().decode())

# Step 1: Register new citizen
reg_payload = {
    "full_name": "Audit Citizen Test User",
    "email": "audit_citizen_2026@test.karnataka.gov.in",
    "password": "SecurePass@2026!",
    "confirm_password": "SecurePass@2026!",
    "primary_district": "Mysuru",
    "mobile_number": "+919876543210",
    "consent_given": True
}

print("1. Registering new citizen account...")
reg_res = post_json(f"{BASE_URL}/api/auth/register", reg_payload)
print(f"Registration status: {reg_res.get('status')} | User ID: {reg_res.get('user', {}).get('id')}")
assert reg_res.get("status") == "success"
user_id = reg_res.get("user", {}).get("id")

# Step 2: Attempt Login with wrong password (Security verification)
print("2. Testing invalid password rejection...")
try:
    post_json(f"{BASE_URL}/api/auth/login", {
        "email": "audit_citizen_2026@test.karnataka.gov.in",
        "password": "WrongPassword123"
    })
    assert False, "Login with wrong password should have been rejected!"
except urllib.error.HTTPError as ex:
    print(f"  -> Successfully rejected with HTTP {ex.code}: Unauthorized")
    assert ex.code == 401

# Step 3: Login with correct password
print("3. Logging in with correct credentials...")
login_res = post_json(f"{BASE_URL}/api/auth/login", {
    "email": "audit_citizen_2026@test.karnataka.gov.in",
    "password": "SecurePass@2026!"
})
print(f"Login result: {login_res.get('status')} | District: {login_res.get('user', {}).get('primary_district')} | Role: {login_res.get('user', {}).get('role')}")
assert login_res.get("status") == "success"

# Step 4: Verify Protected Profile Fetch
print("4. Accessing protected user profile...")
me_res = get_json(f"{BASE_URL}/api/auth/me?user_id={user_id}")
print(f"Profile access: {me_res.get('status')} | Name: {me_res.get('user', {}).get('full_name')}")
assert me_res.get("user", {}).get("email") == "audit_citizen_2026@test.karnataka.gov.in"

# Step 5: Test Logout
print("5. Executing logout...")
logout_res = post_json(f"{BASE_URL}/api/auth/logout", {})
print(f"Logout status: {logout_res.get('status')} | Msg: {logout_res.get('message')}")
assert logout_res.get("status") == "success"

# Step 6: Verify Unauthenticated Request Rejection
print("6. Verifying protected route access rejection without session/ID...")
try:
    get_json(f"{BASE_URL}/api/auth/me")
    assert False, "Accessing /api/auth/me without identification should have failed!"
except urllib.error.HTTPError as ex:
    print(f"  -> Successfully rejected with HTTP {ex.code}: Bad Request / Auth required")
    assert ex.code == 400

print("\nAudit 6 Completed Successfully.")
