# Bitácora de señuelos de la Fase 4 — capa de base de datos

**Corridos el 2026-09-06 por el ejecutor del plan 04-07, sobre el checkout principal.**

Un señuelo es una mutación deliberada que rompe **una sola cosa**. Si la suite no se pone roja,
la aserción no prueba lo que dice probar, y eso es un hallazgo, no un trámite. El ciclo de cada
uno fue el mismo, sin atajos:

1. aplicar la mutación en el archivo de migración,
2. `npm run db:reset` (la migración entera se reaplica: el señuelo tiene que viajar por el camino real, no por un `create or replace` suelto),
3. correr la suite que corresponde y **anotar el número y el nombre exactos de la aserción roja, con su mensaje**,
4. revertir con `git checkout -- supabase/`,
5. `npm run db:reset` otra vez y **confirmar `Result: PASS`** antes de pasar al siguiente.

Los pasos 4 y 5 no son burocracia: los señuelos 2, 3 y 8 **debilitan guardas de autorización**.
Dejar cualquiera de ellos en el repositorio sería T-04-01 a T-04-05 materializados, escritos por
nosotros mismos y firmados. El paso 5 se ejecutó **once veces** y devolvió `Files=7, Tests=153,
Result: PASS` las once.

Formato heredado de las fases 1 a 3, que llevan 48 de 49 atrapados.

---

## Resumen

| # | Mutación (archivo:línea) | Suite | Prueba que se puso roja | Mensaje | Resultado |
|---|---|---|---|---|---|
| **0** | `20260903120000_15…sql:409-410` — quitar `reservation_id = null` del `update` de `reschedule_cleaning` | `test:integration` | `aseos-admin.integration.test.ts` → **1** "el aseo reprogramado SOBREVIVE al sync, y el checkout real se repone" y **2** "la bitácora NO tiene una cancelación anónima sobre el aseo reprogramado" | (1) `expected '39abb20e-…' to be null`; (2) `expected [ {…} ] to deeply equal []` con la fila `{to_state: "cancelada", reason: "reserva_movida", actor_id: null}` | **atrapado** |
| **1** | `20260903120000_15…sql:177` — añadir `update public.properties set responsable_id = p_aseador where id = v_property;` dentro de `reassign_cleaning` | `db:test` | `06_aseos_admin` → **14** "D-18 reassign_cleaning reasignó el aseo y dejó el apartamento byte a byte igual: no tocó responsable_id ni suplente_id" (arrastra la **13**) | `have: {true,false}` / `want: {true,true}` | **atrapado** |
| **2** | `20260903120000_15…sql:474-476` — quitar `if not (select private.is_admin())` de `close_cleaning` | `db:test` | `06_aseos_admin` → **7** "ASEO-08 una aseadora no puede cerrar a mano: close_cleaning levanta 42501", **8** "y el aseo en curso quedó byte a byte igual tras el intento denegado", **28** | `have: sin_error` / `want: 42501`; la fila del aseo pasa de `en_curso` a `completada` bajo el JWT de la aseadora | **atrapado** |
| **3** | `20260903120000_15…sql:502` — borrar `revoke all … from public, anon` de `close_cleaning` | `db:test` | `02_guardarrailes` → **10** "guardarraíl: ninguna función de public ni private es ejecutable por anon" | `Unexpected records: (public.close_cleaning)` | **atrapado** |
| **4a** | `20260903120000_15…sql:494` — `coalesce(started_at, now())` → `now()` | `db:test` | `06_aseos_admin` → **29** "ASEO-08 cerrar un aseo en curso NO pisa su started_at: es la hora real en que empezó el trabajo" | `have: completada/inicio:2026-09-06 16:33:56…` / `want: completada/inicio:2026-09-06 15:03:56…` (hora y media borrada) | **atrapado** |
| **4b** | `20260903120000_15…sql:492-494` — quitar la asignación de `started_at` por completo | `db:test` | `06_aseos_admin` → **27** "ASEO-08 close_cleaning desde pendiente completa el aseo sin romper cl_completada_shape" | `have: pendiente/inicio_nulo:true/fin_nulo:true/orden_ok:false` / `want: completada/inicio_nulo:false/…` — el aseo no se mueve porque el `update` revienta con **23514 `cl_completada_shape`** (medido aparte, ver abajo) | **atrapado** |
| **5** | `20260903120000_15…sql:301-303` — envolver el `insert` de `create_manual_cleaning` en `exception when unique_violation then raise 'P0001'` | `db:test` | `06_aseos_admin` → **20** "ASEO-07 crear sobre apartamento y fecha ocupados propaga el 23505 CON el nombre del índice: la RPC no captura el unique_violation" | `have: {P0001,false}` / `want: {23505,true}` | **atrapado** |
| **6** | `20260903120000_15…sql:560` — añadir un `insert into public.cleaning_state_transitions` dentro de `cancel_cleaning` | `db:test` | `06_aseos_admin` → **32** "ASEO-09 queda EXACTAMENTE una fila en la bitácora, la del trigger, con el motivo del admin" | `have: 2/cancelado_por_admin+cancelado_por_admin` / `want: 1/cancelado_por_admin` | **atrapado** |
| **7** | `20260903120000_15…sql:531` — añadir `p_motivo text` a `cancel_cleaning` y escribirlo en `cancel_reason` (con sus `revoke`/`grant` y su `comment` ajustados a la firma nueva) | `db:test` | `06_aseos_admin` → **36** "ninguna de las seis RPC del admin asigna cancel_reason desde un parámetro: el slug es literal" | `have: {1,6}` / `want: {0,6}` | **atrapado** |
| **8** | `20260903120000_15…sql:151` — quitar `and p.is_active` de la validación del destino de `reassign_cleaning` | `db:test` | `06_aseos_admin` → **15** "ASEO-04 NEG reasignar a una aseadora desactivada levanta P0001 y la pista nombra a la aseadora" | `have: {sin_error,false}` / `want: {P0001,true}` | **atrapado** |
| **9** | `20260903120000_15…sql:667-696` — comentar el bloque `do $realtime$` completo | `db:test` | `06_aseos_admin` → **39** "D-13 public.cleanings está publicada en supabase_realtime…" y **40** "D-13 public.notifications está publicada…" | `have: 0` / `want: 1`, las dos | **atrapado** |
| **10** | `20260902235500_14…sql:247,321` — `interval '3 hours'` → `'6 hours'` (**migración de la Fase 3**) | `db:test` | `05_sync` → **38** "feed_health_watchdog sigue usando interval 3 hours exactamente dos veces: el umbral del watchdog y el del panel no se pueden separar" (arrastra 51, 52, 53, 54, 55 y 57) | `have: 0` / `want: 2` | **atrapado** |

