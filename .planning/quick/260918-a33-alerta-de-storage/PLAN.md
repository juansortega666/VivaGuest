---
quick_id: 260918-a33
slug: alerta-de-storage
date: 2026-09-18
type: quick
requirements:
  - RET-07
origin: >-
  RET-07 sale de la Fase 9 y se hace suelto porque el 2026-09-18 el dueño decidió
  que nada se borra nunca. Sin purga automática, esta alerta es lo único que
  avisa antes de que el Storage se llene.
autonomous: true
files_modified:
  - supabase/migrations/20260918100000_29_consumo_de_storage.sql
  - supabase/seeds/010_app_settings.sql
  - supabase/tests/12_almacenamiento.test.sql
  - lib/database.types.ts
  - lib/domain/almacenamiento.ts
  - lib/domain/almacenamiento.test.ts
  - lib/domain/alertas.ts
  - lib/domain/alertas.test.ts
  - lib/data/almacenamiento.ts
  - app/(admin)/operacion/_components/MedidorDeAlmacenamiento.tsx
  - app/(admin)/operacion/page.tsx
  - e2e/almacenamiento.spec.ts

must_haves:
  truths:
    - El admin ve en /operacion cuántos bytes lleva consumido el bucket evidencia y contra qué cupo.
    - Al llegar al umbral aparece una fila en PanelAlertas con la etiqueta ALMACENAMIENTO, y el contador del panel la cuenta.
    - Subir el cupo con un update sobre app_settings apaga la alerta en la lectura siguiente, sin migración y sin deploy.
    - Un fallo de la lectura se VE en pantalla y no tumba /operacion.
    - El medidor y la alerta salen de la MISMA lectura, así que no se pueden contradecir dentro del mismo render.
  prohibiciones:
    - "NINGUNA SESIÓN DE ASEADORA PUEDE LEER EL CONSUMO DE STORAGE: public.consumo_de_storage() lanza 42501 para cualquier authenticated que no sea admin activo, y eso se afirma en pgTAP IMPERSONANDO, no leyendo el archivo."
    - Ninguna función nueva nace ejecutable por anon (revoke pegado a la definición).
    - La fila de almacenamiento no lleva color, tamaño ni peso distinto de las otras doce dentro de PanelAlertas.
    - No se toca ni un archivo de app/(cleaner).
    - No se agenda ningún job. Los agenda la Fase 9 y hay una puerta de CI que lo verifica.
  artifacts:
    - supabase/migrations/20260918100000_29_consumo_de_storage.sql
    - supabase/tests/12_almacenamiento.test.sql
    - lib/domain/almacenamiento.ts
    - lib/data/almacenamiento.ts
    - app/(admin)/operacion/_components/MedidorDeAlmacenamiento.tsx
    - e2e/almacenamiento.spec.ts
  key_links:
    - "app_settings.storage_quota_mb -> public.consumo_de_storage() -> lib/data/almacenamiento.ts -> alertasComputadas() -> PanelAlertas"
    - "el mismo objeto `consumo` alimenta el medidor de la cabecera y la alerta del panel"
---

<objective>
Hacer verdadero RET-07 con lo mínimo: que el admin **vea** cuánto Storage lleva
consumido, y que **reciba alerta** cuando el consumo llegue al umbral ya sembrado
(70%).

Purpose: desde el 2026-09-18 no hay purga de nada. Sin purga, la alerta de
espacio es la única señal que existe antes de que el Storage se llene, y el
síntoma de llenarse sin aviso no es un error en un log: es una aseadora de pie en
un apartamento que no puede subir la foto de evidencia y no puede terminar el
aseo.

Output: una función definer con guarda de admin, un ajuste nuevo en
`app_settings` para el cupo, un módulo de dominio puro, una alerta computada más
en el panel que el admin ya lee, un medidor en la cabecera de `/operacion`, y
nueve aserciones pgTAP de las que la 5 es la que importa.
</objective>

<la_decision_que_cambia_el_sentido>
El dueño decidió el **2026-09-18** que **nada se borra nunca**. Ni las fotos a los
30 días, ni los aseos a los 6 meses. Cuando el espacio apriete, se paga Supabase
Pro.

Consecuencia directa sobre el alcance: RET-07 deja de ser el menor de siete
requisitos de retención y pasa a ser **el único, y el más importante**. Los otros
seis (RET-01 a RET-06) quedan sin sentido mientras la decisión siga en pie.

Números medidos el 2026-09-18: 6 fotos por aseo × ~200 KB = 1.2 MB por aseo,
~360 MB al mes con 34 apartamentos gestionados. El free tier es 1 GB, o sea
**~3 meses de operación real**. No es una alerta teórica.
</la_decision_que_cambia_el_sentido>

<lo_medido_hoy>
Todo esto se midió contra la base local el 2026-09-18, antes de escribir una sola
línea. No es recuerdo ni suposición: son doce hechos, y varios contradicen lo que
uno esperaría.

1. **`storage.get_size_by_bucket()` existe, y es `security INVOKER`.**
   `prosecdef = f`, `stable`, **sin `set search_path`**, y su `proacl` es NULO, o
   sea EXECUTE para PUBLIC. Su cuerpo es un `group by bucket_id` sobre
   `"storage".objects`.

2. **Una aseadora SÍ puede llamarla, y le devuelve un número.**
   `storage.objects` tiene RLS activa y la policy `evidencia_cleaner_select` le
   deja ver los objetos cuyo primer segmento de ruta está en sus propios aseos.
   Como la función es invoker, esa RLS aplica: la aseadora obtiene **la suma de
   SUS PROPIAS fotos**, no el total del sistema. Es una frontera real y hay que
   afirmarla como es, no fingir que la función está cerrada.

