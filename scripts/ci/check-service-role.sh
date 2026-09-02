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
#   7. Quien construye la fabrica administrativa llama antes a un guard de sesion
#   8. La tabla de secretos del apartamento solo se nombra donde se construyo la fabrica
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

# ── 7. El guard va ANTES de construir la fabrica administrativa ────────────────
# El guardarrail 5 obliga a que solo una Server Action pueda importar la fabrica.
# No dice NADA sobre si esa action comprueba quien la llama, y un Server Action es
# un endpoint HTTP publico: sin guard, cualquiera con el id de action y un payload
# opera con un cliente que salta la RLS por completo.
#
# MEDIDO en el plan 02-08: se borro `exigirAdmin()` de la action de alta de aseador,
# convirtiendola en un creador de cuentas abierto a cualquiera, y NADA lo atrapo.
# Ni el compilador, ni los 188 tests unitarios, ni los 13 de integracion, ni los 33
# de punta a punta, ni los guardarrailes 1 a 6. Este es el hueco que cierra.
#
# LA COMPROBACION ES POR FUNCION, NO POR ARCHIVO, Y ESO TAMBIEN SE MIDIO. La
# primera version de este guardarrail comparaba la primera linea con un guard
# contra la primera que construye la fabrica en TODO el archivo, y era un FALSO
# VERDE: en el archivo de actions del alta hay dos exportaciones, y el guard de la
# primera satisfacia la comprobacion mientras la segunda se quedaba sin ninguno.
# Con el guard borrado de la action que de verdad importa, el script decia OK.
#
# Por eso se recorre funcion a funcion y se exige, DENTRO de cada una, que el guard
# aparezca antes de construir la fabrica. Invertir el orden deja el cliente
# privilegiado construido antes de saber quien pregunta.
#
# Los patrones buscan la LLAMADA (con parentesis) y no el identificador a secas,
# para que la linea del `import` no cuente como si fuera una invocacion.
if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  USUARIOS=$(grep -rl --include='*.ts' --include='*.tsx' \
    -F '@/lib/supabase/admin' "${SRC_DIRS[@]}" 2>/dev/null || true)

  SIN_GUARD=""
  while IFS= read -r archivo; do
    [ -z "$archivo" ] && continue
    [ "$archivo" = "$ADMIN_FILE" ] && continue
    case "$archivo" in
      # Codigo de prueba: siembra y limpia a proposito sin sesion. Misma excepcion
      # acotada que documenta el guardarrail 5.
      lib/test/*) continue ;;
    esac

    # Solo importa el archivo que de verdad la CONSTRUYE; importarla sin llamarla
    # ya lo cubre el guardarrail 5.
    if ! grep -qE '(^|[^A-Za-z0-9_])createAdminClient[[:space:]]*\(' "$archivo"; then
      continue
    fi

    HALLAZGOS=$(awk -v archivo="$archivo" '
      function esComentario(l) { return l ~ /^[[:space:]]*(\/\/|\/\*|\*)/ }

      # Cierre de una funcion de nivel superior: la llave en la columna 1.
      dentro && /^\}/ {
        if (fabrica && !guard) {
          printf "  %s: %s() construye la fabrica administrativa sin un guard antes\n", archivo, nombre
        }
        dentro = 0
        next
      }

      dentro {
        if (esComentario($0)) next
        # El guard solo cuenta si aparece ANTES de construir la fabrica.
        if ($0 ~ /(^|[^A-Za-z0-9_])(exigirAdmin|exigirSesion)[[:space:]]*\(/ && !fabrica) guard = 1
        if ($0 ~ /(^|[^A-Za-z0-9_])createAdminClient[[:space:]]*\(/) fabrica = 1
        next
      }

      # Apertura de una funcion de nivel superior, exportada o no.
      /^(export[[:space:]]+)?(async[[:space:]]+)?function[[:space:]]+[A-Za-z_$]/ {
        dentro = 1; guard = 0; fabrica = 0
        nombre = $0
        sub(/^.*function[[:space:]]+/, "", nombre)
        sub(/[[:space:]]*[(<].*$/, "", nombre)
      }
    ' "$archivo")

    if [ -n "$HALLAZGOS" ]; then
      SIN_GUARD="${SIN_GUARD}${HALLAZGOS}
"
    fi
  done <<EOF
$USUARIOS
EOF

  if [ -n "$SIN_GUARD" ]; then
    err "una Server Action es un endpoint HTTP publico: el guard va ANTES de construir la fabrica administrativa:"
    printf '%s' "$SIN_GUARD" >&2
  fi
fi

# ── 8. La tabla de secretos, solo con la fabrica administrativa ────────────────
# `public.property_secrets` guarda dos credenciales: el codigo fisico de la
# cerradura y la URL de exportacion del calendario (un GET a esa URL revela la
# ocupacion completa del apartamento sin autenticarse). La migracion 07 NO le
# otorga ningun privilegio de tabla a `authenticated`, asi que con el JWT de un
# usuario —admin incluido— cualquier consulta devuelve 42501. La unica ruta
# posible es la fabrica administrativa.
#
# MEDIDO en el plan 02-10: se cambio `leerSecretos()` para que usara el cliente
# del usuario en vez de la fabrica, y NADA lo atrapo. Ni el compilador, ni los
# 197 tests unitarios, ni los 41 de integracion, ni los guardarrailes 1 a 7. El
# 7 no dice nada porque la funcion, sin fabrica, deja de tener nada que vigilar:
# es un falso verde por AUSENCIA.
#
# Los dos sentidos del error importan y este guardarrail cubre los dos:
#   - hacia el fallo: la seccion de secretos del formulario se queda vacia para
#     siempre y el admin no puede editar el codigo de ninguna cerradura;
#   - hacia la fuga: alguien "arregla" el 42501 anadiendo un grant en una
#     migracion, y entonces la columna pasa a depender de una sola policy en vez
#     de ser inalcanzable por construccion (T-02-49).
#
# Se comprueba POR FUNCION y no por archivo, por la misma razon medida en el
# guardarrail 7: en un archivo con varias exportaciones, la fabrica de una tapa
# la ausencia en otra. Las menciones de nivel de modulo (JSDoc de cabecera) no
# cuentan: el recorrido solo mira dentro de cuerpos de funcion.
#
# EXCEPCIONES, las mismas dos de siempre y por la misma razon acotada:
#   - lib/test/, que siembra y limpia a proposito con el cliente de servicio;
#   - los *.test.ts, donde nombrar la tabla CON el JWT del usuario es justamente
#     la asercion: `apartamento.integration.test.ts` existe para medir el 42501.
if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  TOCAN=$(grep -rl --include='*.ts' --include='*.tsx' \
    -F 'property_secrets' "${SRC_DIRS[@]}" 2>/dev/null || true)

  SIN_FABRICA=""
  while IFS= read -r archivo; do
    [ -z "$archivo" ] && continue
    case "$archivo" in
      lib/test/*) continue ;;
      *.test.ts) continue ;;
      *.test.tsx) continue ;;
    esac

    HALLAZGOS=$(awk -v archivo="$archivo" '
      function esComentario(l) { return l ~ /^[[:space:]]*(\/\/|\/\*|\*)/ }

      dentro && /^\}/ { dentro = 0; next }

      dentro {
        if (esComentario($0)) next
        if ($0 ~ /(^|[^A-Za-z0-9_])createAdminClient[[:space:]]*\(/) fabrica = 1
        if ($0 ~ /property_secrets/ && !fabrica && !reportado) {
          printf "  %s:%d: %s() nombra la tabla de secretos sin la fabrica administrativa antes\n", archivo, FNR, nombre
          reportado = 1
        }
        next
      }

      /^(export[[:space:]]+)?(async[[:space:]]+)?function[[:space:]]+[A-Za-z_$]/ {
        dentro = 1; fabrica = 0; reportado = 0
        nombre = $0
        sub(/^.*function[[:space:]]+/, "", nombre)
        sub(/[[:space:]]*[(<].*$/, "", nombre)
      }
    ' "$archivo")

    if [ -n "$HALLAZGOS" ]; then
      SIN_FABRICA="${SIN_FABRICA}${HALLAZGOS}
"
    fi
  done <<EOF
$TOCAN
EOF

  if [ -n "$SIN_FABRICA" ]; then
    err "la tabla de secretos del apartamento no tiene grant para authenticated: solo se alcanza con la fabrica administrativa:"
    printf '%s' "$SIN_FABRICA" >&2
  fi
fi

if [ "$fallo" -ne 0 ]; then
  exit 1
fi

echo "check-service-role: OK"
