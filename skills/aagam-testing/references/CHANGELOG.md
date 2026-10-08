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

- **2026-10-08 · v1.1.0 · relocated to a tracked top-level `skills/` directory**
  - Moved `.commandcode/skills/aagam-testing/` → **`skills/aagam-testing/`**
    (seven files, `git mv`, history preserved).
  - Why: `.commandcode/` is this tool's own config/state directory and is
    gitignored by default, so the v1.0.0 wiring needed a `.gitignore`
    carve-out just to make the skill committable — and a dot-directory is
    hidden in a normal file listing, so a human browsing the repository would
    never find it. A top-level `skills/` is the convention used by public
    agent-skill repos, is self-advertising, and needs no tool-specific config
    for another model to read it.
  - `.gitignore` reverted to a plain `.commandcode/` rule; the carve-out is
    gone and `.commandcode/design/` stays local as before.
  - Path references updated in `SKILL.md` (live-revision invocation) and
    `references/api.md` (script location).
  - `AGENTS.md` → **Agent skills** now names `skills/<name>/` and explains why
    it is not a dot-directory.
  - Content unchanged: flows, assertions G1–G9, endpoint map and BUG-001…
    BUG-004 are identical to v1.0.0.

- **2026-10-08 · v1.1.1 · first real test pass: packed/sold/left in the store grid**
  - Ran the store-grid assertions against live revision `2be0cfb6` for five
    dates. **G1, G2, G4 and G7 passed** on all five; G3 holds trivially;
    G5/G6/G8/G9 were not exercised (no mutation run). Values recorded in
    `references/store-grid.md` §9 *Last verified*.
  - **BUG-005 opened (minor, `OPEN`)** — the store grid answers *"how much did
    the rider leave with"* (`Total Pack: 20.25 L`) but never answers *"how much
    sold"* or *"how much is left"*. `todayStats` sums volume over all
    non-skipped stops and counts delivered stops without summing their volume;
    a repo-wide grep for `soldLitres|leftLitres|remainingLitres` returns
    nothing. The API already returns per-stop `totalLiters` **and** `status`,
    so only the aggregation and labels are missing.
  - Also documented in `store-grid.md` §9: where the two pack surfaces live
    (checklist bar + **Pack Summary** modal), that both agree with
    `dispatch-summary` exactly, and that **Pack Summary is intentionally
    today-only** (no `date` parameter) — recorded so nobody files it as a bug.
