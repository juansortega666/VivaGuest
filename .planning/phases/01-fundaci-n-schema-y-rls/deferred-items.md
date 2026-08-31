# Fase 1 — Hallazgos fuera de alcance

Cosas detectadas durante la ejecución que **no** pertenecen al plan que las encontró. No se corrigieron.

## 1. `project_id` de `supabase/config.toml` es el nombre del worktree

- **Encontrado en:** plan 01-02, al levantar la base local.
- **Qué pasa:** `supabase/config.toml` tiene `project_id = "agent-a77b9e39ec453293b"`, que es el nombre del directorio del worktree donde corrió el plan 01-01. `supabase init` lo deriva del nombre del directorio, igual que `create-next-app` derivó `"name": "vg-stage"` en `package.json` (que sí se corrigió, desviación 5 del 01-01).
- **Impacto:** cosmético hoy. `project_id` nombra los contenedores Docker locales (`supabase_db_agent-a77b9e39ec453293b`) y es el default de `supabase link`. No afecta a ninguna aserción.
- **Sugerencia:** cambiarlo a `vivaguest` en el plan que toque `config.toml` de nuevo, o antes del primer `supabase link` con el proyecto dev.

## 2. `anon` tiene `TRUNCATE` sobre `storage.objects`

- **Encontrado en:** plan 01-02, al medir los grants de `storage.objects`.
- **Qué pasa:** el ACL por defecto es `anon=arwdDxtm/supabase_storage_admin`, es decir `anon` conserva `TRUNCATE`, y `TRUNCATE` ignora la RLS por completo. Es la misma clase de agujero que el guardarraíl 4 del `02_guardarrailes.test.sql` cierra para `public`, pero ese guardarraíl filtra `table_schema='public'` y no ve el esquema `storage`.
- **Impacto:** explotabilidad práctica baja (PostgREST no expone el esquema `storage` ni emite `TRUNCATE`), pero la clase entera se elimina revocándolo.
- **Bloqueante:** el revoke **no es ejecutable desde una migración** por la misma razón documentada en `01-VALIDATION.md` §Trampas nº 4: el grantor es `supabase_storage_admin` y `postgres` no puede revocar ni hacer `set role` a él. Requiere decisión: o se acepta como riesgo residual documentado, o se ejecuta desde el dashboard con un rol con privilegios suficientes.
- **Sugerencia:** evaluarlo en el plan que escriba las policies de Storage, y si no es ejecutable, registrarlo como riesgo aceptado en el `<threat_model>` de la fase.

## 3. Los privilegios por defecto de `public` siguen abiertos para las tablas que aún no existen

- **Encontrado en:** plan 01-03, al aplicar la migración 03 y correr el guardarraíl 4.
- **Qué pasa:** con la CLI 2.116.0 (la pineada en `package.json`) toda tabla nueva creada por `postgres` en `public` nace con `arwdDxtm` — SELECT, INSERT, UPDATE, DELETE, TRUNCATE — para `anon`, `authenticated` y `service_role`. Lo instala la clave `auto_expose_new_tables` de `config.toml`, que no tiene valor explícito y cuyo fallback es `true` (el default de la nube). Medido:
  ```
  pg_default_acl: postgres | public | r |
    {postgres=arwdDxtm/postgres, anon=arwdDxtm/postgres,
     authenticated=arwdDxtm/postgres, service_role=arwdDxtm/postgres}
  ```
  `01-RESEARCH.md` §3.1 midió lo contrario (`REFERENCES, TRIGGER, TRUNCATE`) con la CLI 2.115.0. La medición envejeció.
- **Qué SÍ se corrigió aquí:** la migración 03 revoca `all` para `anon` y `authenticated` sobre sus 8 tablas. Guardarraíles 4 y 8 en verde.
- **Qué queda pendiente y NO es de este plan:**
  1. Las tablas de las migraciones 04, 05 y 06 nacerán con el mismo agujero.
  2. Hay que revocar los **default privileges**, o toda tabla de las Fases 2 a 9 lo reintroduce. La migración propuesta en `01-RESEARCH.md` §3.1 solo contempla `anon`; falta `authenticated`, que con INSERT/UPDATE/DELETE sobre todo rompe la decisión "el aseador no escribe directo".
  3. El ACL `f` (funciones) es `anon=X`, así que `anon` recibe EXECUTE sobre toda función nueva de `public`. Para `today_bog()` da igual; para los RPC de los planes 05-07 **no**. `01-RESEARCH.md` §3.3 ya lo advierte.
- **Dueño:** plan 01-07 (migración de grants).
- **Lo que NO hay que hacer:** poner `auto_expose_new_tables = false` en `config.toml`. Arregla local y deja la nube expuesta, que es peor: los guardarraíles pasarían en verde sobre una base que no se parece a producción.

## 4. `calendar_feeds.url`: el plan 01-03 y la suite pgTAP se contradicen

- **Encontrado en:** plan 01-03, leyendo el contrato antes de escribir DDL.
- **Qué pasa:** la corrección 2 del `01-03-PLAN.md` declara como consecuencia que **`calendar_feeds` NO lleva columna `url`**, porque la URL iCal vive en `property_secrets.ical_url`. Pero `supabase/tests/01_invariantes.test.sql` inserta el fixture del feed así:
  ```sql
  insert into public.calendar_feeds (id, property_id, provider, url) values (...);
  ```
  Sin la columna `url`, ese `INSERT` falla con `42703` en la sentencia 6 del archivo y **aborta las 11 aserciones**, incluidas las de FIN-01 y ASEO-07 que no tienen nada que ver con calendarios.
- **Impacto:** bloqueante para el plan 04 en el momento en que escriba `calendar_feeds`. No es opinable: son dos artefactos versionados que se contradicen.
- **Resolución sugerida:** la regla de la fase es que la suite gana, así que `calendar_feeds` lleva `url`. Si se quiere conservar el argumento de seguridad de la corrección 2 (que `calendar_feeds` no porte credenciales), la salida limpia es que `url` sea **derivada o nula** y que el worker resuelva la URL efectiva desde `property_secrets.ical_url`; pero la columna tiene que existir. Cambiar el test para quitar `url` del fixture es la otra opción, y exige justificarlo como desviación en el plan 04.
- **Dueño:** plan 01-04.

## Ejecución paralela y base local compartida (orquestador, 2026-08-31)

`supabase/config.toml` tiene un único `project_id` versionado, así que **todos los worktrees
resuelven al mismo contenedor de Supabase local**. Un `supabase db reset --local` desde un
worktree recrea la base que otro worktree está usando en vivo.

- Detectado por el ejecutor del plan 01-05, que verificó en una instancia aislada en vez de
  arriesgarse. El `project_id` quedaba además apuntando a `agent-a77b9e39ec453293b`, un worktree
  ya eliminado. Corregido a `vivaguest`.
- Las waves 5 a 8 de esta fase son de un solo plan, así que no hay colisión intra-wave.
- **Para fases futuras con waves paralelas que toquen la base:** o se serializa el acceso, o cada
  worktree necesita su propio `project_id` y bloque de puertos vía `--workdir` sobre una copia.

## Regla de planificación pendiente

Dos veces apareció el mismo patrón: un comentario que cita el nombre literal de la cosa prohibida
hace fallar el propio grep que la prohíbe (`service_role` en 01-01, `gen_random_uuid` en 01-05).
Vale la pena volverlo regla explícita al planear: los guardarraíles por grep obligan a que los
comentarios no citen el token vetado.
