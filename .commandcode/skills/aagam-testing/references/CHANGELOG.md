# Skill changelog

Append-only. Never rewrite or delete a line — the history of *what the skill
believed and when* is the point. Newest entry last.

Each entry: date, version after the change, author (agent/session label or
human), what changed, why.

---

## Entries

- **2026-10-08 · v1.0.0 · initial creation**
  - Created `.commandcode/skills/aagam-testing/` as a self-contained
    directory: `SKILL.md`, `references/` (four reference files + this
    changelog) and `scripts/live-revision.ps1`. Everything the skill needs
    travels inside the skill; no path in any file escapes the skill directory
    except repo-relative code references.
  - `SKILL.md` — scope, hard rules (no credentials in the repo, read-first,
    evidence-backed findings, never claim a fix is live before the served
    revision contains it), orientation step, session guidance, condensed
    end-to-end chain, cross-cutting assertions, bug recording, self-update
    protocol, definition of done.
  - `references/flows.md` — UI-level flows for all four roles: customer
    subscribe → store assign → rider pickup checklist → store handoff →
    rider deliver → customer confirm (Flow A), store self-delivery (Flow B),
    store grid packed/sold/left (Flow C), rider operations loop (Flow D),
    admin oversight (Flow E), failure/return (Flow F); plus identity/ID
    conventions and known stall points.
  - `references/api.md` — env-var credential contract, `access_token` cookie
    login, per-role cookie jars, endpoint map for delivery-operations,
    rider-portal, store subscriptions, rider delivery-runs and admin;
    response-shape traps; deploy/revision rules.
  - `references/store-grid.md` — `dispatch-summary` semantics, how
    `baseQty` / BM-CM / add-on litres are derived from strings, which rows are
    counted, grid label parsing, the ledger-vs-day-cell money trap, a PowerShell
    test recipe and assertions G1–G9.
  - `references/bug-register.md` — template, status vocabulary, four seeded
    entries (BUG-001 blocker pickup selector `FIXED-DEPLOYED` `cb1e85fc`,
    BUG-002 major rider-copy `OPEN`, BUG-003 `NOT-A-BUG`, BUG-004 major
    permanently-red dependency security gate `OPEN`), and a regression
    hot-spot table drawn from `AGENTS.md`.
  - `scripts/live-revision.ps1` — compares `GET /api/health.revision` against
    `origin/main` and lists commits not yet live.
  - Credentials deliberately excluded: the skill reads role credentials from
    `AAGAM_*_EMAIL` / `AAGAM_*_PASSWORD` at runtime and tells the agent to ask
    the user when they are unset.
  - Repo wiring: `.gitignore` changed from ignoring all of `.commandcode/` to
    `.commandcode/*` + `!.commandcode/skills/`, so the skill is tracked while
    `.commandcode/design/` and other tool state stay local. `AGENTS.md` gained
    an **Agent skills** section so any model reading the repository finds the
    skill without being told where it is.
