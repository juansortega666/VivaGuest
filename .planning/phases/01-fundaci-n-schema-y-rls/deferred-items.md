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
