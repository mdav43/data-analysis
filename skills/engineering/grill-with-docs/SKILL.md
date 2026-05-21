# Skill: TDD Multi-Agent Implementation from GitHub Issues + PRD

**Trigger:** User says "kick off TDD with sub-agents", "implement the issues", or points at a branch with a PRD and a set of drafted GitHub issues.

---

## Pattern overview

Given a PRD (on a source branch) and a set of drafted GitHub issues (with blocking dependencies), scaffold the project, then spawn N parallel sub-agents — each owning a non-overlapping domain — to implement their issues using strict Red→Green TDD. Close issues on GitHub when done.

---

## Step-by-step

### 1. Reconnaissance (always first)

Run in parallel:
- Read the PRD from the source branch (`mcp__github__get_file_contents`)
- List all open issues (`mcp__github__list_issues`, state: OPEN)
- Check the working branch and local file state (`git status`, `git log`)

From the issues, extract:
- The **dependency chain** (which issues block which)
- **HITL flags** — issues that require human sign-off before implementing
- **Parallel opportunities** — issues that can proceed simultaneously (e.g. issues blocked by the same parent)

### 2. Scaffold the project skeleton yourself

Before spawning agents, write the foundation files that all agents depend on:
- `package.json` with all dependencies pre-installed
- Framework config (`svelte.config.js`, `vite.config.ts`, `tsconfig.json`)
- `src/app.html`, `src/app.d.ts`, placeholder route
- **Shared type definitions** (`src/lib/types.ts`) — lock the interfaces all agents will use so they don't conflict
- Sample data / static assets
- `.gitignore` — critically, exclude `node_modules` **before** the first commit

Run `npm install` and framework sync (e.g. `npx svelte-kit sync`) so agents inherit a working environment.

Commit and push the scaffold before launching agents.

### 3. Partition issues into N agent domains

Partition by **directory ownership**, not by issue number. Each agent owns a distinct set of source directories so git conflicts are unlikely:

| Agent | Issues | Owns |
|-------|--------|------|
| Agent 1 | Foundation + data layer | `src/lib/duck/`, `src/routes/`, `src/lib/charts/`, `src/lib/wizards/<leaf>` |
| Agent 2 | Config / persistence layer | `src/lib/config/` |
| Agent 3 | Query builders + state | `src/lib/query/`, `src/lib/state/` |

Rule of thumb: pure-logic modules (SQL builders, YAML parsers, type validators) are the most parallelisable because they have no runtime deps on each other. UI/integration layers are sequential.

### 4. Write agent prompts

Each prompt must be **fully self-contained** — the agent has no conversation context. Include:

1. Working directory, branch name, tech stack
2. Which files the agent **must not touch** (shared types, package.json)
3. Which directories the agent **owns**
4. The specific issues to implement, with acceptance criteria
5. The strict TDD mandate:
   - Write ALL test files first (RED — they must fail)
   - Run tests, confirm failure
   - Implement to make them pass (GREEN)
   - Run tests again, confirm all pass
   - Only then write UI components / integration code
6. Concrete test cases to write (copy from the issue acceptance criteria)
7. Mock strategy for external dependencies (e.g. `vi.mock('@duckdb/duckdb-wasm', ...)` for WASM modules that don't run in jsdom)
8. Git workflow at the end:
   ```bash
   git pull --rebase origin <branch>
   git add <owned-dirs>
   git commit -m "feat: ..."
   git push -u origin <branch>
   # retry up to 4× with exponential backoff (2s, 4s, 8s, 16s) on push failure
   ```

### 5. Launch all agents in parallel

Send all `Agent(...)` calls in a single message so they start concurrently. Use `run_in_background: true`.

Monitor for completion notifications. When one agent completes:
- Check `git status` for anything uncommitted (agents sometimes leave modified tracked files)
- Run the full test suite to verify the GREEN state
- Commit/push any leftover changes yourself

### 6. Close issues on GitHub

Once all agents are done and tests are green, call `mcp__github__issue_write` with `state: "closed"` and `state_reason: "completed"` for each implemented issue. Write a brief implementation summary in the body covering:
- What was built
- Which files were created
- Which acceptance criteria are satisfied (checkbox list)

Do this in a single parallel batch (one tool call per issue, all in one message).

---

## ADR: decisions made in the canonical session (2026-05-21)

**Context:** DuckLens — 10 sequential GitHub issues, strict TDD, SvelteKit + DuckDB WASM + ECharts stack.

**Scaffold first, then agents.** Rather than asking Agent 1 to scaffold and Agents 2/3 to wait, the orchestrator scaffolds the project (types, package.json, install) before any agent starts. This eliminates the most common source of conflict and gives every agent a compilable baseline.

**Shared types file (`src/lib/types.ts`).** Written by the orchestrator before agents start. All agents import from it; none modify it. This avoids the scenario where two agents independently define incompatible types (e.g. `DimensionFilter`).

**No `node_modules` in git.** Add `.gitignore` *and* `git rm -r --cached node_modules .svelte-kit` immediately after the first commit if they were accidentally staged. Failing to do this caused an 8 000-file commit that had to be cleaned up.

**Mock WASM/Worker in unit tests.** DuckDB WASM uses Web Workers unavailable in Vitest/jsdom. Agent 1 uses `vi.mock('@duckdb/duckdb-wasm', ...)` + `vi.stubGlobal('Worker', ...)` for unit tests; the real WASM is exercised at runtime only.

**Query builders are pure functions.** `buildTotalsSQL`, `buildTimeseriesSQL`, `buildLeaderboardSQL`, `generateJoinSQL`, `resolveTimeRange` take typed params and return SQL strings or date objects — no DuckDB import, no side effects. This makes them trivially testable and agent-parallelisable.

**HITL issues left open.** Issues #9 (comparison semantics) and #10 (wizard UX) carry HITL flags. Non-HITL issues proceeded; HITL issues stay open for human confirmation before the next agent wave.

---

## Pitfalls

- **Committing `node_modules`** — always add `.gitignore` *before* `git add -A`.
- **Agents touching shared files** — partition ownership strictly and tell each agent explicitly what it must not touch.
- **Push conflicts** — agents finishing at the same time collide on push. The `git pull --rebase` + exponential backoff pattern resolves this without force-pushing.
- **WASM/Worker in tests** — never instantiate real DuckDB in Vitest. Mock it.
- **HITL issues** — do not implement without explicit human sign-off. Leave open and flag clearly.

---

## Outcome metrics (canonical session)

- 10 issues drafted → 7 implemented in one session
- 3 parallel agents ≈ 5 min wall time for Issues #1–#7
- 64 tests written and passing
- `npm run build` succeeds, static SPA output