3. **`postgres` tiene `rolbypassrls = t`; `authenticated` no.**
   Verificado con `select rolname, rolbypassrls from pg_roles`. Por eso una
   definer propiedad de `postgres` ve la tabla entera, que es exactamente la
   trampa que la migración 26 documenta y la razón de que la guarda vaya primera.

4. **Una definer con `set search_path = ''` PUEDE llamar a
   `storage.get_size_by_bucket()` sin romperse.** Probado. El cuerpo de la
   función de Supabase califica `"storage".objects`, así que el camino de
   búsqueda vacío no la afecta.

5. **La ventana del instante de cruce funciona con `search_path = ''`.** Probada
   con cuatro objetos sembrados de 300, 300, 300 bytes y uno con `metadata` sin
   `size`:
   - cupo 1000 / umbral 70 (o sea 700 bytes) devolvió el `created_at` del TERCER
     objeto, que es donde la suma corrida cruzó. Correcto.
   - cupo 100000 devolvió **nulo**. Correcto: no hay cruce.
   - el objeto sin `size` se contó como 0 gracias al `coalesce` y no rompió nada.

6. **Solo hay UN bucket: `evidencia`, privado (`public = f`).** No hace falta
   desglose por bucket.

7. **Con cero objetos, `get_size_by_bucket()` devuelve CERO FILAS**, no
   `evidencia | 0`. El `group by` sobre el vacío no emite nada. Sin `coalesce`, el
   medidor diría "sin datos" donde la verdad es "0 B".

8. **`app_settings` ya tiene `storage_alert_threshold_pct = 70`** en el seed, con
   policy `app_settings_admin_all` (el admin lee Y escribe) y grant a
   `authenticated`. El patrón de lectura del valor jsonb ya está escrito en la
   migración 23, líneas 292-302: `(s.value #>> '{}')::int` envuelto en
   `coalesce(..., default)`.

9. **El CUPO no existe en ninguna parte.** Ni columna, ni constante, ni ajuste.
   Es lo único que falta de datos. Hoy solo está el umbral (70%), que es un
   porcentaje de nada.

10. **`lib/domain/alertas.test.ts` líneas 197 y 202 van a ponerse rojas a
    propósito** al añadir una clave: afirman `toHaveLength(12)`,
    `new Set(ORDEN_DE_TIPOS).size === 12` y set-igualdad con las claves de
    `MAPA_DE_ALERTAS`. Eso no es un obstáculo, es el diseño: una clave nueva sin
    entrada en el mapa tiene que ser un error de build.

11. **La última migración es `20260917100000_28_detalle_de_aseo.sql`.** La
    siguiente es la 29.

12. **`storage.objects` está en cero ahora mismo** (la base quedó limpia tras las
    pruebas de arriba). Y borrar de esa tabla por SQL exige levantar el GUC
    `storage.allow_delete_query`: hay un trigger `BEFORE DELETE` que lo rechaza
    con **42501**, que es el mismo código que un deny de RLS. Nota 3 de
    `04_storage.test.sql`, y es una fuente de falso verde si el test no la
    conoce.
</lo_medido_hoy>

<decisiones>

## D-1. El cupo va en `app_settings` como `storage_quota_mb`, no en una constante

La decisión del dueño es literal: *cuando apriete, pago Pro*. Pasar de 1 GB a
100 GB tiene que ser **un `update` de una fila**, no una migración, un commit, un
deploy y un reinicio. El día que el Storage esté al 95% es el peor día posible
para necesitar un deploy.

Y va junto al umbral, no en otro sitio: `storage_alert_threshold_pct` ya vive en
esa tabla. Partir el par (el umbral aquí, el cupo allá) deja media verdad en cada
lado y garantiza que alguien mueva una sola.

Valor inicial `1024` (el free tier, en MB). Se lee con el patrón de la migración
23 y con `coalesce(..., 1024)`, para que la función siga siendo correcta si
alguien borra la fila.

## D-2. UNA función definer, y devuelve los números crudos, NO el veredicto

`public.consumo_de_storage()` devuelve `usado_bytes`, `cupo_bytes`, `umbral_pct` y
`cruce_at`. **No devuelve "está lleno".**

El porcentaje y el veredicto se derivan en `lib/domain/almacenamiento.ts`, que es
un módulo puro y testeable sin base. Misma separación que ya existe entre
`last_success_at` (el dato crudo) y `estadoDeSincronizacion()` (el veredicto). Un
booleano calculado en SQL sería el único sitio donde el umbral estaría aplicado,
y se pondría a prueba solo con `db:test`, que es el ciclo más lento del repo.

Las reglas no negociables de la migración 26 aplican enteras: `security definer`,
`set search_path = ''`, **guarda de admin como PRIMERA sentencia ejecutable** con
`42501`, `comment on function`, y el par `revoke all ... from public, anon` +
`grant execute ... to authenticated` **pegado a la definición**.

## D-3. NO se usa `storage.get_size_by_bucket()` para el total

Es contraintuitivo, porque la función existe y funciona. La razón es de
coherencia, y es la misma que `resumen_financiero` escribe para hacer un solo
recorrido:

El instante de cruce (D-4) obliga a recorrer los objetos igual. Llamar además a
`get_size_by_bucket()` sería **un segundo snapshot independiente**: en `read
committed`, una foto que entre entre las dos lecturas haría que el total y el
cruce no describieran el mismo estado del mundo. Con un solo CTE sobre
`storage.objects` el agujero no existe por construcción.

La definer lee `storage.objects` directo. Es legal y está medido: la definer es
propiedad de `postgres`, que tiene `rolbypassrls`.

## D-4. El instante del hecho es el del objeto que cruzó, nunca `ahoraMs`

