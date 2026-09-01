#!/usr/bin/env bash
#
# Test de arquitectura de VivaGuest. No prueba comportamiento: prueba invariantes
# estructurales que ninguna suite de tests puede cubrir.
#
#   1. La clave de servicio solo se nombra en lib/supabase/admin.ts
#   2. Ninguna clave de servicio lleva prefijo NEXT_PUBLIC_
#   3. lib/supabase/admin.ts declara import 'server-only'
#   4. Ninguna migracion ni seed usa current_date / now()::date
#
# Se corre en el job `arquitectura` de .github/workflows/db.yml y en local con
# `npm run ci:arch`.
set -euo pipefail

ADMIN_FILE="lib/supabase/admin.ts"
SRC_DIRS=()
for d in app lib components; do
  [ -d "$d" ] && SRC_DIRS+=("$d")
done

fallo=0

err() {
  echo "::error::$1"
  echo "$1" >&2
  fallo=1
}

# ── 1. La clave de servicio, solo en admin.ts ────────────────────────────────────
# `import 'server-only'` rompe el build si el modulo se importa desde un Client
# Component, pero NO impide importarlo desde un Server Component o una Server Action.
# Este grep es la defensa real.
if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  HITS=$(grep -rn --include='*.ts' --include='*.tsx' \
    -E 'SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|sb_secret_' \
    "${SRC_DIRS[@]}" 2>/dev/null | grep -v "^${ADMIN_FILE}:" || true)
  if [ -n "$HITS" ]; then
    err "clave de servicio fuera de ${ADMIN_FILE}:"
    echo "$HITS" >&2
  fi

  # ── 2. Ninguna clave de servicio con prefijo NEXT_PUBLIC_ ─────────────────────
  # Next.js inlinea cualquier NEXT_PUBLIC_* en el bundle del cliente.
  PUB=$(grep -rn --include='*.ts' --include='*.tsx' \
    -E 'NEXT_PUBLIC_[A-Z0-9_]*(SECRET|SERVICE)' \
    "${SRC_DIRS[@]}" 2>/dev/null || true)
  if [ -n "$PUB" ]; then
    err "clave de servicio con prefijo NEXT_PUBLIC_:"
    echo "$PUB" >&2
  fi
fi

# ── 3. admin.ts declara server-only ─────────────────────────────────────────────
if [ ! -f "$ADMIN_FILE" ]; then
  err "no existe ${ADMIN_FILE}"
elif ! grep -q "import 'server-only'" "$ADMIN_FILE"; then
  err "${ADMIN_FILE} sin import 'server-only'"
fi

# ── 4. Prohibido current_date en migraciones y seeds ────────────────────────────
# La sesion corre en UTC: despues de las 19:00 de Bogota `current_date` ya es manana,
# asi que con `current_date` en una policy el aseador pierde el codigo de acceso a las
# 7pm. Regla transversal: usar `public.today_bog()`.
# Se filtran las lineas de comentario SQL (`-- …`) antes de contar, o el propio
# comentario explicativo de una migracion dispararia el fallo.
SQL_DIRS=()
for d in supabase/migrations supabase/seeds; do
  [ -d "$d" ] && SQL_DIRS+=("$d")
done

if [ ${#SQL_DIRS[@]} -gt 0 ]; then
  FECHAS=$(grep -rn --include='*.sql' -iE '\bcurrent_date\b|\bnow\(\)::date\b' \
    "${SQL_DIRS[@]}" 2>/dev/null | grep -vE '^[^:]+:[0-9]+:[[:space:]]*--' || true)
  if [ -n "$FECHAS" ]; then
    err "usa public.today_bog(), no current_date:"
    echo "$FECHAS" >&2
  fi
fi

if [ "$fallo" -ne 0 ]; then
  exit 1
fi

echo "check-service-role: OK"
