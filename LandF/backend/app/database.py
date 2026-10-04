import sqlite3
import os
import json
from pathlib import Path
from datetime import datetime, timedelta
from app.config import DB_DIR

DB_PATH = DB_DIR / "lost_and_found.db"

def get_db_connection():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
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

DEMO_BOTTLE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%231e293b'/><rect x='250' y='70' width='100' height='40' rx='8' fill='%2394a3b8'/><rect x='230' y='110' width='140' height='210' rx='18' fill='%23cbd5e1' stroke='%23e2e8f0' stroke-width='3'/><line x1='230' y1='180' x2='370' y2='180' stroke='%2394a3b8' stroke-width='2'/><text x='300' y='360' font-family='sans-serif' font-size='16' font-weight='bold' fill='%2394a3b8' text-anchor='middle'>Silver Insulated Water Bottle</text></svg>"

DEMO_HINGE_VERIFICATION_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='400' viewBox='0 0 600 400'><rect width='600' height='400' fill='%2318181b'/><rect x='50' y='120' width='500' height='160' rx='6' fill='%2327272a' stroke='%233f3f46' stroke-width='2'/><line x1='350' y1='120' x2='350' y2='280' stroke='%2352525b' stroke-width='8'/><circle cx='440' cy='160' r='14' fill='%2318181b' stroke='%2371717a' stroke-width='2'/><path d='M360 162 L390 178' stroke='%23ef4444' stroke-width='2' stroke-dasharray='2,2'/><text x='300' y='70' font-family='sans-serif' font-size='15' font-weight='bold' fill='%23f43f5e' text-anchor='middle'>Close-Up Inspection: Right Hinge & Power Button Zone</text><text x='400' y='210' font-family='sans-serif' font-size='13' fill='%23fbbf24'>Hairline crack detected at hinge</text></svg>"


