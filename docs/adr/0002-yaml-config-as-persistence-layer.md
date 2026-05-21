# 0002 — YAML config as the persistence layer (BI-as-code)

Dashboard definitions — Sources, Models, and Dashboards — are stored as YAML documents, auto-saved to `localStorage`, and exportable as `.yaml` files for sharing and git versioning. The YAML Config is the source of truth; the wizards read from and write back to it.

This was chosen over a traditional GUI-state approach (e.g. storing dashboard config as opaque JSON keyed by ID) because YAML is human-readable, diffable, and version-controllable — aligning with the Rill Data model that inspired DuckLens. The trade-off is that any schema change requires a migration strategy, and the v1 schema is intentionally locked early (see `src/lib/types.ts`) to give the query and wizard layers a stable contract to build on.