Copia literal del razonamiento que `alertas.ts` ya tiene escrito para
`calendario_caido` (líneas 560-571): con `ahoraMs` la alerta **salta al tope de la
lista en cada render** y empuja hacia abajo hechos más recientes que ella. El
panel ordena cronológico descendente y eso sería una jerarquía de facto.

Aquí el instante existe y es derivable: es el `created_at` del objeto en el que la
suma corrida por fecha cruzó el umbral. Medido en el hecho 5. Es estable entre
lecturas, se recalcula solo cuando el cupo cambia, y desaparece cuando deja de
haber cruce.

Si `cruce_at` es nulo, no hay alerta. Si hay cruce pero el instante no se puede
parsear, se cae a `ahoraMs` **escribiéndolo**, igual que la rama de
`maxUltimoExito` nulo: un instante `NaN` cae en un sitio arbitrario del orden.

## D-5. La alerta es COMPUTADA, no una fila de `notifications`

Tres razones, y la tercera es la que cierra el alcance:

1. **Es un ESTADO, no un EVENTO.** Se apaga sola el día que el dueño pague Pro y
   suba el cupo, exactamente como `urgente` se apaga al pasar la fecha. Una fila
   persistida habría que ir a borrarla a mano, y nadie se va a acordar.
2. **`atendible: false` es la verdad.** No hay nada que atender en una alerta que
   reaparecería en la lectura siguiente. Un botón ahí sería un botón que miente,
   y esa frase ya está escrita en `alertas.ts`.
3. **Una fila de `notifications` exigiría un valor nuevo en el enum
   `notification_type` Y un productor que la escriba**, o sea un job agendado. La
   migración 06 dejó escrito que los jobs los agendan las Fases 3 y 9, y hay una
   puerta de CI que lo verifica. Meter un job aquí rompe esa regla por una alerta
   que no lo necesita.

**Consecuencia que se acepta y que queda escrita: si el admin no abre
`/operacion`, nadie mide el Storage.** Es exactamente el mismo estándar que el
proyecto ya aceptó para `calendario_caido`, que es una falla más urgente que
esta, y por la razón que `alertas.ts` ya tiene redactada: *"no es un vigilante, es
una lectura, y la hace la página que el admin abre de todas formas"*. Una push de
verdad exige el job agendado. Queda como deuda, abajo, y no se hace aquí.

## D-6. El número se VE siempre; el color solo aparece al cruzar

RET-07 tiene dos mitades y son dos superficies distintas, no una:

| Mitad del requisito | Superficie | Por qué ahí |
|---|---|---|
| *ve el consumo* | medidor en la cabecera de `/operacion`, al lado de `SincronizacionEnVivo` | es la ranura que esta pantalla ya usa para el estado del sistema, y el admin ya la mira |
| *recibe alerta al superar el 70%* | fila computada en `PanelAlertas` | es donde este admin ya lee lo que necesita atención |

El medidor va en `text-muted-foreground` mientras esté por debajo del umbral. **Un
número de contexto no es una llamada a la acción**, y una tira ámbar visible al
12% entrena al admin a saltársela con la vista. Ese argumento exacto ya está
escrito en esta misma pantalla, para justificar que `Atrasados` no se renderice
con cero.

Al cruzar, el medidor pasa a `text-status-warn`, que es **el mismo color del
icono de la alerta**. Las dos superficies dicen lo mismo porque salen de la misma
lectura, y no pueden contradecirse dentro de un render.

Prohibido, y no es negociable dentro de este quick: barra de progreso, gráfica de
tendencia, desglose por bucket y proyección de "te quedan N días". Nada de eso
está en RET-07. Ver `<deuda>`.

## D-7. El icono es `HardDrive`, y es una AMPLIACIÓN declarada

`IconoDeAlerta` es una lista cerrada que viene del UI-SPEC §17.3. Añadirle un
valor tiene precedente literal y escrito en el propio archivo: `Bell`,
`CircleSlash`, `History`, `UserRoundCog` y `CircleCheck` ya se añadieron cada uno
con su razón.

La regla que NO se toca no es *"la lista no crece"*, es **"el color no codifica el
tipo"**. `HardDrive` va en el mismo `text-status-warn`, al mismo tamaño y con la
misma clase de etiqueta que los otros doce, así que no jerarquiza nada. Etiqueta:
`ALMACENAMIENTO`.

## D-8. `>=` y no `>`, y se compara con enteros

*"Superar el 70%"* se implementa como **llegar al 70%**. Para una alarma de
capacidad, esperar al 70.1% para avisar no compra nada y cuesta el caso exacto que
un test fijará.

Y la comparación se hace **con enteros**, igual en SQL que en TypeScript:
`usadoBytes * 100 >= cupoBytes * umbralPct`. Redondear a porcentaje antes de
comparar haría que 69.6% dijera 70 y la alerta saltaría antes de tiempo, que en
una alarma es la forma más rápida de que dejen de creerle.

## D-9. Un fallo de la lectura se VE, no se traga y no tumba la pantalla

`lib/data/` tiene una regla: toda llamada comprueba su error y lanza, porque un
respaldo silencioso en ceros es peor que el fallo. Esa regla se respeta: el lector
lanza.

Pero `/operacion` no se puede caer porque una lectura de nueve falle, y meter la
promesa cruda en el `Promise.all` haría exactamente eso. Entonces:

- el `.catch(() => null)` va **pegado a esta promesa**, no envolviendo el
  `Promise.all`, para que las otras nueve lecturas ni se enteren;
- `null` **no es cero y no se pinta como cero**: el medidor dice
  `Almacenamiento: no se pudo medir` en `text-status-warn`;
