# PRD — DuckLens: A Client-Side, Config-Driven Analytics Dashboard

**Status:** Draft for review
**Author:** generated via Claude Code
**Last updated:** 2026-05-21

---

## 1. Summary

DuckLens is a fully client-side BI tool inspired by [Rill Data](https://www.rilldata.com/).
Users load data (CSV, DuckDB files), define an analytical model with SQL (including
joins across tables), and explore it through fast, interactive dashboards that support
drill-down, time-range selection, and period-over-period comparison.

Everything runs in the browser via **DuckDB WASM** — no server, no data upload, no
backend. Dashboards are defined as **YAML config** (BI-as-code), authored through guided
**wizards**, and persisted to `localStorage` with YAML import/export for sharing and
git versioning.

## 2. Goals & Non-Goals

### Goals
- Load data and query it entirely in the browser using DuckDB WASM.
- Let users build an analytical model with SQL, joining multiple source tables.
- Generate exploratory dashboards from declarative YAML config.
- Author dashboards via wizards (no hand-writing YAML required, but always possible).
- Deliver core time intelligence: range + grain, period-over-period, drill-down filters.
- Interactive charts (ECharts) that double as filter controls.

### Non-Goals (for now)
- No backend, auth, or multi-user collaboration.
- No server-side DuckDB / big-data (limited to what fits in browser memory).
- No scheduled refresh, alerting, or embedding API.
- SQLite source support is deferred (DuckDB has a sqlite extension we can add later).

## 3. Decisions (locked)

| Area | Decision |
|---|---|
| Architecture | Fully client-side; static site, all compute in browser |
| Framework | SvelteKit + TypeScript |
| Query engine | DuckDB WASM (the "backend") |
| Data model | SQL model layer (Rill-style): SQL `SELECT` joins raw tables into a model |
| Config format | YAML; auto-saved to `localStorage` + download/upload `.yaml` |
| Charts | ECharts |
| v1 sources | CSV upload, DuckDB file upload |
| Time features | Range picker + grain, period-over-period comparison, dimension drill-down |
| First deliverable | Thin vertical slice (this PRD scopes it), with real joins |

## 4. Personas

- **Analyst (primary):** comfortable with SQL, wants to slice data fast without standing
  up infra. Writes/edits the model SQL, tweaks YAML.
- **Explorer (secondary):** non-author who opens a shared dashboard YAML + data and
  drills around. Uses wizards and filters, not SQL.

## 5. Core Concepts (data flow)

```
Source files (CSV / .duckdb)
        │  registered as DuckDB tables
        ▼
   Raw tables  ──►  Model (SQL SELECT, joins)  ──►  Metrics View
                                                        │ (dimensions, measures, timestamp)
                                                        ▼
                                                   Dashboard (YAML)
                                                        │
                                                        ▼
                          Interactive UI: time chart, leaderboards, metric cards
```

- **Source:** an uploaded file. CSV → `read_csv_auto`; `.duckdb` → `ATTACH` and read tables.
- **Model:** a named SQL `SELECT` that may join multiple raw tables into one wide,
  analysis-ready relation. Materialized as a DuckDB view (or table for perf).
- **Metrics View:** declares, over a model, the `timeseries` column, the `dimensions`
  (categorical, drillable) and `measures` (SQL aggregate expressions).
- **Dashboard:** binds a metrics view to a layout + default time range/grain + comparison.

## 6. Config Schema (YAML, draft)

Three resource kinds. Each is one YAML doc; a project is a set of docs.

### 6.1 Source
```yaml
kind: source
name: orders_csv
type: csv            # csv | duckdb
file: orders.csv     # original filename (matched to an uploaded handle)
# duckdb-only: tables: [orders, customers]
```

### 6.2 Model (the join layer)
```yaml
kind: model
name: orders_enriched
sql: |
  SELECT
    o.order_id,
    o.ordered_at,
    o.amount,
    c.country,
    c.segment,
    p.category
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.customer_id
  LEFT JOIN products  p ON o.product_id  = p.product_id
materialize: view   # view | table
```

### 6.3 Metrics View + Dashboard
```yaml
kind: dashboard
name: sales_overview
model: orders_enriched
timeseries: ordered_at
default_time_range: P30D     # ISO-8601 duration; or explicit {start, end}
default_grain: day           # hour | day | week | month | quarter | year
comparison:
  enabled: true
  mode: previous_period      # previous_period (v1)

dimensions:
  - name: country
    column: country
  - name: segment
    column: segment
  - name: category
    column: category

measures:
  - name: total_revenue
    label: Total Revenue
    expr: SUM(amount)
    format: usd
  - name: order_count
    label: Orders
    expr: COUNT(*)
    format: number

layout:
  metric_cards: [total_revenue, order_count]
  timeseries_measure: total_revenue
  leaderboard_dimensions: [country, segment, category]
```

> Schema is intentionally close to Rill's so concepts transfer. It will evolve; the
> wizard is the source of truth for what fields are required.

## 7. Wizards (authoring UX)

1. **Connect Data Wizard** — drag/drop CSV or `.duckdb`; preview inferred schema
   (column names + types from DuckDB); confirm → emits `source` config and registers tables.
2. **Model Wizard** — pick base table, optionally add joins. Two modes share one screen:
   a scaffold UI (pick tables + keys) that *generates SQL*, plus a SQL editor for hand
   edits. Live "Run" shows a result preview + row count → emits `model` config.
3. **Metrics Wizard** — choose timestamp column, select dimension columns, define measures
   (label + aggregate expr + format) with live validation against the model → emits
   `dashboard` config dimensions/measures.
4. **Dashboard Wizard** — choose default time range/grain, toggle comparison, arrange
   metric cards / leaderboards → finalizes the `dashboard` config.

Each wizard step writes back to the YAML; advanced users can jump to a raw YAML editor at
any time and the wizards reflect the parsed result.

## 8. Dashboard Interactions (runtime)

- **Metric cards:** big-number per measure for the selected range, with comparison delta
  (absolute + %) vs previous period, colored up/down.
- **Time-series chart (ECharts):** selected measure over time at the chosen grain;
  comparison period drawn as a secondary (dashed) series; brush-to-zoom narrows the range.
- **Leaderboards:** one ranked table per dimension (top N values by the active measure)
  with comparison delta. Clicking a row **drills down** = adds an equality filter on that
  dimension and re-runs everything.
- **Filter bar:** shows active filters as chips; supports stacking multiple dimension
  filters and clearing them.
- **Time controls:** range picker (presets + custom) and grain selector.

All interactions recompute by issuing parameterized SQL to DuckDB WASM against the model.

## 9. Architecture

```
SvelteKit (SPA, adapter-static)
├─ lib/duck/        DuckDB WASM init, query API, file registration
├─ lib/config/      YAML parse/serialize, schema validation, localStorage persistence
├─ lib/query/       SQL builders (timeseries, leaderboard, totals, comparison)
├─ lib/wizards/     Connect / Model / Metrics / Dashboard wizard components
├─ lib/charts/      ECharts wrappers (time series, etc.)
├─ lib/state/       Svelte stores: active dashboard, filters, time range, grain
└─ routes/          / (home + project) , /build (wizards) , /view (dashboard)
```

- **DuckDB WASM**: lazy-loaded; uses the bundled MVP build, OPFS optional later for
  persistence of attached DBs. Files registered via `db.registerFileBuffer`.
- **Query layer**: a small set of typed SQL builders parameterize time bounds, grain
  (`date_trunc`), filters (`WHERE` from active filter chips), and the comparison window.
- **State**: changing a filter/time/grain updates stores → triggers query re-runs →
  charts/tables reactively update.

## 10. Thin Vertical Slice (first deliverable to build)

Proves the entire loop end-to-end with real joins. Acceptance criteria:

1. Upload **two CSVs** (e.g. `orders.csv` + `customers.csv`) **or** a `.duckdb` file →
   tables registered in DuckDB WASM, schema preview shown.
2. Author a **model** that **LEFT JOINs** the two tables (via wizard-generated SQL,
   editable) and run a preview.
3. Define a **metrics view**: one timestamp, ≥2 dimensions, ≥2 measures.
4. Render a dashboard with:
   - metric cards with **period-over-period** deltas,
   - an interactive **time-series** chart with grain switching + comparison overlay,
   - ≥2 **leaderboards** with **click-to-drill-down** filtering,
   - a **time-range picker** and **filter chips**.
5. Config round-trips: auto-saved to `localStorage`, **export YAML**, **import YAML**
   restores the dashboard.

Sample dataset (orders/customers) shipped so the demo works with zero setup.

## 11. Milestones

- **M0 — Scaffold:** SvelteKit + TS + static adapter, DuckDB WASM boots and runs a query, ECharts renders a test chart.
- **M1 — Data + Model:** CSV/.duckdb upload + registration, schema preview, Model wizard (join → editable SQL → preview).
- **M2 — Metrics + Query layer:** Metrics wizard, SQL builders for totals/timeseries/leaderboards, YAML serialize/parse + localStorage.
- **M3 — Dashboard runtime:** metric cards, time-series chart, leaderboards, time/grain controls.
- **M4 — Interactivity:** drill-down filters + chips, period-over-period comparison everywhere, brush-zoom.
- **M5 — Polish:** YAML import/export UI, sample dataset, error states, empty/loading states, basic responsive layout.

(Thin slice = M0–M4 with the M5 import/export + sample data.)

## 12. Risks & Open Questions

- **Bundle size / cold start:** DuckDB WASM + ECharts are heavy; lazy-load and show a boot indicator.
- **Memory limits:** large CSVs can blow browser memory; document guidance, consider sampling later.
- **File↔config binding:** YAML references a filename, but files aren't persisted across reloads (localStorage can't hold large buffers reliably). v1: on reload, prompt to re-attach files for a saved config. OPFS persistence is a later enhancement.
- **SQL safety:** model SQL runs locally against local data only (no server), so injection risk is on the user's own browser — acceptable, but we validate/parse before running.
- **Comparison semantics:** "previous period" = same-length window immediately preceding the selected range (confirm this default).

## 13. Future (post–thin-slice)
SQLite source, multiple dashboards per project, more chart types (bar/stacked/heatmap),
URL-shareable state, OPFS-backed persistence, pivot tables, derived/ratio measures,
custom time comparisons (YoY, MoM), theming.
