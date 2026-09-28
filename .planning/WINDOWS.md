---
schema_version: 1
open_count: 5
waived_count: 0
fixed_count: 1
total_count: 6
last_updated: 2026-09-28T18:24:05.584Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 09 | deviation | app/(admin)/operacion/_components/DialogoCancelarAseo.tsx | 134 | El toast de exito se pierde ~32% de las veces: toast.success() y acto seguido router.refresh() en el mismo tick; medido con MutationObserver, cero inserciones en 15 s | open |  | 2026-09-18T20:59:42.244Z |  |
| 2 | 09 | unrun-verify | e2e/push-instalacion.spec.ts | 215 | Rojo intermitente sin causa aislada: dos mediciones que se contradicen en las dos direcciones | open |  | 2026-09-18T20:59:42.393Z |  |
| 3 | 10 | unrun-verify | e2e/login.spec.ts |  | npm run db:reset + suite E2E completa no se corrio en 10-01: el ejecutor paralelo de 10-02 tenia corridas en vuelo sobre la misma base local | fixed |  | 2026-09-19T06:14:52.174Z | 2026-09-19T06:45:25.215Z |
| 4 | 10 | deviation | lib/domain/sync-diff.integration.test.ts | 70 | FECHA_VIEJA='2026-09-27' y FECHA_NUEVA='2026-09-29' son literales y caducaron el 2026-09-28: 2 casos de integracion rojos. La cabecera del propio archivo advierte de este modo de fallo. Fuera del alcance de 10-04 | open |  | 2026-09-28T18:24:05.133Z |  |
| 5 | 10 | deviation | e2e/operacion.spec.ts | 429 | cancelar un aseo: el contador 'Ver cancelados (1)' no aparece con la base reseteada el 2026-09-28. Reproducible, ajeno a /login | open |  | 2026-09-28T18:24:05.366Z |  |
| 6 | 10 | deviation | e2e/push-instalacion.spec.ts | 97 | E1 de push: timeout de 30s. El stack local corre sin edge-runtime por falta de memoria en Docker. Ajeno a /login | open |  | 2026-09-28T18:24:05.584Z |  |

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
  },
  {
    "id": 3,
    "kind": "unrun-verify",
    "phase": "10",
    "file": "e2e/login.spec.ts",
    "line": null,
    "description": "npm run db:reset + suite E2E completa no se corrio en 10-01: el ejecutor paralelo de 10-02 tenia corridas en vuelo sobre la misma base local",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-09-19T06:14:52.174Z",
    "resolved_at": "2026-09-19T06:45:25.215Z",
    "milestone": "v1.0"
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "10",
    "file": "lib/domain/sync-diff.integration.test.ts",
    "line": 70,
    "description": "FECHA_VIEJA='2026-09-27' y FECHA_NUEVA='2026-09-29' son literales y caducaron el 2026-09-28: 2 casos de integracion rojos. La cabecera del propio archivo advierte de este modo de fallo. Fuera del alcance de 10-04",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-28T18:24:05.133Z",
    "resolved_at": null,
    "milestone": "v1.0"
  },
  {
    "id": 5,
    "kind": "deviation",
    "phase": "10",
    "file": "e2e/operacion.spec.ts",
    "line": 429,
    "description": "cancelar un aseo: el contador 'Ver cancelados (1)' no aparece con la base reseteada el 2026-09-28. Reproducible, ajeno a /login",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-28T18:24:05.366Z",
    "resolved_at": null,
    "milestone": "v1.0"
  },
  {
    "id": 6,
    "kind": "deviation",
    "phase": "10",
    "file": "e2e/push-instalacion.spec.ts",
    "line": 97,
    "description": "E1 de push: timeout de 30s. El stack local corre sin edge-runtime por falta de memoria en Docker. Ajeno a /login",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-09-28T18:24:05.584Z",
    "resolved_at": null,
    "milestone": "v1.0"
  }
]
````
