# Smart Lost & Found Platform

A full-stack lost and found application with:

- FastAPI backend for item reporting, matching, status lookup, admin actions, OTP-like verification, and escrow logic
- SQLite database for persistence
- Static frontend served by the backend for the user experience
- Matching engine and blind verification workflow for candidate evaluation and secure proofs

## Project structure

```text
LandF/
├── backend/
│   ├── app/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── schemas.py
│   │   ├── security.py
│   │   ├── routers/
│   │   └── services/
│   ├── data/
│   ├── requirements.txt
│   └── run.py
├── frontend/
│   ├── css/
│   ├── js/
│   └── index.html
├── uploads/
├── test_backend.py
├── test_matching_pipeline.py
└── README.md
```

## Prerequisites

- Python 3.10 or newer
- pip
- Git (optional)

## 1) Install backend dependencies

From the project root:

```bash
python -m pip install -r backend/requirements.txt
```

Optional: if you want to run the test scripts too, install pytest:

```bash
python -m pip install pytest
```

## 2) Run the backend

From the project root:

```bash
cd backend
python run.py
```

The backend will start on:

- http://127.0.0.1:8000

The app also serves the frontend automatically from the static frontend folder, so you do not need a separate frontend server in the normal setup.

### Optional environment variables

```bash
set PORT=8000
set ADMIN_PIN=admin123
```

On Linux/macOS:

```bash
export PORT=8000
export ADMIN_PIN=admin123
```

## 3) Open the frontend

Once the backend is running, open this in your browser:

```text
http://127.0.0.1:8000
```

This loads the frontend from [frontend/index.html](frontend/index.html), and API calls go through the same FastAPI backend.

## Health check

You can verify the backend is running by opening:

```text
http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status": "ok", "system": "Smart Lost & Found Platform", "version": "1.0.0"}
```

## Admin login

Default admin PIN:

```text
admin123
```

This is configured in [backend/app/config.py](backend/app/config.py).

## Run tests

From the project root:

```bash
python test_backend.py
python test_matching_pipeline.py
```

## Notes

- The default frontend is served by the backend, so the easiest way to run the project is to start the backend only.
- Uploaded images are saved under the project uploads folder.
- The app uses SQLite database file stored in [backend/data/lost_and_found.db](backend/data/lost_and_found.db).
- If you want a clean database reset during local development, delete the SQLite file and restart the backend.

## Troubleshooting

### Module not found errors

Ensure you installed the backend dependencies:

```bash
python -m pip install -r backend/requirements.txt
```

### Port already in use

Change the port before starting:

```bash
set PORT=8001
```

Then open:

```text
http://127.0.0.1:8001
```

### Frontend not showing

Make sure the backend is running and the static folder is accessible. The app mounts the frontend from the backend automatically.

## Quick start

```bash
cd /path/to/LandF
python -m pip install -r backend/requirements.txt
cd backend
python run.py
```

Then open:

```text
http://127.0.0.1:8000
```