- con `consumo === null` **no se emite alerta**: afirmar que está lleno sin
  haberlo medido es tan falso como afirmar que está vacío.

Un cero silencioso aquí sería el peor resultado posible del quick entero: la
pantalla diría que hay espacio de sobra justo el día que no lo hay.

</decisiones>

<tasks>

<task type="auto">
  <name>Task 1 [BLOCKING]: la migración 29, el ajuste del cupo y las nueve aserciones pgTAP</name>

  <files>supabase/migrations/20260918100000_29_consumo_de_storage.sql, supabase/seeds/010_app_settings.sql, supabase/tests/12_almacenamiento.test.sql, lib/database.types.ts</files>

  <read_first>
    - `supabase/migrations/20260913130000_26_lecturas_financieras.sql` líneas 1-100
      (las siete reglas que aplican a toda definer de este repo y las tres trampas
      medidas) y líneas 163-245 (una definer completa: guarda primera, cuerpo,
      `comment on function`, par revoke/grant).
    - `supabase/migrations/20260913100000_23_calendario_y_snapshot.sql` líneas
      288-304: el patrón EXACTO de lectura de un valor de `app_settings`.
    - `supabase/tests/11_financiero.test.sql` líneas 380-460: el arnés de
      impersonación `pg_temp.intento_como`, `pg_temp.valor_como` y
      `pg_temp.escalar`. Se copia LITERAL, con los mismos nombres.
    - `supabase/tests/04_storage.test.sql` líneas 1-60: las tres notas de entorno
      sobre `storage.objects` y la limpieza con el GUC.
    - `supabase/seeds/010_app_settings.sql` entero: las cuatro reglas de escritura
      del seed.
  </read_first>

  <action>
    **(a) El ajuste del cupo, en el seed.**

    Añade `storage_quota_mb` con valor `1024` al `insert` existente de
    `supabase/seeds/010_app_settings.sql`, dentro del mismo `on conflict (key) do
    nothing`. Comentario al lado, con el mismo tono que los otros seis: que son
    megabytes, que 1024 es el free tier, y que **pasar a Pro es cambiar este
    registro, no una migración**. Va pegado a `storage_alert_threshold_pct`: son
    el par que forma la regla y no se separan.

    **(b) La migración, `supabase/migrations/20260918100000_29_consumo_de_storage.sql`.**

    Crea `public.consumo_de_storage()`, `returns table (usado_bytes bigint,
    cupo_bytes bigint, umbral_pct int, cruce_at timestamptz)`, `language plpgsql`,
    `security definer`, `set search_path = ''`.

    Cabecera del archivo con el mismo formato que la 26, y que deje escritos estos
    cinco puntos porque ninguno se deduce del código:
      1. Por qué la guarda va primera (la definer es de `postgres`, que tiene
         `rolbypassrls`, y sin guarda entrega el consumo del negocio a cualquiera).
      2. Por qué NO se usa `storage.get_size_by_bucket()` (D-3: dos lecturas son
         dos snapshots, y el total y el cruce tienen que describir el mismo
         estado).
      3. Por qué el cupo sale de `app_settings` y no de una constante (D-1).
      4. Que la comparación del cruce es con enteros y no con porcentajes
         redondeados (D-8).
      5. Que **esta migración no agenda ningún job**, y por qué (D-5).

    Cuerpo, en este orden exacto:

      1. **PRIMERA SENTENCIA EJECUTABLE:** la guarda.
         `if not (select private.is_admin()) then raise exception 'no_autorizado'
         using errcode = '42501', hint = '...'; end if;`
         El `hint` en español y diciendo qué es el dato: el consumo de
         almacenamiento es información del negocio.

      2. Resuelve `cupo_bytes` y `umbral_pct` leyendo `public.app_settings` con
         `(s.value #>> '{}')::bigint` / `::int` y `coalesce` a `1024` y `70`. El
         cupo en bytes es MB × 1024 × 1024.

      3. UN SOLO `return query` con un CTE sobre `storage.objects` filtrado por
         `bucket_id = 'evidencia'`, que produce a la vez:
         - el total: `coalesce(sum(...), 0)::bigint` sobre
           `coalesce((o.metadata->>'size')::bigint, 0)`. El `coalesce` de dentro NO
           sobra: hay objetos con `metadata` sin `size` y están medidos (hecho 5).
         - el cruce: `min(created_at)` de las filas cuya suma corrida
           (`sum(bytes) over (order by created_at, bytes rows between unbounded
           preceding and current row)`) cumple `corrido * 100 >= cupo * umbral`.
           Devuelve NULO cuando no hay cruce, y eso es lo que apaga la alerta.

    Trampas de este repo que muerden aquí, todas ya medidas, y que la cabecera
    debe nombrar:
      - **`coalesce` NO se califica con esquema.** Es una construcción del
        lenguaje, no una función: calificarla revienta con "function does not
        exist" bajo `search_path` vacío. Costó un error en la migración 22.
      - En un `returns table`, los nombres de las columnas de salida son variables
        del cuerpo: **toda referencia a una columna de tabla va calificada con su
        alias** o plpgsql la rechaza por ambigua (lección de la migración 24).
      - `public.today_bog()` es el único helper de fecha permitido en migraciones;
        el guardarraíl 4 de `scripts/ci/check-service-role.sh` prohíbe por grep las
        funciones de fecha de sesión. Aquí no hace falta ninguna: todo son
        `timestamptz` crudos.

    Cierra con `comment on function public.consumo_de_storage()` explicando qué
    devuelve, por qué los cuatro valores viajan crudos sin veredicto, y por qué
    `cruce_at` es el instante del objeto que cruzó y no el de la lectura. Y con el
    par pegado:
      `revoke all on function public.consumo_de_storage() from public, anon;`
      `grant execute on function public.consumo_de_storage() to authenticated;`
    No se hereda: en PG 17 una función nueva de `public` nace ejecutable por
    `anon` salvo que se revoque ahí mismo (guardarraíl 9 de `02_guardarrailes`).

    **(c) El pgTAP, `supabase/tests/12_almacenamiento.test.sql`. `select plan(9);`**

    Copia el arnés de `11_financiero.test.sql` (las tres funciones `pg_temp`, con
    los mismos nombres) y limpia dentro de la transacción. **La limpieza de
    `storage.objects` va entre `set_config('storage.allow_delete_query','true',
    true)` y su vuelta a `'false'`**: hay un trigger `BEFORE DELETE` que rechaza el
    borrado directo con 42501, que es el mismo código que un deny de RLS, y sin el
    GUC el archivo aborta entero (nota 3 de `04_storage.test.sql`).

    Fixture: un admin, DOS aseadoras (A y B) con un aseo cada una, y objetos en
    `evidencia` bajo `{cleaning_id}/...` de las dos, con `metadata` con `size`
    conocido y `created_at` escalonado. Inserta también un objeto con `metadata`
    sin `size`, que es el caso que ya se midió vivo.

    Las nueve aserciones:

      1. `has_function('public','consumo_de_storage')` con la firma esperada.
      2. Estructural: `prosecdef` es cierto y `proconfig` incluye el camino de
         búsqueda vacío. Una definer sin `search_path` fijado es una puerta
         distinta de la que este plan cree estar abriendo.
      3. `authenticated` tiene EXECUTE y `anon` NO.
      4. Como ADMIN: `usado_bytes` es exactamente la suma de los `size` sembrados
         (con el objeto sin `size` contando 0).
      5. **LA QUE IMPORTA. Como ASEADORA A: `select * from
         public.consumo_de_storage()` devuelve `ERROR:42501`.** Usa
         `pg_temp.valor_como`, NO `intento_como`: si la guarda se cayera, el TAP
         tiene que imprimir en el `have` la cifra exacta que se está escapando, no
         un `sin_error` que no enseña nada. Es la lección de la fuga de la tarifa
         que la Fase 7 midió.
      6. La frontera REAL, escrita como es: como ASEADORA A, `storage.get_size_by_bucket()`
         **no falla** (es invoker y PUBLIC la ejecuta) pero devuelve
         **estrictamente menos** que el total, porque la RLS la recorta a sus
         propios aseos. Esta aserción existe para que nadie crea que la definer es
         la única puerta a `storage.objects`, y para que el día que alguien afloje
         `evidencia_cleaner_select` esto salga rojo.
      7. `cruce_at` es el `created_at` del objeto que cruzó: siembra
         `storage_quota_mb` de forma que el umbral caiga entre el segundo y el
         tercer objeto, y afirma la igualdad con el `created_at` del tercero.
      8. Con el cupo holgado, `cruce_at` es **nulo**.
      9. Con `storage.objects` vacío, `usado_bytes` es `0` y no nulo. Es el hecho 7:
         `group by` sobre el vacío no emite filas, y un nulo aquí pintaría "sin
         datos" donde la verdad es "0 B".

    **(d) Regenera los tipos.** `lib/database.types.ts` cambia solo: no se edita a
    mano.
  </action>

  <verify>
    <automated>npm run db:reset &amp;&amp; npm run db:types &amp;&amp; npm run db:types:check &amp;&amp; npm run db:test</automated>
  </verify>

  <acceptance_criteria>
    - `npm run db:reset` corre limpio con la migración 29 y el seed ampliado.
    - `npm run db:types:check` no imprime diff (los tipos regenerados están commiteados).
    - `npm run db:test` pasa 9/9 en `12_almacenamiento.test.sql`, y las once suites
      anteriores siguen en verde: el total sube desde 376, no se mueve hacia abajo.
    - La aserción 5 falla si se comenta la guarda de admin. Compruébalo a mano una
      vez antes de dar el archivo por bueno: un test de denegación que pasa sin la
      defensa puesta no prueba nada.
    - `select key from public.app_settings where key = 'storage_quota_mb'` devuelve
      una fila tras el reset.
  </acceptance_criteria>

  <done>
    La base sabe cuánto Storage se usa, contra qué cupo, y cuándo se cruzó el
    umbral. Y lo sabe solo para el admin, afirmado impersonando.
  </done>
