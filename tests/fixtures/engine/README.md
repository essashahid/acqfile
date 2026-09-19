# Hand-authored Phase 1 scenarios

`clean.json` supplies a complete small synthetic deal and explicit expected rows. `defects.json`, `unknowns.json`, `traps.json` and `packs.json` supply authored edits to that deal, an optional subset of actual shipped rules, and explicit expected rows/findings. The adapter in tests/unit/engine-fixtures.ts expands short source records into typed evidence with fixed locators, dates and audit references. Expected outputs are never calculated by the engine or a fixture generator.

Focused defect cases isolate each check/CON rule so one unknown cannot hide the intended defect. Clean evaluates the entire pack. Packs use the same economic inputs with dates on the appropriate side of the boundary, avoiding an unrelated pack-selection warning. Tracking and manual confirmations are explicit evidence, never implicit defaults. Every optional expectation expands to an exact item/scope/period/status tuple.

The monotonic tests keep the evaluation evidence inventory fixed while deleting every segment/fact in each scenario. A fresh authored scenario rebuilds its inventory; deletion within that snapshot cannot silently erase a disagreement. All timestamps are fixed; no fixture reads the system clock.
