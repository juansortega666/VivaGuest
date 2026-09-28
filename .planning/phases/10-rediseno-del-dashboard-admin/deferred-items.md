# Fase 10 · Hallazgos fuera de alcance, encontrados al ejecutar 10-04

Nada de esto lo causó el rediseño de `/login`. El diff completo del plan 10-04 son
nueve archivos y ninguno vive fuera de `app/(public)/login/`, `app/globals.css`,
`e2e/login.spec.ts` y `.planning/`. Se anotan aquí porque la regla de alcance del
ejecutor prohíbe arreglar lo que no causó, y prohíbe también callárselo.

---

## 1. `sync-diff.integration.test.ts` tiene dos fechas literales que caducaron el 2026-09-28

**Estado:** 2 casos rojos de 205 en `npm run test:integration`. Corren verdes el
2026-09-19 (lo reporta `10-03-SUMMARY.md`) y rojos el 2026-09-28.

```
FAIL lib/domain/sync-diff.integration.test.ts > una reserva que cambia de fechas
  > 1: el aseo viejo se cancela y el nuevo nace SIN CONFIRMAR
  > 3: confirmado y asignado pero SIN empezar sí se cancela
AssertionError: expected +0 to be 1
  expect(t1.corrida?.cleanings_cancelled).toBe(1)
```

**Causa, y es la que el propio archivo predijo.** Sus líneas 70 y 71 son

```ts
const FECHA_VIEJA = '2026-09-27';
const FECHA_NUEVA = '2026-09-29';
```

y hoy es **2026-09-28**. `FECHA_VIEJA` cayó al pasado, así que el aseo viejo ya no
está por encima del piso de la corrida y el diff no lo cancela: `cleanings_cancelled`
sale 0 donde el caso espera 1.

La cabecera de ese mismo archivo, líneas 43 a 50, lo advierte literalmente:

> *"LAS FECHAS RELATIVAS NO SON UN LUJO. La ventana protegida se define respecto a
> HOY. Una fixture con fechas literales que hoy cae dentro de la ventana mañana cae
> fuera, y el test que la usa deja de probar lo que decía probar SIN QUE NADA SE
> PONGA ROJO."*

Los tres candados de fecha se escribieron con `feedConCheckoutRelativo`. **Estos dos
casos no**, y es donde la bomba estaba armada.

**Por qué no se arregla aquí.** El arreglo no es cambiar el número: es convertir
`FECHA_VIEJA` y `FECHA_NUEVA` en relativas y regenerar las dos fixtures
(`airbnb-real-anonimizado.ics` y `airbnb-real-movida.ics`) para que sus `DTEND`
también lo sean. Eso es trabajo sobre el dominio de sincronización, que este plan
declara explícitamente fuera de alcance ("NO se toca `_actions.ts`, ni auth, ni el
middleware, ni ninguna ruta distinta de `/login`").

**Consecuencia de segundo orden, y hay que tenerla en cuenta al leer la suite E2E:**
cuando esos dos casos mueren, el `afterAll` de `limpiarSync()` deja filas en
`cleanings`, y `e2e/operacion.spec.ts` es sensible a eso. Su propio guardia lo dice:

```
Error: La tabla cleanings arranca con 12 filas y este spec cuenta filas en pantalla.
Corre `npm run db:reset` antes de la suite E2E.
```

O sea: correr `test:integration` **antes** de la suite E2E sin un `db:reset` entre
medias contamina la corrida de Playwright mientras estos dos casos sigan rojos.

---

## 2. El stack local de Supabase no arranca completo en esta máquina

**Estado:** `npx supabase start` falla con

```
LegacyHealthCheckTimeoutError: supabase_analytics_vivaguest container is not ready:
unhealthy / supabase_vector_vivaguest ... / supabase_realtime_vivaguest ... /
supabase_storage_vivaguest ... / supabase_studio_vivaguest ...
```

**Causa:** memoria. Docker Desktop tiene 4 GB y los comparte con contenedores de
otros dos proyectos del usuario (`tresur-hope-lite-app`, `tresur-hope-lite-db`,
`alfa-mvp-db`), y la máquina ya viene apretada (ver la nota
`maquina-sin-memoria-docker`). `analytics` (logflare) y `vector` son los pesados, y
`realtime`, `storage` y `studio` caen detrás porque dependen de ellos para logging.

**Cómo se levantó para esta corrida**, sin tocar `supabase/config.toml`:

```bash
npx supabase stop
npx supabase start -x vector,logflare,studio,imgproxy,realtime,edge-runtime
```

Eso deja arriba `db`, `auth`, `rest`, `kong`, `storage`, `pg_meta` e `inbucket`, que
es todo lo que la suite necesita. **`storage` sí hace falta**: sin él,
`e2e/mis-pagos.spec.ts` y `e2e/almacenamiento.spec.ts` fallan con
`No se pudieron subir los bytes del recibo: name resolution failed`, que se lee como
un bug del producto y es un contenedor apagado.

**No es alcance de este plan**, pero merece quedar escrito en `COMO-CORRER-PRUEBAS.md`
o en `.planning/codebase/TESTING.md`: es exactamente el tipo de trampa que esa chuleta
existe para documentar, y cuesta media hora de diagnóstico cada vez.

---

## 3. Dos casos E2E rojos con la base reseteada, ninguno en `/login`

**Estado:** con `npm run db:reset` inmediatamente antes, `PLAYWRIGHT_PORT=3210 npx
playwright test` reporta **171 pasados · 2 fallados · 1 saltado** (174 en total).

| Caso | Síntoma |
|---|---|
| `e2e/operacion.spec.ts:429` — *cancelar un aseo, y el descarte del diálogo dice Volver y nunca Cancelar* | `getByRole('button', { name: 'Ver cancelados (1)' })` no aparece. El diálogo, sus dos botones y la cancelación en sí pasan: lo que no cuadra es el contador global de cancelados |
| `e2e/push-instalacion.spec.ts:97` — *E1, con el permiso concedido queda UNA suscripción viva* | `Test timeout of 30000ms exceeded`. En corrida aislada arrastra además a `E3` |

**Por qué no los causó este plan, y no es una opinión:**

1. El diff completo de 10-04 son nueve archivos
   (`git diff --name-only 5f8d6af..HEAD`) y ninguno vive fuera de
   `app/(public)/login/`, `app/globals.css`, `e2e/login.spec.ts` y `.planning/`.
2. El único archivo global tocado es `app/globals.css`, y su **único cambio
   funcional** es `grid-template-columns: 45% 10% 45%` → `50% 50%` dentro de
   `@utility rejilla-login`. Esa utilidad tiene **un solo consumidor en todo el
   repo**: `app/(public)/login/page.tsx`. Ningún token de color, espaciado,
   tipografía o movimiento cambió de valor.
3. Los 171 verdes incluyen las demás pantallas del admin y del aseador, que se
   autentican tecleando en `/login` por `e2e/fixtures.ts`. Si el rediseño hubiera
   roto el camino de autenticación, no caerían dos casos: caería la suite.
4. `push-instalacion` es sensible al `edge-runtime`, que está excluido del stack
   local por el punto 2 de este archivo.

**Los dos son reproducibles, no intermitentes** (se volvieron a correr aislados y
volvieron a caer). Quedan para quien tenga el alcance de `/operacion` y del carril
de push.
