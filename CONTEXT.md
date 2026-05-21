# DuckLens — Domain Context

A fully client-side analytics dashboard. Users load data, define a model with SQL, and explore it through interactive dashboards. Everything runs in the browser via DuckDB WASM — no server, no upload, no backend.

---

## Terms

### Active Range
The currently selected time window, expressed as `{ start: Date, end: Date }`. Every query is scoped to the Active Range. Not to be confused with the *Default Time Range* stored in the Dashboard config, which is only the initial value.

### Comparison Period
The time window used for delta calculations. In v1 the only mode is *previous period*: a same-length window immediately preceding the Active Range. Not called "prior period", "last period", or "baseline".

### Config
The YAML representation of a project — a set of **Source**, **Model**, and **Dashboard** documents. Persisted to `localStorage` and exportable as a `.yaml` file. The Config is the source of truth; the UI reflects it, not the other way around.

### Dashboard
A Config kind that binds a **Metrics View** to a layout and default time settings. Owns `default_time_range`, `default_grain`, `comparison`, and `layout`. Not to be confused with the overall application or the screen — "Dashboard" refers specifically to this config resource.

### Dimension
A categorical column that can be used to slice, group, and filter data. Declared on a **Metrics View** by name and source column. Dimensions are what you drill down on; **Measures** are what you aggregate.

### Drill-down
The act of clicking a **Leaderboard** row to add an equality filter on that **Dimension**, re-running all queries so the whole dashboard reflects the narrowed view. Not called "filter by" or "select row".

### Filter Chip
A UI element representing one active **Dimension** filter. Multiple chips stack — the dashboard applies all of them as AND conditions. Removing a chip clears that filter.

### Grain
The temporal granularity used for bucketing time-series data: `hour | day | week | month | quarter | year`. Passed as the first argument to `date_trunc`. Not called "granularity", "resolution", or "interval".

### Leaderboard
A ranked top-N table of **Dimension** values ordered by the active **Measure**. One Leaderboard per Dimension declared in `layout.leaderboard_dimensions`. Supports **Comparison Period** deltas per row.

### Measure
A named aggregate expression (`SUM(amount)`, `COUNT(*)`, etc.) with a display label and a format (`usd | number | percent`). Declared on a **Metrics View**. Not called "metric", "KPI", or "field".

### Metrics View
The declaration of a `timeseries` column, one or more **Dimensions**, and one or more **Measures** over a named **Model**. Embedded inside the **Dashboard** config (not a separate resource kind). Not called "metric layer", "semantic layer", or "view definition".

### Model
A named SQL `SELECT` that joins one or more raw **Source** tables into a single, analysis-ready relation. Materialized as a DuckDB view. The **Metrics View** is always defined over a Model. Not called "dataset", "table", or "query".

### Source
A Config kind representing a single uploaded file (CSV or `.duckdb`) registered as one or more DuckDB tables. Not called "data source", "connection", or "dataset".

### Timeseries
The designated timestamp column of a **Model** that serves as the primary time axis. Used by the time-series chart and by all time-range WHERE clauses. Not called "date column", "timestamp field", or "time dimension".

---

## Example dialogue

> "I want to add a new metric to the dashboard."

→ Do you mean adding a **Measure** to the **Metrics View**, or changing which Measure is displayed as the active one in the **Dashboard** layout?

> "Can I filter by country?"

→ Yes — if `country` is declared as a **Dimension** on the **Metrics View**, clicking a **Leaderboard** row for that Dimension performs a **Drill-down**, adding a **Filter Chip**.
