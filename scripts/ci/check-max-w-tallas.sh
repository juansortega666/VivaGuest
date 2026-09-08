#!/usr/bin/env bash
#
# Test de arquitectura de la capa de ESTILOS de VivaGuest. Complementa a
# check-service-role.sh, que vigila la capa de servidor; este vigila una sola
# invariante:
#
#   Ninguna clase de ancho con nombre de talla (`max-w-sm`, `min-w-xs`, …) en
#   codigo bajo app/, components/ ni lib/.
#
# ── POR QUE HACE FALTA UN GUARDARRAIL Y NO BASTA CON LOS TESTS ────────────────
#
# Ninguna de las cuatro suites del proyecto puede ver este defecto. El codigo
# fuente se lee perfectamente bien, `tsc` pasa verde, los unitarios pasan verdes
# y el nombre de la clase es el que cualquier tutorial de Tailwind escribiria.
# Lo unico que cambia es el `max-width` que Tailwind EMITE en el CSS del build,
# y eso solo se ve abriendo el navegador o leyendo .next/static/css/*.css.
#
# La causa: Tailwind v4.3 resuelve `max-w-<nombre>` contra el namespace
# `--spacing-*` ANTES que contra `--container-*`, y 02-UI-SPEC.md §2 declara la
# escala de espaciado con nombres de talla (`--spacing-xs` = 4px,
# `--spacing-sm` = 8px, `--spacing-md` = 12px, `--spacing-lg` = 16px). Resultado
# medido en el CSS de produccion:
#
#     max-w-sm{max-width:var(--spacing-sm)}   ->   8px   (el registry queria 384px)
#     max-w-xs{max-width:var(--spacing-xs)}   ->   4px   (el registry queria 320px)
#
# Se pago dos veces: el quick 260907-703 lo encontro en `AlertDialog` (32px de
# ancho, el texto se salia) y en `Tooltip`; el quick 260908-7w0 lo cerro en
# `Dialog` y en `Sheet`, donde el lado izquierdo media 8px de verdad porque
# nadie lo pisaba. La tercera vez la trae el CLI: cada primitiva que instale la
# Fase 5 con `npx shadcn add` nace con `max-w-xs` / `sm:max-w-sm` en su clase
# base. Este script es lo que la atrapa.
#
# ── DOS REGLAS DE EDICION, Y UNA ES LA CONTRARIA A LA DEL OTRO SCRIPT ─────────
#
# 1. AQUI SI se pueden nombrar las clases prohibidas. Es lo contrario de la
#    REGLA AL EDITAR de check-service-role.sh, y no es un descuido: aquel busca
#    en *.ts y *.tsx y vive en un directorio que su propio grep no alcanza, pero
#    el riesgo de atraparse a si mismo esta ahi el dia que alguien amplie un
#    grep. Este archivo es .sh, y su grep mira SOLO *.ts y *.tsx bajo app/,
#    components/ y lib/. Un .sh en scripts/ci/ no entra en ningun caso. Explicar
#    la causa exige escribir la clase, asi que se escribe.
#
# 2. NO se anade `--include='*.css'`, y es una decision medida, no un olvido.
#    El bloque de comentario de app/globals.css que documenta este mismo defecto
#    tiene lineas de continuacion que no empiezan por `*` sino por espacios y un
#    backtick, asi que el filtro de comentarios de abajo no las descarta.
#    Incluir los .css seria un falso positivo permanente sobre el unico archivo
#    que explica la regla. Y no hace falta: en un .css la clase no se escribe,
#    se declara el token.
#
# Se corre en el job `arquitectura` de ci/db.yml y en local con `npm run ci:arch`.
set -euo pipefail

SRC_DIRS=()
for d in app components lib; do
  [ -d "$d" ] && SRC_DIRS+=("$d")
done

fallo=0

err() {
  echo "::error::$1"
  echo "$1" >&2
  fallo=1
}

# Filtro comun de lineas de comentario sobre la salida `archivo:linea:contenido`
# de `grep -rn`, el mismo que usa check-service-role.sh.
#
# La distincion que implementa: MENCIONAR la clase en prosa es legitimo y de
# hecho obligatorio, porque las cabeceras de alert-dialog.tsx, tooltip.tsx,
# sheet.tsx, dialog.tsx y lib/utils.ts documentan el defecto citando la clase
# que lo causa. USARLA dentro de una cadena de clases es el fallo. Lo unico que
# separa a las dos es que la mencion vive en una linea que empieza por marcador
# de comentario.
COMENTARIO_RE='^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)'

# Las tallas del namespace de espaciado y las de la escala de contenedores de
# Tailwind. Se prohiben todas y no solo las cuatro que hoy colisionan: la escala
# de §2 puede crecer, y una clase de ancho con nombre de talla es indistinguible
# a simple vista de una que ya colisiona.
TALLAS='xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl'

# Los limites del patron son lo que evita los falsos positivos reales del repo.
# El guion cuenta como caracter de nombre en la clase negada del final, asi que
# `max-w-sheet-base`, `max-w-alerta-ancha`, `max-w-col-acargo` y
# `max-w-screen-lg` no son hallazgos: en los tres primeros el nombre no empieza
# por una talla, y en el ultimo la talla no va pegada a `w-`.
PATRON="(^|[^A-Za-z0-9_-])(max|min)-w-(${TALLAS})([^A-Za-z0-9_-]|$)"

if [ ${#SRC_DIRS[@]} -gt 0 ]; then
  HITS=$(grep -rnE --include='*.ts' --include='*.tsx' \
    "$PATRON" "${SRC_DIRS[@]}" 2>/dev/null \
    | grep -vE "$COMENTARIO_RE" || true)

  if [ -n "$HITS" ]; then
    err "clase de ancho con nombre de talla: aqui NO mide lo que dice. Tailwind v4.3 resuelve \`max-w-<nombre>\` contra el namespace \`--spacing-*\` ANTES que contra \`--container-*\`, y 02-UI-SPEC.md §2 nombra la escala de espaciado por tallas, asi que \`max-w-sm\` emite \`max-width:var(--spacing-sm)\` = 8px, no 384px. Arreglo: declara un token \`--container-<nombre-propio>\` en app/globals.css (un nombre de talla NO sirve, el espaciado gana igual) y registra tambien \`max-w-<nombre-propio>\` en el grupo \`max-w\` de \`cn()\` en lib/utils.ts, o el override del sitio de uso no desplazara al de la primitiva. Contexto en la cabecera de lib/utils.ts:"
    echo "$HITS" >&2
  fi
fi

if [ "$fallo" -ne 0 ]; then
  exit 1
fi

echo "check-max-w-tallas: OK"
