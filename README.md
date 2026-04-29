# Honestlytics

> Open source, self-hosted user behavior tracking system — built from scratch to understand how platforms like Mixpanel actually work under the hood.
---

## Why Honestlytics?

Most analytics tools are black boxes. They track everything silently, sell your users' data, and give you no control. Honestlytics is different — transparency is the core philosophy, not an afterthought.

- **Self-hosted** — your data stays on your infrastructure
- **Transparent** — users can view, manage, and correct their own tracked data
- **No dark patterns** — no fingerprinting, no silent data sales
- **Production-aware** — built with fallback strategies, deduplication, and horizontal scaling from day one

---

## Stack

| Layer | Technology |
|-------|------------|
| API | Node.js |
| Queue | RabbitMQ |
| Database | PostgreSQL |
| Cache / Dedup | Redis |
| Infra | Docker |

---

## Getting Started

### Prerequisites
- Docker
- Docker Compose

### Run locally

```bash
git clone https://github.com/medmedabd/honestlytics.git
cd honestlytics
cp .env.example .env
docker-compose up
```

That's it. Everything runs in one command.

### Verify it works

Send a test event:

```bash
curl -X POST http://localhost:3000/event \
  -H "Content-Type: application/json" \
  -d '{
    "event_name": "test_event",
    "distinct_id": "abc-123",
    "session_id": "sess-456",
    "client_timestamp": "2026-04-30T05:00:00Z",
    "page": "/home",
    "html_element": "button",
    "sdk_version": "0.1.0",
    "user_id": null,
    "device_properties": {
      "browser": "Chrome",
      "os": "Linux",
      "screen": "1920x1080",
      "timezone": "Africa/Tunis"
    },
    "properties": {}
  }'
```

Expected response: `202 Accepted`

Check the database:

```bash
docker exec -it honestlytics-postgres psql -U postgres -d honestlytics -c "SELECT event_id, event_name, page, server_timestamp FROM events LIMIT 5;"
```

---

## Project Structure

```
honestlytics/
  ├── api/                  # Ingestion API — receives and queues events
  │   ├── src/
  │   ├── package.json
  │   └── Dockerfile
  ├── consumer/             # Queue consumer — deduplicates and stores events
  │   ├── src/
  │   ├── package.json
  │   └── Dockerfile
  ├── sdk/                  # Lightweight browser SDK
  │   ├── src/
  │   └── package.json
  ├── docker-compose.yml
  ├── .env.example
  └── README.md
```

---

## Architecture

```
SDK (Beacon API, fire & forget)
→ Ingestion API (light validation, 202 immediately)
→ RabbitMQ (shock absorber, competing consumers)
→ Redis (O(1) deduplication filter)
→ PostgreSQL (persistent storage)
```

Full architecture decisions and rationale → [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Key Design Decisions

- **RabbitMQ as intentional bottleneck** — absorbs traffic spikes so nothing downstream dies
- **Redis deduplication shield** — protects PostgreSQL from expensive B-tree traversals at write-heavy scale
- **ACK after insert only** — at-least-once delivery, never lose an event
- **3-tier fallback** — RabbitMQ down → Redis queue → PostgreSQL fallback table
- **Dual timestamp** — `client_timestamp` for debugging, `server_timestamp` as source of truth

---

## Roadmap

- [x] Architecture design
- [ ] POST /event endpoint
- [ ] RabbitMQ consumer
- [ ] Redis deduplication
- [ ] PostgreSQL storage
- [ ] SDK v0.1.0
- [ ] Aggregations engine
- [ ] Admin dashboard
- [ ] User transparency dashboard

---

## Building in Public

Following every architecture decision, tradeoff, and milestone on [LinkedIn](https://www.linkedin.com/in/medabed/).

---

## License

MIT