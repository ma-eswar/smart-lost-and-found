import sqlite3
import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from app.config import DB_DIR

DB_PATH = DB_DIR / "lost_and_found.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    return conn

def ensure_column_exists(cursor, table: str, column: str, col_type: str):
    cursor.execute(f"PRAGMA table_info({table})")
    columns = [row[1] for row in cursor.fetchall()]
    if column not in columns:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. users
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL
    )
    """)

    # 2. lost_items
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS lost_items (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        product_name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        reference_photos TEXT NOT NULL DEFAULT '[]',
        secret_points TEXT NOT NULL DEFAULT '[]',
        reward_amount REAL NOT NULL DEFAULT 0.0,
        reward_currency TEXT NOT NULL DEFAULT 'INR',
        escrow_status TEXT NOT NULL DEFAULT 'PLEDGED',
        owner_name TEXT NOT NULL,
        owner_phone TEXT NOT NULL,
        owner_phone_verified INTEGER NOT NULL DEFAULT 1,
        backup_contact TEXT NOT NULL,
        owner_email TEXT NOT NULL,
        residential_address TEXT NOT NULL,
        govt_id_hash TEXT NOT NULL,
        govt_id_last4 TEXT NOT NULL,
        last_seen_location TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        last_seen_time TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'REPORTED',
        access_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
    )
    """)

    # 3. found_items
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS found_items (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        submission_type TEXT NOT NULL,
        desk_id TEXT,
        desk_intake_receipt_id TEXT,
        object_name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        primary_photo TEXT NOT NULL,
        additional_photos TEXT NOT NULL DEFAULT '[]',
        found_location TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        found_time TEXT NOT NULL,
        pickup_availability TEXT NOT NULL,
        finder_name TEXT NOT NULL,
        finder_phone TEXT NOT NULL,
        finder_phone_verified INTEGER NOT NULL DEFAULT 1,
        finder_email TEXT NOT NULL,
        finder_upi_id TEXT NOT NULL,
        finder_roll_or_id TEXT,
        is_verified_samaritan INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'INTAKE_RECEIVED',
        access_token TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (desk_id) REFERENCES verified_desks(id)
    )
    """)

    ensure_column_exists(cursor, "lost_items", "user_id", "TEXT")
    ensure_column_exists(cursor, "found_items", "user_id", "TEXT")
    ensure_column_exists(cursor, "lost_items", "is_archived", "INTEGER NOT NULL DEFAULT 0")
    ensure_column_exists(cursor, "found_items", "is_archived", "INTEGER NOT NULL DEFAULT 0")

    # 4. verified_desks
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS verified_desks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        building_or_zone TEXT NOT NULL,
        address TEXT NOT NULL,
        operating_hours TEXT NOT NULL,
        officer_on_duty TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
    )
    """)

    # 5. otp_verifications
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS otp_verifications (
        phone TEXT PRIMARY KEY,
        otp_code TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        is_verified INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    )
    """)

    # 6. escrow_records
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS escrow_records (
        id TEXT PRIMARY KEY,
        lost_item_id TEXT NOT NULL,
        found_item_id TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        status TEXT NOT NULL DEFAULT 'PLEDGED',
        payer_name TEXT NOT NULL,
        payer_phone TEXT NOT NULL,
        recipient_upi TEXT,
        transaction_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lost_item_id) REFERENCES lost_items(id),
        FOREIGN KEY (found_item_id) REFERENCES found_items(id)
    )
    """)

    # 7. match_evaluations
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS match_evaluations (
        id TEXT PRIMARY KEY,
        lost_item_id TEXT NOT NULL,
        found_item_id TEXT NOT NULL,
        text_score REAL NOT NULL,
        distance_km REAL NOT NULL,
        distance_score REAL NOT NULL,
        time_delta_hours REAL NOT NULL,
        time_decay_score REAL NOT NULL,
        spatio_temporal_score REAL NOT NULL,
        visual_score REAL NOT NULL,
        visual_details TEXT NOT NULL DEFAULT '{}',
        composite_score REAL NOT NULL,
        rank INTEGER NOT NULL DEFAULT 1,
        verification_status TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
        admin_decision TEXT NOT NULL DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lost_item_id) REFERENCES lost_items(id),
        FOREIGN KEY (found_item_id) REFERENCES found_items(id)
    )
    """)

    # 8. verification_probes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS verification_probes (
        id TEXT PRIMARY KEY,
        lost_item_id TEXT NOT NULL,
        found_item_id TEXT NOT NULL,
        secret_point_index INTEGER NOT NULL DEFAULT 0,
        secret_point_text TEXT NOT NULL,
        neutral_prompt TEXT NOT NULL,
        target_area TEXT NOT NULL,
        finder_response_photo TEXT,
        finder_notes TEXT,
        agent_verification_score REAL,
        agent_analysis_reasoning TEXT,
        probe_status TEXT NOT NULL DEFAULT 'PENDING_RESPONSE',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (lost_item_id) REFERENCES lost_items(id),
        FOREIGN KEY (found_item_id) REFERENCES found_items(id)
    )
    """)

    # 9. release_authorizations (dynamic 6-digit physical handover passcodes)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS release_authorizations (
        id TEXT PRIMARY KEY,
        lost_item_id TEXT NOT NULL,
        found_item_id TEXT NOT NULL,
        evaluation_id TEXT,
        owner_phone TEXT NOT NULL,
        owner_name TEXT NOT NULL,
        authorized_admin_pin TEXT NOT NULL,
        passcode TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        is_used INTEGER NOT NULL DEFAULT 0,
        used_at TEXT,
        used_by_desk_id TEXT,
        used_by_officer TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (lost_item_id) REFERENCES lost_items(id),
        FOREIGN KEY (found_item_id) REFERENCES found_items(id)
    )
    """)

    # 11. notifications
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        phone TEXT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_url TEXT,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
    )
    """)


    # Populate default verified desks if empty
    cursor.execute("SELECT COUNT(*) FROM verified_desks")
    if cursor.fetchone()[0] == 0:
        default_desks = [
            (
                "DESK-MAIN-01",
                "Campus Main Gate Security Desk",
                "Gate 1 - North Entrance",
                "Main Administrative Gate, North Campus",
                "24x7 Active Duty",
                "Officer Rajesh Kumar",
                "+91 98765 43210",
                12.9716,
                77.5946,
                1
            ),
            (
                "DESK-LIB-02",
                "Central Library Circulation Desk",
                "Ground Floor, Library Block",
                "East Wing, Academic Boulevard",
                "08:00 AM - 10:00 PM",
                "Officer Sunita Verma",
                "+91 98765 43211",
                12.9725,
                77.5958,
                1
            ),
            (
                "DESK-TECH-03",
                "Student Tech Hub Desk",
                "Block C, Student Union Center",
                "Student Hub Plaza, Central Quad",
                "09:00 AM - 08:00 PM",
                "Officer Anand Mohan",
                "+91 98765 43212",
                12.9702,
                77.5935,
                1
            ),
            (
                "DESK-METRO-04",
                "Metro Station Master Office",
                "Concourse Level, Exit Gate 2",
                "Station Concourse, Central Line",
                "06:00 AM - 11:30 PM",
                "Officer Pradeep Sen",
                "+91 98765 43213",
                12.9750,
                77.5980,
                1
            )
        ]
        cursor.executemany("""
        INSERT INTO verified_desks (id, name, building_or_zone, address, operating_hours, officer_on_duty, contact_phone, latitude, longitude, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, default_desks)

    # Ensure schema migrations / dynamic columns
    ensure_column_exists(cursor, "lost_items", "user_id", "TEXT")
    ensure_column_exists(cursor, "found_items", "user_id", "TEXT")
    ensure_column_exists(cursor, "lost_items", "is_archived", "INTEGER NOT NULL DEFAULT 0")
    ensure_column_exists(cursor, "found_items", "is_archived", "INTEGER NOT NULL DEFAULT 0")
    ensure_column_exists(cursor, "lost_items", "archived_at", "TEXT")
    ensure_column_exists(cursor, "found_items", "archived_at", "TEXT")

    conn.commit()
    conn.close()


# SVG data URLs for realistic item visualizations
DEMO_MACBOOK_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%231e293b'/><rect x='100' y='60' width='400' height='240' rx='16' fill='%23334155' stroke='%2364748b' stroke-width='4'/><rect x='120' y='80' width='360' height='200' rx='8' fill='%230f172a'/><circle cx='300' cy='180' r='24' fill='%2394a3b8' opacity='0.8'/><path d='M70 300 L530 300 L510 320 L90 320 Z' fill='%23475569'/><rect x='260' y='300' width='80' height='8' rx='4' fill='%231e293b'/><text x='300' y='360' font-family='sans-serif' font-size='16' font-weight='bold' fill='%23cbd5e1' text-anchor='middle'>Apple MacBook Pro 14 M2 (Space Gray)</text></svg>"
DEMO_FOUND_MACBOOK_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%230f172a'/><rect x='110' y='70' width='380' height='230' rx='14' fill='%2327272a' stroke='%2352525b' stroke-width='3'/><path d='M80 300 L520 300 L500 325 L100 325 Z' fill='%233f3f46'/><circle cx='300' cy='185' r='22' fill='%2371717a' opacity='0.7'/><text x='300' y='360' font-family='sans-serif' font-size='16' font-weight='bold' fill='%23a1a1aa' text-anchor='middle'>MacBook Laptop in Dark Protective Cover</text></svg>"

DEMO_WALLET_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%23292524'/><rect x='140' y='90' width='320' height='220' rx='12' fill='%2378350f' stroke='%2392400e' stroke-width='4'/><path d='M140 180 L460 180' stroke='%23b45309' stroke-width='3' stroke-dasharray='6,6'/><rect x='380' y='160' width='60' height='40' rx='6' fill='%23d97706'/><circle cx='410' cy='180' r='6' fill='%23fef3c7'/><text x='300' y='360' font-family='sans-serif' font-size='16' font-weight='bold' fill='%23fde68a' text-anchor='middle'>Tommy Hilfiger Brown Leather Bi-Fold Wallet</text></svg>"
DEMO_FOUND_WALLET_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%231c1917'/><rect x='150' y='100' width='300' height='200' rx='10' fill='%23573010' stroke='%2378350f' stroke-width='3'/><rect x='370' y='170' width='50' height='36' rx='4' fill='%23b45309'/><text x='300' y='360' font-family='sans-serif' font-size='15' font-weight='bold' fill='%23e7e5e4' text-anchor='middle'>Found Tan Leather Wallet with Cards</text></svg>"

DEMO_HEADPHONES_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%230f172a'/><path d='M200 220 C200 130 400 130 400 220' stroke='%2394a3b8' stroke-width='16' fill='none'/><rect x='170' y='200' width='50' height='90' rx='24' fill='%23cbd5e1'/><rect x='380' y='200' width='50' height='90' rx='24' fill='%23cbd5e1'/><text x='300' y='360' font-family='sans-serif' font-size='16' font-weight='bold' fill='%23e2e8f0' text-anchor='middle'>Sony WH-1000XM5 Wireless Headphones (Silver)</text></svg>"
DEMO_FOUND_HEADPHONES_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%231e293b'/><path d='M210 220 C210 140 390 140 390 220' stroke='%2364748b' stroke-width='14' fill='none'/><rect x='180' y='205' width='46' height='80' rx='20' fill='%2394a3b8'/><rect x='374' y='205' width='46' height='80' rx='20' fill='%2394a3b8'/><text x='300' y='360' font-family='sans-serif' font-size='15' font-weight='bold' fill='%23cbd5e1' text-anchor='middle'>Found Silver Noise-Cancelling Headphones in Case</text></svg>"

DEMO_BACKPACK_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%2309090b'/><path d='M200 130 C200 80 400 80 400 130 L430 330 L170 330 Z' fill='%2327272a' stroke='%233f3f46' stroke-width='4'/><rect x='230' y='200' width='140' height='100' rx='10' fill='%2318181b'/><rect x='285' y='140' width='30' height='20' fill='%23ef4444' rx='2'/><text x='300' y='360' font-family='sans-serif' font-size='15' font-weight='bold' fill='%23a1a1aa' text-anchor='middle'>Black SwissGear College Backpack</text></svg>"
DEMO_BOTTLE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%231e293b'/><rect x='250' y='70' width='100' height='40' rx='8' fill='%2394a3b8'/><rect x='230' y='110' width='140' height='210' rx='18' fill='%23cbd5e1' stroke='%23e2e8f0' stroke-width='3'/><line x1='230' y1='180' x2='370' y2='180' stroke='%2394a3b8' stroke-width='2'/><text x='300' y='360' font-family='sans-serif' font-size='16' font-weight='bold' fill='%2394a3b8' text-anchor='middle'>Silver Insulated Water Bottle</text></svg>"


def seed_demo_dataset():
    """
    Seeds a rich, realistic multi-category demo dataset without duplicates:
    1. Lost Laptop (MacBook Pro 14 M2) + Matching Found Laptop
    2. Lost Wallet (Tommy Hilfiger Bi-Fold) + Matching Found Wallet
    3. Lost Headphones (Sony WH-1000XM5) + Matching Found Headphones
    4. Unclaimed Backpack (SwissGear) & Decoy Water Bottle
    """
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    now = datetime.now()
    now_str = now.isoformat()
    t_minus_3h = (now - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S")
    t_minus_2h = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S")
    t_minus_1h = (now - timedelta(hours=1, minutes=20)).strftime("%Y-%m-%dT%H:%M:%S")
    t_minus_4h = (now - timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%S")

    # Clean existing demo records to ensure zero duplicates
    cursor.execute("DELETE FROM verification_probes WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%' OR found_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM match_evaluations WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%' OR found_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM escrow_records WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM release_authorizations WHERE id LIKE '%DEMO%' OR lost_item_id LIKE '%DEMO%'")
    cursor.execute("DELETE FROM lost_items WHERE id LIKE '%DEMO%' OR user_id LIKE 'USER-DEMO%'")
    cursor.execute("DELETE FROM found_items WHERE id LIKE '%DEMO%' OR user_id LIKE 'USER-DEMO%'")
    cursor.execute("DELETE FROM notifications WHERE user_id LIKE 'USER-DEMO%'")
    cursor.execute("DELETE FROM users WHERE id LIKE 'USER-DEMO%'")

    # 1. Users
    users_data = [
        ("USER-DEMO-AARAV", "Aarav Sharma", "aarav.sharma@campus.edu", "+91 98765 43210"),
        ("USER-DEMO-PRIYA", "Priya Patel", "priya.patel@campus.edu", "+91 98765 11223"),
        ("USER-DEMO-ROHAN", "Rohan Varma", "rohan.varma@campus.edu", "+91 98765 55443"),
        ("USER-DEMO-RAHUL", "Rahul Verma", "rahul.verma@campus.edu", "+91 91234 56789"),
        ("USER-DEMO-VIKRAM", "Vikram Rao", "vikram.rao@campus.edu", "+91 91234 88776"),
        ("USER-DEMO-ANANYA", "Ananya Sen", "ananya.sen@campus.edu", "+91 91234 33221")
    ]
    for uid, name, email, phone in users_data:
        cursor.execute("""
        INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at)
        VALUES (?, ?, ?, ?, 'pbkdf2_sha256$demosalt$d04130be7f4bfbbfda96426d1db3ebfa556a3e14fb61eb6194b0593c66bf9b8f', 'user', ?)
        """, (uid, name, email, phone, now_str))

    # 2. Lost Item 1: MacBook Pro
    cursor.execute("""
    INSERT INTO lost_items (
        id, user_id, product_name, category, description, reference_photos,
        secret_points, reward_amount, reward_currency, escrow_status,
        owner_name, owner_phone, owner_phone_verified, backup_contact,
        owner_email, residential_address, govt_id_hash, govt_id_last4,
        last_seen_location, latitude, longitude, last_seen_time,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-LOST-MACBOOK', 'USER-DEMO-AARAV', 'Apple MacBook Pro 14 M2 Space Gray', 'Electronics',
        'Space Gray 14-inch MacBook Pro M2 with matte screen and faint hairline markings on casing.',
        ?, ?, 2000.0, 'INR', 'PLEDGED', 'Aarav Sharma', '+91 98765 43210', 1,
        '+91 98765 00000 (Rohan - Roommate)', 'aarav.sharma@campus.edu', 'Hostel Block C, Room 412',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '8891',
        'Central Library 2nd Floor, Table 14', 12.9725, 77.5958, ?, 'REPORTED',
        'TOKEN-DEMO-LOST-AARAV', ?, ?
    )
    """, (
        json.dumps([DEMO_MACBOOK_PHOTO]),
        json.dumps([{"point": "Small hairline crack on the right hinge directly next to the power button", "photo_url": None}]),
        t_minus_3h, now_str, now_str
    ))

    # 3. Found Item 1: MacBook Pro Match
    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-FND-LAPTOP-MATCH', 'USER-DEMO-RAHUL', 'VERIFIED_DESK', 'DESK-LIB-02', 'RCPT-LIB-8801',
        'Apple MacBook Laptop in Dark Cover', 'Electronics',
        'Dark cover space gray Apple laptop found left on library study desk near east wing window.',
        ?, '[]', 'Library Study Section (50m from 2nd floor)', 12.9726, 77.5959, ?,
        'Safely Deposited at Central Library Circulation Desk (DESK-LIB-02)',
        'Rahul Verma', '+91 91234 56789', 1, 'rahul.verma@campus.edu', 'rahul@okaxis', '2024CS042', 1,
        'INTAKE_RECEIVED', 'TOKEN-DEMO-FND-RAHUL', ?, ?
    )
    """, (DEMO_FOUND_MACBOOK_PHOTO, t_minus_1h, now_str, now_str))

    # 4. Lost Item 2: Leather Wallet
    cursor.execute("""
    INSERT INTO lost_items (
        id, user_id, product_name, category, description, reference_photos,
        secret_points, reward_amount, reward_currency, escrow_status,
        owner_name, owner_phone, owner_phone_verified, backup_contact,
        owner_email, residential_address, govt_id_hash, govt_id_last4,
        last_seen_location, latitude, longitude, last_seen_time,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-LOST-WALLET', 'USER-DEMO-PRIYA', 'Tommy Hilfiger Brown Leather Bi-Fold Wallet', 'Wallets & Cards',
        'Classic tan brown genuine leather wallet with metal brand emblem and multiple card dividers.',
        ?, ?, 500.0, 'INR', 'PLEDGED', 'Priya Patel', '+91 98765 11223', 1,
        '+91 98765 99887 (Kavita - Sister)', 'priya.patel@campus.edu', 'Girls Hostel Block B, Room 204',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '3341',
        'Main Campus Cafeteria, Counter 2', 12.9719, 77.5942, ?, 'REPORTED',
        'TOKEN-DEMO-LOST-PRIYA', ?, ?
    )
    """, (
        json.dumps([DEMO_WALLET_PHOTO]),
        json.dumps([{"point": "Diagonal scissor cut on top-right corner of college gym ID inside mesh slot", "photo_url": None}]),
        t_minus_2h, now_str, now_str
    ))

    # 5. Found Item 2: Leather Wallet Match
    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-FND-WALLET-MATCH', 'USER-DEMO-VIKRAM', 'VERIFIED_DESK', 'DESK-SEC-01', 'RCPT-SEC-4412',
        'Tan Brown Leather Bi-Fold Wallet', 'Wallets & Cards',
        'Found on table at cafeteria dining area containing several student cards.',
        ?, '[]', 'Campus Dining Hall table 8', 12.9720, 77.5943, ?,
        'Deposited at Main Gate Security Desk (DESK-SEC-01)',
        'Vikram Rao', '+91 91234 88776', 1, 'vikram.rao@campus.edu', 'vikram@okhdfcbank', '2023EE088', 1,
        'INTAKE_RECEIVED', 'TOKEN-DEMO-FND-VIKRAM', ?, ?
    )
    """, (DEMO_FOUND_WALLET_PHOTO, t_minus_1h, now_str, now_str))

    # 6. Lost Item 3: Sony Headphones
    cursor.execute("""
    INSERT INTO lost_items (
        id, user_id, product_name, category, description, reference_photos,
        secret_points, reward_amount, reward_currency, escrow_status,
        owner_name, owner_phone, owner_phone_verified, backup_contact,
        owner_email, residential_address, govt_id_hash, govt_id_last4,
        last_seen_location, latitude, longitude, last_seen_time,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-LOST-HEADPHONES', 'USER-DEMO-ROHAN', 'Sony WH-1000XM5 Wireless Headphones (Silver)', 'Electronics',
        'Silver platinum over-ear headphones with active noise cancellation in grey hard case.',
        ?, ?, 1500.0, 'INR', 'PLEDGED', 'Rohan Varma', '+91 98765 55443', 1,
        '+91 98765 12345 (Aarav - Friend)', 'rohan.varma@campus.edu', 'Hostel Block A, Room 102',
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '9021',
        'Student Activity Center, Badminton Court', 12.9734, 77.5971, ?, 'REPORTED',
        'TOKEN-DEMO-LOST-ROHAN', ?, ?
    )
    """, (
        json.dumps([DEMO_HEADPHONES_PHOTO]),
        json.dumps([{"point": "Micro scratch on left volume swivel slider and initials R.V. marker inside headband", "photo_url": None}]),
        t_minus_4h, now_str, now_str
    ))

    # 7. Found Item 3: Sony Headphones Match
    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-FND-HEADPHONES-MATCH', 'USER-DEMO-ANANYA', 'VERIFIED_DESK', 'DESK-HUB-03', 'RCPT-HUB-1092',
        'Sony Platinum Noise-Cancelling Headphones', 'Electronics',
        'Over-ear premium silver wireless headphones inside grey protective zipper case.',
        ?, '[]', 'SAC Sports Building lounge seating', 12.9735, 77.5972, ?,
        'Deposited at Student Tech Hub Helpdesk (DESK-HUB-03)',
        'Ananya Sen', '+91 91234 33221', 1, 'ananya.sen@campus.edu', 'ananya@paytm', '2024CS115', 1,
        'INTAKE_RECEIVED', 'TOKEN-DEMO-FND-ANANYA', ?, ?
    )
    """, (DEMO_FOUND_HEADPHONES_PHOTO, t_minus_2h, now_str, now_str))

    # 8. Unclaimed Found Items: Backpack & Bottle
    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-FND-BACKPACK', NULL, 'VERIFIED_DESK', 'DESK-LIB-02', 'RCPT-LIB-8890',
        'Black SwissGear College Backpack', 'Bags & Backpacks',
        'Durable black laptop backpack left on 3rd row desk of Lecture Hall 3.',
        ?, '[]', 'Lecture Hall 3, Engineering Complex', 12.9740, 77.5960, ?,
        'Deposited at Central Library Circulation Desk (DESK-LIB-02)',
        'Sneha Reddy', '+91 97654 11220', 1, 'sneha.r@campus.edu', 'sneha@oksbi', '2024CS089', 1,
        'INTAKE_RECEIVED', 'TOKEN-DEMO-FND-SNEHA', ?, ?
    )
    """, (DEMO_BACKPACK_PHOTO, t_minus_3h, now_str, now_str))

    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        'DEMO-FND-BOTTLE-DECOY', NULL, 'DIRECT_CUSTODY', NULL, NULL,
        'Silver Insulated Water Bottle', 'Other',
        'Stainless steel vacuum flask with black screw top lid found at sports pavilion.',
        ?, '[]', 'Sports Complex Pavilion', 12.9900, 77.6200, ?,
        'Available with finder on campus',
        'Amit Kumar', '+91 97654 32109', 1, 'amit.k@campus.edu', 'amit@oksbi', '2023ME119', 0,
        'IN_CUSTODY', 'TOKEN-DEMO-FND-AMIT', ?, ?
    )
    """, (DEMO_BOTTLE_PHOTO, t_minus_4h, now_str, now_str))

    # 9. Escrow Records for Pledged Rewards
    cursor.execute("""
    INSERT INTO escrow_records (id, lost_item_id, found_item_id, amount, currency, status, payer_name, payer_phone, recipient_upi, transaction_ref, created_at, updated_at)
    VALUES
        ('ESC-DEMO-01', 'DEMO-LOST-MACBOOK', 'DEMO-FND-LAPTOP-MATCH', 2000.0, 'INR', 'PLEDGED', 'Aarav Sharma', '+91 98765 43210', NULL, 'TXN-UPI-DEMO-2000', ?, ?),
        ('ESC-DEMO-02', 'DEMO-LOST-WALLET', 'DEMO-FND-WALLET-MATCH', 500.0, 'INR', 'PLEDGED', 'Priya Patel', '+91 98765 11223', NULL, 'TXN-UPI-DEMO-500', ?, ?),
        ('ESC-DEMO-03', 'DEMO-LOST-HEADPHONES', 'DEMO-FND-HEADPHONES-MATCH', 1500.0, 'INR', 'PLEDGED', 'Rohan Varma', '+91 98765 55443', NULL, 'TXN-UPI-DEMO-1500', ?, ?)
    """, (now_str, now_str, now_str, now_str, now_str, now_str))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "Rich multi-category demo dataset seeded successfully without duplicates",
        "items_seeded": ["MacBook Pro 14", "Tommy Hilfiger Wallet", "Sony WH-1000XM5 Headphones", "SwissGear Backpack", "Water Bottle"]
    }

