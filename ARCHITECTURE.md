# Honestlytics — Architecture Document
> Open source, self-hosted, transparent user behavior analytics system (Not trying to replace Mixpanel, trying to understand what it took to build it)

> Last updated: April 28, 2026

---

## Philosophy
Transparency first. Users can see, manage, and correct their own tracked data. No dark patterns.

---

## Target
SaaS developers, budget-conscious startups. Self-hosted, no multi-tenant for MVP.

---

## Stack
- **Runtime**: Node.js
- **Queue**: RabbitMQ
- **Database**: PostgreSQL
- **Cache/Dedup**: Redis
- **Infra**: Docker

---

## Event Flow

```
SDK (fire and forget via Beacon API)
→ Ingestion API (light: structure validation only)
→ RabbitMQ (intentional bottleneck, absorbs spikes)
→ Consumer (all heavy work happens here)
   → Redis dedup check (O(1))
   → PostgreSQL insert
   → ACK to RabbitMQ
```

---

## Architecture Decisions & Rationale

### 1. Rate Limiting — Two Layers
- **Network layer first**: block abusive IPs (e.g. 10k req/s from same IP) at infra level before hitting the app. Cheap, fast, no code involved.
- **RabbitMQ as the second layer**: for legitimate high volume (10k req/s different data), RabbitMQ is the intentional bottleneck. It absorbs spikes so the consumer processes at a controlled pace without anything downstream dying.
- SDK: no rate limiting. It just sends.

### 2. API Design — Keep It Light
The API does **minimum viable validation only**:
- Is the payload valid JSON?
- Is `event_name` present?
- Reject malformed garbage fast, accept everything else and push to RabbitMQ immediately.

**Why**: Validating one by one under 10k req/s in the API creates a bottleneck in the wrong place. RabbitMQ exists precisely to absorb that pressure. The API's job is to be a fast gate, not a processing layer.

### 3. Deduplication Strategy — Redis Shield
**Problem**: SDK retries on network failure → same event arrives twice → duplicate data.

**Solution**: Redis deduplication filter in the consumer, before any PostgreSQL write.

**Flow**:
```
Consumer receives event from RabbitMQ
→ Check Redis for event_id
  → HIT:  drop event, ACK RabbitMQ (already processed)
  → MISS:
     → SET event_id in Redis with TTL
     → Insert into PostgreSQL
     → ACK RabbitMQ
```

**Why Redis and not just PostgreSQL PRIMARY KEY?**
PostgreSQL PRIMARY KEY does prevent duplicates, but at 10k events/second it means 10k B-tree index traversals/second on a table growing to hundreds of millions of rows. Cost increases as table grows.
Redis check is O(1) in-memory. It shields PostgreSQL from expensive index checks on a write-heavy table at scale.

**TTL Strategy**: TTL = SDK retry timeout + small safety margin. No need to store event_ids forever — only long enough to cover the retry window. Keeps Redis memory bounded.

**Why SET before PostgreSQL insert, not after?**
If we insert into PostgreSQL first, then crash before writing to Redis:
- Same event arrives again from SDK retry
- Redis has no record → consumer processes again
- PostgreSQL PRIMARY KEY catches it, but we've already paid the cost of a failed insert + index check at scale

Setting Redis key first means even if PostgreSQL insert fails, the worst case is a dropped event (recoverable via fallback) not a duplicate storm.

### 4. RabbitMQ Acknowledgement — ACK After Insert Only
**Rule**: Consumer ACKs RabbitMQ **only after successful PostgreSQL insert**. Never before.

**Why**: 
- ACK before insert → RabbitMQ deletes the message → server crashes → event gone forever. Unrecoverable data loss.
- ACK after insert → server crashes before ACK → RabbitMQ redelivers → Redis dedup catches the duplicate → no data loss, no duplicate in DB.

This is **at-least-once delivery**. Redis deduplication handles the "at-least" part cleanly.

---

## Fallback Strategy — 3 Tiers (No Data Loss)

| Tier | Condition | Behavior |
|------|-----------|----------|
| 1 | Normal | SDK → API → RabbitMQ → Consumer → PostgreSQL |
| 2 | RabbitMQ down | API → Redis fallback queue |
| 3 | RabbitMQ + Redis down | API → PostgreSQL events_fallback table |

Recovery worker runs periodically, drains fallback storage back into normal flow.

---

## Identity Resolution
- `localStorage` based `distinct_id` — anonymous tracking
- `distinct_id_list` on user profile for multi-session matching
- No fingerprinting — contradicts transparency philosophy
- Anonymous → identified merge via `alias` call on login

---

## Intent Confirmation (Rage Clicks)
- Detected client-side
- Stored as `unconfirmed_intent`
- User answers async via personal dashboard
- No real-time popup — ROI near zero

---

## Aggregations
- Pre-computed, scheduled job based
- Dynamic frequency configured per metric by SaaS owner from dashboard
- Not real-time, not on-demand

---

