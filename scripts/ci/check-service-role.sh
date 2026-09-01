#!/usr/bin/env bash
#
# Test de arquitectura de VivaGuest. No prueba comportamiento: prueba invariantes
# estructurales que ninguna suite de tests puede cubrir.
#
#   1. La clave de servicio solo se nombra en lib/supabase/admin.ts
#   2. Ninguna clave de servicio lleva prefijo NEXT_PUBLIC_
#   3. lib/supabase/admin.ts declara import 'server-only'
#   4. Ninguna migracion ni seed usa current_date / now()::date
#   5. La fabrica administrativa solo se importa desde Server Actions, app/api/ o lib/test/
#   6. Ningun archivo de UI lleva un valor de color literal fuera de globals.css
#
# Se corre en el job `arquitectura` de ci/db.yml y en local con `npm run ci:arch`.
#
# REGLA AL EDITAR ESTE ARCHIVO: ningun comentario puede citar literalmente un token
# que el propio script prohibe, o el script se atrapa a si mismo el dia que alguien
# amplie el alcance de un grep. Describe el patron, no lo escribas. Paso dos veces
# en la Fase 1.
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

# Filtro comun de lineas de comentario sobre la salida `archivo:linea:contenido`
# de `grep -rn`. Cubre los cuatro estilos que aparecen en el repo.
COMENTARIO_RE='^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*|#|--)'

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

# ── 5. Quien puede importar la fabrica administrativa ───────────────────────────
# El guardarrail 1 busca el NOMBRE de la variable de entorno, no el import. Nada
# impedia que una pagina del admin importara la fabrica que salta RLS por completo,
# y `import 'server-only'` tampoco: solo rompe si el importador es Client Component.
#
# Solo cuatro sitios pueden importarla:
#   - el propio lib/supabase/admin.ts
#   - un archivo que declare la directiva de Server Action en su primera linea de codigo
#   - cualquier route handler bajo app/api/
#   - lib/test/, y SOLO por la razon que sigue
#
# EXCEPCION lib/test/ (anadida en el plan 02-04): los tests de integracion tienen
# que sembrar y limpiar usuarios saltandose la RLS, porque un test que siembra con
# el mismo cliente con el que comprueba pasa aunque la policy este mal escrita.
# Es seguro porque ese directorio es codigo de prueba que NUNCA se compila en el
# bundle: nada bajo app/ lo importa, solo lo tocan los *.integration.test.ts, y
# `npm run build` lo confirma al no incluirlo en ningun chunk.
# La excepcion es de directorio, no de archivo, y es deliberadamente estrecha: si
# algun dia un import de la fabrica aparece en lib/ FUERA de lib/test/, este
# guardarrail lo sigue atrapando.
if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  CANDIDATOS=$(grep -rl --include='*.ts' --include='*.tsx' \
    -F '@/lib/supabase/admin' "${SRC_DIRS[@]}" 2>/dev/null || true)

  IMPORTADORES=""
  while IFS= read -r archivo; do
    if [ -z "$archivo" ]; then
      continue
    fi
    if [ "$archivo" = "$ADMIN_FILE" ]; then
      continue
    fi
    case "$archivo" in
      app/api/*) continue ;;
      lib/test/*) continue ;;
    esac
    # La referencia solo cuenta si esta en codigo. Un comentario que mencione la
    # fabrica no es una importacion.
    if ! grep -vE '^[[:space:]]*(//|/\*|\*)' "$archivo" | grep -q 'createAdminClient'; then
      continue
    fi
    # Primera linea de codigo, ignorando comentarios y lineas en blanco.
    PRIMERA=$(grep -vE '^[[:space:]]*(//|/\*|\*)|^[[:space:]]*$' "$archivo" | head -n 1 || true)
    case "$PRIMERA" in
      "'use server'"*) continue ;;
      '"use server"'*) continue ;;
    esac
    IMPORTADORES="${IMPORTADORES}  ${archivo}
"
  done <<EOF
$CANDIDATOS
EOF

  if [ -n "$IMPORTADORES" ]; then
    err "la fabrica administrativa (${ADMIN_FILE}) se importa desde un archivo que no es Server Action ni vive bajo app/api/:"
    printf '%s' "$IMPORTADORES" >&2
  fi
fi

# ── 6. Colores literales fuera de la capa de tokens ─────────────────────────────
# El swap de marca es de dos lineas en app/globals.css (UI-SPEC §4.3). Deja de serlo
# en cuanto un componente conoce un valor de color literal. Se buscan dos formas: el
# valor hexadecimal de 3 o 6 digitos, y la clase arbitraria de Tailwind que lo mete
# en bg/text/border/ring/fill/stroke.
#
# Exclusiones:
#   - app/globals.css: es el UNICO archivo autorizado a nombrar valores literales.
#   - components/ui/: lo genera el CLI de shadcn. Editarlo a mano es el modelo, pero
#     los valores que trae son del preset y se sustituyen por la capa de tokens, no
#     reescribiendo archivo por archivo.
UI_DIRS=()
for d in app components; do
  [ -d "$d" ] && UI_DIRS+=("$d")
done

if [ ${#UI_DIRS[@]} -gt 0 ]; then
  COLORES=$(grep -rnE --include='*.ts' --include='*.tsx' --include='*.css' \
    -e '#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})([^0-9a-fA-F]|$)' \
    -e '(bg|text|border|ring|fill|stroke)-\[#' \
    "${UI_DIRS[@]}" 2>/dev/null \
    | grep -vE "$COMENTARIO_RE" \
    | grep -vE '^app/globals\.css:' \
    | grep -vE '^components/ui/' || true)
  if [ -n "$COLORES" ]; then
    err "valor de color literal fuera de la capa de tokens (solo app/globals.css puede nombrarlos):"
    echo "$COLORES" >&2
  fi
fi

if [ "$fallo" -ne 0 ]; then
  exit 1
fi

echo "check-service-role: OK"
