---
phase: 06-pwa-del-aseador-offline-first
plan: 02
subsystem: db
tags: [rpc, reportes, notificaciones, push, d-07, report-01, report-02, report-03]

requires:
  - phase: 01
    provides: "`damages`, `expenses`, `missing_item_reports`, `missing_item_lines` y `cleaning_photos`, creadas desde la migracion 04"
  - phase: 05
    provides: "El trigger `notifications_disparar_push` de la migracion 17, que es lo que hace que estos RPC no tengan que invocar el push"
  - phase: 06-01
    provides: "`expenses.moneda`, que `report_expense` recibe por parametro"
provides:
  - "`private.aseo_en_curso_propio(uuid)`: autoriza y resuelve el apartamento en una llamada"
  - "`public.report_damage(uuid, text)`: REPORT-01, devuelve el id para colgarle la foto"
  - "`public.report_expense(uuid, text, bigint, text)`: REPORT-02, monto en unidad minima"
  - "`public.report_missing_items(uuid, text[])`: REPORT-03 simplificado por D-07"
  - "Los dos tipos de notificacion que la Fase 5 dejo sin emisor por fin lo tienen"
  - "`supabase/tests/10_reportes.test.sql`: 19 aserciones, nacio rojo y quedo verde"
affects: [06-09, 06-10, 07]

tech-stack:
  added: []
  patterns:
    - "Sembrar DOS admins activos y uno de baja convierte 'notifica al admin' en algo medible: un limit 1 da 1, olvidar el filtro de actividad da 3, y lo correcto es 2"
    - "No duplicar en la funcion una validacion que ya hace un CHECK de tabla: el CHECK no se puede saltar y la validacion se puede olvidar en el siguiente create or replace"
    - "El property_id se RESUELVE dentro del RPC en vez de recibirse por parametro: aceptarlo permitiria colgar un reporte del apartamento equivocado"
    - "El identificador de la fila entra en la dedupe_key cuando dos hechos del mismo tipo son dos hechos (dos danos del mismo aseo no se deduplican)"
---

# 06-02: Migracion 19, los tres RPC de reporte

## Que se construyo

Los tres RPC de reporte, con una guarda compartida escrita **una vez y no tres**, y cada uno con su
notificacion a **cada admin activo**.

## La costura de la Fase 5 que este plan cierra

`05-UI-SPEC.md` §10.1 registro que `dano_reportado` y `faltantes_reportados` eran dos valores del
enum que **todavia no los escribia nadie**, aunque el criterio 3 del ROADMAP de la Fase 5 los exige.
Se probaron entonces contra fila insertada a mano. **Ahora tienen emisor real.**

## Y la promesa de D-04 cobrandose por primera vez

**Ninguno de los tres RPC invoca el push.** El trigger `AFTER INSERT` de la migracion 17 dispara
solo. Era el argumento entero de D-04 de la Fase 5: el disparo va en el trigger y no dentro de cada
RPC, asi que cada emisor futuro queda cubierto por construccion.

**Comprobado a mano**, no deducido. Con una sesion de aseadora real:

```
      tipo      |  estado   |   clave
----------------+-----------+------------
 dano_reportado | pendiente | dano:99000
 dano_reportado | pendiente | dano:99000
```

Dos filas (dos admins activos), las dos en `pendiente`, o sea el drenaje las recoge. Cero lineas de
codigo nuevo tocando el push.

## Un defecto que el test encontro al correr

**`profiles_deactivation_coherent` exige `deactivated_at` cuando `is_active` es falso.** La siembra
del admin de baja lo omitia y mataba el archivo entero antes de la primera asercion. No lo habia
visto en `09_ejecucion_aseo` porque ahi todos los perfiles eran activos.

## Verificacion

| Puerta | Resultado |
|---|---|
| `db:reset` | 19 migraciones aplicadas desde cero |
| `db:test` | **269 tests, los once archivos en verde.** Antes 250, mas las 19 nuevas: cuadra exacto |
| `db:lint` · `db:advisors` | cero resultados |
| `db:types:check` | sin deriva; los tres RPC presentes en los tipos |
| `tsc --noEmit` | limpio |
| Comprobacion manual del push | dos notificaciones en `pendiente`, ver arriba |

El rojo de Wave 0 se verifico antes: fallaba **solo** `10_reportes.test.sql`.

## Decisiones tomadas al implementar

- **La guarda es una funcion `private` y no codigo repetido tres veces.** Devuelve el `property_id`,
  que es lo que las tres necesitan, asi que autoriza y resuelve en una sola llamada.
- **No se duplica la validacion del monto** dentro de la funcion. La hace el `check (monto > 0)` de la
  tabla, y la razon esta escrita: un CHECK no se puede saltar, una validacion se puede olvidar.
- **La `dedupe_key` del dano y del gasto llevan el id de la fila**, porque dos danos del mismo aseo son
  dos hechos y no deben deduplicarse entre si.
- **Los faltantes van por la rama de texto libre** de `mil_exactly_one_source` (D-07). La rama de
  catalogo **se queda en el schema sin usar a proposito**: es por donde entrara la lista base cuando se
  retome, y `REPORT-03` corregido lo dice con su fecha.
- **Un arreglo de cadenas en blanco no es un reporte.** Se recorta y se descartan vacios **antes** de
  decidir si hay reporte, y si no queda nada se lanza `P0001` con hint en espanol.