## Database — 9 Tables

```sql
CREATE TABLE events (
    event_id UUID PRIMARY KEY,
    event_name VARCHAR NOT NULL,
    user_id UUID REFERENCES users(id),
    distinct_id VARCHAR NOT NULL,
    session_id UUID REFERENCES sessions(id),
    client_timestamp TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL,
    page VARCHAR,
    html_element VARCHAR,
    intent VARCHAR DEFAULT 'unconfirmed',
    sdk_version VARCHAR,
    device_properties JSONB,
    properties JSONB
);

CREATE TABLE users (
    id UUID PRIMARY KEY,
    distinct_id_list JSONB DEFAULT '[]',
    fingerprint VARCHAR,
    is_identified BOOLEAN DEFAULT false,
    external_user_id VARCHAR,
    consent_given BOOLEAN DEFAULT false,
    consent_given_at TIMESTAMPTZ,
    data_deletion_requested BOOLEAN DEFAULT false,
    data_deletion_requested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    properties JSONB
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    distinct_id VARCHAR NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_ms INTEGER,
    entry_page VARCHAR,
    exit_page VARCHAR,
    event_count INTEGER DEFAULT 0,
    device_properties JSONB,
    properties JSONB
);

CREATE TABLE admins (
    id UUID PRIMARY KEY,
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR NOT NULL,
    name VARCHAR,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE events_fallback (
    id UUID PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    status VARCHAR DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    last_retry_at TIMESTAMPTZ,
    error_message VARCHAR
);

CREATE TABLE aggregations (
    id UUID PRIMARY KEY,
    metric VARCHAR NOT NULL,
    date DATE NOT NULL,
    granularity VARCHAR NOT NULL,
    value JSONB NOT NULL,
    computed_at TIMESTAMPTZ,
    urgency VARCHAR DEFAULT 'normal'
);

CREATE TABLE aggregation_configs (
    id UUID PRIMARY KEY,
    metric VARCHAR NOT NULL,
    frequency VARCHAR NOT NULL,
    urgency VARCHAR NOT NULL,
    last_computed_at TIMESTAMPTZ,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cron_jobs (
    id UUID PRIMARY KEY,
    job_name VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message VARCHAR,
    metadata JSONB
);

CREATE TABLE user_questions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    event_id UUID REFERENCES events(event_id),
    question VARCHAR NOT NULL,
    answer VARCHAR,
    answered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Raw Event Schema

```json
{
  "event_id": "uuid",
  "event_name": "button_clicked",
  "user_id": "real-db-id or null",
  "distinct_id": "anonymous-uuid",
  "session_id": "uuid",
  "timestamp": "2026-04-27T07:00:00Z",
  "page": "/dashboard/settings",
  "html_element": "button",
  "device_properties": {
    "browser": "Chrome",
    "os": "Android",
    "screen": "1080x2280",
    "timezone": "Africa/Tunis"
  },
  "intent": "unconfirmed",
  "sdk_version": "0.1.0",
  "properties": {}
}
```

---

## Architecture Diagram

```
                      HONESTLYTICS — ARCHITECTURE DIAGRAM
          
          ┌─────────────────────────────────────────────────────────────┐
          │                        CLIENT BROWSER                       │
          │                                                             │
          │  ┌──────────────────────────────────────────────────────┐   │
          │  │                   HONESTLYTICS SDK                   │   │
          │  │                                                      │   │
          │  │  init()          → distinct_id (localStorage)        │   │
          │  │                  → session_id (memory + TTL)         │   │
          │  │                                                      │   │
          │  │  track()         → fill props automatically          │   │
          │  │                  → Beacon API (fire & forget)        │   │
          │  │                  → fails → fetch() retry once        │   │
          │  │                  → failed queue (memory)             │   │
          │  └──────────────────────────┬───────────────────────────┘   │
          └─────────────────────────────┼───────────────────────────────┘
                                        │ POST /event
                                        ▼
          ┌─────────────────────────────────────────────────────────────┐
          │                      INGESTION API                          │
          │                                                             │
          │  • Validate: JSON valid? event_name present?                │
          │  • Generate: event_id, server_timestamp, intent             │
          │  • Return: 202 Accepted immediately                         │
          │                                                             │
          │              Fallback chain if RabbitMQ down:               │
          │              → Redis fallback queue                         │
          │              → PostgreSQL events_fallback table             │
          └──────────────────────────┬──────────────────────────────────┘
                                     │
                                     ▼
          ┌─────────────────────────────────────────────────────────────┐
          │                       RABBITMQ                              │
          │                                                             │
          │         shock absorber — holds up to 400k messages          │
          │         distributes to consumers automatically              │
          └──────────┬──────────────┬──────────────┬────────────────────┘
                     │              │              │
                     ▼              ▼              ▼
              ┌──────────┐   ┌──────────┐   ┌──────────┐
              │Consumer 1│   │Consumer 2│   │Consumer N│   competing
              └─────┬────┘   └─────┬────┘   └─────┬────┘   consumers
                    │              │              │
                    └──────────────┴──────────────┘
                                   │
                                   ▼
          ┌─────────────────────────────────────────────────────────────┐
          │                        REDIS                                │
          │                                                             │
          │  dedup check → event_id exists?                             │
          │                                                             │
          │  HIT  → drop event → ACK RabbitMQ                           │
          │  MISS → SET event_id (TTL = retry window + margin)          │
          │         → continue                                          │
          └──────────────────────────┬──────────────────────────────────┘
                                     │
                                     ▼
          ┌─────────────────────────────────────────────────────────────┐
          │                      POSTGRESQL                             │
          │                                                             │
          │  INSERT event                                               │
          │  → success →  ACK RabbitMQ                                  │ 
          │  → fail    → no ACK → RabbitMQ redelivers                   │
          └─────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
                        ┌────────────────────────┐
                        │    RECOVERY WORKER     │
                        │                        │
                        │ periodically drains:   │
                        │ • Redis fallback queue │
                        │ • events_fallback table│
                        └────────────────────────┘
