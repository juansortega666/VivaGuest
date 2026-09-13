# Fase 7: Financiero - Research

**Researched:** 2026-09-12
**Domain:** Snapshot financiero inmutable en Postgres, cierre mensual agendado, retención legal y medición de Storage
**Confidence:** HIGH (casi todo se midió contra la base local, no se dedujo)

> **Nota de forma:** este documento no usa la raya larga en español, por la regla del
> usuario. El repo sí la usa; no se propone cambiar nada de lo ya escrito.

---

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

**D7-1 · El dinero vive en su propia sección.** Decidido: una pestaña propia. No columnas
de plata dentro de `/operacion`. Razón dada: la pantalla operativa es donde se coordinan
los aseos del día y el dinero la ensucia. Y hay una segunda razón que conviene dejar
escrita: cualquiera que abra `/operacion` durante una jornada vería los márgenes, y eso
incluye pantallas compartidas. **Consecuencia:** ruta nueva en el árbol `(admin)`, con su
entrada en la navegación principal. `/operacion` no cambia.

**D7-2 · Qué entra en el pago de un aseador.** Decidido: la suma de sus aseos MÁS los
gastos que reportó. Cita literal del dueño: *"ambos pero debe haber desglose con
evidencia"*. Eso convierte el desglose en **requisito, no en adorno**. El número final no
basta: al abrir el pago de una persona hay que poder ver de qué se compone, aseo por aseo
y gasto por gasto, y desde cada gasto llegar a la foto que lo sustenta. **Lo que NO entra,
y es decisión explícita:** descuentos por daños (se ofreció y se dejó fuera; con personal
real, un descuento automático sobre el sueldo es una conversación, no un cálculo) y bonos
o ajustes manuales (fuera del alcance de esta fase). **Consecuencia:** el snapshot mensual
guarda las dos partidas por separado, no un total plano, o el desglose no sobrevive al
borrado de los aseos (FIN-04).

**D7-3 · Un mes cerrado no se vuelve a tocar.** Decidido: se queda quieto. Si se corrige
la tarifa de un apartamento después de cerrar un mes, el pago de ese mes NO se recalcula.
Razón: es el número que una persona ya cobró. Un histórico que cambia solo es un histórico
en el que nadie puede confiar. **Consecuencia:** el snapshot es la autoridad del mes
cerrado, no una caché de un cálculo que se pueda repetir. Se descartó también la variante
de "ajuste aparte para el mes siguiente": no se pidió y añade un concepto nuevo.

**D7-4 · Qué se hace con el pago, una vez calculado.** Decidido, tres cosas: (1) verlo en
pantalla, con su desglose (D7-2); (2) marcarlo como pagado, con fecha y quién lo marcó,
sirve para no pagar dos veces y para saber qué falta; (3) que el aseador vea lo suyo en su
propia app. **Descartado:** exportar o imprimir. Ya figuraba en el roadmap como algo de la
siguiente versión (`FIN-V2-01`) y se confirma que sigue fuera.

**El punto 3 es alcance NUEVO, y hay que decirlo.** El ROADMAP define esta fase entera del
lado del admin: *"El admin ve cuánto deja cada aseo y cuánto le debe a cada aseador al
cierre de mes"*. Ninguno de sus cinco criterios de éxito menciona la app del aseador, y
ninguno de los requisitos `FIN-02` a `FIN-05` la toca. Que cada persona vea su propio pago
en el teléfono trae consigo: una pantalla nueva en el árbol `(cleaner)`; reglas de acceso
(un aseador ve **lo suyo y nada más**, ni el de un compañero ni la rentabilidad del
apartamento, y eso es lo que hay que probar contra la base, no contra la pantalla); y
**decidido el 2026-09-12: SOLO MESES YA CERRADOS.** El aseador no ve el mes en curso.
Razón: el acumulado del mes se mueve, y puede BAJAR (si se cancela un aseo ya contado), y
un número que baja en el teléfono de quien lo va a cobrar genera una conversación que
nadie quiere tener. Lo cerrado no cambia nunca (D7-3), así que es lo único que se puede
enseñar sin ambigüedad. Esto simplifica la pantalla del aseador: es una lista de meses
liquidados, no un contador en vivo.

### Claude's Discretion

El CONTEXT.md no declara una sección de discreción explícita. Lo que queda abierto es todo
lo que él no decidió: la forma del schema, el disparador del cierre, la mecánica de la
retención legal y la medición de Storage. Las decisiones de producto que descubrí durante
esta investigación y que **no** me corresponde tomar están en `## Open Questions`.

### Deferred Ideas (OUT OF SCOPE)

- **Exportar o imprimir el cierre mensual** (`FIN-V2-01`), confirmado fuera el 2026-09-12.
- **Descuentos por daños** sobre el pago del aseador. Ofrecido y rechazado.
- **Bonos o ajustes manuales** sobre el pago. Fuera del alcance de esta fase.
- **Ajuste del mes siguiente** por corrección retroactiva de tarifa. Descartado: no se
  pidió y añade un concepto nuevo.
- **El margen que se le muestra al aseador: ninguno.** El aseador ve lo que se le paga,
  nunca lo que se le cobra al huésped.
- **Scorecard de desempeño por aseador** (`PERF-V2-01`), diferido a v2 desde 2026-08-31.

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Descripción | Soporte de la investigación |
|----|-------------|-----------------------------|
| **FIN-02** | Admin ve la rentabilidad de cada aseo (fee al huésped menos pago al aseador) | Las dos cifras ya están congeladas en `cleanings.tarifa_huesped` y `cleanings.pago_aseador` desde la Fase 1 (§Dónde vive hoy el dinero). La rentabilidad es una **lectura viva**, no un snapshot: FIN-04 solo exige que sobreviva el cálculo MENSUAL. Debe servirse por función `security definer` con guarda de admin, porque hoy el grant de columna la deja leer al aseador (§Hallazgo 1) |
| **FIN-03** | El sistema calcula el pago del mes por aseador al cierre del último día laboral, excluyendo fines de semana | `pg_cron` 1.6.4 con guarda de calendario dentro de la función, no en la expresión cron: `$` existe pero significa último día CALENDARIO, y eso es incorrecto en 8 de 24 meses (§Pitfall 2). Forma cerrada del último día hábil verificada contra `generate_series` en 36 meses (§Code Example 1) |
| **FIN-04** | El cálculo mensual queda persistido como snapshot y sigue consultable aunque los aseos que lo sustentan se borren por retención | Dos tablas nuevas, cabecera y líneas, **sin FK en cascada hacia `cleanings` ni `expenses`**, con todo texto snapshoteado. El precedente exacto ya está en el repo: `access_code_reads.cleaning_id` es `on delete set null` por esta misma razón (§Pattern 1) |
| **FIN-05** | Los aseos informativos quedan fuera de todo cálculo financiero y de toda métrica | `cleanings.is_managed` es snapshot inmutable (el trigger lo reimpone en UPDATE) y el CHECK `cl_unmanaged_is_inert` fuerza `tarifa_huesped is null and pago_aseador is null` en las filas informativas. El filtro debe ser explícito igual, no implícito por NULL (§Pitfall 8) |
| **RET-03** | Admin marca un aseo con retención legal y ese aseo no se borra | Las columnas, el CHECK `cl_legal_hold_reason` y el índice `cleanings_legal_hold_idx` ya existen desde la migración 04. Falta el RPC (el aseador y el admin comparten `authenticated`, que solo tiene `grant select` sobre `cleanings`) y, sobre todo, el **trigger `BEFORE DELETE` que impide que la Fase 9 rompa la promesa por olvido** (§Pattern 3) |
| **RET-07** | El admin ve el consumo de Storage y recibe alerta al superar el 70% del cupo | `storage.get_size_by_bucket()` existe y es `security invoker`. El esquema `storage` NO está expuesto a PostgREST, así que hace falta envoltura en `public`. `postgres` tiene `rolbypassrls = t`, medido: una envoltura `definer` sin guarda le da el total a cualquier aseador (§Hallazgo 3). El umbral del 70% ya está sembrado en `app_settings` |

</phase_requirements>

---

## Summary

La Fase 1 ya dejó puesto casi todo el cimiento financiero, y eso cambia la forma de esta
fase: no hay que inventar dónde vive el dinero, hay que decidir **qué se congela, cuándo y
quién puede leerlo**. `cleanings.tarifa_huesped` y `cleanings.pago_aseador` son `bigint` de
pesos enteros, los escribe `tg_cleanings_snapshot()` al insertar y los **reimpone** en
todo UPDATE cuando el aseo está en estado terminal, así que FIN-01 no es una promesa del
código sino un invariante de la base. `expenses.monto` es `bigint` con `check (monto > 0)`
y desde la migración 18 lleva `moneda`. `legal_hold`, `legal_hold_reason`, `deleted_at`,
su CHECK de coherencia y su índice parcial existen desde la migración 04. El umbral del
70% de Storage ya está sembrado en `app_settings`. Lo que falta construir es más chico de
lo que parece, y lo difícil no es el cálculo.

Lo difícil es la tensión que el dueño creó al pedir **desglose con evidencia** (D7-2) sobre
un snapshot que debe **sobrevivir al borrado de esa misma evidencia** (FIN-04). Se resuelve
partiendo en dos lo que hoy se piensa como una cosa: la LÍNEA del desglose (apartamento,
fecha, concepto, monto) se copia como texto y vive para siempre, sin ninguna clave foránea
en cascada; la FOTO no se copia (duplicarla en un free tier de 1 GB es inviable y además
anula RET-06) y por tanto el enlace a la evidencia es **válido mientras la foto viva**, no
para siempre. Y ahí aparece una colisión que nadie había visto y que hay que llevarle al
dueño: RET-06 borra las fotos de evidencia a los 30 días, de modo que cualquier pago
revisado más de un mes después del aseo ya no tiene recibos que enseñar. Eso no se arregla
en la Fase 7 con código; se arregla con una decisión sobre si las fotos de gasto quedan
exentas de la purga de 30 días.

