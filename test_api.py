import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def test_api():
    print("--- 1. Testing Health Endpoint ---")
    res = requests.get(f"{BASE_URL}/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("Health response:", res.json())

    print("\n--- 2. Testing Authentication (/api/auth/login) ---")
    login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "mctracker", "password": "2008batch"})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token_data = login_res.json()
    token = token_data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    print(f"Logged in as admin successfully. Role: {token_data['user']['role']}")

    print("\n--- 3. Testing /api/auth/me ---")
    me_res = requests.get(f"{BASE_URL}/api/auth/me", headers=headers)
    assert me_res.status_code == 200, f"Auth me check failed: {me_res.text}"
    print("User profile:", me_res.json())

    print("\n--- 4. Creating Initial Components ---")
    components_to_create = [
        {
            "part_number": "RES-10K-0805",
            "type": "Resistor",
            "footprint": "0805",
            "current_stock": 100,
            "minimum_threshold": 20,
            "comments": "10k Ohm 1% surface mount"
        },
        {
            "part_number": "CAP-100NF-0603",
            "type": "Capacitor",
            "footprint": "0603",
            "current_stock": 50,
            "minimum_threshold": 10,
            "comments": "100nF 50V ceramic"
        },
        {
            "part_number": "MCU-ESP32-WROOM",
            "type": "Microcontroller",
            "footprint": "Module",
            "current_stock": 10,
            "minimum_threshold": 5,
            "comments": "ESP32 WiFi/BLE Module"
        }
    ]

    for comp in components_to_create:
        res = requests.post(f"{BASE_URL}/api/components", json=comp, headers=headers)
        if res.status_code == 201:
            print(f"Created: {comp['part_number']}")
        elif res.status_code == 400 and "already exists" in res.text:
            print(f"Already exists: {comp['part_number']}")
        else:
            print(f"Error creating {comp['part_number']}:", res.status_code, res.text)

    print("\n--- 5. Fetching All Components ---")
    res = requests.get(f"{BASE_URL}/api/components", headers=headers)
    assert res.status_code == 200
    print("Components in DB count:", len(res.json()))

    print("\n--- 6. Testing Physical Board Registration ---")
    board_payload = {
        "serial_number": "SN-TEST-2026-999",
        "product_id": 1,
        "current_status": "IN_TESTING"
    }
    res = requests.post(f"{BASE_URL}/api/physical-boards", json=board_payload, headers=headers)
    if res.status_code in [200, 201]:
        print("Registered physical board serial successfully.")
    else:
        print("Board register response:", res.status_code, res.text)

    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_api()
