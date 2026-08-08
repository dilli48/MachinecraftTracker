import requests
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def test_api():
    print("--- 1. Testing Health Endpoint ---")
    res = requests.get(f"{BASE_URL}/health")
    assert res.status_code == 200, f"Health check failed: {res.text}"
    print("Health response:", res.json())

    print("\n--- 2. Creating Initial Components ---")
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
        res = requests.post(f"{BASE_URL}/api/components", json=comp)
        if res.status_code == 201:
            print(f"Created: {comp['part_number']}")
        elif res.status_code == 400 and "already exists" in res.text:
            print(f"Already exists: {comp['part_number']}")
        else:
            print(f"Error creating {comp['part_number']}:", res.status_code, res.text)

    print("\n--- 3. Fetching All Components ---")
    res = requests.get(f"{BASE_URL}/api/components")
    assert res.status_code == 200
    print("Components in DB:", json.dumps(res.json(), indent=2))

    print("\n--- 4. Logging Production Assembly (Deducting Stock) ---")
    prod_payload = {
        "assembly_name": "Main Control Board V1",
        "assembly_quantity": 5,
        "items": [
            {"part_number": "RES-10K-0805", "quantity_per_assembly": 4},
            {"part_number": "CAP-100NF-0603", "quantity_per_assembly": 2},
            {"part_number": "MCU-ESP32-WROOM", "quantity_per_assembly": 1}
        ],
        "operator_name": "SRIRAMSIR",
        "comments": "Batch #2026-A1"
    }
    res = requests.post(f"{BASE_URL}/api/production/update", json=prod_payload)
    print("Production update status:", res.status_code)
    print("Response:", json.dumps(res.json(), indent=2))
    assert res.status_code == 200

    print("\n--- 5. Checking Updated Stock Levels ---")
    res = requests.get(f"{BASE_URL}/api/components")
    comps_after = {c['part_number']: c['current_stock'] for c in res.json()}
    print("Stock levels after 5x assembly:", comps_after)
    # RES-10K: 100 - (5*4) = 80
    # CAP-100NF: 50 - (5*2) = 40
    # MCU-ESP32: 10 - (5*1) = 5
    assert comps_after["RES-10K-0805"] == 80
    assert comps_after["CAP-100NF-0603"] == 40
    assert comps_after["MCU-ESP32-WROOM"] == 5
    print("SUCCESS: Stock levels deducted accurately!")

    print("\n--- 6. Testing Insufficient Stock Error Handling ---")
    excessive_payload = {
        "assembly_name": "Main Control Board V1",
        "assembly_quantity": 100,  # Only 5 MCU-ESP32 left, so 100 will fail
        "items": [
            {"part_number": "MCU-ESP32-WROOM", "quantity_per_assembly": 1}
        ],
        "operator_name": "SRIRAMSIR"
    }
    res = requests.post(f"{BASE_URL}/api/production/update", json=excessive_payload)
    print("Status code for excessive request:", res.status_code)
    print("Error response:", json.dumps(res.json(), indent=2))
    assert res.status_code == 400
    print("SUCCESS: Insufficient stock rejected correctly!")

    print("\n--- 7. Fetching Production Logs ---")
    res = requests.get(f"{BASE_URL}/api/production/logs")
    assert res.status_code == 200
    print("Production Logs:", json.dumps(res.json(), indent=2))

    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_api()