def seed_demo_dataset():
    """
    Seeds a realistic 1-click end-to-end demo dataset:
    1. Lost Item: DEMO-LOST-MACBOOK (Aarav Sharma, Apple MacBook Pro 14 M2, ₹2,000 Escrow,
       Secret point: "Small hairline crack on the right hinge directly next to the power button", Lat: 12.9725, Lon: 77.5958).
    2. Matching Found Item: DEMO-FND-LAPTOP-MATCH (Rahul Verma, Apple MacBook Laptop in Dark Cover,
       50m away at Library Study Section, found 1.5h later, UPI: rahul@okaxis).
    3. Decoy Found Item: DEMO-FND-BOTTLE-DECOY (Silver Insulated Water Bottle, 3.5km away).
    4. Linked Escrow Record: ESC-DEMO-01 (₹2,000 PLEDGED).
    """
    init_db()
    conn = get_db_connection()
    cursor = conn.cursor()

    now = datetime.now()
    lost_time = (now - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%S")
    found_time = (now - timedelta(hours=1, minutes=30)).strftime("%Y-%m-%dT%H:%M:%S")
    decoy_time = (now - timedelta(hours=4)).strftime("%Y-%m-%dT%H:%M:%S")
    now_str = now.isoformat()

    # 1. Create or update demo owner user
    demo_user_id = "USER-DEMO-AARAV"
    cursor.execute("""
    INSERT INTO users (id, full_name, email, phone, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?, 'user', ?)
    ON CONFLICT(id) DO UPDATE SET
        full_name = excluded.full_name,
        email = excluded.email,
        phone = excluded.phone
    """, (
        demo_user_id,
        "Aarav Sharma",
        "aarav.sharma@campus.edu",
        "+91 98765 43210",
        "pbkdf2_sha256$demosalt$d04130be7f4bfbbfda96426d1db3ebfa556a3e14fb61eb6194b0593c66bf9b8f",
        now_str
    ))

    # 2. Lost Item: DEMO-LOST-MACBOOK
    lost_id = "DEMO-LOST-MACBOOK"
    secret_points = [
        {
            "point": "Small hairline crack on the right hinge directly next to the power button",
            "photo_url": None
        }
    ]
    ref_photos = [DEMO_MACBOOK_PHOTO]

    cursor.execute("""
    INSERT INTO lost_items (
        id, user_id, product_name, category, description, reference_photos,
        secret_points, reward_amount, reward_currency, escrow_status,
        owner_name, owner_phone, owner_phone_verified, backup_contact,
        owner_email, residential_address, govt_id_hash, govt_id_last4,
        last_seen_location, latitude, longitude, last_seen_time,
        status, access_token, created_at, updated_at
    ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, 'PLEDGED', ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        'REPORTED', 'TOKEN-DEMO-LOST-AARAV', ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
        product_name = excluded.product_name,
        category = excluded.category,
        description = excluded.description,
        reference_photos = excluded.reference_photos,
        secret_points = excluded.secret_points,
        reward_amount = excluded.reward_amount,
        reward_currency = excluded.reward_currency,
        escrow_status = 'PLEDGED',
        owner_name = excluded.owner_name,
        owner_phone = excluded.owner_phone,
        backup_contact = excluded.backup_contact,
        owner_email = excluded.owner_email,
        last_seen_location = excluded.last_seen_location,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        last_seen_time = excluded.last_seen_time,
        status = 'REPORTED',
        updated_at = excluded.updated_at
    """, (
        lost_id,
        demo_user_id,
        "Apple MacBook Pro 14 M2 Space Gray",
        "Electronics",
        "Space Gray 14-inch MacBook Pro M2 with matte screen and faint hairline markings on casing.",
        json.dumps(ref_photos),
        json.dumps(secret_points),
        2000.0,
        "INR",
        "Aarav Sharma",
        "+91 98765 43210",
        1,
        "+91 98765 00000 (Rohan - Roommate)",
        "aarav.sharma@campus.edu",
        "Hostel Block C, Room 412, North Campus",
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "8891",
        "Central Library 2nd Floor, Table 14",
        12.9725,
        77.5958,
        lost_time,
        now_str,
        now_str
    ))

    # 3. Matching Found Item: DEMO-FND-LAPTOP-MATCH
    fnd_match_id = "DEMO-FND-LAPTOP-MATCH"
    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        ?, NULL, 'VERIFIED_DESK', 'DESK-LIB-02', 'RCPT-LIB-8801',
        ?, ?, ?, ?, '[]',
        ?, ?, ?, ?,
        ?, ?, ?, 1,
        ?, ?, '2024CS042', 1,
        'INTAKE_RECEIVED', 'TOKEN-DEMO-FND-RAHUL', ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
        object_name = excluded.object_name,
        category = excluded.category,
        description = excluded.description,
        primary_photo = excluded.primary_photo,
        found_location = excluded.found_location,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        found_time = excluded.found_time,
        pickup_availability = excluded.pickup_availability,
        finder_name = excluded.finder_name,
        finder_phone = excluded.finder_phone,
        finder_email = excluded.finder_email,
        finder_upi_id = excluded.finder_upi_id,
        status = 'INTAKE_RECEIVED',
        updated_at = excluded.updated_at
    """, (
        fnd_match_id,
        "Apple MacBook Laptop in Dark Cover",
        "Electronics",
        "Dark cover space gray Apple laptop found left on library study desk near east wing window.",
        DEMO_FOUND_MACBOOK_PHOTO,
        "Library Study Section (50m from 2nd floor)",
        12.9726,
        77.5959,
        found_time,
        "Safely Deposited at Central Library Circulation Desk (DESK-LIB-02)",
        "Rahul Verma",
        "+91 91234 56789",
        "rahul.verma@campus.edu",
        "rahul@okaxis",
        now_str,
        now_str
    ))

    # 4. Decoy Item: DEMO-FND-BOTTLE-DECOY
    decoy_id = "DEMO-FND-BOTTLE-DECOY"
    cursor.execute("""
    INSERT INTO found_items (
        id, user_id, submission_type, desk_id, desk_intake_receipt_id,
        object_name, category, description, primary_photo, additional_photos,
        found_location, latitude, longitude, found_time,
        pickup_availability, finder_name, finder_phone, finder_phone_verified,
        finder_email, finder_upi_id, finder_roll_or_id, is_verified_samaritan,
        status, access_token, created_at, updated_at
    ) VALUES (
        ?, NULL, 'DIRECT_CUSTODY', NULL, NULL,
        ?, ?, ?, ?, '[]',
        ?, ?, ?, ?,
        ?, ?, ?, 1,
        ?, ?, '2023ME119', 0,
        'IN_CUSTODY', 'TOKEN-DEMO-FND-AMIT', ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
        object_name = excluded.object_name,
        category = excluded.category,
        description = excluded.description,
        primary_photo = excluded.primary_photo,
        found_location = excluded.found_location,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        found_time = excluded.found_time,
        pickup_availability = excluded.pickup_availability,
        finder_name = excluded.finder_name,
        finder_phone = excluded.finder_phone,
        finder_email = excluded.finder_email,
        finder_upi_id = excluded.finder_upi_id,
        status = 'IN_CUSTODY',
        updated_at = excluded.updated_at
    """, (
        decoy_id,
        "Silver Insulated Water Bottle",
        "Personal Accessories",
        "Stainless steel vacuum flask with black screw top lid.",
        DEMO_BOTTLE_PHOTO,
        "Sports Complex Pavilion (3.5km away)",
        12.9900,
        77.6200,
        decoy_time,
        "Available for handover at Student Tech Hub on weekdays",
        "Amit Kumar",
        "+91 97654 32109",
        "amit.k@campus.edu",
        "amit@oksbi",
        now_str,
        now_str
    ))

    # 5. Escrow Record: ESC-DEMO-01
    escrow_id = "ESC-DEMO-01"
    cursor.execute("""
    INSERT INTO escrow_records (
        id, lost_item_id, found_item_id, amount, currency, status,
        payer_name, payer_phone, recipient_upi, transaction_ref,
        created_at, updated_at
    ) VALUES (?, ?, ?, 2000.0, 'INR', 'PLEDGED', ?, ?, NULL, 'TXN-UPI-DEMO-2000', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
        amount = 2000.0,
        status = 'PLEDGED',
        updated_at = excluded.updated_at
    """, (
        escrow_id,
        lost_id,
        fnd_match_id,
        "Aarav Sharma",
        "+91 98765 43210",
        now_str,
        now_str
    ))

    # Remove any stale test evaluations for clean demo state
    cursor.execute("DELETE FROM match_evaluations WHERE lost_item_id = ?", (lost_id,))
    cursor.execute("DELETE FROM verification_probes WHERE lost_item_id = ?", (lost_id,))
    cursor.execute("DELETE FROM release_authorizations WHERE lost_item_id = ?", (lost_id,))

    conn.commit()
    conn.close()

    return {
        "success": True,
        "message": "Realistic demo dataset seeded successfully",
        "lost_item_id": lost_id,
        "matching_found_id": fnd_match_id,
        "decoy_found_id": decoy_id,
        "escrow_id": escrow_id
    }
