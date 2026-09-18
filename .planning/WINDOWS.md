---
schema_version: 1
open_count: 2
waived_count: 0
fixed_count: 0
total_count: 2
last_updated: 2026-09-18T20:59:42.393Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 09 | deviation | app/(admin)/operacion/_components/DialogoCancelarAseo.tsx | 134 | El toast de exito se pierde ~32% de las veces: toast.success() y acto seguido router.refresh() en el mismo tick; medido con MutationObserver, cero inserciones en 15 s | open |  | 2026-09-18T20:59:42.244Z |  |
| 2 | 09 | unrun-verify | e2e/push-instalacion.spec.ts | 215 | Rojo intermitente sin causa aislada: dos mediciones que se contradicen en las dos direcciones | open |  | 2026-09-18T20:59:42.393Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "09",
    "file": "app/(admin)/operacion/_components/DialogoCancelarAseo.tsx",
    "line": 134,
    "description": "El toast de exito se pierde ~32% de las veces: toast.success() y acto seguido router.refresh() en el mismo tick; medido con MutationObserver, cero inserciones en 15 s",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T20:59:42.244Z",
    "resolved_at": null,
    "milestone": "v1.0"
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "09",
    "file": "e2e/push-instalacion.spec.ts",
    "line": 215,
    "description": "Rojo intermitente sin causa aislada: dos mediciones que se contradicen en las dos direcciones",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-18T20:59:42.393Z",
    "resolved_at": null,
    "milestone": "v1.0"
  }
]
````