</task>

<task type="auto">
  <name>Task 2: el dominio puro, el lector y la alerta computada número cuatro</name>

  <files>lib/domain/almacenamiento.ts, lib/domain/almacenamiento.test.ts, lib/data/almacenamiento.ts, lib/domain/alertas.ts, lib/domain/alertas.test.ts</files>

  <read_first>
    - `lib/domain/salud-sync.ts` completo: es el módulo puro de veredicto más
      parecido a este, y el que marca el tono.
    - `lib/domain/alertas.ts` líneas 78-140 (`ClaveDeAlerta`, `IconoDeAlerta`,
      `PresentacionDeAlerta` y por qué NO puede tener campo de severidad), 176-240
      (el mapa y `ORDEN_DE_TIPOS`), y **553-595 completo**: el bloque de
      `calendario_caido`, que es el molde exacto de lo que hay que escribir, con su
      razonamiento sobre el instante ya redactado.
    - `lib/domain/alertas.test.ts` líneas 181-205: los tres asertos que se van a
      poner rojos, y por qué eso es el diseño y no un obstáculo.
    - `lib/data/finanzas.ts` líneas 1-120: el patrón de lector (constante `RPC_*`
      exportada, cliente por parámetro, cero autorización aquí, error leído ANTES
      de devolver).
  </read_first>

  <action>
    **(a) `lib/domain/almacenamiento.ts`, módulo puro.**

    No importa React, no lee el reloj, no construye clientes. Todo entra por
    parámetro. Exporta:

      - `ConsumoDeStorage = { usadoBytes: number; cupoBytes: number; umbralPct: number; cruceAt: string | null }`
      - `superaElUmbral(c: ConsumoDeStorage): boolean` con la comparación **entera**
        de D-8: `c.usadoBytes * 100 >= c.cupoBytes * c.umbralPct`. Escribe en el
        comentario por qué no se redondea a porcentaje antes de comparar, y por qué
        es `>=` y no `>`.
      - `porcentajeUsado(c: ConsumoDeStorage): number` para PINTAR, no para decidir.
        Redondeo a entero. Con `cupoBytes <= 0` devuelve `100`: un cupo de cero no
        es una división por cero, es estar lleno, y decirlo es más útil que un
        `NaN` en la cabecera. Escríbelo.
      - `formatearBytes(n: number): string` en base **1024** (que es lo que
        significan el gigabyte del free tier y los megabytes del ajuste), con `B`,
        `KB`, `MB`, `GB`, sin decimales de MB para arriba. Un `412 MB` se lee; un
        `412.38 MB` no aporta nada en una cabecera.

    Su test cubre: el caso exacto del umbral (69%, 70% clavado, 71%), el cupo cero,
    el consumo cero, y los cuatro cortes del formateador. Son ~10 casos, todos de
    tabla.

    **(b) `lib/data/almacenamiento.ts`, el lector.**

    `export const RPC_CONSUMO_STORAGE = 'consumo_de_storage' as const;` y
    `leerConsumoDeStorage(supabase): Promise<ConsumoDeStorage>` que hace
    `.rpc(RPC_CONSUMO_STORAGE).single()`, **comprueba `error` y lanza antes de
    devolver**, y mapea las cuatro columnas a la forma del dominio.

    Cero lógica de autorización aquí, y déjalo escrito: la frontera es la guarda de
    Postgres. Una segunda comprobación en TypeScript no añade garantía y sí un
    sitio más donde equivocarse.

    **(c) `lib/domain/alertas.ts`, la cuarta computada.**

    Cinco cambios, y el compilador fuerza tres de ellos:

      1. `IconoDeAlerta` gana `'HardDrive'`, con el comentario de D-7 al lado: es
         una ampliación declarada de la lista cerrada, con el precedente de `Bell`
         nombrado, y no toca la regla de color.
      2. `ClaveDeAlerta` gana `| 'almacenamiento_lleno'`. Igual que `urgente`, no
         es un valor del enum porque **no es una notificación**: es un estado que se
         computa al leer.
      3. `MAPA_DE_ALERTAS` gana la entrada
         `almacenamiento_lleno: { icono: 'HardDrive', etiqueta: 'ALMACENAMIENTO', ...HOMOGENEO }`.
         El `Record` exhaustivo la exige: sin ella no compila.
      4. `ORDEN_DE_TIPOS` la gana **al final**, después de `retencion_proxima`. El
         orden del filtro es fijo y su valor es que no se mueva: meterla en medio
         reordenaría opciones que el admin ya aprendió de sitio.
      5. `EntradaComputadas` gana `consumo: ConsumoDeStorage | null`, y
         `alertasComputadas` emite la alerta cuando
         `consumo !== null && superaElUmbral(consumo)`.

    La alerta, calcada del molde de `calendario_caido`:
      - `id: 'almacenamiento_lleno:sistema'`, fijo. Solo puede haber una a la vez,
        por definición, y sin `cleaning_id` ni `property_id` que la hagan única.
      - `ocurrioEnMs`: `instanteDeLaBase(consumo.cruceAt)`, y si `cruceAt` es nulo o
        el parseo da `NaN`, `ahoraMs` **con la razón escrita** (un instante `NaN`
        cae en un sitio arbitrario del orden). Es el mismo tratamiento que la rama
        de `maxUltimoExito` nulo, tres bloques más arriba en este archivo.
      - `titulo`: la cifra real, no un adjetivo. Algo de la forma
        `El almacenamiento va en {usado} de {cupo} ({pct}%).`
      - `cuerpo`: el título más **el síntoma**, que es la mitad del valor de esta
        alerta y sin él el admin no sabe qué se rompe:
        `Cuando se llene, las aseadoras no van a poder subir las fotos de evidencia.`
      - `apartamento: 'Todo el sistema'`, igual que la caída global: no es de ningún
        apartamento.
      - `cleaningId: null`, `propertyId: null`.
      - `url: null`, y **déjalo justificado**: D-08 pide que una alerta sea
        accionable desde donde se ve, y aquí el remedio (subir el plan de Supabase)
        está fuera de la aplicación. Un enlace a una pantalla que no arregla nada
        sería peor que ninguno. `Alerta.url` ya admite `null` para exactamente esto.
      - `atendible: false`. No tiene fila en `notifications`, luego no tiene
        `read_at`, luego no se puede atender.

    **(d) `lib/domain/alertas.test.ts`.**

    Sube `12` a `13` en las dos aserciones de longitud de `ORDEN_DE_TIPOS` (línea
    197 y su `Set`). La set-igualdad con las claves del mapa (línea 202) y el
    recorrido de homogeneidad se arreglan solos si la entrada quedó bien; si alguno
    sigue rojo, el bug está en el mapa, no en el test.

    Añade `describe('alertasComputadas · almacenamiento')` con cinco casos:
      - por debajo del umbral no emite nada;
      - **al 70% clavado SÍ emite** (es D-8, y este es el caso que lo fija);
      - con `consumo: null` no emite nada, y eso es D-9: no medido no es lleno;
      - el `ocurrioEnMs` sale de `cruceAt` y NO de `ahoraMs` (pásale un `cruceAt`
        viejo y un `ahoraMs` distinto, y afirma cuál ganó);
      - con `cruceAt` nulo pero umbral superado, cae a `ahoraMs` y el instante no es
        `NaN`.
  </action>

  <verify>
    <automated>npm run test:unit &amp;&amp; npx tsc --noEmit &amp;&amp; npm run lint</automated>
  </verify>

  <acceptance_criteria>
    - `npm run test:unit` en verde, con los 1201 anteriores intactos y los nuevos
      sumando. Ninguna suite existente baja de número.
    - `npx tsc --noEmit` limpio. En particular: `MAPA_DE_ALERTAS` compila (el
      `Record` exhaustivo es la puerta) y `_CubreElEnum` sigue en `true`.
    - `presentacionDeAlerta('almacenamiento_lleno')` devuelve la entrada del mapa y
      NO el fallback genérico.
    - El recorrido de homogeneidad del mapa sigue pasando con trece entradas: la
      nueva comparte `claseIcono` y `claseEtiqueta` con las otras doce.
    - `lib/domain/almacenamiento.ts` no importa nada de `app/`, de React ni de
      `@supabase/*`.
  </acceptance_criteria>

  <done>
    El veredicto existe, es puro, está testeado sin base, y la alerta entra al panel
    tratada exactamente igual que las otras doce.
  </done>
