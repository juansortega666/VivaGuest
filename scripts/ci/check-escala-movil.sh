#!/usr/bin/env bash
#
# Tercer test de arquitectura de VivaGuest. Complementa a check-service-role.sh
# (capa de servidor) y a check-max-w-tallas.sh (anchos), y vigila una sola
# invariante:
#
#   Ninguna clase tipografica SIN el sufijo `-movil` en codigo bajo
#   app/(cleaner)/.
#
# ── POR QUE, Y LA RAZON ES DEL MOTOR, NO UNA PREFERENCIA ─────────────────────
#
# 05-UI-SPEC.md §3.1 declara una SUPERSESION: dentro de app/(cleaner)/ los
# cuatro roles tipograficos valen 28 / 20 / 16 / 14 px en vez de los 24 / 16 /
# 14 / 12 de (admin). La primera de sus tres razones es la que obliga:
#
#   iOS Safari HACE ZOOM AUTOMATICO al enfocar un campo cuyo font-size es menor
#   a 16 px. Es comportamiento del motor de WebKit. Con el rol de texto corriente
#   a 14 px, cualquier campo del arbol del aseador dispara un zoom que descoloca
#   el layout y que el usuario tiene que deshacer a mano.
#
# La Fase 5 todavia no tiene campos en ese arbol. LA FASE 6 SI: el checklist por
# cuarto y los reportes de dano, gasto y faltante. Para entonces la escala tiene
# que llevar meses puesta, y este script es lo que impide que se destense en el
# camino. Una clase sin sufijo bajo ese arbol no es una diferencia de gusto: es
# un defecto que solo se ve en un iPhone real, con un campo enfocado.
#
# ── POR QUE HACE FALTA UN GUARDARRAIL Y NO BASTA CON LOS TESTS ───────────────
#
# Exactamente por lo mismo que check-max-w-tallas.sh: ninguna de las cuatro
# suites lo puede ver. El codigo fuente se lee bien, `tsc` pasa verde, los
# unitarios pasan verdes y el nombre de la clase es el que cualquiera escribiria.
# Lo unico que cambia es el tamano que Tailwind emite, y eso se ve abriendo el
# navegador.
#
# ── DOS REGLAS DE EDICION ────────────────────────────────────────────────────
#
# 1. AQUI SI se pueden nombrar las clases sin sufijo, igual que en
#    check-max-w-tallas.sh y al contrario que en check-service-role.sh: este
#    archivo es .sh, vive en scripts/ci/ y su propio grep mira SOLO *.ts y *.tsx
#    bajo app/(cleaner)/. No entra en ningun caso.
#
# 2. El filtro de comentarios distingue MENCIONAR de USAR. Las cabeceras de
#    app/(cleaner)/ explican la supersesion, y explicarla exige nombrar la escala
#    vieja. Lo que es el fallo es escribirla dentro de una cadena de clases.
#
# ── ADVISORY EN EL CONTRATO, BLOQUEANTE AQUI ─────────────────────────────────
#
# 05-UI-SPEC.md §3.1 lo dejo como "recomendado, advisory". Se encadena en
# ci:arch como bloqueante desde el plan 05-10 Y NO ANTES: hasta este plan los dos
# archivos del arbol usaban la escala vieja, asi que el script habria roto el
# build desde el primer dia.
#
# Se corre con `npm run ci:arch`, encadenado detras de los otros dos scripts.
set -euo pipefail

DIR='app/(cleaner)'

if [ ! -d "$DIR" ]; then
  echo "check-escala-movil: OK (no existe $DIR)"
  exit 0
fi

# El mismo filtro de lineas de comentario que usan los otros dos scripts, sobre
# la salida `archivo:linea:contenido` de `grep -rn`.
COMENTARIO_RE='^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)'

# Los cuatro roles de 02-UI-SPEC.md §3. El limite de la derecha es lo que hace
# que la version CON sufijo no sea un hallazgo: tras el nombre del rol viene un
# guion, que esta dentro de la clase negada.
ROLES='display|heading|body|micro'
PATRON="(^|[^A-Za-z0-9_-])text-(${ROLES})([^A-Za-z0-9_-]|$)"

HITS=$(grep -rnE --include='*.ts' --include='*.tsx' \
  "$PATRON" "$DIR" 2>/dev/null \
  | grep -vE "$COMENTARIO_RE" || true)

if [ -n "$HITS" ]; then
  MSG="clase tipografica sin el sufijo movil bajo $DIR. 05-UI-SPEC.md §3.1 declara una supersesion para ese arbol: los cuatro roles valen 28/20/16/14 px y las clases llevan sufijo. La razon que obliga es del motor: iOS Safari hace ZOOM AUTOMATICO al enfocar un campo con font-size menor a 16 px, y la Fase 6 es la que trae los campos (checklist y reportes). Arreglo: anadir el sufijo a la clase. Contexto en la cabecera de app/(cleaner)/layout.tsx:"
  echo "::error::$MSG"
  echo "$MSG" >&2
  echo "$HITS" >&2
  exit 1
fi

echo "check-escala-movil: OK"
