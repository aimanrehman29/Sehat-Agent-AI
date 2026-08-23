# Sehat-Agent AI

> **Multi-Agent Healthcare Platform — Track A: Pharma-Check · Lingo-Med · Care-Sync**

An AI-powered healthcare assistant platform that uses computer vision (OCR), NLP, and intelligent scheduling to detect counterfeit medicines, simplify lab reports, and parse prescriptions into automated medication reminders.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [Agents](#agents)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Guardrails & Safety](#guardrails--safety)
- [Testing](#testing)
- [Team](#team)
- [License](#license)

---

## Overview

Sehat-Agent AI is a **multi-agent healthcare platform** split into two tracks:

| Track | Responsibility | Status |
|-------|---------------|--------|
| **Track A** (this repo) | AI Agents — OCR, NLP, scheduling | Active development |
| **Track B** | Voice (Twilio), GPS, Telephony | Teammate's scope |

Track A provides three core AI agents:

1. **Pharma-Check AI** — Detects fake/counterfeit medicines via barcode, QR code, and DRAP registration number OCR
2. **Lingo-Med AI** — Simplifies lab reports into plain-language explanations with severity classification
3. **Care-Sync AI** — Parses prescriptions and generates cron-based medication reminder schedules

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      Incoming Request                         │
│                  (Twilio / Web / API)                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │  Orchestrator  │  ← Routes to correct agent
              └───────┬────────┘
         ┌────────────┼────────────┐
         ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Pharma-  │ │ Lingo-   │ │ Care-    │
   │ Check    │ │ Med      │ │ Sync     │
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │            │            │
        ▼            ▼            ▼
   ┌─────────────────────────────────────┐
   │       Guardrail Layer               │
   │  (Disclaimer + Sanitize + Freeze)   │
   └──────────────┬──────────────────────┘
                  │
                  ▼
         UniversalResponse
         (frozen, with disclaimer)
```

**Key Design Principles:**
- **Fail-closed guardrails** — Every response MUST pass through `applyGuardrails()` with mandatory medical disclaimer
- **Universal envelopes** — Standardized `UniversalRequest` / `UniversalResponse` for Track A ↔ Track B handoffs
- **Immutable responses** — `Object.freeze()` prevents post-guardrail mutation
- **Typed pipelines** — Zod schemas validate all inputs/outputs at runtime

---

## Folder Structure

```
Sehat-Agent-AI/
│
├── agents/                     # AI Agent modules (standalone, JSDoc-documented)
│   ├── orchestrator.ts         # Central dispatcher — routes to all agents
│   ├── pharmaCheck.ts          # Fake medicine detector (OCR + DRAP lookup)
│   ├── lingoMed.ts             # Lab report simplifier (OCR + NLP)
│   ├── careSync.ts             # Prescription parser + cron reminders
│   ├── triage.ts               # Symptom → department routing
│   ├── geoLocator.ts           # Google Maps hospital finder
│   ├── autoBooking.ts          # Twilio voice call + E-Parchi booking
│   └── emergencyEscalation.ts  # Emergency keyword detection
│
├── utils/                      # Shared utilities
│   ├── logger.ts               # Structured leveled logger
│   ├── disclaimers.ts          # Medical disclaimer constants
│   └── twilioClient.ts         # Twilio SDK singleton (mock mode)
│
├── routes/
│   └── api.ts                  # REST API router (Express-style)
│
├── public/
│   └── index.html              # Standalone HTML test console
│
├── src/
│   ├── app/                    # Next.js 14 App Router
│   │   ├── page.tsx            # Landing page
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Tailwind base styles
│   │   ├── api/track-a/       # Next.js API routes (mock data for test UI)
│   │   │   ├── pharma-check/route.ts
│   │   │   ├── lingo-med/route.ts
│   │   │   └── care-sync/parse/route.ts
│   │   └── test/               # Test frontend UI
│   │       ├── layout.tsx      # Sidebar navigation
│   │       ├── page.tsx        # Dashboard overview
│   │       ├── pharma-check/page.tsx
│   │       ├── lingo-med/page.tsx
│   │       └── care-sync/page.tsx
│   │
│   ├── config/
│   │   ├── env.ts              # Zod-validated environment variables
│   │   └── constants.ts        # Enums, limits, cron templates
│   │
│   ├── lib/
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── logger.ts           # Scoped structured logger
│   │   ├── guardrails/
│   │   │   ├── disclaimer.ts   # applyGuardrails() — mandatory wrapper
│   │   │   └── sanitize.ts     # PII redaction, HTML strip, deep sanitize
│   │   └── validation/
│   │       ├── pharma-check.schema.ts
│   │       ├── lingo-med.schema.ts
│   │       └── care-sync.schema.ts
│   │
│   └── types/
│       ├── orchestrator.ts     # UniversalRequest / UniversalResponse
│       ├── agents.ts           # OCR types, agent input types
│       └── api.ts              # TrackARequestBody, ERROR_CODES
│
├── prisma/
│   ├── schema.prisma           # 6 models (DrugRegistry, LabReport, etc.)
│   └── seed.ts                 # 10 sample DRAP drug entries
│
├── server.ts                   # Custom Next.js + REST API server
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
├── .env.example                # Template showing required keys
├── .gitignore                  # .env and node_modules never get pushed
└── README.md
```

---

## Agents

### Pharma-Check AI (Fake Medicine Detector)
- **Input**: Image (barcode / QR code / DRAP registration number)
- **Pipeline**: Barcode extraction → QR decoding → DRAP OCR → DB lookup → Risk scoring (0–100)
- **Output**: Risk level (SAFE / LOW / MEDIUM / HIGH / CRITICAL), drug info, confidence score

### Lingo-Med AI (Report Simplifier)
- **Input**: Lab report image (OCR)
- **Pipeline**: OCR → Parse metrics → Classify severity → Generate explanations → Summary
- **Output**: Patient info, metrics table (NORMAL / BORDERLINE / ABNORMAL / CRITICAL), plain-language explanations

### Care-Sync AI (Prescription Parser)
- **Input**: Prescription image (OCR)
- **Pipeline**: OCR → Extract medicines → Map dosages → Generate cron schedules → Build reminders
- **Output**: Medicine list with dosage/schedule, cron expressions, reminder CRUD schemas

### Track B Agents (Stubs — Teammate's Scope)
- **Triage** — Symptom → department routing
- **Geo-Locator** — Google Maps hospital finder
- **Auto-Booking** — Twilio voice call + E-Parchi appointment booking
- **Emergency Escalation** — Emergency keyword detection + immediate dispatch

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| OCR | Tesseract.js |
| QR Decode | jsqr + sharp (image preprocessing) |
| Validation | Zod (runtime schemas) |
| Database | PostgreSQL |
| ORM | Prisma |
| Scheduling | node-cron |
| Telephony | Twilio SDK (Track B) |
| Styling | Tailwind CSS |

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/aimanrehman29/Sehat-Agent-AI.git
cd Sehat-Agent-AI

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your database URL and API keys

# 4. Generate Prisma client
npm run db:generate

# 5. Push schema to database
npm run db:push

# 6. Seed sample data (optional)
npm run db:seed

# 7. Start development server
npm run dev
```

The app will be available at:
- **Test UI**: [http://localhost:3000/test](http://localhost:3000/test)
- **API Health**: [http://localhost:3000/api/v1/agents](http://localhost:3000/api/v1/agents)

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/sehat_agent"

# OCR (Tesseract)
TESSERACT_WORKER_PATH=""        # Optional: custom worker path

# Twilio (Track B — teammate's scope)
TWILIO_ACCOUNT_SID=""
TWILIO_AUTH_TOKEN=""
TWILIO_PHONE_NUMBER=""

# Google Maps (Track B)
GOOGLE_MAPS_API_KEY=""

# App
NODE_ENV="development"
PORT="3000"
LOG_LEVEL="debug"
```

---

## API Reference

### REST API (via `server.ts`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/agents` | List all agents + health check |
| `POST` | `/api/v1/agents/pharma-check` | Fake medicine detection |
| `POST` | `/api/v1/agents/lingo-med` | Lab report simplification |
| `POST` | `/api/v1/agents/care-sync` | Prescription parsing |
| `POST` | `/api/v1/agents/triage` | Symptom routing |
| `POST` | `/api/v1/agents/geo-locator` | Hospital lookup |
| `POST` | `/api/v1/agents/auto-booking` | Appointment booking |
| `POST` | `/api/v1/agents/emergency` | Emergency escalation |

### Request Envelope

```json
{
  "request_id": "req_abc123",
  "source": "twilio_voice",
  "agent": "pharma-check",
  "payload": {
    "image_base64": "...",
    "patient_id": "P-001"
  },
  "metadata": {
    "language": "en",
    "timestamp": "2026-01-15T10:30:00Z"
  }
}
```

### Response Envelope

```json
{
  "request_id": "req_abc123",
  "status": "success",
  "agent": "pharma-check",
  "data": { ... },
  "disclaimer": "This AI assistant helps with information only...",
  "processing_time_ms": 1250,
  "confidence": 0.92
}
```

---

## Database Schema

6 Prisma models:

| Model | Purpose |
|-------|---------|
| `DrugRegistry` | DRAP drug database for Pharma-Check lookups |
| `LabReport` | Uploaded lab reports |
| `LabMetric` | Individual lab metrics (linked to LabReport) |
| `Prescription` | Uploaded prescriptions |
| `PrescriptionItem` | Individual medicines (linked to Prescription) |
| `MedicationReminder` | Cron-based medication reminders |

---

## Guardrails & Safety

Every agent response passes through a **mandatory guardrail layer**:

1. **Disclaimer injection** — Medical disclaimer is appended to every response
2. **PII sanitization** — Patient names, phone numbers, and emails are redacted
3. **HTML stripping** — Prevents XSS in OCR-extracted text
4. **Object.freeze()** — Response is immutable after guardrail processing
5. **Fail-closed** — If guardrail fails, the response is rejected entirely

```typescript
// The ONLY way to construct a valid response:
const response = applyGuardrails(agentResult, requestId);
// response is now frozen and includes disclaimer
```

---

## Testing

```bash
# Type-check
npm run typecheck

# Run tests
npm test

# Start test UI
npm run dev
# Open http://localhost:3000/test
```

The test UI provides:
- **Pharma-Check** — Upload medicine image, see risk assessment
- **Lingo-Med** — Upload lab report, see simplified metrics
- **Care-Sync** — Upload prescription, see medicines + cron schedules

---

## Team

| Member | Track | Responsibility |
|--------|-------|---------------|
| Aiman Rehman | Track A | AI Agents, OCR, NLP, Scheduling |
| Teammate | Track B | Twilio Voice, GPS Mapping, Telephony |

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <b>Sehat-Agent AI</b> — AI-Powered Healthcare Assistant<br>
  <i>Built for Pakistan's healthcare ecosystem</i>
</p>