Lo segundo que esta investigación encontró, y que sí es un defecto vivo en `main`, es que
**un aseador puede leer hoy mismo la tarifa al huésped**. Medido contra Postgres local:
impersonando al aseador sembrado, `select max(tarifa_huesped) from public.cleanings`
devuelve `90000`, y `select max(tarifa_huesped) from public.properties` devuelve otros
`90000`. Contradice frontalmente la frontera que el CONTEXT.md da por sentada ("el aseador
ve lo que se le paga, nunca lo que se le cobra al huésped"). La buena noticia es que
**ningún código de la aplicación lee `cleanings.tarifa_huesped` hoy**, verificado por grep,
así que revocarlo cuesta casi nada; la parte de `properties` sí la lee el CRUD del admin y
es una decisión de alcance.

**Primary recommendation:** dos tablas de snapshot sin FK en cascada, un núcleo de cierre
idempotente con dos puertas de entrada (job diario con guarda de calendario, y RPC de
admin para reintento), toda lectura financiera por función `security definer` con guarda
explícita de rol en vez de por grants de columna, y un `BEFORE DELETE` sobre `cleanings` y
sobre `cleaning_photos` que convierta la retención legal en un invariante que la Fase 9 no
pueda romper por olvido.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Congelar tarifas por aseo (FIN-01, ya hecho) | Database (trigger) | — | `tg_cleanings_snapshot()` reimpone los dos números en UPDATE terminal. Un guard de aplicación no cubre `service_role` ni el pipeline iCal, que insertan sin pasar por RPC |
| Calcular rentabilidad por aseo (FIN-02) | Database (función definer) | Frontend Server (RSC) | Es resta de dos columnas ya congeladas. Va en la base porque el grant de columna no puede esconder `tarifa_huesped` del aseador (§Hallazgo 1) |
| Decidir el último día hábil (FIN-03) | Database (función SQL) | Frontend Server (gemelo TS solo para pintar) | La decisión de "hoy cierro" tiene que tomarla quien corre el job, y el job corre en Postgres. El gemelo TypeScript es para la etiqueta "cierra el 30 de octubre", no para decidir |
| Disparar el cierre (FIN-03) | Database (`pg_cron`) | Database (RPC de admin) | Mismo patrón que la sync iCal: `pg_cron` + guarda dentro de la función. El RPC de admin existe para reintentar, no como camino primario |
| Persistir el snapshot mensual (FIN-04) | Database (tablas propias) | — | Sobrevivir al borrado es una propiedad del schema (ausencia de cascada), no del código |
| Mostrar el pago al admin (D7-4.1) | Frontend Server (RSC) | Database (definer) | Ruta nueva bajo `(admin)`, RSC como el resto del dashboard |
| Marcar pagado (D7-4.2) | Frontend Server (Server Action) | Database (RPC) | `cleaner_monthly_payouts` no puede tener `grant update` para `authenticated`: el aseador comparte el rol |
| Mostrar el pago al aseador (D7-4.3) | Frontend Server (RSC bajo `(cleaner)`) | Database (definer) | La restricción "solo meses cerrados y solo míos" se impone en la función, no en el `where` de la pantalla |
| Marcar retención legal (RET-03) | Database (RPC + trigger) | Frontend Server (Server Action) | El RPC escribe la marca; el TRIGGER es lo que la hace cumplir contra código futuro |
| Medir Storage (RET-07) | Database (definer con guarda) | Frontend Server (RSC) | El esquema `storage` no está expuesto a PostgREST y `postgres` tiene `bypassrls` |
| Alertar al 70% (RET-07) | Database (job) | Frontend Server (banner) | El banner cubre "ve el consumo"; "recibe alerta" implica `notifications`, que exige valor nuevo de enum (§Pitfall 6) |

---

## Standard Stack

### Core

**No entra ninguna dependencia nueva en esta fase.** Todo lo que hace falta ya está
instalado y pineado. Se lista lo que la fase consume, con la versión que el repo tiene hoy.

| Librería | Versión | Propósito | Por qué es la estándar aquí |
|----------|---------|-----------|------------------------------|
| PostgreSQL | 17.6 (Supabase local) | Aritmética de dinero, calendario y el snapshot | `bigint` de pesos enteros, `date` para días de negocio. Constraint del proyecto [VERIFIED: `docker exec supabase_db_vivaguest psql`] |
| `pg_cron` | 1.6.4 | Disparo diario del cierre | Ya lo usan las Fases 3 y 5 con tres jobs agendados. `select extversion from pg_extension` [VERIFIED: base local] |
| `pg_net` | 0.20.4 | No hace falta en esta fase | Se lista para descartarlo: el cierre es SQL puro dentro de Postgres, sin HTTP saliente |
| `supabase` (CLI) | 2.116.0 | Migraciones, `gen types`, `test db` | El CLI es la fuente de verdad del schema [VERIFIED: `package.json`] |
| `next` | 15.5.24 | Rutas nuevas `(admin)` y `(cleaner)` | Constraint del proyecto |
| `@supabase/ssr` | 0.12.5 | Cliente servidor con cookies | Constraint del proyecto |
| `zod` | 4.5.4 | Validación de input de Server Actions | Patrón ya establecido en las 9 actions de `/operacion` |

### Supporting

| Librería | Versión | Propósito | Cuándo usarla |
|----------|---------|-----------|---------------|
| `lib/domain/money.ts` | interno | `formatCOP`, `formatMilesCOP`, `aEnteroCOP` | **Único sitio** donde se construye un `Intl.NumberFormat` de COP. Reutilizar, no duplicar [VERIFIED: leído el archivo] |
| `lib/domain/dates.ts` | interno | `hoyBog`, `sumarDias`, `formatFechaBog`, `formatFechaLargaBog` | Único sitio donde se formatea una fecha. El helper de mes nuevo va aquí, no en el componente |
| `vitest` | 4.1.11 | Lógica de calendario y de agregación en TS | El gemelo TypeScript del último día hábil |
| `@playwright/test` | 1.62.1 | E2E de las dos pantallas nuevas | Correr **siempre con `PLAYWRIGHT_PORT`** en puerto libre (§Pitfall 9) |
| pgTAP vía `supabase test db` | — | Aislamiento admin/aseador, invariantes del snapshot, retención legal | Es la única capa que prueba grants y RLS con roles reales |
| `sonner` | 2.0.8 | Toasts de las acciones | Ya es el estándar del repo |
| `shadcn` (CLI) | 4.19.1 | Primitivas nuevas si hacen falta | **Ojo al §Pitfall 4** si se genera una primitiva con ancho |

### Alternatives Considered

| En vez de | Se podría usar | Tradeoff |
|-----------|----------------|----------|
| Snapshot en tablas propias | Vista materializada sobre `cleanings` | Una vista materializada se REFRESCA, y refrescarla tras una corrección de tarifa reescribiría el histórico. Contradice D7-3 de frente. Descartada |
| Snapshot en tablas propias | Un `jsonb` con el desglose dentro de la fila de cabecera | Sobrevive igual al borrado y es una tabla menos. Pierde: índices sobre las líneas, `check` por línea, y la posibilidad de sumar en SQL sin desanidar. Con 8 aseadores y ~60 líneas por pago el `jsonb` funcionaría; se descarta porque el desglose es el requisito central (D7-2) y merece forma tipada |
| Job `pg_cron` diario con guarda | Expresión cron `0 4 $ * *` (`$` = último día del mes) | `$` existe en pg_cron 1.6.4 y se verificó que `cron.schedule` lo acepta, pero es el último día CALENDARIO. En 2026-2027 eso es incorrecto en 8 de 24 meses. Descartada |
| Job `pg_cron` diario con guarda | Vercel Cron | El proyecto ya decidió `pg_cron` en la Fase 3, y Hobby está capado a una corrida diaria. No se reabre |
| Funciones `security definer` con guarda de rol | RLS + grants por columna | Los grants de columna **no discriminan usuarios**: admin y aseador comparten el rol Postgres `authenticated`. Es el argumento literal de la migración 16. Cualquier columna admin-only en una tabla con grant a `authenticated` la lee también el aseador |
| `storage.get_size_by_bucket()` envuelto | Management API de Supabase (`/v1/projects/{ref}/usage`) | Exige un Personal Access Token de CUENTA, no la clave del proyecto. Meter un PAT de cuenta en el env de la app es ampliar la superficie de un secreto para leer un número que ya está en la base. Descartada |
| `storage.get_size_by_bucket()` envuelto | `sum(cleaning_photos.bytes)` | Es nuestra contabilidad, no la del bucket: no ve huérfanos. **Se recomienda calcular las DOS y exponer la diferencia**, que es justamente el indicador que la Fase 9 necesita (criterio 3) |

**Installation:**

```bash
# Ninguna. Cero paquetes nuevos en esta fase.
```

---

## Package Legitimacy Audit

**Esta fase no instala ningún paquete externo.** No hay dependencias nuevas de npm, PyPI ni
crates. La sección se deja escrita, vacía y a propósito, para que el planner no la
interprete como un olvido.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (ninguno) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

Si durante la planificación aparece la tentación de una librería de calendario laboral
(tipo `business-days`, `date-holidays`), la respuesta ya está decidida por el propio
requisito: **sin festivos**, solo fines de semana. Son cuatro líneas de SQL verificadas en
§Code Example 1 y un gemelo en TypeScript. Instalar una librería de festivos para un
cálculo que explícitamente excluye los festivos sería introducir el bug.

---

## Dónde vive hoy el dinero (inventario medido del repo)

Todo lo de esta sección se leyó de las migraciones y se confirmó contra la base local.

| Dato | Ubicación | Tipo | Quién lo escribe | Nota |
|------|-----------|------|-------------------|------|
| Tarifa al huésped, congelada por aseo | `public.cleanings.tarifa_huesped` | `bigint` nullable | `tg_cleanings_snapshot()` en INSERT, con `coalesce` para permitir tarifa propia en `repaso`/`emergencia` | `20260831212658_04_operacion.sql:198` |
| Pago al aseador, congelado por aseo | `public.cleanings.pago_aseador` | `bigint` nullable | igual | `...04_operacion.sql:199` |
| Reimposición de la congelación | `tg_cleanings_snapshot()` rama UPDATE | — | trigger `cleanings_snapshot` BEFORE INSERT OR UPDATE | `20260831215108_05_...sql:130-131`. **No falla el UPDATE: lo reescribe.** Aplica cuando `old.state in ('completada','cancelada')` |
| Tarifas vigentes del apartamento | `public.properties.tarifa_huesped` / `.pago_aseador` | `bigint` nullable | CRUD del admin | `20260831210111_03_catalogo.sql:148-149`, con `props_rates_nonneg` y el CHECK que las exige cuando `gestion_vivaguest` |
| Gasto reportado en campo | `public.expenses.monto` | `bigint not null check (monto > 0)` | `public.report_expense()` | `...04_operacion.sql:389`. Desde la migración 18 lleva además `moneda text not null default 'COP'` con `check (moneda ~ '^[A-Z]{3}$')` |
| Foto del recibo del gasto | `public.cleaning_photos` con `kind='gasto'` y `expense_id` | fila + objeto en bucket `evidencia` | `registrarFotoDeReporte` de la Fase 6 | Ruta `{cleaning_id}/{kind}/{uuid}.{ext}`, y esa convención es lo que autoriza la policy de `storage.objects` |
| Discriminador de gestión, snapshot | `public.cleanings.is_managed` | `boolean not null` | trigger; **inmutable en UPDATE** | `...05_...sql:110`. Es lo que hace que FIN-05 no pueda reescribirse retroactivamente |
| Retención legal | `cleanings.legal_hold`, `.legal_hold_reason`, `.deleted_at` | `boolean`/`text`/`timestamptz` | nadie todavía | `...04_operacion.sql:202-204`, con `cl_legal_hold_reason` y el índice parcial `cleanings_legal_hold_idx` |
| Umbral de alerta de Storage | `public.app_settings` clave `storage_alert_threshold_pct` | `jsonb` = `70` | seed | **Ya sembrado.** También `photo_retention_days = 30`, `retention_months = 6`, `retention_notice_days = 15` |
| Día de negocio | `public.today_bog()` | `date`, `stable` | — | `current_date` está PROHIBIDO en migraciones y seeds, y lo verifica `scripts/ci/check-service-role.sh` §4 |

**Lo que NO existe y hay que crear:** cualquier tabla de pagos mensuales, cualquier RPC de
retención legal, cualquier lectura de Storage, cualquier ruta financiera. Nada de esto
está esbozado ni stubbeado.

---

## Los tres hallazgos que cambian el plan

### Hallazgo 1 (ALTO) · El aseador lee HOY la tarifa al huésped

**Medido, no supuesto.** Impersonando al aseador sembrado contra la base local:

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','00000000-0000-4000-8000-000000000002','role','authenticated')::text, true);

select count(*), max(tarifa_huesped), max(pago_aseador) from public.cleanings;
--  1 | 90000 | 45000     <-- el aseador ve la tarifa al huésped

select count(*), max(tarifa_huesped) from public.properties;
--  1 | 90000             <-- y también la del apartamento
rollback;
```

Las dos superficies y por qué existen:

| Superficie | Mecanismo | Ventana | ¿La usa el código? |
|------------|-----------|---------|---------------------|
| `cleanings.tarifa_huesped` | `grant select (tarifa_huesped)` a `authenticated` + policy `cleanings_cleaner_select` cuyo `using` es solo `aseador_id = auth.uid()` | **Sin ventana de fechas.** Todo su histórico | **NO.** `grep -rn tarifa_huesped lib/data app` solo encuentra comentarios que dicen que NO se selecciona |
| `properties.tarifa_huesped` | `grant select (tarifa_huesped)` + policy `properties_cleaner_select` sobre `private.my_property_ids()` | `today_bog()-1 .. +7` | **SÍ, del lado del admin:** `lib/data/apartamentos.ts:106` la trae en el `select` de la lista |

**Consecuencia para el plan.** La primera es barata de cerrar y debería cerrarse en esta
fase: `revoke select (tarifa_huesped) on public.cleanings from authenticated` no rompe nada
(ningún consumidor), y FIN-02 nace ya por función `definer` con guarda de admin, que es lo
que de todos modos hay que construir. La segunda es una decisión de alcance y está en
§Open Questions Q4.

Y un matiz que conviene no confundir: `pago_aseador` visible para el aseador **no** es una
fuga (es lo que le pagan). Sí roza D7-4.3, que dijo "solo meses cerrados": leyendo
`cleanings` directamente un aseador podría armarse el acumulado del mes en curso. No es lo
mismo que pintárselo en pantalla, y la decisión del dueño era sobre la pantalla. Se anota,
no se propone cerrarlo.

### Hallazgo 2 (ALTO) · La evidencia del gasto muere a los 30 días, antes que el pago

D7-2 exige, textual, *"desde cada gasto llegar a la foto que lo sustenta"*. RET-06 dice que
las fotos de evidencia se borran a los 30 días, y `app_settings.photo_retention_days = 30`
ya está sembrado. `public.cleaning_photos` tiene **un solo** `deleted_at` y **ningún**
campo que distinga política de purga por `kind`, aunque `kind` valga
`('checklist','dano','gasto','faltante')`.

La línea de tiempo, con números del propio proyecto:

```
día 0    aseo, se reporta un gasto con foto del recibo
día 0-30 el mes se cierra (el último día hábil), el pago se calcula
día 30   la purga de RET-06 borra la foto del recibo
día 31+  el admin abre el pago de ese mes -> hay línea de gasto, no hay recibo
```

O sea que el enlace a la evidencia está roto **ya en el mes siguiente**, no dentro de seis
meses. No es un problema de FIN-04, es un problema de RET-06 contra D7-2, y no se puede
resolver desde la Fase 7 con código: copiar la foto a otro sitio la duplica en un bucket de
1 GB y anula el propio RET-06.

Presupuesto de Storage, para dimensionar la excepción que se propondría:

| Concepto | Cálculo | Resultado |
|----------|---------|-----------|
| Peso objetivo por foto | `OBJETIVO_KB = 200` en `lib/fotos/politica.ts` | 200 KB |
| Fotos por aseo (checklist) | ~6, según el presupuesto de `PROJECT.md` | 1,2 MB/aseo |
| Fotos de gasto | 1 por gasto, y no todo aseo tiene gasto | ≈ 0,2 MB en los que lo tienen |
| Cupo del plan Free | 1 GB de File Storage | 1024 MB |
| Umbral del 70% | `storage_alert_threshold_pct = 70` | ≈ 716 MB |

Las fotos de gasto son del orden del 3% del volumen. **Eximirlas de la purga de 30 días y
alinearlas con los 6 meses de `retention_months` cuesta poco Storage y salva el requisito.**
Pero es una decisión del dueño, no mía: §Open Questions Q2.

### Hallazgo 3 (MEDIO) · Medir Storage es fácil, y por eso es fácil filtrarlo

Todo medido contra la base local:

```
storage.get_size_by_bucket() -> TABLE(size bigint, bucket_id text)   [existe]
prosecdef = f                                                        [es INVOKER]
cuerpo: sum((metadata->>'size')::bigint) group by bucket_id
```

Comportamiento verificado bajo RLS:

| Quien llama | Resultado |
|-------------|-----------|
| admin (`private.is_admin()` true) | `415 | evidencia` (el total real) |
| aseador | **0 filas** (la policy `evidencia_cleaner_select` solo le deja ver sus rutas) |
| función `security definer` propiedad de `postgres`, sin guarda, llamada por un aseador | **415** |

La última línea es el hallazgo: `select rolname, rolbypassrls from pg_roles` devuelve
`postgres | t`. Una envoltura `definer` **salta la RLS de `storage.objects` entera**, así
que sin `private.is_admin()` explícito dentro, cualquier aseador aprende el consumo total.
Es exactamente la lección que la migración 16 escribió para `push_subscriptions`, repetida.

Y dos precisiones sobre el número:

1. **El esquema `storage` no está expuesto a PostgREST.** `supabase/config.toml:14` dice
   `schemas = ["public", "graphql_public"]`, con un comentario que prohíbe expresamente
   añadir `private`. Hace falta envoltura en `public`.
2. **El número puede quedarse CORTO.** `get_size_by_bucket()` suma filas de
   `storage.objects`. Un objeto huérfano (archivo en el bucket, fila borrada por SQL) no
   aparece, y es justo el escenario que `storage_deletion_queue` existe para prevenir. Por
   eso la recomendación es calcular las dos cifras y exponer la diferencia.

---

## Architecture Patterns

### System Architecture Diagram

```
                     ENTRADAS (ya existen, no se tocan)
  ┌───────────────────────┐   ┌──────────────────────┐   ┌────────────────────┐
  │ sync iCal / RPC admin │   │ report_expense()     │   │ CRUD apartamento   │
  │  crea `cleanings`     │   │  crea `expenses`     │   │ edita tarifas      │
  └───────────┬───────────┘   └──────────┬───────────┘   └─────────┬──────────┘
              │                          │                         │
              v                          v                         v
      ┌───────────────────────────────────────────────────────────────────┐
      │ tg_cleanings_snapshot()  ·  CONGELA tarifa_huesped/pago_aseador   │
      │ y las REIMPONE en todo UPDATE terminal            [FIN-01, hecho] │
      └────────────────────────────┬──────────────────────────────────────┘
                                   │
        ┌──────────────────────────┼─────────────────────────────┐
        │ LECTURA VIVA             │                  CIERRE     │
        v                          │                             v
 ┌─────────────────────┐           │        ┌──────────────────────────────────┐
 │ rentabilidad_aseos()│           │        │ pg_cron  '30 4 * * *' (UTC)      │
 │  definer + is_admin │           │        │  = 23:30 Bogotá del día anterior │
 │  filtra is_managed  │           │        └────────────────┬─────────────────┘
 │        [FIN-02/05]  │           │                         v
 └──────────┬──────────┘           │        ┌──────────────────────────────────┐
            │                      │        │ cerrar_mes_si_toca()             │
            │                      │        │  guarda: today_bog() =           │
            │                      │        │  ultimo_dia_habil(today_bog())   │
            │                      │        └────────────────┬─────────────────┘
            │                      │                         │
            │                      │        ┌────────────────┴─────────────────┐
            │                      │        │ RPC admin cerrar_mes(periodo)    │
            │                      │        │  (reintento manual, misma lógica)│
            │                      │        └────────────────┬─────────────────┘
            │                      │                         v
            │                      │        ┌──────────────────────────────────┐
            │                      └───────>│ private.cerrar_mes_core(periodo) │
            │                               │  · lee cleanings completadas     │
            │                               │    is_managed, del periodo       │
            │                               │  · lee expenses de esos aseos    │
            │                               │  · COPIA texto y montos          │
            │                               │  · on conflict do nothing        │
            │                               └────────┬─────────────────────────┘
            │                                        v
            │                  ┌──────────────────────────────────────────────┐
            │                  │ cleaner_monthly_payouts        (cabecera)    │
            │                  │  unique (aseador_id, periodo)                │
            │                  │ cleaner_monthly_payout_lines   (desglose)    │
            │                  │  SIN FK EN CASCADA hacia cleanings/expenses  │
            │                  │  todo texto snapshoteado         [FIN-04]    │
            │                  └───────┬─────────────────────┬────────────────┘
            │                          │                     │
            v                          v                     v
   ┌────────────────────┐   ┌─────────────────────┐  ┌──────────────────────────┐
   │ /finanzas (admin)  │   │ pagos_del_mes()     │  │ mis_pagos_cerrados()     │
   │  RSC + definer     │   │  definer + is_admin │  │  definer + is_active_    │
   │  rentabilidad      │   │  desglose completo  │  │  cleaner + auth.uid()    │
   │  + pagos + storage │   │  + intento de       │  │  + closed_at is not null │
   └────────────────────┘   │    signed URL       │  └────────────┬─────────────┘
                            └─────────────────────┘               v
                                                      ┌──────────────────────────┐
                                                      │ /mis-pagos (cleaner)     │
                                                      │  lista de meses cerrados │
                                                      │  SIN tarifa al huésped   │
                                                      └──────────────────────────┘

          GUARDIANES QUE ESTA FASE DEJA PUESTOS PARA LA FASE 9
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ BEFORE DELETE on cleanings       raise si legal_hold           [RET-03]  │
  │ BEFORE UPDATE on cleanings       raise si legal_hold y deleted_at nuevo  │
  │ BEFORE DELETE on cleaning_photos raise si el aseo tiene legal_hold       │
  │ consumo_storage()  definer + is_admin, devuelve bucket vs contabilidad   │
  └──────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
supabase/migrations/
├── 20260913xxxx_23_calendario_y_financiero.sql   # ultimo_dia_habil + las 2 tablas + grants
├── 20260913xxxx_24_cierre_mensual.sql            # core + las 2 puertas + el job pg_cron
├── 20260913xxxx_25_retencion_legal.sql           # RPC + los 3 triggers guardianes
└── 20260913xxxx_26_consumo_storage.sql           # envoltura definer + enum nuevo (ver Pitfall 6)

supabase/tests/
└── 11_financiero.test.sql                        # WAVE 0, en rojo antes del schema

lib/domain/
├── mes.ts            # ultimoDiaHabilDelMes, periodoDe, etiquetaDePeriodo  (gemelo de SQL)
├── mes.test.ts
└── finanzas.ts       # tipos del desglose + agregación de presentación

lib/data/
├── finanzas.ts       # llamadas a las definer del admin
└── pagos-aseador.ts  # llamada a mis_pagos_cerrados()

app/(admin)/finanzas/
├── page.tsx
├── _actions.ts       # marcarPagado, cerrarMesAhora, marcarRetencionLegal
└── _components/

app/(cleaner)/mis-pagos/
├── page.tsx
└── _components/
```

### Pattern 1: El snapshot que sobrevive al borrado (FIN-04)

**Qué:** dos tablas, cabecera y líneas, cuyo contenido es TEXTO COPIADO y cuyas referencias
hacia el mundo vivo son débiles a propósito.

**Cuándo usarlo:** siempre que un dato tenga que sobrevivir a la purga de aquello que lo
originó. El repo ya tiene el precedente exacto y conviene citarlo en el plan:

> `access_code_reads.cleaning_id` es `on delete set null` y NO cascade: *"si la purga de la
> Fase 9 borra el aseo, el rastro de quién vio el código debe sobrevivir. Un cascade aquí
> convertiría la retención en un borrador de evidencia de acceso."*
> (`20260831212658_04_operacion.sql`)

**Las cuatro reglas, y qué rompe cada una si se ignora:**

| Regla | Si se ignora |
|-------|--------------|
| Ninguna FK `on delete cascade` hacia `cleanings` ni `expenses` | La purga de 6 meses borra el pago del mes. Es FIN-04 al revés |
| Los punteros (`cleaning_id`, `expense_id`, `property_id`) van `on delete set null` o sin FK | Con `restrict`, la purga de la Fase 9 falla con 23503 y nunca borra nada |
| Todo lo legible es columna `text`/`date`/`bigint` COPIADA: `property_nombre`, `fecha`, `concepto`, `monto`, `moneda` | Al borrarse el aseo el desglose queda con UUIDs sueltos. D7-2 pedía desglose, no punteros rotos |
| `unique (aseador_id, periodo)` en la cabecera | El cierre deja de ser idempotente y una corrida doble paga dos veces |

**El desglose con evidencia, resuelto:**

| Se conserva para siempre | NO se conserva |
|--------------------------|----------------|
| La línea del aseo: fecha, nombre del apartamento, monto | La fila de `cleanings` (la borra la Fase 9 a los 6 meses) |
| La línea del gasto: fecha, apartamento, concepto, monto, moneda | La fila de `expenses` (cascade desde `cleanings`) |
| `evidencia_path text`, la RUTA del recibo en el bucket, copiada | **El archivo de la foto** (RET-06 a 30 días, salvo que Q2 lo cambie) |
| `evidencia_bucket text`, por si algún día hay más de uno | La fila de `cleaning_photos` |

**La regla de presentación que se deriva, y que el planner debe escribir en la tarea:** al
abrir un pago, la UI intenta la signed URL de `evidencia_path`; si el objeto ya no está,
pinta literalmente *"recibo purgado"* con la fecha de purga si se conoce. **No** un
`<img>` roto ni un enlace muerto. Una ausencia explicada es información; una ausencia
silenciosa es un bug percibido.

**Lo que NO se propone y por qué:** copiar el archivo de la foto a un bucket de archivo
permanente. Duplica el objeto en un cupo de 1 GB, y el archivo copiado nunca lo borra nadie,
así que la purga de RET-06 deja de servir para lo que existe. Si el dueño quiere el recibo
para siempre, lo barato es eximir `kind='gasto'` de la purga de 30 días (Q2), no duplicarlo.

### Pattern 2: Cierre idempotente con dos puertas y una sola lógica

**Qué:** un núcleo en `private`, y dos funciones `public` que lo llaman: el job y el RPC.

```
private.cerrar_mes_core(p_periodo date)   -- sin grant a nadie
   ^                           ^
   |                           |
public.cerrar_mes_si_toca()    public.cerrar_mes(p_periodo date)
  grant execute to postgres      grant execute to authenticated
  guarda de calendario           guarda private.is_admin()
  lo llama pg_cron               lo llama la Server Action
```

**Por qué las dos y no una:**

- Solo job: si el job no corre (la Fase 3 ya construyó un watchdog justo porque eso pasa),
  el mes no cierra y nadie cobra. El admin tiene que poder forzarlo.
- Solo acción del admin: el requisito dice *"el sistema calcula"*, no *"el admin calcula"*.
- Las dos, con un núcleo compartido: el cálculo es uno solo, y el `unique (aseador_id,
  periodo)` con `on conflict do nothing` hace que no importe quién llegue primero.

**Dónde va la guarda de calendario:** dentro de `cerrar_mes_si_toca()`, no en la expresión
cron. Razones medidas en §Pitfall 2.

**Horario:** `30 4 * * *` en UTC. `cron.timezone` es `GMT` en el stack de Supabase (medido:
`select current_setting('cron.timezone')` devuelve `GMT`), así que eso son las 23:30 de
Bogotá, y `today_bog()` en ese instante todavía devuelve el día que se está cerrando. La
`hora_limite` por defecto es 11:30, así que a esa hora los aseos del día ya terminaron.

**Precedente de idempotencia del repo:** el pipeline de sync es idempotente por
construcción (`unique (apartamento_id, uid)` + upsert), y `cron.schedule` es un UPSERT por
`jobname`, medido en la Fase 3. Mismo criterio aquí.

### Pattern 3: La retención legal como invariante, no como cortesía (RET-03)

**Qué:** la marca la escribe un RPC; lo que la hace CUMPLIR son triggers.

**Por qué hace falta el RPC y no basta un UPDATE:** `authenticated` tiene `grant select` por
columna sobre `cleanings` y **ninguno** de insert, update o delete. Verificado contra
`information_schema.column_privileges`. Es el patrón deliberado registrado en STATE.md:
*"Toda mutación de `cleanings` necesita RPC nueva, incluida la del admin."*

**Por qué hacen falta los triggers, que es la parte que importa:** la Fase 9 todavía no
existe. Quien la escriba va a redactar un `delete from public.cleanings where scheduled_date
< ...` y tiene que acordarse de `and not legal_hold`. Un olvido ahí destruye evidencia en
disputa y **no da error**: borra. Tres guardianes lo vuelven imposible:

| Guardián | Qué impide | Por qué separado |
|----------|------------|------------------|
| `BEFORE DELETE on cleanings` raise si `legal_hold` | Borrado físico del aseo retenido | Cubre transitivamente el cascade hacia `expenses`, `damages`, `cleaning_checklist_items` y `cleaning_photos` |
| `BEFORE UPDATE on cleanings` raise si `legal_hold` y `deleted_at` pasa de null a no null | Soft delete del aseo retenido | El `deleted_at` es el paso 1 de la purga; bloquearlo hace que la Fase 9 falle temprano y ruidosamente |
| `BEFORE DELETE on cleaning_photos` raise si su aseo tiene `legal_hold` | La purga de fotos a 30 días | **Es la que no sale gratis.** RET-06 borra `cleaning_photos` DIRECTAMENTE, sin pasar por `cleanings`, así que el primer trigger no la ve. El criterio 4 de la Fase 9 dice literal *"ni por la purga de fotos"* |

**Efecto colateral conocido y aceptable:** los archivos pgTAP hacen `delete from
public.cleanings` en su preparación. Con el trigger puesto, un test que siembre un aseo
retenido tendrá que apagar la marca antes de limpiar. Eso no es una molestia: es la prueba
de que el trigger funciona, y conviene que una aserción lo ejerza a propósito.

**Lo que esta fase debe dejar escrito para la Fase 9, y va en el plan como entregable, no
como comentario:**

1. Los tres triggers, con sus `comment on trigger` explicando qué fase los va a chocar.
2. Aserciones pgTAP que fallen si alguien los quita.
3. Una nota en `.planning/STATE.md` bajo "Consecuencias para fases posteriores", igual que
   la que la Fase 1 dejó para la 3, la 4 y la 6.

### Pattern 4: Lectura financiera por función, no por grant

**Qué:** las tablas del snapshot no reciben `grant select` para `authenticated`. Todo sale
por funciones `security definer` con guarda de rol explícita.

**Por qué:** los grants por columna no discriminan usuarios. Argumento textual de la
migración 16:

> *"los grants por columna NO DISCRIMINAN USUARIOS. Admin y aseador comparten el rol
> Postgres `authenticated`, así que 'solo el admin' no existe como categoría de grant."*

Con RLS + grants sería posible separar por FILA (el aseador ve su fila) pero no por COLUMNA
(si la cabecera guardara un total de tarifa al huésped, el aseador lo leería). La salida es
no meter nunca cifras de huésped en las tablas de pago, y además servirlo por función.

**Las funciones de la fase, con su guarda:**

| Función | Guarda | Devuelve |
|---------|--------|----------|
| `public.rentabilidad_aseos(p_desde date, p_hasta date)` | `private.is_admin()` | aseo, apartamento, tarifa, pago, margen. **Filtra `is_managed`** |
| `public.pagos_del_mes(p_periodo date)` | `private.is_admin()` | cabeceras del periodo con sus totales |
| `public.detalle_de_pago(p_payout uuid)` | `private.is_admin()` | líneas del pago, con `evidencia_path` |
| `public.marcar_pago_pagado(p_payout uuid)` | `private.is_admin()` | escribe `paid_at`, `paid_by` |
| `public.cerrar_mes(p_periodo date)` | `private.is_admin()` | invoca el núcleo |
| `public.set_legal_hold(p_cleaning uuid, p_activo boolean, p_motivo text)` | `private.is_admin()` | escribe la marca y su motivo |
| `public.consumo_storage()` | `private.is_admin()` | bytes del bucket, bytes contabilizados, cupo, porcentaje |
| `public.mis_pagos_cerrados()` | `private.is_active_cleaner()` + `aseador_id = auth.uid()` + `closed_at is not null` | **solo** periodo, total de aseos, total de gastos, total, `paid_at` |
| `public.detalle_de_mi_pago(p_payout uuid)` | igual, y verifica dueño antes de devolver una línea | líneas propias. **Cero columnas de huésped** |

**El coste, dicho en voz alta:** se pierden los filtros y embeds de PostgREST. Para una
pantalla de 8 aseadores por mes eso no es un coste real, y es el precio ya pagado por
`property_secrets` y por `estado_avisos_aseadores()`.

### Pattern 5: El gemelo SQL/TypeScript del calendario, con su test de paridad

La Fase 6 encontró una divergencia real el primer día que corrió su test de paridad
SQL/TypeScript (`armarChecklist()` descartaba el salto de un cuarto sin tareas, y el
dashboard decía una cosa y el teléfono otra). Aquí hay dos implementaciones del mismo
concepto por la misma razón: la base decide cuándo cierra, la pantalla dice cuándo cierra.

**Regla:** `public.ultimo_dia_habil_del_mes(date)` y `ultimoDiaHabilDelMes(string)` viven en
paralelo, y un test de integración los compara sobre **los 36 meses de 2026 a 2028**, no
sobre tres casos escogidos.

### Anti-Patterns to Avoid

- **Sumar tarifas vivas de `properties` en vez de las congeladas de `cleanings`.** Anula
  FIN-01 y hace que el mes pasado se mueva al editar un apartamento. Toda consulta
  financiera lee `cleanings.tarifa_huesped` / `.pago_aseador`, nunca `properties.*`.
- **Una vista materializada como snapshot.** Se refresca, y refrescar es exactamente lo que
  D7-3 prohíbe.
- **Recalcular el mes al abrirlo.** El snapshot es la autoridad, no una caché.
- **Poner cifras de huésped en las tablas de pago.** Ver Pattern 4.
- **`on delete cascade` desde las líneas del snapshot hacia `cleanings`.** Ver Pattern 1.
- **Contar el periodo por `finished_at::date`.** `finished_at` es `timestamptz`; un aseo
  terminado a las 20:00 de Bogotá del 31 cae en el 1 del mes siguiente en UTC. La membresía
  del periodo se decide por `scheduled_date`, que es `date` y ya es día de negocio.
- **Confiar en que los informativos no suman porque sus tarifas son NULL.** Es cierto hoy
  por el CHECK `cl_unmanaged_is_inert`, pero FIN-05 dice *"fuera de todo cálculo y de toda
  métrica"*, incluidos los CONTEOS. `where is_managed` explícito en todas.
- **`revalidatePath` en las Server Actions de `(admin)`.** Ver Pitfall 3.
- **Dar `grant update` sobre las tablas de pago a `authenticated` para marcar "pagado".**
  El aseador comparte el rol y se marcaría su propio pago.

---

## Don't Hand-Roll

| Problema | No construir | Usar en su lugar | Por qué |
|----------|--------------|------------------|---------|
| Formatear COP | Un `Intl.NumberFormat` nuevo en el componente | `formatCOP` de `lib/domain/money.ts` | Es el único sitio del repo, por decisión de UI-SPEC §8.4. Instanciar `Intl` por fila es caro y un segundo formateador diverge |
| Leer dinero de un input | `Number(valor)` sobre el string del DOM | `aEnteroCOP` de `lib/domain/money.ts` | `Number('120.000')` es **120**. Ya hay un comentario de 20 líneas en el repo explicándolo |
| Formatear fechas | `new Date(iso)` | `formatFechaBog` / `formatFechaLargaBog` de `lib/domain/dates.ts` | Un ISO de solo fecha se parsea como medianoche UTC y en Bogotá pinta el día anterior |
| Sumar o restar días | Restar 86.400.000 ms | `sumarDias` de `lib/domain/dates.ts` | El cruce de mes y el año bisiesto son los dos casos donde la resta a pelo falla |
| Saber qué día es hoy | `new Date()` en el servidor, `current_date` en SQL | `hoyBog()` / `public.today_bog()` | `current_date` está prohibido por `scripts/ci/check-service-role.sh` §4. Pasadas las 19:00 de Bogotá la sesión UTC ya está en mañana |
| Medir el bucket | Recorrer el bucket con la Storage API y sumar | `storage.get_size_by_bucket()` envuelta | Ya existe, ya suma, ya respeta RLS si se deja invoker |
| Calendario laboral | `date-holidays`, `business-days` | Cuatro líneas de SQL de §Code Example 1 | El requisito excluye festivos expresamente. Una librería de festivos introduciría el bug |
| Aritmética de dinero | `dinero.js`, `big.js`, `currency.js` | `bigint` de pesos enteros y suma | Sin subunidad y sin multi-moneda en el MVP. Ya está decidido en CLAUDE.md |
| Idempotencia del cierre | Una bandera `ya_corrio` en `app_settings` | `unique (aseador_id, periodo)` + `on conflict do nothing` | Una bandera es estado que se puede desincronizar. El índice único es una garantía de la base |
| Deduplicar la alerta de Storage | Comparar a mano con la última notificación | `dedupe_key` + el índice único parcial de `notifications` | El mecanismo ya existe y ya lo usan `report_expense` y compañía |

**Key insight:** en esta fase, la tentación de construir a mano no está en las librerías
(no entra ninguna), está en **reimplementar lo que la Fase 1 ya puso en la base**. El
error de forma más probable de este plan es calcular en TypeScript algo que ya es un
invariante de Postgres, y quedarse con dos verdades.

---

## Common Pitfalls

### Pitfall 1: El grant por columna choca con el upsert y falla SIEMPRE, en silencio

**Qué sale mal:** PostgREST traduce un `upsert(..., { onConflict })` a `INSERT ... ON
CONFLICT DO UPDATE` metiendo **todas** las columnas del payload en el `SET`, y Postgres
exige el privilegio de UPDATE sobre esas columnas **aunque no haya conflicto**. Resultado:
42501 en el 100% de las llamadas.

**Por qué pasa:** medido el 2026-09-12 en este mismo repo, migración 22. `registrarSuscripcion`
llevaba así desde la Fase 5 y **ningún aseador quedó registrado nunca**. Fue invisible porque
el cliente no miraba el `ok` de la action.

**Cómo evitarlo:** toda escritura nueva de esta fase pasa por función `security definer`, y
**toda escritura nueva se prueba en pgTAP contra Postgres de verdad**, no contra un doble en
vitest. Un doble en vitest no tiene grants y siempre dice que sí.

**Señales de alerta:** una Server Action que devuelve `{ ok: ... }` y un componente que no
lo lee. La otra mitad del bug de la migración 22 fue exactamente esa.

### Pitfall 2: `$` de pg_cron es el último día CALENDARIO, y eso está mal un tercio del año

**Qué sale mal:** `pg_cron` acepta `$` en el campo de día del mes. Verificado contra la base
local: `select cron.schedule('x', '0 12 $ * *', 'select 1')` se acepta y queda agendado. Es
tentador y es incorrecto.

**Por qué pasa:** `$` es el último día del mes, hábil o no. Medido sobre 2026 y 2027:

| Año | Meses cuyo último día NO es hábil | Días del mes que quedan DESPUÉS del cierre |
|-----|------------------------------------|---------------------------------------------|
| 2026 | 4 de 12 (ene, feb, may, oct) | 5 días |
| 2027 | 4 de 12 (ene, feb, jul, oct) | 7 días |

**Cómo evitarlo:** cron diario (`30 4 * * *` en UTC = 23:30 de Bogotá) y la guarda dentro de
la función: `if public.today_bog() <> public.ultimo_dia_habil_del_mes(public.today_bog())
then return; end if;`. El coste son 365 consultas triviales al año.

**Y la consecuencia que NO es de implementación sino de producto:** esos 5 a 7 días al año
quedan del lado equivocado del cierre. Ver §Open Questions Q1. Es la decisión más cara de
esta fase y no me corresponde tomarla.

### Pitfall 3: `revalidatePath` cuelga el navegador en las Server Actions de `(admin)`

**Qué sale mal:** con `revalidatePath('/ruta')` dentro de una Server Action de `(admin)`, la
fila se escribe, el servidor responde 200 con la carga útil completa en ~50 ms, y el cliente
no la aplica NUNCA: el botón se queda en "Guardando..." para siempre, sin toast y sin cerrar
el diálogo.

**Por qué pasa:** causa raíz **no identificada**. Medido en el plan 04-14 sobre las nueve
Server Actions de `/operacion`. El disparador es el TAMAÑO del árbol de cliente, no su
contenido, así que una pantalla nueva y grande vuelve a caer.

**Cómo evitarlo:** ninguna Server Action de `(admin)` llama `revalidatePath`. El refresco lo
pide `router.refresh()` desde el cliente. Las nueve de `/operacion` ya están así.

**Señales de alerta:** solo se ve con el build de producción y Playwright. `next dev` y los
tests de integración no lo detectan.

### Pitfall 4: `max-w-<nombre de talla>` resuelve contra `--spacing-*` y la caja nace de 8px

**Qué sale mal:** en Tailwind v4.3, `max-w-sm` compila a `var(--spacing-sm)` = 8px, porque
la escala de espaciado del proyecto usa nombres de talla. Un `Sheet` midió ocho píxeles de
ancho en producción.

**Cómo evitarlo:** anchos de primitiva en tokens `--container-<nombre-propio>`, nunca con
nombre de talla, y registrar el token nuevo en el grupo `max-w` de `cn()`. `npm run ci:arch`
ya lo atrapa (`check-max-w-tallas.sh`).

**Señales de alerta:** solo se ve midiendo el CSS del build de producción.

### Pitfall 5: `sum()` sobre `bigint` devuelve `numeric`, y `numeric` llega como string

**Qué sale mal:** `select pg_typeof(sum(monto)) from public.expenses` devuelve **`numeric`**
(medido). CLAUDE.md ya registra que `supabase-js` entrega `numeric` como **string** para no
perder precisión. Un total que llega como `"1200000"` rompe la aritmética en TypeScript en
silencio: `"1200000" + 50000` es `"120000050000"`.

**Cómo evitarlo:** castear en la base. El `returns table` de toda función que agregue declara
`bigint`, y el cuerpo hace `coalesce(sum(x), 0)::bigint`. Verificado:
`pg_typeof(coalesce(sum(1::bigint),0)::bigint)` es `bigint`.

**Señales de alerta:** un total que se concatena en vez de sumarse, o un `toLocaleString` que
funciona igual sobre string y sobre number y por eso no delata nada.

### Pitfall 6: Un valor nuevo de enum no se puede USAR en la misma migración que lo crea

**Qué sale mal:** RET-07 dice *"recibe alerta"*. Si la alerta va por `notifications`, hace
falta un valor nuevo en `public.notification_type`, que hoy tiene once (`asignacion`,
`no_puedo`, `dano_reportado`, `faltantes_reportados`, `gasto_reportado`, `aseo_completado`,
`hora_limite_vencida`, `calendario_caido`, `extension_sospechosa`, `aseo_cancelado`,
`retencion_proxima`).

**Por qué pasa:** medido contra la base local:

```
begin;
alter type public.notification_type add value if not exists '__probe';   -- ALTER TYPE  OK
select '__probe'::public.notification_type;
-- ERROR: unsafe use of new value "__probe" of enum type notification_type
-- HINT:  New enum values must be committed before they can be used.
```

El CLI aplica cada archivo de migración dentro de una transacción, así que **el `alter type`
y su primer uso ejecutado tienen que ir en archivos distintos**. Matiz que sí funciona: un
`create function` cuyo cuerpo mencione el literal SÍ se puede crear en el mismo archivo,
porque el cuerpo no se evalúa al crearse. Lo que falla es ejecutar.

**Cómo evitarlo:** archivo 26 añade el valor; el job que lo escribe vive en 26 como función
y solo se ejecuta en runtime. O más simple: no usar `notifications` para esto (§Open
Questions Q3).

**Nota adicional:** la STATE.md registra *"once valores, decisión fijada en el plan 03-03"*,
así que ampliarlo no es un detalle técnico: es tocar una decisión escrita.

### Pitfall 7: Una definer propiedad de `postgres` salta la RLS de `storage.objects`

**Qué sale mal:** `select rolname, rolbypassrls from pg_roles where rolname='postgres'`
devuelve `postgres | t`. Una función `security definer` en `public` que lea
`storage.objects` devuelve el total real a quien sea. Medido: un aseador obtuvo `415`.

**Cómo evitarlo:** `if not private.is_admin() then raise exception ... using errcode='42501';
end if;` como **primera** operación de la función. Es el mismo patrón de `exigirAdmin()` en
las nueve actions de la Fase 4, y el mismo argumento de `estado_avisos_aseadores()` en la 16.

**Señales de alerta:** una función `definer` que lee un esquema ajeno y no menciona el rol.

### Pitfall 8: La membresía del mes y el estado del aseo son dos preguntas, no una

**Qué sale mal:** al cerrar, hay aseos del periodo que siguen en `pendiente` o `en_curso`.
Si no se paga solo lo `completada`, se paga trabajo no hecho. Si se paga solo lo `completada`
y ese aseo se termina al día siguiente, **nunca se paga**, porque D7-3 prohíbe recalcular.

**Cómo evitarlo:** el núcleo cuenta solo `state = 'completada'` **y además** escribe en la
cabecera un contador de lo que quedó fuera (`cleanings_no_computados`), para que el admin lo
vea en la pantalla del cierre en vez de descubrirlo por un reclamo. Es barato: una columna.

Y el filtro completo de la consulta del núcleo, que conviene escribir en el plan tal cual:

```
where c.is_managed                          -- FIN-05
  and c.state = 'completada'
  and c.aseador_id is not null
  and c.pago_aseador is not null
  and c.scheduled_date >= p_periodo
  and c.scheduled_date <  (p_periodo + interval '1 month')::date
```

Nótese que **no** aparece `state is distinct from 'cancelada'`: aquí se pide igualdad a
`completada`, que es más estrecho. La regla transversal del repo (`is distinct from` y nunca
`<>`) aplica a las consultas de "aseos vivos", no a esta.

### Pitfall 9: Playwright contra el puerto 3000 corre contra OTRO proyecto

**Qué sale mal:** `playwright.config.ts` usa `reuseExistingServer`, y en el puerto 3000 de
esta máquina corre Alfa-MVP (Next 15.5.18). Los rojos e2e atribuidos a la Fase 5 eran falsos
rojos de esa confusión.

**Cómo evitarlo:** correr siempre con `PLAYWRIGHT_PORT` en un puerto libre. Está registrado
en `STATE.md` como hallazgo del 2026-09-12.

### Pitfall 10: El I/O de iCloud domina el reloj, y `db:reset` cuesta 54 segundos

**Qué sale mal:** `tsc` en frío tardó 6 min 39 s consumiendo 6 s de CPU; `eslint` llegó a 53
minutos con 4,4 s de CPU. Un proceso al 0% de CPU **no** está colgado.

**Cómo evitarlo:** `npx tsc --noEmit` una vez al empezar la sesión. Y presupuestar 54 s por
cada `npm run db:reset`: un plan de señuelos sobre migraciones hace veintitantos y se come
la mitad de su tiempo ahí. Esta fase toca migraciones, así que aplica.

---

## Code Examples

### Ejemplo 1: El último día hábil, en forma cerrada y verificada

```sql
-- Fuente: verificado contra la base local de este repo el 2026-09-12,
-- comparando con generate_series sobre 36 meses (2026-01 a 2028-12):
-- 36 meses, 36 coincidencias.
create or replace function public.ultimo_dia_habil_del_mes(p_dia date)
returns date
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.extract(isodow from ultimo)
           when 6 then ultimo - 1   -- sábado -> viernes
           when 7 then ultimo - 2   -- domingo -> viernes
           else        ultimo
         end
  from (
    select (pg_catalog.date_trunc('month', p_dia::timestamp)
            + interval '1 month - 1 day')::date as ultimo
  ) t
$$;

comment on function public.ultimo_dia_habil_del_mes(date) is
  'FIN-03. Último día del mes que no cae en fin de semana. SIN festivos, por decisión
   explícita del ROADMAP. `immutable` porque no lee el reloj ni ninguna tabla: depende
   solo del argumento. Verificado contra generate_series en los 36 meses de 2026-2028.';
```

**Consulta de verificación que el plan debería incluir como aserción:**

```sql
with meses as (select generate_series('2026-01-01'::date,'2028-12-01'::date,'1 month')::date m)
select count(*) as total,
       count(*) filter (
         where public.ultimo_dia_habil_del_mes(m) =
               (select max(d)::date
                  from generate_series(m, m + interval '1 month - 1 day', '1 day') d
                 where extract(isodow from d) < 6)
       ) as coinciden
from meses;
-- Medido: 36 | 36
```

### Ejemplo 2: Consumo de Storage, con la guarda que no puede faltar

```sql
-- Fuente: storage.get_size_by_bucket() leída de pg_proc en la base local.
-- Su cuerpo es: sum((metadata->>'size')::bigint) group by bucket_id, y es INVOKER.
create or replace function public.consumo_storage()
returns table (
  bytes_bucket        bigint,   -- lo que hay en el bucket, según storage.objects
  bytes_contabilizados bigint,  -- lo que NUESTRA contabilidad dice que hay
  bytes_cupo          bigint,
  porcentaje          numeric,
  umbral_pct          int,
  supera_umbral       boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_cupo   bigint;
  v_umbral int;
begin
  -- PRIMERA operación, sin excepción. `postgres` tiene rolbypassrls = t (medido),
  -- así que sin esta línea esta función le da el consumo total a cualquier aseador.
  -- Medido: devolvía 415 llamada por un aseador.
  if not (select private.is_admin()) then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  select (value #>> '{}')::bigint into v_cupo
    from public.app_settings where key = 'storage_quota_bytes';
  select (value #>> '{}')::int into v_umbral
    from public.app_settings where key = 'storage_alert_threshold_pct';

  return query
  select
    coalesce(b.total, 0)::bigint,
    coalesce(c.total, 0)::bigint,
    v_cupo,
    round(100.0 * coalesce(b.total, 0) / nullif(v_cupo, 0), 1),
    v_umbral,
    (100.0 * coalesce(b.total, 0) / nullif(v_cupo, 0)) > v_umbral
  from (select sum((o.metadata->>'size')::bigint) total
          from storage.objects o where o.bucket_id = 'evidencia') b
  cross join (select sum(p.bytes)::bigint total
                from public.cleaning_photos p where p.deleted_at is null) c;
end;
$fn$;

revoke all     on function public.consumo_storage() from public, anon;
grant  execute on function public.consumo_storage() to authenticated;
```

**Por qué devuelve las dos cifras:** `bytes_bucket` es lo que Supabase factura;
`bytes_contabilizados` es lo que nuestro schema cree que existe. La diferencia son
huérfanos, y ese número es exactamente el criterio 3 de la Fase 9 (*"sin dejar objetos
huérfanos facturando, verificable comparando el bucket contra la tabla"*). Sale gratis
aquí.

**`storage_quota_bytes` es una clave NUEVA de `app_settings`.** No sembrarlo como constante
en el código: la Fase 8 obliga a migrar a plan pago (Vercel Hobby prohíbe uso comercial), y
el cupo cambia. `1073741824` para el plan Free. [CITED: supabase.com/pricing, 2026-09-12]

### Ejemplo 3: El trigger que la Fase 9 no puede romper por olvido

```sql
create or replace function public.tg_bloquear_borrado_retenido()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.legal_hold then
    raise exception 'aseo_con_retencion_legal'
      using errcode = 'P0001',
            detail  = format('cleaning_id=%s', old.id),
            -- El español va en el HINT y NO en el message: los RPC de este repo
            -- levantan P0001 con un TOKEN de máquina en el message, y
            -- mapDbError() lee el hint. Hallazgo de la Fase 4, afecta a las
            -- siete RPC existentes.
            hint    = 'Este aseo tiene retención legal activa y no se puede borrar. Quita la retención primero, con su motivo.';
  end if;
  return old;
end;
$$;

create trigger cleanings_bloquear_borrado_retenido
  before delete on public.cleanings
  for each row execute function public.tg_bloquear_borrado_retenido();

comment on trigger cleanings_bloquear_borrado_retenido on public.cleanings is
  'RET-03, y es el guardián de la Fase 9. La purga de 6 meses va a escribir un
   `delete from cleanings where scheduled_date < ...` y quien la escriba tiene que
   acordarse de `and not legal_hold`. Si se le olvida, esto revienta ruidosamente
   en vez de destruir evidencia en disputa en silencio. NO QUITAR: la aserción
   correspondiente de 11_financiero.test.sql lo mide.';
```

### Ejemplo 4: El núcleo del cierre, idempotente

```sql
-- Esqueleto. El plan lo desarrolla; lo que importa aquí son las cuatro
-- propiedades marcadas.
create or replace function private.cerrar_mes_core(p_periodo date)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_cerrados int := 0;
begin
  with base as (
    select c.aseador_id,
           -- (1) CAST A BIGINT: sum() sobre bigint devuelve numeric, y numeric
           --     llega a supabase-js como STRING. Medido.
           coalesce(sum(c.pago_aseador), 0)::bigint as total_aseos,
           count(*)::int                            as n_aseos
      from public.cleanings c
     where c.is_managed                      -- (2) FIN-05, explícito
       and c.state = 'completada'
       and c.aseador_id   is not null
       and c.pago_aseador is not null
       and c.scheduled_date >= p_periodo
       and c.scheduled_date <  (p_periodo + interval '1 month')::date
     group by c.aseador_id
  )
  insert into public.cleaner_monthly_payouts
    (aseador_id, periodo, moneda, total_aseos, total_gastos, total,
     cleanings_count, expenses_count, closed_at, closed_by)
  select b.aseador_id, p_periodo, 'COP', b.total_aseos, 0, b.total_aseos,
         b.n_aseos, 0, pg_catalog.now(), (select auth.uid())
    from base b
  -- (3) IDEMPOTENCIA: dos corridas del job, o job + acción del admin, no pagan
  --     dos veces. Es el mismo criterio del pipeline de sync.
  on conflict (aseador_id, periodo) do nothing;

  get diagnostics v_cerrados = row_count;

  -- (4) Las LÍNEAS se escriben copiando texto, no punteros. Ver Pattern 1.
  --     Solo para las cabeceras recién creadas: si `do nothing` no insertó,
  --     ese mes ya estaba cerrado y NO se vuelve a tocar (D7-3).
  return v_cerrados;
end;
$$;
```

### Ejemplo 5: El arnés de impersonación de pgTAP que ya existe

```sql
-- Fuente: supabase/tests/10_reportes.test.sql, líneas 49-68. Copiar tal cual;
-- es el arnés que la Fase 6 ya validó.
create function pg_temp.intento_como(p_uid uuid, p_consulta text) returns text
language plpgsql as $fn$
declare v_estado text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text, true);
    execute p_consulta;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return 'sin_error';
  exception when others then
    get stacked diagnostics v_estado = returned_sqlstate;
    perform set_config('role', 'postgres', true);
    perform set_config('request.jwt.claims', '', true);
    return v_estado;
  end;
end;
$fn$;
```

---

## State of the Art

| Enfoque viejo | Enfoque actual | Cuándo cambió | Impacto en esta fase |
|---------------|----------------|---------------|----------------------|
| `revalidatePath` en Server Actions de `(admin)` | `router.refresh()` desde el cliente | Fase 4, plan 04-14 | Las actions de `/finanzas` nacen sin `revalidatePath` |
| `grant` de tabla a `authenticated` | Grant por columna, y definer para lo sensible | Fase 5, migración 16 | Las tablas de pago no reciben grant; todo por función |
| Upsert desde el cliente con `onConflict` | Función `security definer` que toma el dueño de `auth.uid()` | Fase 6, migración 22 (2026-09-12) | Ninguna escritura de esta fase va por PostgREST directo |
| `mapDbError` leyendo el `message` de P0001 | Lee el `hint` | Fase 4, plan 04-08 | Todo `raise` nuevo pone el token en `message` y el español en `hint` |
| `max-w-sm` en primitivas | Tokens `--container-<nombre-propio>` | Quicks 260907-703 y 260908-7w0 | Cualquier primitiva nueva de `/finanzas` |
| Cola offline con IndexedDB | Diferida a v2 | Fase 6, D-08 | **Ninguna pantalla puede mostrar contador de pendientes** (06-UI-SPEC §11.4, prohibición activa) |

**Obsoleto / que no aplica aquí:**

- `date-fns-tz`: absorbido por date-fns v4, y sin DST en Colombia no aporta. No instalarlo.
- Vercel Cron: el proyecto ya está en `pg_cron`. La sección de CLAUDE.md que recomienda
  Vercel Cron quedó superada por la decisión de la Fase 3, y así está registrado en STATE.md.
- `getClaims()`: no se usa para autorizar en este proyecto. Medido: tras un ban devuelve OK
  mientras `getUser()` da 403.

---

## Assumptions Log

| # | Afirmación | Sección | Riesgo si es falsa |
|---|------------|---------|---------------------|
| A1 | El cupo del plan Free es 1 GB de File Storage | Hallazgo 2, Ejemplo 2 | El umbral del 70% se calcula sobre el número equivocado. **Mitigación ya incorporada:** el cupo vive en `app_settings.storage_quota_bytes`, no en el código, así que corregirlo es un UPDATE |
| A2 | `metadata->>'size'` está poblado en todos los objetos que sube esta app | Hallazgo 3 | El consumo saldría corto. Verificado en un objeto real del bucket local (`"size": 415`), pero es una sola muestra |
| A3 | El volumen real es del orden de 500 aseos/mes sobre 34 unidades | Hallazgo 2 | El presupuesto de Storage y la urgencia del umbral cambian. No hay dato de ocupación real en el repo |
| A4 | RET-06 aplica a las cuatro clases de `cleaning_photos`, incluida `kind='gasto'` | Hallazgo 2 | Si la Fase 9 ya pensaba eximir los gastos, Q2 se cae. El schema no distingue y el requisito dice "fotos de evidencia" sin matizar |
| A5 | `supabase-js` entrega `numeric` como string | Pitfall 5 | Si lo entregara como número, el cast a `bigint` sigue siendo correcto y no cuesta nada. Riesgo asimétrico y bajo. Viene de CLAUDE.md, no se midió en esta sesión |
| A6 | El admin no borra aseos hoy por ninguna vía (solo cancela) | Pattern 3 | El `BEFORE DELETE` rompería un flujo existente. Verificado por ausencia de RPC de borrado en las migraciones 09 y 15, pero no se ejerció |
| A7 | La pantalla del aseador se cuelga del árbol `(cleaner)` ya existente y hereda su layout, `viewport-fit=cover` y escala móvil | Estructura | Si necesitara layout propio, el presupuesto de la fase crece |

---

## Open Questions

### Q1 (BLOQUEA EL SCHEMA) · Los 5 a 7 días al año que caen después del cierre

**Lo que sabemos:** el cierre es el último día hábil (ROADMAP y FIN-03, sin festivos).
Medido sobre 2026-2027: en 8 de 24 meses el mes termina en fin de semana, y quedan 5 días
huérfanos en 2026 y 7 en 2027. Un aseo del sábado 31 de enero de 2026 ocurre DESPUÉS de que
su mes cerró.

**Lo que no está claro:** qué pasa con el pago de esos aseos. Tres salidas, y las tres son
defendibles:

| Opción | Qué implica | Coste |
|--------|-------------|-------|
| (a) El periodo termina el día del cierre | "Enero" es del 1 al 30. El 31 es de febrero. El periodo deja de ser un mes calendario y la cabecera necesita `periodo_desde`/`periodo_hasta`, no solo `periodo` | Schema distinto. El aseador ve un "enero" que no es enero |
| (b) El periodo es el mes calendario y el cierre lo adelanta | Se cierra el 30 contando hasta el 31, o sea contando trabajo que aún no ocurrió | Inaceptable: paga por adelantado |
| (c) El periodo es el mes calendario y el cierre se mueve al primer día hábil del mes siguiente | El mes cierra completo y sin adivinar. Contradice la letra de FIN-03 ("al cierre del último día laboral") | Requiere que el dueño confirme que la intención era "cerrar el mes", no "cerrar ese día" |

**Recomendación, sin decidir:** la (c) es la única que cierra un mes completo sin inventar
nada, y sospecho que es lo que el requisito quería decir. Pero cambia la fecha de cierre y
eso es visible para quien cobra, así que lo decide el dueño. **Si se elige la (a), la
cabecera necesita dos columnas de fecha desde el día uno; añadirlas después de cerrar meses
reales es caro.**

### Q2 (BLOQUEA EL CRITERIO DE ÉXITO DE D7-2) · ¿Sobrevive el recibo del gasto?

**Lo que sabemos:** D7-2 exige llegar desde cada gasto a su foto. RET-06 borra las fotos a
los 30 días. `app_settings.photo_retention_days = 30`. `cleaning_photos` no distingue
política por `kind`. Las fotos de gasto son ~3% del volumen (1 por gasto, contra ~6 de
checklist por aseo).

**Lo que no está claro:** si el recibo tiene que durar lo que dura el pago (6 meses, o para
siempre) o si basta con que esté durante el mes en curso.

**Recomendación, sin decidir:** eximir `kind='gasto'` de la purga de 30 días y alinearla con
`retention_months = 6`. Cuesta poco Storage y salva el requisito. **Lo que la Fase 7 tiene
que dejar escrito pase lo que pase:** la decisión, en `.planning/STATE.md`, bajo
consecuencias para la Fase 9. Si nadie la escribe, la Fase 9 va a purgar los recibos sin
saber que estaba rompiendo D7-2.

### Q3 (MENOR, pero toca una decisión escrita) · ¿Por dónde llega la alerta del 70%?

**Lo que sabemos:** RET-07 dice "ve el consumo Y recibe alerta". `notification_type` tiene
once valores y STATE.md registra que son once por decisión del plan 03-03. Añadir el
doceavo funciona pero no se puede usar en la misma migración (medido).

**Lo que no está claro:** si "recibe alerta" significa push, o si un banner persistente en
`/finanzas` y en `/operacion` cumple.

**Recomendación, sin decidir:** banner persistente (cumple "ve" y "alerta" sin tocar el
enum) más, si el dueño lo quiere, un valor `storage_alto` en su propia migración. El banner
es lo barato y lo que se ve aunque el push falle.

### Q4 (DE ALCANCE) · ¿Se cierra la fuga de la tarifa al huésped en esta fase?

**Lo que sabemos:** las dos superficies están medidas (Hallazgo 1). La de `cleanings` no la
usa nadie y cerrarla es casi gratis. La de `properties` la usa el CRUD del admin en
`lib/data/apartamentos.ts:106`.

**Lo que no está claro:** si cerrar la segunda entra en la Fase 7 o se registra como deuda.
Las tres salidas:

| Opción | Coste | Efecto |
|--------|-------|--------|
| (a) Solo cerrar `cleanings` | bajo, sin consumidores | El aseador sigue viendo la tarifa del apartamento en su ventana -1..+7 |
| (b) Mover la lectura del aseador a una definer y quitar `properties_cleaner_select` | medio: hay que rehacer el embed `properties(...)` de `lib/data/aseo-aseador.ts` | Cierra las dos |
| (c) Partir las columnas de dinero a una tabla `property_rates` con grants solo de admin | alto: migración con datos + CRUD | Cierra las dos y además ordena el schema |

**Recomendación, sin decidir:** hacer la (a) dentro de esta fase (es gratis y FIN-02 ya nace
por función) y registrar la (b) como deuda con su medición. La (c) es trabajo de la Fase 9
o de v2.

### Q5 (MENOR) · El aseo que quedó `pendiente` al cerrar el mes

**Lo que sabemos:** D7-3 prohíbe recalcular un mes cerrado. Un aseo del día 28 que sigue
`pendiente` el día del cierre no entra, y si se completa el día 2 del mes siguiente ya no
entrará nunca en ningún mes (su `scheduled_date` es del mes cerrado).

**Lo que no está claro:** si eso es aceptable o si el aseo debe caer en el mes en que se
completó.

**Recomendación, sin decidir:** mantener la membresía por `scheduled_date` (es lo coherente
con todo el resto del sistema) y **mostrarle al admin, en la pantalla del cierre, cuántos
aseos del periodo quedaron sin computar y cuáles**. Cuesta una columna y convierte un
agujero silencioso en una lista que alguien puede resolver antes de pagar.

---

## Environment Availability

| Dependencia | Requerida por | Disponible | Versión | Fallback |
|-------------|---------------|-----------|---------|----------|
| Docker + stack Supabase local | Migraciones, pgTAP, integración | Sí | 12 contenedores, `supabase_db_vivaguest` arriba | — |
| PostgreSQL | Todo | Sí | 17.6 | — |
| `pg_cron` | FIN-03 | Sí | 1.6.4, con `$` soportado y `cron.timezone = GMT` | Job diario ya es el patrón; no hace falta |
| `pg_net` | Nada de esta fase | Sí | 0.20.4 | — |
| `storage.get_size_by_bucket()` | RET-07 | Sí | presente, `security invoker` | `sum(cleaning_photos.bytes)`, menos preciso |
| Supabase CLI | Migraciones, `gen types`, `test db` | Sí | 2.116.0 (hay 2.117.0; **no actualizar en esta fase**, el repo pinea la 2.116.0) | — |
| `psql` en el host | Inspección | **No** | — | `docker exec -i supabase_db_vivaguest psql -U postgres -d postgres` (así se midió todo este documento) |
| `timeout` (coreutils) en el host | scripts | **No** (macOS) | — | Usar `gtimeout` o prescindir |
| Node + npm | Build y tests | Sí | según `package.json` | — |
| Playwright | E2E | Sí | 1.62.1 | **Correr con `PLAYWRIGHT_PORT` en puerto libre** (§Pitfall 9) |
| Proyecto Supabase hosted | Nada de esta fase | No verificado | — | Todo se valida en local; el push a hosted es de otra fase |

**Dependencias ausentes que bloqueen:** ninguna.

**Dependencias ausentes con fallback:** `psql` y `timeout` en el host. Ambas tienen
sustituto inmediato y ya se usó el sustituto durante esta investigación.

---

## Validation Architecture

### Test Framework

| Propiedad | Valor |
|-----------|-------|
| Dominio puro | `vitest` 4.1.11, config `vitest.config.ts` |
| Integración (Postgres real + JWT reales) | `vitest` con `vitest.integration.config.ts` |
| Base de datos (grants, RLS, triggers) | pgTAP vía `supabase test db --local` |
| E2E | `@playwright/test` 1.62.1 |
| Comando rápido | `npm run test:unit` |
| Comando de base | `npm run db:test` |
| Suite completa | `npm run test:unit && npm run test:integration && npm run db:test && npm run test:e2e && npm run ci:arch && npm run lint && npx tsc --noEmit && npm run build` |

Línea base actual, para que el planner pueda medir regresión: pgTAP `Files=11, Tests=269`;
`test:unit` 55 archivos / 1005 tests; `test:integration` 19 archivos / 169 tests; `test:e2e`
107 en Chromium. Todo en verde en `main`.

### Phase Requirements → Test Map

| Req | Comportamiento | Tipo | Comando automatizado | ¿Existe el archivo? |
|-----|----------------|------|----------------------|----------------------|
| FIN-01 (regresión) | Editar la tarifa del apartamento no mueve la del aseo terminal | pgTAP | `npm run db:test` (`01_invariantes.test.sql` aserción 3) | Sí, ya pasa |
| FIN-02 | `rentabilidad_aseos()` da margen correcto y excluye informativos | pgTAP | `npm run db:test` | ❌ Wave 0: `11_financiero.test.sql` |
| FIN-02 | Un aseador que llama `rentabilidad_aseos()` recibe 42501 | pgTAP | `npm run db:test` | ❌ Wave 0 |
| FIN-02 | Un aseador NO puede leer `cleanings.tarifa_huesped` por PostgREST | pgTAP | `npm run db:test` | ❌ Wave 0. **Hoy fallaría: es el Hallazgo 1** |
| FIN-03 | `ultimo_dia_habil_del_mes` coincide con `generate_series` en 36 meses | pgTAP | `npm run db:test` | ❌ Wave 0 |
| FIN-03 | El gemelo TS coincide con el SQL en los mismos 36 meses | integración | `npm run test:integration` | ❌ Wave 0: `lib/domain/mes.integration.test.ts` |
| FIN-03 | `cerrar_mes_si_toca()` no hace nada en un día que no es el de cierre | integración | `npm run test:integration` | ❌ Wave 0 |
| FIN-03 | Dos corridas del cierre no duplican el pago | pgTAP | `npm run db:test` | ❌ Wave 0 |
| FIN-04 | **Borrar a mano un aseo del mes cerrado deja el pago y su desglose intactos** | pgTAP | `npm run db:test` | ❌ Wave 0. **Es el criterio 3 del ROADMAP, literal** |
| FIN-04 | Borrar el gasto deja la línea del gasto con su concepto y su monto | pgTAP | `npm run db:test` | ❌ Wave 0 |
| FIN-04 | Editar la tarifa del apartamento tras cerrar no mueve el pago (D7-3) | integración | `npm run test:integration` | ❌ Wave 0 |
| FIN-05 | Un aseo `is_managed = false` no aparece en ningún total ni en ningún conteo | pgTAP | `npm run db:test` | ❌ Wave 0 |
| RET-03 | `set_legal_hold` sin motivo falla (CHECK `cl_legal_hold_reason`) | pgTAP | `npm run db:test` | ❌ Wave 0 |
| RET-03 | `delete from cleanings` sobre un aseo retenido levanta P0001 | pgTAP | `npm run db:test` | ❌ Wave 0. **El guardián de la Fase 9** |
| RET-03 | `delete from cleaning_photos` de un aseo retenido levanta P0001 | pgTAP | `npm run db:test` | ❌ Wave 0 |
| RET-03 | Un aseador no puede llamar `set_legal_hold` | pgTAP | `npm run db:test` | ❌ Wave 0 |
| RET-07 | `consumo_storage()` llamada por un aseador levanta 42501 | pgTAP | `npm run db:test` | ❌ Wave 0. **Sin esto el Pitfall 7 pasa a producción** |
| RET-07 | El porcentaje cruza el umbral cuando debe | unit | `npm run test:unit` | ❌ Wave 0 |
| D7-4.3 | `mis_pagos_cerrados()` no devuelve el mes en curso | pgTAP | `npm run db:test` | ❌ Wave 0 |
| D7-4.3 | Un aseador no ve el pago de otro aseador | pgTAP | `npm run db:test` | ❌ Wave 0 |
| D7-4.3 | Ninguna función del aseador devuelve `tarifa_huesped` | pgTAP | `npm run db:test` | ❌ Wave 0. Se prueba sobre el `returns table`, no sobre la fila |
| D7-1 | `/finanzas` existe, está en `TopNav` y `/operacion` no cambió | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ❌ Wave 0 |
| D7-2 | El desglose muestra aseos y gastos por separado, y el recibo se abre | E2E | `PLAYWRIGHT_PORT=… npm run test:e2e` | ❌ Wave 0 |
| D7-4.2 | Marcar pagado queda con fecha y autor, y no se puede marcar dos veces | E2E + pgTAP | ambos | ❌ Wave 0 |

### Sampling Rate

- **Por commit de tarea:** `npm run test:unit`
- **Por merge de wave:** `npm run db:test && npm run test:integration`
- **Puerta de fase:** las doce puertas de la Fase 6, con `PLAYWRIGHT_PORT` en puerto libre,
  antes de `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `supabase/tests/11_financiero.test.sql` — todo el bloque de FIN-02 a FIN-05, RET-03,
      RET-07 y D7-4.3. **En rojo antes del schema**, igual que hizo el plan 01-02
- [ ] `lib/domain/mes.test.ts` — el gemelo TypeScript del calendario
- [ ] `lib/domain/mes.integration.test.ts` — la paridad SQL/TS sobre 36 meses
- [ ] `lib/domain/finanzas.test.ts` — agregación de presentación del desglose
- [ ] `e2e/finanzas.spec.ts` — las dos pantallas nuevas
- [ ] Extender `lib/test/aseos.ts` con un sembrador de mes completo (aseos completados +
      gastos con foto), que es lo que van a necesitar la integración y el E2E
- [ ] **Señuelos declarados por adelantado**, siguiendo el patrón del 04-07: quitar
      `where is_managed` del núcleo (debe poner rojo a FIN-05), quitar el `on conflict do
      nothing` (debe poner rojo a la idempotencia), quitar el `private.is_admin()` de
      `consumo_storage()` (debe poner rojo al Pitfall 7), y cambiar el `on delete set null`
      por `cascade` en las líneas (debe poner rojo al criterio 3)

**Nota de presupuesto:** `npm run db:reset` cuesta 54 s medidos. Esta fase toca migraciones
y va a correr señuelos, así que un plan de señuelos completo son ~8 resets = ~7 minutos solo
de reset. Presupuestarlo.

---

## Security Domain

### Applicable ASVS Categories

| Categoría ASVS | Aplica | Control estándar en este proyecto |
|----------------|--------|-----------------------------------|
| V2 Autenticación | Sí | `getUser()` contra el servidor de Auth, nunca `getClaims()` ni `getSession()`. Medido: tras un ban, `getClaims()` sigue devolviendo OK |
| V3 Gestión de sesión | Sí | `@supabase/ssr` con `setAll(cookiesToSet, headers)` de **dos** argumentos. Omitir `headers` deja que el CDN cachee respuestas con cookie de sesión |
| V4 Control de acceso | **Sí, es el centro de la fase** | RLS + `private.is_admin()` / `private.is_active_cleaner()`, que leen `profiles` en vivo. El rol de aplicación sale de `app_metadata.role`, nunca de `user_metadata` |
| V5 Validación de entrada | Sí | Zod en las Server Actions; CHECK en la base. El `p_periodo` del RPC de cierre tiene que normalizarse a primer día de mes en la base, no confiar en el cliente |
| V6 Criptografía | No | Esta fase no cifra nada |
| V7 Manejo de errores | Sí | Token de máquina en `message`, español en `hint`. `mapDbError` lee el `hint` |
| V8 Protección de datos | **Sí** | Las cifras de huésped son el dato a proteger frente al aseador. Ver Hallazgo 1 |
| V12 Archivos | Sí | Bucket privado, signed URL de vida corta desde RSC que ya verificó acceso |

### Known Threat Patterns

| Patrón | STRIDE | Mitigación estándar |
|--------|--------|---------------------|
| El aseador lee el margen del apartamento | Information Disclosure | Ninguna cifra de huésped en las tablas de pago; lecturas por definer con `private.is_admin()` |
| El aseador lee el pago de un compañero | Information Disclosure | `aseador_id = auth.uid()` **dentro** de la función, no en el `where` de la pantalla |
| El aseador se marca su propio pago como pagado | Tampering | Sin `grant update` sobre las tablas de pago; RPC con guarda de admin |
| Un aseador desactivado sigue leyendo su pago | Elevation of Privilege | `private.is_active_cleaner()` consulta `profiles.is_active` en vivo. Es el patrón que hace efectiva la desactivación inmediata (PLAT-04) |
| Definer que salta la RLS de `storage` | Information Disclosure | Guarda de rol como **primera** operación. Medido: sin ella, un aseador obtiene el total |
| La Fase 9 borra un aseo con retención legal | Destruction / Repudiation | Tres triggers `BEFORE DELETE` / `BEFORE UPDATE`, más aserciones pgTAP que fallan si se quitan |
| Un cierre doble paga dos veces | Tampering | `unique (aseador_id, periodo)` + `on conflict do nothing` |
| Un Server Action invocado directamente por HTTP | Elevation of Privilege | `exigirAdmin()` como primera operación de cada action. Un Server Action es un endpoint público; que el botón viva en `(admin)` no autoriza nada |
| Fuga de sesión por caché del CDN | Information Disclosure | `setAll` de dos argumentos; ya está en `lib/supabase/middleware.ts` |

---

## Project Constraints (from CLAUDE.md)

Directivas accionables que el planner debe verificar en cada tarea:

1. **Montos en pesos colombianos enteros (`bigint`).** Prohibido `numeric`, `decimal`,
   `float`, `double precision`. `numeric` llega como string desde supabase-js y `float`
   redondea mal.
2. **`fecha_aseo` y todo día de negocio son `date`, nunca `timestamptz`.** Un
   `timestamptz` convierte un día calendario en un instante y en UTC-5 se desplaza un día
   al renderizar. `periodo` del snapshot es `date`.
3. **UTC-5 fijo, sin DST.** `public.today_bog()` y `hoyBog()` son los únicos helpers de
   fecha permitidos. `current_date` está PROHIBIDO en migraciones, seeds, índices, policies
   y jobs, y lo verifica `scripts/ci/check-service-role.sh` §4.
4. **Schema + migraciones + RLS antes que UI.** `database.types.ts` y la forma de los RPC
   son el contrato de toda la UI.
5. **La autorización nunca se apoya en claims del JWT.** `getUser()` en middleware y
   layouts; el rol de aplicación desde `app_metadata.role`.
6. **El código de acceso vive en tabla aparte con RPC y auditoría.** No se toca en esta fase.
7. **Runtime `nodejs`, nunca `edge`**, en cualquier ruta que toque Node APIs.
8. **Testing por capa:** vitest para el dominio, pgTAP para RLS y grants, Playwright para
   la PWA. **Ampliado por la migración 22:** toda escritura nueva se prueba en pgTAP.
9. **`is distinct from` y nunca `<>`** al comparar contra `'cancelada'`.
10. **No usar `@supabase/auth-helpers-nextjs`, `next-pwa`, `date-fns-tz`, `shadcn-ui`,
    `ical-expander`, `rrule`.** Ninguno aplica a esta fase, pero la lista está viva.
11. **Free tier de Vercel y Supabase durante todo el desarrollo.** Es lo que hace de RET-07
    un requisito real y no decorativo.
12. **Flujo GSD obligatorio:** no hacer ediciones directas fuera de un comando GSD.

---

## Sources

### Primary (HIGH confidence)

- **La base de datos local de este repo**, interrogada con
  `docker exec -i supabase_db_vivaguest psql`. De aquí salen, medidos y no deducidos: los
  grants por columna de `cleanings` y `expenses`; las policies de `cleanings`, `properties`,
  `expenses`, `app_settings` y `storage.objects`; la fuga de `tarifa_huesped` al aseador; el
  cuerpo y el `prosecdef` de `storage.get_size_by_bucket()`; `rolbypassrls` de `postgres`;
  el rechazo de `alter type ... add value` usado en la misma transacción; la aceptación de
  `$` por `cron.schedule`; `cron.timezone = GMT`; el tipo `numeric` de `sum(bigint)`; la
  coincidencia de la forma cerrada del último día hábil con `generate_series` en 36 meses;
  y las 7 claves sembradas de `app_settings`.
- **Las migraciones 01 a 22 del repo**, leídas directamente. En particular
  `20260831212658_04_operacion.sql` (schema de `cleanings`, `expenses`, `cleaning_photos`,
  `access_code_reads`), `20260831215108_05_...` (`tg_cleanings_snapshot`),
  `20260831215109_06_...` (`storage_deletion_queue`), `20260831221405_08_...` (las seis
  funciones de `private`), `20260831224030_10_storage.sql` (bucket y policies),
  `20260902235500_14_sync_jobs.sql` (el patrón de `cron.schedule` y la poda),
  `20260911120000_16_push_avisos.sql` (grants por columna y el argumento de por qué),
  `20260912110000_19_rpc_reportes.sql` (`report_expense`) y
  `20260912140000_22_registro_push_definer.sql` (el bug del upsert contra grant por columna).
- **`supabase/tests/10_reportes.test.sql`** — el arnés `pg_temp.intento_como()`.
- **`lib/domain/dates.ts`, `lib/domain/money.ts`, `lib/auth/guards.ts`,
  `lib/data/aseo-aseador.ts`, `lib/fotos/politica.ts`** — los helpers que esta fase
  reutiliza y el presupuesto de 200 KB por foto.
- **`.planning/phases/07-financiero/07-CONTEXT.md`** — las cuatro decisiones del dueño.
- **`.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`,
  `.planning/BACKLOG.md`, `./CLAUDE.md`.**
- **Documentación de `pg_cron`** (repo citusdata/pg_cron) — sintaxis cron soportada,
  extensión `$`, intervalos en segundos, ausencia de `L`/`W`.

### Secondary (MEDIUM confidence)

- **supabase.com/pricing**, consultada 2026-09-12 — plan Free: 1 GB de File Storage, 500 MB
  de base, 5 GB de egress, 50 MB por archivo, pausa a la semana de inactividad.

### Tertiary (LOW confidence)

- Management API de Supabase para uso de proyecto: descartada sin verificar a fondo, porque
  la alternativa dentro de Postgres es mejor por seguridad y por coste. Si alguna vez hace
  falta, hay que confirmar si exige PAT de cuenta.

---

## Metadata

**Confidence breakdown:**

- **Stack estándar: HIGH.** No entra ninguna dependencia nueva. Todo lo listado se leyó de
  `package.json` o de `pg_extension`.
- **Arquitectura del snapshot: HIGH.** El patrón (ausencia de cascada + texto copiado) tiene
  precedente explícito y comentado en el propio repo (`access_code_reads`).
- **Calendario del cierre: HIGH en el cálculo, BLOQUEADO en la política.** La función está
  verificada contra 36 meses; qué hacer con los 5 a 7 días huérfanos es Q1 y no es técnico.
- **Retención legal: HIGH.** Las columnas y el CHECK existen; los triggers son mecánica
  estándar de Postgres.
- **Storage: HIGH en el mecanismo, MEDIUM en el número.** La función existe y su
  comportamiento bajo RLS está medido en los tres escenarios; el cupo de 1 GB viene de la
  página de precios y por eso vive en `app_settings`, no en el código.
- **Reglas de acceso del aseador: HIGH.** Las dos fugas están medidas con impersonación
  real, y el patrón de la solución es el que la migración 16 ya escribió y argumentó.
- **Pitfalls: HIGH.** Todos salen de defectos medidos en este repo (planes 04-08, 04-14,
  migración 22, quicks 260907-703 y 260908-7w0) o de mediciones de esta sesión.

**Research date:** 2026-09-12
**Valid until:** 2026-10-12 para el stack. **Las mediciones contra la base caducan con la
próxima migración**: si entra una migración 23 escrita por otra vía, revalidar los grants y
las policies antes de planificar.