```

---

## SDK Design

### Developer Experience
```html
<script src="honestlytics.js"></script>
<script>
  Honestlytics.init('YOUR_API_URL')
</script>
```

```js
Honestlytics.track('button_clicked', { custom: 'prop' })
```

### Internal Responsibilities

**init(apiUrl)**
- Generate or load `distinct_id` from localStorage (once, permanent)
- Generate `session_id` (memory, expires after 30min inactivity)
- Store `apiUrl` for all future requests

**track(eventName, properties)**
- Auto-fill all fields developer didn't provide:

| Field | Source |
|-------|--------|
| `distinct_id` | localStorage |
| `session_id` | memory |
| `client_timestamp` | `Date.now()` |
| `page` | `window.location.pathname` |
| `device_properties.browser` | `navigator.userAgent` |
| `device_properties.screen` | `window.screen.width/height` |
| `device_properties.timezone` | `Intl.DateTimeFormat().resolvedOptions().timeZone` |
| `sdk_version` | hardcoded constant |
| `user_id` | set via `identify()` call or null |

### Send Strategy
```
try Beacon API (fire & forget)
→ fails
   → push to failedQueue (in-memory array)
   → wait (timeout duration + margin)
   → retry once via fetch()
   → still fails → stays in failedQueue until page unload
```

### Session Management
- New `session_id` generated on `init()`
- Inactivity timer resets on every `track()` call
- 30min no activity → session expires → new `session_id` on next `track()`

### Identity
```js
Honestlytics.identify('real-user-id')
// sets user_id on all subsequent events
// triggers alias merge on server side
```

---

## API Contract

### POST /event
**Response**: `202 Accepted` — always. No body needed. SDK doesn't read it anyway (Beacon API).

**Why 202 and not 200**: Event is queued for async processing, not immediately stored. 202 is the correct semantic.

#### Request Body — SDK sends:
```json
{
  "event_name": "button_clicked",
  "distinct_id": "uuid-from-localstorage",
  "session_id": "uuid-from-sdk-memory",
  "client_timestamp": "2026-04-28T14:00:00Z",
  "page": "/dashboard",
  "html_element": "button",
  "sdk_version": "0.1.0",
  "user_id": "uuid-or-null",
  "device_properties": {
    "browser": "Chrome",
    "os": "Android",
    "screen": "1080x2280",
    "timezone": "Africa/Tunis"
  },
  "properties": {}
}
```

#### Server generates on arrival:
| Field | Reason |
|-------|--------|
| `event_id` | Never trust client to generate IDs |
| `server_timestamp` | Client clock can be wrong or manipulated |
| `intent` | Defaults to `unconfirmed`, server concern not client |

**Both timestamps stored**: `client_timestamp` for debugging drift, `server_timestamp` as source of truth for all metrics.

#### Minimum viable validation (API layer only):
- Is payload valid JSON? → reject 400
- Is `event_name` present and non-empty? → reject 400
- Everything else passes through to RabbitMQ immediately

---

## Consumer Flow

```
Listen to RabbitMQ
→ Check Redis for event_id (O1)
  → HIT:  drop + ACK RabbitMQ
  → MISS:
     → SET event_id in Redis with TTL
     → Insert into PostgreSQL
     → ACK RabbitMQ ← always last, never before
```

### Scaling: Competing Consumers Pattern
Multiple consumer instances can run in parallel — each message goes to exactly one consumer. RabbitMQ handles distribution automatically. No sync risk because Redis dedup is the single source of truth regardless of which consumer instance processes the event.

- 1 consumer → processes queue at speed X
- N consumers → processes queue at speed N×X


## About the Builder
- Backend engineer, 4+ years experience
- Polyvalent, curious, fast learner
- Building in public on LinkedIn — posts scheduled for each architecture decision, tradeoff, and milestone
- Timeline: 1 month, 6-8h/day
- Goal: demonstrate senior backend