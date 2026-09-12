---
phase: 06-pwa-del-aseador-offline-first
plan: 01
subsystem: db
tags: [schema, rls, rpc, evidencia, moneda, pwa-07, d-06]

requires:
  - phase: 01
    provides: "`cleanings`, `cleaning_checklist_items`, `cleaning_photos`, `expenses`, `property_rooms`, y los RPC `start_cleaning` / `toggle_checklist_item` / `finish_cleaning`, que YA existian"
provides:
  - "`public.motivo_sin_evidencia`: enum de cuatro valores, lista cerrada porque se puede contar"
  - "`public.cleaning_room_skips`: donde vive el motivo, con RLS y SIN DML para nadie"
  - "`public.aseo_sin_evidencia_completa(uuid)`: la marca, computada al leer y no materializada"
  - "`public.skip_room_evidence()` y `public.unskip_room_evidence()`: la unica puerta de escritura"
  - "`public.finish_cleaning()` SIN el bloqueo por checklist incompleto (D-06 deroga PWA-07)"
  - "`expenses.moneda`: codigo ISO en mayusculas, regla 1 del camino a v2"
  - "`supabase/tests/09_ejecucion_aseo.test.sql`: 21 aserciones, nacio rojo y quedo verde"
affects: [06-03, 06-04, 06-07, 06-08, 06-09, 06-10, 07]

tech-stack:
  added: []
  patterns:
    - "Un contrato pgTAP que nace rojo mide el CAMBIO, no el estado: las cuatro primeras aserciones son lives_ok sobre lo que antes lanzaba"
    - "El control de una asercion importa tanto como la asercion: la 4 (aseo completo NO marcado) es lo que impide que la 3 pase con una funcion que devuelve siempre cierto"
    - "La misma fila usada en dos aserciones con veredicto opuesto prueba la CAUSA: el aseo de la 4 pasa a estar marcado en la 7, y lo unico que cambio entre las dos fue el skip"
    - "42501 indistinguible para cuatro causas distintas de denegacion, para no dar un oraculo de enumeracion"
---

# 06-01: Migracion 18, la ejecucion del aseo

## Que se construyo

La migracion 18 y su contrato pgTAP. Tres cosas:

1. **Derogar el bloqueo de "Terminé"** (D-06). `finish_cleaning` rechazaba con
   `P0001 checklist_incompleto`; ahora no.
2. **Darle sitio al motivo del skip**: enum de lista cerrada, tabla `cleaning_room_skips`, y los dos
   RPC que la escriben.
3. **Ponerle moneda al gasto** (regla 1 del camino a v2).

## Lo que se descubrio y cambio el trabajo

**El backend ya existia casi entero.** `start_cleaning`, `toggle_checklist_item` y `finish_cleaning`
estan construidos desde la migracion 09, y `confirm_cleaning` ya materializa el checklist al
confirmar. La migracion 18 son 364 lineas, no 900, y el plan de la fase bajo de ~20 planes a 10.

## Tres defectos que el test encontro, y ninguno era del codigo nuevo

Los tres salieron al correr, no al revisar:

1. **`toggle_checklist_item` toma TRES parametros** (`p_item`, `p_done`, `p_nota`), no dos. El test
   lo llamaba con dos.
2. **`room_types` no tiene columna `is_active`.** Su DDL real es `id, slug, nombre, sort_order`. La
   siembra del test inventaba una columna.
3. **La asercion de la moneda media el privilegio, no el CHECK.** Escrita como `insert` con la sesion
   de la aseadora devolvia **42501 y no 23514**, porque `expenses` **no tiene DML para
   `authenticated`**: toda escritura pasa por RPC. La asercion habria pasado en verde **incluso con la
   columna sin restriccion ninguna**. Reescrita como `throws_ok`, que corre con el rol del archivo y
   por tanto si llega al CHECK.

El tercero es el que mas vale registrar: era un **falso verde en potencia**, de la misma familia que
los cuatro que este proyecto ya tiene catalogados.

## Verificacion

| Puerta | Resultado |
|---|---|
| `db:reset` | 18 migraciones aplicadas desde cero |
| `db:test` | **250 tests, los diez archivos en verde.** Antes 229, mas las 21 nuevas: cuadra exacto |
| `db:lint` | cero resultados |
| `db:advisors` | cero resultados |
| `db:types:check` | sin deriva |
| `tsc --noEmit` | limpio |

El rojo de Wave 0 se verifico antes de la migracion: fallaba **solo** `09_ejecucion_aseo.test.sql`,
por `relation "public.cleaning_room_skips" does not exist`, con los ocho anteriores en `ok`.

## Decisiones tomadas al implementar

- **`aseo_sin_evidencia_completa()` no se materializa** en una columna de `cleanings`. Habria que
  sincronizarla desde tres sitios (marcar tarea, subir foto, saltar cuarto) y el primero que se
  olvide deja la marca mintiendo.
- **`unskip_room_evidence` BORRA la fila** en vez de marcarla resuelta. El hecho que importa es si
  **hoy** falta evidencia, no el historial de intentos.
- **La cuarta condicion de autorizacion de `skip_room_evidence`**, que es la que se olvida: el cuarto
  tiene que pertenecer a **ese** apartamento. Sin ella se podria saltar el cuarto de otra propiedad.
- **`cleaning_room_skips` sin DML para nadie**, ni para el admin: la unica puerta son los dos RPC.
  Misma disciplina que el resto de hijas de `cleanings`.

## Deuda que este plan deja declarada

- La regla de evidencia incompleta **vive dos veces**: aqui en SQL y en `lib/domain/checklist.ts`
  (plan 06-03). Es deliberado y esta escrito en el comentario de la funcion. **El plan 06-10 trae el
  test de paridad que la mide.**