</task>

<task type="auto">
  <name>Task 3: el medidor en la cabecera, el cableado de la página y el E2E</name>

  <files>app/(admin)/operacion/_components/MedidorDeAlmacenamiento.tsx, app/(admin)/operacion/page.tsx, e2e/almacenamiento.spec.ts</files>

  <read_first>
    - `app/(admin)/operacion/page.tsx` líneas 296-370 (el `Promise.all` de nueve
      lecturas y por qué van en paralelo), 496-530 (el cómputo de las alertas y por
      qué `verAtendidas` pasa `[]`), y 538-560 (la cabecera, con
      `SincronizacionEnVivo` y `DialogoCrearAseo`).
    - `app/(admin)/operacion/_components/TiraAvisosAdmin.tsx`: el vocabulario de una
      superficie de estado en este admin (`role="region"`, `aria-label`, icono en
      `text-status-warn`, `h-fila`, `shrink-0`, el botón de 32px). **Se reusa el
      patrón, no se inventa uno nuevo.**
    - `e2e/operacion-alertas.spec.ts` líneas 1-60 y su bloque de siembra: cómo este
      repo siembra con `clienteDeServicio` y limpia después.
    - `e2e/fixtures.ts`: `clienteDeServicio`, `iniciarSesionPorUI`, el `test`
      extendido y los helpers de limpieza.
  </read_first>

  <action>
    **(a) `MedidorDeAlmacenamiento.tsx`.**

    Componente de **servidor**: no lleva `'use client'`. No tiene estado, no maneja
    eventos y no lee nada del navegador. Recibe una sola prop,
    `consumo: ConsumoDeStorage | null`.

    Tres ramas, y las tres se ven:
      - `null` → `Almacenamiento: no se pudo medir`, en `text-status-warn`. Es D-9:
        un fallo se ve. No se renderiza `0 B` y no se devuelve `null`.
      - por debajo del umbral → `text-muted-foreground`. Es D-6.
      - en o por encima del umbral → `text-status-warn` y el icono `HardDrive`, el
        mismo color que el icono de la fila del panel.

    Texto: `Almacenamiento · {usado} de {cupo} ({pct}%)`, con `formatearBytes` y
    `porcentajeUsado`. El `title` lleva la frase completa.

    Sin `role="alert"` y sin `role="status"`: es una superficie de estado
    persistente, no un anuncio puntual, y cualquiera de los dos interrumpiría al
    lector de pantalla en cada carga. Ese criterio ya está escrito en
    `TiraAvisosAdmin`.

    Cero valores de color literales: solo tokens. El guardarraíl 6 de `ci:arch` lo
    verifica por grep.

    **(b) El cableado en `page.tsx`.**

    - Añade `leerConsumoDeStorage(supabase).catch(() => null)` como **décima
      promesa del mismo `Promise.all`**. El `.catch` va pegado a ESA promesa: si
      envuelve el `Promise.all`, un fallo de esta lectura tumba las otras nueve, que
      es justo lo que D-9 prohíbe.
    - Pasa `consumo` a `alertasComputadas({ ..., consumo })`.
    - Renderiza `<MedidorDeAlmacenamiento consumo={consumo} />` en la cabecera,
      **antes de `SincronizacionEnVivo`**, dentro del mismo contenedor de acciones.
    - **El medidor se renderiza también en modo `Ver atendidas`.** El panel pasa
      `[]` de computadas en ese modo (y está bien: una computada no tiene `read_at`
      y no puede estar entre las atendidas), pero el NÚMERO no depende del modo del
      panel. Escríbelo donde se decide, o el día que alguien lea el `verAtendidas`
      de arriba va a creer que es un olvido.
    - No metas un `Suspense` ni un esqueleto de carga para esto. La lectura entra al
      `Promise.all` que la pantalla ya espera, así que cuesta cero latencia extra, y
      esta ruta no tiene archivo de carga de segmento a propósito (está escrito en
      la cabecera de la página, medido en el plan 08-02).

    **(c) `e2e/almacenamiento.spec.ts`. Dos casos, y ninguno depende del otro.**

    - **Caso 1, la mitad de "ve":** con la base recién reseteada y el cupo por
      defecto (1024 MB) sobre un Storage casi vacío, el admin abre `/operacion`, el
      medidor está visible y dice un porcentaje bajo, y **no hay ninguna fila con la
      etiqueta `ALMACENAMIENTO` en el panel de alertas**.
    - **Caso 2, la mitad de "recibe alerta":** con `clienteDeServicio`, sube **dos
      objetos de 1 MB** al bucket `evidencia` (`storage.from('evidencia').upload`
      con un `Buffer` de 1024×1024) y pon `storage_quota_mb = 2` con un `update`
      sobre `app_settings`. Recarga `/operacion` y afirma:
        (a) el medidor está en el color de aviso y dice un porcentaje `>= 70`;
        (b) el panel tiene UNA fila con la etiqueta `ALMACENAMIENTO`;
        (c) el contador del panel subió exactamente en uno respecto al caso 1;
        (d) el icono de esa fila tiene **el mismo color computado y el mismo
            tamaño** que el icono de otra fila cualquiera del panel. Es la
            comprobación de que la entrada nueva no jerarquiza, y es el mismo
            aserto que `operacion-alertas.spec.ts` ya hace para los siete tipos.
      Teardown en el mismo spec: borra los dos objetos con `.remove()` y devuelve
      `storage_quota_mb` a `1024`. Un spec que deja el cupo en 2 MB pone en rojo a
      todos los que corran después.

    **No hay caso de aseadora en E2E, y es deliberado.** La prohibición dura
    ("ninguna sesión de aseadora lee el consumo") se afirma en **pgTAP
    impersonando**, que es donde es falsable. Un E2E de aseadora contra
    `/operacion` mediría el guard de ruta, que ya tiene su propio spec en
    `ruteo.spec.ts`, y pasaría por construcción sin probar nada de este quick.

    **Y `app/(cleaner)` no se toca. Ni un archivo.**
  </action>

  <verify>
    <automated>npm run db:reset &amp;&amp; PLAYWRIGHT_PORT=3210 npx playwright test e2e/almacenamiento.spec.ts &amp;&amp; npm run ci:arch &amp;&amp; npx tsc --noEmit &amp;&amp; npm run lint</automated>
  </verify>

  <acceptance_criteria>
    - Los dos casos de `e2e/almacenamiento.spec.ts` pasan con `PLAYWRIGHT_PORT=3210`.
      **Con el 3000 se reusa el `next dev` de otro proyecto y salen rojos falsos con
      `/login` en 404.** El puerto no es opcional.
    - `PLAYWRIGHT_PORT=3210 npm run test:e2e` completo sigue en verde: 134 + 1
      saltado antes, y los nuevos suman. Ninguno de los 134 se cae por el cupo
      cambiado, o sea que el teardown del caso 2 funciona.
    - `npm run ci:arch` limpio: el medidor no introduce ningún valor de color
      literal (guardarraíl 6) ni toca la escala móvil.
    - A 480px la cabecera de `/operacion` no empuja `DialogoCrearAseo` fuera de
      pantalla ni genera scroll horizontal.
    - `git diff --stat` no lista ningún archivo bajo `app/(cleaner)/`.
  </acceptance_criteria>

  <done>
    RET-07 es verdad de punta a punta: el admin ve el número siempre y la alerta
    aparece sola al cruzar el umbral, en el mismo panel donde ya lee todo lo demás.
  </done>
