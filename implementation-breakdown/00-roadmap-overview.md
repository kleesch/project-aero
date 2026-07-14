# Implementation Roadmap — Overview

This folder breaks the [DESIGN.md](../DESIGN.md) architecture into sequential, independently shippable phases. Each phase document lists its goals, tasks, deliverables, and acceptance criteria. A phase is "done" when its acceptance criteria pass on a local `docker compose up` instance.

## Phase Sequence & Dependencies

```
01 Foundation & Tooling
        │
02 Auth, Sessions & Claims
        │
03 Audit Log & PDF Pipeline
        │
04 Bill Tracking ────────────┐
        │                    │
05 Judicial Records          │   (05 and 06 depend on 03;
        │                    │    06 can run parallel to 04/05)
06 Business Registration ────┘
        │
07 Public API & API Keys
        │
08 Deployment & Operations
        │
09 Future: User Records (not scheduled)
```

| Phase | Document                                                     | Summary                                                                                                                 | Depends on |
| ----- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| 01    | [Foundation & Tooling](01-foundation-and-tooling.md)         | Monorepo scaffold, TypeScript, lint, Docker Compose dev environment, Postgres + Drizzle, shared package, skeleton apps  | —          |
| 02    | [Auth, Sessions & Claims](02-auth-sessions-and-claims.md)    | ROBLOX OAuth login, server-side sessions, full claims system (group mappings, direct grants, negative claims, admin UI) | 01         |
| 03    | [Audit Log & PDF Pipeline](03-audit-log-and-pdf-pipeline.md) | Append-only audit layer, document storage in R2/MinIO, separate-origin sandboxed file serving, quarantine               | 02         |
| 04    | [Bill Tracking](04-bill-tracking.md)                         | Bill submission, identifiers & session math, stage pipeline, per-member votes, rosters, tags, versioned PDFs            | 03         |
| 05    | [Judicial Records](05-judicial-records.md)                   | Ruling entry with linked parties, outcomes vocabulary, appeals, expungement & pardon                                    | 03         |
| 06    | [Business Registration](06-business-registration.md)         | Registrar-created businesses, single-owner editing, ownership transfer, licenses                                        | 03         |
| 07    | [Public API & API Keys](07-public-api-and-api-keys.md)       | Versioned read-only external API, hashed API keys, rate limiting                                                        | 04, 05, 06 |
| 08    | [Deployment & Operations](08-deployment-and-operations.md)   | Production compose, reverse proxy + TLS, managed Postgres + R2 wiring, backups, README deploy docs                      | 07         |
| 09    | [Future: User Records](09-future-user-records.md)            | Employment history, medals, citizenship passthrough — design notes only, not scheduled                                  | —          |

## Cross-Phase Conventions

These hold in every phase (details in DESIGN.md):

- **TypeScript strict everywhere**; enums, claim keys, zod schemas, and shared math live in `packages/shared` — never duplicated.
- **Every mutation is audited** (from phase 03 onward; phase 02 mutations are retrofitted in 03).
- **Every gated route uses `requireClaim(key)`**; the frontend renders from `GET /api/me` claims but is never the enforcement point.
- **Soft deletes only** on user-facing records.
- **Migrations via drizzle-kit**, committed and applied automatically on boot.
- **Each phase updates README.md** if it changes how the app is run.
- **Tests**: Vitest unit tests for pure logic (session math, claim merging, transition map) are required; supertest integration tests for each phase's happy path + permission denial path.
