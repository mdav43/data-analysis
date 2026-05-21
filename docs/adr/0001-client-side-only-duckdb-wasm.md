# 0001 — Client-side-only architecture with DuckDB WASM

All data loading, query execution, and dashboard computation runs in the browser via DuckDB WASM. There is no backend, no server-side query engine, and no data upload to any external service. Files are registered in-memory via `registerFileBuffer`; persistence across reloads requires the user to re-attach files (OPFS is a future enhancement).

This was chosen over a backend query service (e.g. a Node/Python API wrapping DuckDB) because the primary goal is zero-infrastructure deployment — a static site anyone can open without standing up infra. The trade-off accepted is that dataset size is bounded by browser memory and Web Worker constraints, and cold start is slower due to the WASM bundle (~39 MB).