**Doce mutaciones, once filas, cero escapes.** No hubo ningún señuelo que se quedara verde, así
que ninguna aserción tuvo que reescribirse.

---

## Detalle de los que dejaron algo aprendido

### 0 — Reprogramar sin desanclar la reserva

Es el señuelo de mayor valor de la fase y el único que **ninguna aserción pgTAP puede correr**:
para verlo hay que ejecutar `sync_feed_apply()` entero. Por eso vive en
`lib/domain/aseos-admin.integration.test.ts` y no en `06_aseos_admin.test.sql`, que lo declara
explícitamente en su cabecera como algo que no mide.

La mutación es de dos palabras. Sin `reservation_id = null`, el aseo que el admin movió a D+8
sigue apuntando a una reserva cuyo `ends_on` es D+5, y en la **segunda corrida del mismo feed sin
un solo cambio en el `.ics`** el bucle de reserva movida del reconcile (migración 13, paso e.2) lo
cancela y crea otro en la fecha vieja. El trabajo del admin desaparece solo, treinta minutos
después, en otro archivo.

La fila que el test imprimió al ponerse rojo es **exactamente la señal de alarma que hay que
buscar en producción**:

```
{ "cleaning_id": "fd0932ef-…", "from_state": "pendiente", "to_state": "cancelada",
  "reason": "reserva_movida", "actor_id": null,
  "created_at": "2026-09-06T16:24:25.529735+00:00" }
```

`actor_id` nulo significa que quien escribió no era una persona: el trigger lo rellena con
`auth.uid()`, nulo cuando escribe la clave de servicio o `pg_cron`. Una transición hacia
`cancelada` con `reason = 'reserva_movida'` y `actor_id` nulo, minutos después de que un admin
reprogramara, quiere decir una sola cosa: **la RPC no desancló**.

