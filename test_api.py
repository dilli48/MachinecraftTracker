import os
os.environ["DATABASE_URL"] = "sqlite:///./ci_test.db"

import unittest
from fastapi.testclient import TestClient
from main import app

class MachinecraftTrackerApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()
        login_res = cls.client.post("/api/auth/login", json={"username": "mctracker", "password": "2008batch"})
        if login_res.status_code == 200:
            cls.token = login_res.json().get("access_token")
            cls.headers = {"Authorization": f"Bearer {cls.token}"}
        else:
            cls.token = None
            cls.headers = {}

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

    def test_01_health_endpoint(self):
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200, f"Health check failed: {res.text}")
        self.assertEqual(res.json().get("status"), "ok")

    def test_02_login_and_auth_me(self):
        login_res = self.client.post("/api/auth/login", json={"username": "mctracker", "password": "2008batch"})
        self.assertEqual(login_res.status_code, 200, f"Login failed: {login_res.text}")
        token_data = login_res.json()
        self.assertIn("access_token", token_data)
        
        headers = {"Authorization": f"Bearer {token_data['access_token']}"}
        me_res = self.client.get("/api/auth/me", headers=headers)
        self.assertEqual(me_res.status_code, 200, f"Auth me check failed: {me_res.text}")
        self.assertEqual(me_res.json().get("username"), "mctracker")

    def test_03_component_creation_and_list(self):
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
            }
        ]

        for comp in components_to_create:
            res = self.client.post("/api/components", json=comp, headers=self.headers)
            self.assertIn(res.status_code, [200, 201, 400])

        res = self.client.get("/api/components", headers=self.headers)
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_04_user_management(self):
        new_user = {
            "username": "test_operator",
            "password": "password123",
            "role": "operator",
            "email": "operator@machinecraft.com"
        }
        res = self.client.post("/api/auth/users", json=new_user, headers=self.headers)
        self.assertIn(res.status_code, [200, 201, 400])

        res_list = self.client.get("/api/auth/users", headers=self.headers)
        self.assertEqual(res_list.status_code, 200)

    def test_05_board_creation_update_delete(self):
        # 1. Create board without production_line_category
        board_data = {"name": "Test Unassigned Board", "production_line_category": None}
        create_res = self.client.post("/api/boards", json=board_data, headers=self.headers)
        self.assertIn(create_res.status_code, [200, 201])
        board_id = create_res.json()["id"]
        self.assertIsNone(create_res.json()["production_line_category"])

        # 2. Update board with category
        update_data = {"name": "Test Unassigned Board", "production_line_category": "MACHINECRAFT JACQUARD"}
        update_res = self.client.put(f"/api/boards/{board_id}", json=update_data, headers=self.headers)
        self.assertEqual(update_res.status_code, 200)
        self.assertEqual(update_res.json()["production_line_category"], "MACHINECRAFT JACQUARD")

        # 3. Delete board
        delete_res = self.client.delete(f"/api/boards/{board_id}", headers=self.headers)
        self.assertEqual(delete_res.status_code, 204)

    def test_06_docs_protection(self):
        # 1. Unauthenticated request to /docs should return 401
        unauth_res = self.client.get("/docs")
        self.assertEqual(unauth_res.status_code, 401)

        # 2. Authenticated request to /docs with basic auth should return 200
        auth_res = self.client.get("/docs", auth=("mctracker", "2008batch"))
        self.assertEqual(auth_res.status_code, 200)

if __name__ == "__main__":
    unittest.main()
