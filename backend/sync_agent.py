"""Local sync agent: migrate dummy MediaSoft POS catalog into AI ERP & POS."""

from __future__ import annotations

import sys

import requests

API_BASE = "http://localhost:8000"
ADMIN_EMAIL = "admin@pluspoint.com"
ADMIN_PASSWORD = "123456"
TENANT_ID = 1
BRANCH_ID = 1

LEGACY_PRODUCTS = [
    {
        "name": "Oxford Cotton Shirt",
        "barcode": "MS-CLT-1001",
        "price": 1850.00,
        "stock_quantity": 24,
    },
    {
        "name": "Slim Fit Chino Trouser",
        "barcode": "MS-CLT-1002",
        "price": 2200.00,
        "stock_quantity": 18,
    },
    {
        "name": "Leather Belt - Brown",
        "barcode": "MS-CLT-1003",
        "price": 950.00,
        "stock_quantity": 40,
    },
    {
        "name": "Casual Crew Neck Tee",
        "barcode": "MS-CLT-1004",
        "price": 650.00,
        "stock_quantity": 55,
    },
]


def login() -> str:
    print(f"[auth] Signing in as {ADMIN_EMAIL}...")
    response = requests.post(
        f"{API_BASE}/login",
        data={"username": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=15,
    )
    if response.status_code != 200:
        detail = response.text
        print(f"[auth] Failed ({response.status_code}): {detail}")
        sys.exit(1)

    token = response.json().get("access_token")
    if not token:
        print("[auth] Login succeeded but no access_token was returned.")
        sys.exit(1)

    print("[auth] JWT received. Starting catalog sync.\n")
    return token


def sync_product(session: requests.Session, token: str, item: dict) -> None:
    name = item["name"]
    print(f"Syncing product {name} ({item['barcode']})...", end=" ", flush=True)
    response = session.post(
        f"{API_BASE}/products/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "tenant_id": TENANT_ID,
            "branch_id": BRANCH_ID,
            "is_active": True,
            "name": name,
            "barcode": item["barcode"],
            "price": item["price"],
            "stock_quantity": item["stock_quantity"],
        },
        timeout=15,
    )

    if response.status_code in (200, 201):
        created = response.json()
        print(f"Success! (id={created.get('id')})")
        return

    if response.status_code == 409:
        print("Skipped — barcode already exists.")
        return

    print(f"Failed ({response.status_code}): {response.text}")


def main() -> None:
    print("=" * 56)
    print("  AI ERP & POS  -  Local Sync Agent (MediaSoft)")
    print("=" * 56)
    print(f"Target API: {API_BASE}")
    print(f"Scope: tenant_id={TENANT_ID}, branch_id={BRANCH_ID}")
    print(f"Legacy items queued: {len(LEGACY_PRODUCTS)}\n")

    token = login()
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})

    for item in LEGACY_PRODUCTS:
        sync_product(session, token, item)

    print("\n[done] Synchronization finished.")


if __name__ == "__main__":
    main()