### 1 — El señuelo de D-18, y el control positivo que lo salvó

La aserción 14 compara la fila entera del apartamento **antes y después**, y su segundo elemento
es un control positivo: exige que la reasignación SÍ haya ocurrido. Sin ese segundo elemento la
aserción sería vacua, porque "el apartamento no cambió" también pasa en verde con la función sin
crear.

Y resultó ser lo que atrapó el señuelo, porque el fallo no llegó por donde se esperaba. La fixture
`b1000000-…-0001` tiene responsable `…000a` y suplente `…000b`, y la reasignación de la aserción 13
es hacia `…000b`. El `update public.properties set responsable_id = p_aseador` inyectado hace que
responsable y suplente coincidan, viola `props_suplente_distinct` y **aborta la transacción entera
de la RPC**. Por eso la aserción 14 devolvió `{true,false}`: el apartamento quedó intacto (primer
elemento en `true`, la mitad "negativa" de la aserción pasó) y la reasignación no ocurrió (segundo
elemento en `false`).

Es decir: sin el control positivo, este señuelo **habría escapado en esta fixture concreta**. Vale
la pena tenerlo anotado, porque la lección no es sobre D-18 sino sobre la forma de la aserción.

### 2 — T-04-03, la amenaza más concreta de la fase

Con la guarda de rol fuera, la aserción 8 imprimió la fila del aseo antes y después del intento
**hecho con el JWT de la aseadora**, y la diferencia es de una palabra: `en_curso` → `completada`,
con `finished_at` poblado. Es literalmente el bypass de `finish_cleaning`: un aseador da su propio
aseo por terminado sin checklist y sin una sola foto.

Sin este señuelo corrido, la mitigación de T-04-03 sería una afirmación sobre el código y no una
prueba de que el código la sostiene.

### 3 — El `revoke` que no se hereda

`grant execute … to authenticated` no le quita nada a `anon`: el `execute` de una función se
concede a `PUBLIC` por defecto, y `anon` lo hereda. Al borrar **una sola** de las seis líneas de
`revoke`, el guardarraíl transversal nombró a la culpable por su nombre
(`Unexpected records: (public.close_cleaning)`), que es lo que hace que ese guardarraíl valga la
pena frente a un `is(count, 0)`.

Confirma también que el par `revoke`/`grant` pegado a cada definición no es decorativo, y que la
aserción no se puede satisfacer "de rebote" desde otra función.

### 4b — El 23514, medido y no supuesto

La aserción 27 se pone roja mostrando el aseo intacto en `pendiente`. Eso es el *efecto*; la
*causa* se midió aparte, ejecutando contra el contenedor el mismo `update` que la función mutada
hace, sobre una fila creada y descartada dentro de un `begin … rollback`:

```
ERROR:  new row for relation "cleanings" violates check constraint "cl_completada_shape"
```

Queda anotado porque el mensaje que ve quien corre la suite no nombra el CHECK, y el que hay que
reconocer en producción sí.

### 10 — La mutación que había que revertir sin falta

Es la única que toca una migración de la **Fase 3**. La aserción estructural 38 de `05_sync`
(`pg_get_functiondef` con `interval '3 hours'` exactamente dos veces) se puso roja con
`have: 0 / want: 2`, y arrastró seis aserciones de comportamiento del watchdog (51 a 55 y 57),
que es la señal de que el umbral del watchdog y el del panel de salud **están acoplados a
propósito** y no se pueden separar sin que alguien se entere.

Revertida y verificada: `git diff --quiet -- supabase/` pasa y `05_sync` volvió a verde.

---

## Estado del repositorio al cerrar

```
$ git diff --quiet -- supabase/ && echo "GIT DIFF SOBRE supabase/ LIMPIO"
GIT DIFF SOBRE supabase/ LIMPIO

$ npm run db:reset && npm run db:test
Files=7, Tests=153,  Result: PASS

$ npm run test:integration
Test Files  14 passed (14)
     Tests  128 passed (128)
```

**Ninguna mutación de señuelo quedó en el repositorio.** Los archivos tocados fueron dos y solo
dos: `supabase/migrations/20260903120000_15_rpc_admin_y_realtime.sql` y
`supabase/migrations/20260902235500_14_sync_jobs.sql`, ambos restaurados con
`git checkout -- supabase/` y verificados contra el índice.
