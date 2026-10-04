# AegisRecover (LandF) - Smart Lost & Found Platform
## Quick Run & Evaluation Instructions

**AegisRecover** is a production-grade, double-blind, AI-assisted Smart Lost & Found platform featuring:
- **Strict Double-Blind Architecture:** No public browsing or catalog of found items.
- **5-Stage Animated Matching Pipeline:** Parallel semantic token alignment, Spatio-Temporal Haversine & time-decay curve, Multimodal Vision & damage analysis, Autonomous Blind Verification Probe, and Final Authorization.
- **Autonomous Blind Verification Agent:** Translates confidential owner flaws (e.g., *"hairline crack at right hinge"*) into neutral photographic requests sent to the finder without ever leaking the secret.
- **Reward Escrow Vault:** Cash rewards locked upon report filing and disbursed directly via UPI upon confirmed physical handover.
- **The Lost-Phone Catch-22 Protection:** Mandatory secondary/backup contact enforcement for claimants who lost their primary device.
- **Physical Handover Desk Terminal:** Dynamic 6-digit handover OTP verification by duty officers to mark records `RESOLVED` and disburse escrow.
- **1-Click Pre-Loaded Realistic Demo Dataset:** Evaluator mode with Aarav Sharma's MacBook Pro M2, Rahul Verma's matching found MacBook, and Amit Kumar's decoy water bottle.

---

## 1. Environment Setup

The application runs locally on a single machine with Python 3.10+.

### Step 1.1: Create & Activate Virtual Environment
Open your terminal at the root of the repository:

```bash
# macOS / Linux
python3 -m venv venv
source venv/bin/activate

# Windows (Command Prompt / PowerShell)
python -m venv venv
venv\Scripts\activate
```

### Step 1.2: Install Backend Dependencies

```bash
pip install -r backend/requirements.txt
```

---

## 2. Starting the Application Server

Launch the FastAPI backend server (which also serves the responsive frontend and static uploads):

```bash
cd backend
python run.py
```

The server will initialize SQLite database tables (`backend/data/lost_and_found.db`), default custody desks, and start listening on:

👉 **[http://127.0.0.1:8000](http://127.0.0.1:8000)**

---

## 3. Default Credentials & Access Keys

| Role / Feature | Credential / Value | Usage |
| :--- | :--- | :--- |
| **Admin Authorization PIN** | `admin123` | Unlocks Admin Portal & Desk Terminal |
| **Master Test OTP** | `123456` | Bypasses SMS gateway for instant phone verification |
| **Demo Owner Account** | Phone: `+91 98765 43210`<br/>Email: `aarav.sharma@campus.edu` | Track Aarav Sharma's lost MacBook report |
| **Demo Finder Account** | Phone: `+91 91234 56789`<br/>UPI: `rahul@okaxis` | Submit verification proof & receive escrow reward |

---

## 4. End-to-End Walkthrough Using 1-Click Demo Dataset

You can complete the entire lifecycle in under **60 seconds** directly through the web interface:

### Step 4.1: Seed the Demo Dataset
1. Open **[http://127.0.0.1:8000](http://127.0.0.1:8000)** in your browser.
2. In the top notification banner, click the green button: **`⚡ Load Demo Dataset`**.
3. A confirmation toast will appear. This instantly populates:
   - **Lost Item:** `DEMO-LOST-MACBOOK` (Apple MacBook Pro 14 M2 Space Gray, ₹2,000 Escrow, Aarav Sharma, Secret flaw: *"Small hairline crack on the right hinge directly next to the power button"*).
   - **Matching Found Item:** `DEMO-FND-LAPTOP-MATCH` (Apple MacBook Laptop in Dark Cover, found 50m away at Library Study Section by Rahul Verma, UPI: `rahul@okaxis`).
   - **Decoy Item:** `DEMO-FND-BOTTLE-DECOY` (Silver Insulated Water Bottle, 3.5km away).
   - **Escrow Vault:** `ESC-DEMO-01` (₹2,000 PLEDGED).

---

### Step 4.2: Execute the 5-Stage Animated Matching Pipeline
1. Click the **Admin Portal** tab in the navigation bar.
2. Enter the Authorization PIN: `admin123` and click **Unlock Admin Dashboard**.
3. Under the **Lost Items Records** tab, locate `Apple MacBook Pro 14 M2 Space Gray` (`DEMO-LOST-MACBOOK`).
4. Click the blue button: **`⚡ Run 5-Stage Matching Engine`**.
5. **Watch the live stepped node animation:**
   - **Node 1 (Text & Name):** Tokenizes title/description, checks Jaccard overlap, aligns electronics category.
   - **Node 2 (Spatio-Temporal):** Calculates Haversine Great-Circle distance (50m away) and temporal consistency.
   - **Node 3 (Multimodal Vision):** Evaluates Space Gray color palette, casing silhouette, and micro-feature damage keywords.
   - **Node 4 (Blind Probe):** Prepares neutral target zone photographic challenge.
   - **Node 5 (Evaluation):** Ranks candidate matches by composite confidence score.
6. The candidate card appears with **Rank #1: Apple MacBook Laptop in Dark Cover (71% Composite Confidence)**, side-by-side photo comparison, and stage score breakdown meters.

---

### Step 4.3: Test the Autonomous Blind Verification Probe
1. In the candidate evaluation card, click: **`🛡️ Dispatch Blind Verification Probe`**.
2. Notice the anti-fraud prompt:
   > *"To confirm ownership details, please upload a clear close-up photo of the hinge area connecting the display and base."*
   >
   > **Notice:** The secret flaw (*"hairline crack near power button"*) is **strictly omitted** so the finder receives zero leaked intelligence!
3. Switch to the **User Dashboard** tab and search for the finder's phone: `+91 91234 56789`.
4. Under the found MacBook card, you will see the **Autonomous AI Blind Verification Challenge**.
5. Click **`⚡ Use Demo Hinge Verification Photo`** (or upload your own photo), then click **`Submit Verification Photo`**.
6. The AI Verification Agent evaluates the target zone, verifies the hairline crack, and logs an agent confidence score of **94% (VERIFIED)**.

---

### Step 4.4: Issue Handover Token & Disburse Escrow at Desk Terminal
1. Return to the candidate card in the Admin Portal and click: **`🔑 Approve Match & Generate 6-Digit Passcode`**.
2. A modal displays the dynamic one-time 6-digit numeric token (e.g., `[ 1 0 6 4 1 6 ]`) generated for the claimant.
3. Click **`Open Desk Handover Terminal ➔`** (or switch to the **🔑 Handover Desk Terminal** tab in the Admin Portal).
4. Click **`Auto-Fill Latest Code`** (or enter the 6-digit passcode).
5. Click **`✓ Verify Passcode & Complete Handover`**.
6. **Result:**
   - Records are authenticated and marked as **`RESOLVED`**.
   - The ₹2,000 cash reward is immediately marked as **`DISBURSED`** via UPI to `rahul@okaxis`.
   - An immutable audit trail entry is logged in `audit_logs`.
   - A digital printable **Official Handover Certificate** is displayed!

---

## 5. Testing Other Features

- **The Lost-Phone Catch-22 Rule:** Try submitting a lost item report without filling the *Secondary / Backup Contact* — the form enforces this mandatory field to ensure claimants without their primary device still receive alerts.
- **Dual Found Item Ingestion:**
  - **Path A (Official Verified Desk):** Select an official partner desk (e.g., *Campus Main Gate Security Desk*), upload a photo, and receive an instant digital intake receipt (`RCPT-XXXX`).
  - **Path B (Direct Custody):** Keep the item in personal custody, upload multiple photo angles, record background GPS, and set pickup availability.
- **User Dashboard Tracking:** Check status anytime using phone number or report ID (`LOST-...` or `FND-...`) to view the interactive 4-stage progress timeline:
  `Intake Registered` ➔ `Vector & Geo Search` ➔ `Blind Proof Check` ➔ `Handover & Escrow`.
