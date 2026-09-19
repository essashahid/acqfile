# Phase 2 oracle investigation log

Expectations are authored in plans before engine execution. The oracle compares every checklist identity/status and every finding identity/type/severity/key, and checks the engine's evidence references independently. Diagnostic wording and ordering are not a truth contract. No engine outputs are copied into truth.

## First comparison (2026-09-19)

- A, both batches: engine expanded personal guarantor rows and personal cash comparison for a 40% intermediate LLC. **Engine wrong:** ownership-derived personal guarantor scopes now require an individual; an explicitly declared guarantor remains honored. Citizenship/owner scope still includes the entity and indirect person. Regression test covers this distinction. This is document scoping, not a determination about a guaranty obligation.
- A, both batches: the plan omitted the intermediate LLC's affiliate tax/interim/debt rows. **Plan wrong:** the existing affiliate scope also reaches that owned entity. Added its independently authored zero-revenue holding-company statements and expected rows; did not suppress the engine's scope.
- A, both batches: expired LOI affected TXN-01 as well as CON-15. **Plan wrong:** TXN-01 explicitly checks the expiry. Added its received_with_issues row and incomplete finding to planted item 23.
- B: equipment/inventory rows were initially marked not_applicable for a stock purchase. **Plan wrong:** resolved pack requires both unconditionally. Authored satisfied expectations because both documents are supplied.
- C: first comparison passed (63 checklist rows, four findings).

Pre-oracle layout validation also found insufficient pair-only bundle capacity for C; allowed related email packets to contain more than two segments. No expected evaluation was changed for layout.