</task>

</tasks>

<verification>
El quick está cerrado cuando las cuatro suites corren limpias sobre el árbol
quieto y la base reseteada, **en este orden**:

```
npm run db:reset
npm run db:types && npm run db:types:check
npm run db:test                                    # 376 + 9
npm run test:unit                                  # 1201 + ~20
npm run ci:arch && npx tsc --noEmit && npm run lint
PLAYWRIGHT_PORT=3210 npm run test:e2e              # 134 + 2, y 1 saltado
```

Y una comprobación que ninguna suite hace y que es la que prueba D-1: con la base
en marcha, `update public.app_settings set value = '100000'::jsonb where key =
'storage_quota_mb'` y recargar `/operacion` **apaga la alerta y baja el
porcentaje, sin recompilar ni desplegar nada**. Ese es el camino que el dueño va a
usar el día que pague Pro, y si no funciona, el quick no cumplió su razón de ser.
</verification>

<deuda>
Se deja escrito, no se hace. Nada de esto está en RET-07.

- **Push real al cruzar el umbral.** Hoy la medición ocurre cuando el admin abre
  `/operacion` (D-5). Una notificación de verdad exige un job agendado que escriba
  en `notifications`, y con ello un valor nuevo en el enum `notification_type`. Es
  Fase 9, donde los jobs ya tienen dueño.
- **Proyección de "te quedan N días".** Es derivable de la serie de `created_at` de
  `storage.objects` y sería útil ahora que nada se borra. No está en el requisito.
- **Desglose por bucket.** Hoy hay un solo bucket (`evidencia`), así que un
  desglose de una fila no informa nada. El día que haya dos,
  `storage.get_size_by_bucket()` ya lo devuelve.
- **Editar `storage_quota_mb` desde la UI.** Hoy se cambia con un `update`. No
  existe pantalla de ajustes en el proyecto y crearla es otro trabajo, no este.
- **RET-01 a RET-06 quedan sin efecto** mientras la decisión del 2026-09-18 siga en
  pie. `.planning/REQUIREMENTS.md` los sigue listando como Pending para la Fase 9;
  quien retome esa fase tiene que leer esta decisión primero, o va a construir una
  purga que el dueño no quiere.
</deuda>

<output>
Escribe `.planning/quick/260918-a33-alerta-de-storage/260918-a33-SUMMARY.md` al
terminar, con: qué quedó construido, el número final de las cuatro suites, y
cualquier desviación respecto a las nueve decisiones de arriba con su razón
medida.
</output>
