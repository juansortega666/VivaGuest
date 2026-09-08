# CI, desactivado a propósito

`db.yml` es el workflow de GitHub Actions de la Fase 1. Está aquí y no en
`.github/workflows/` por decisión del 2026-09-01: por ahora el repo solo usa
PRs y merges, sin CI automático.

## Por qué no vive en su ruta normal

GitHub rechaza que un token OAuth cree o modifique archivos bajo
`.github/workflows/` sin el scope `workflow`. Mover el archivo evita esa
restricción sin perder el trabajo ni obligar a rotar credenciales.

## Qué verifica

Las 8 puertas de la Fase 1, todas ejecutadas y verificadas en local:

- `supabase db lint` sin errores de schema
- `supabase db advisors --type security --fail-on error` sin hallazgos
- `supabase test db --local` con las 47 aserciones pgTAP en verde
- `npm run db:types:check` detectando drift entre migraciones y `lib/database.types.ts`
- `scripts/ci/check-service-role.sh` prohibiendo `service_role` fuera de `lib/supabase/admin.ts`
- `tsc --noEmit`
- `npm run test:unit`
- `npm run build`

Mientras el CI esté desactivado, esas puertas se corren a mano antes de mergear.

## Para activarlo

1. Token de GitHub con los scopes `repo`, `workflow` y `read:org`
2. `git mv ci/db.yml .github/workflows/db.yml`
3. Commit y push
