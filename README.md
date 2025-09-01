## Nat's Accounting Platform (Initial Scaffold)

Modern minimalist black & white luxury-themed site for consultation intake, scheduling, and internal pricing estimation.

### Structure

- `frontend/` – Vite + React + TypeScript single-page app (public pages + consultation form + admin placeholder)
- `backend/` – Express + TypeScript API (consultation intake, availability, internal estimation)
- `shared/` – Shared TypeScript types & utility constants
- `hoursOfOperation.json` – Defines working hours used for scheduling window

### Quick Start

1. Install deps (root workspaces):

```bash
npm install
```

2. Start both dev servers:

```bash
npm run dev
```

Frontend runs on Vite default (5173). Backend on 4000 (configurable via `PORT`).

### Environment

Copy `.env.example` to `backend/.env` and adjust.

### API (early draft)

`POST /api/consultations` – submit consultation request (no pricing returned to client)
`GET /api/availability?date=YYYY-MM-DD` – list 30‑min open slots
`GET /api/admin/consultations` – admin list (requires `x-api-key`)

### Internal Estimation (Not Exposed Publicly)

Stored with consultation; price ranges derived from questionnaire (revenue bracket, services requested, volume metrics). Estimates are intentionally ranges – final proposal manual.

### Next Iterations (Planned)

- Persist scheduled meetings & integrate real Zoom + Google Calendar APIs
- Add email (Nodemailer) + SMS (Twilio) notifications
- Authentication & Admin UI (protected route + login)
- Validation enhancements + rate limiting
- Unit tests & E2E form submission test

### Theming

Pure black/white foundation with generous whitespace; later add subtle motion & typographic scale.
