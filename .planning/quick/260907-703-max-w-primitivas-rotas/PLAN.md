---
quick_id: 260907-703
slug: max-w-primitivas-rotas
date: 2026-09-07
type: quick
origin: diferido ALTA de la Fase 4
files_modified:
  - app/globals.css
  - components/ui/alert-dialog.tsx
  - components/ui/tooltip.tsx
  - .planning/phases/04-dashboard-operativo-del-admin/deferred-items.md
---

<objective>
Cerrar el diferido de prioridad ALTA de la Fase 4: `AlertDialog` y `Tooltip` se renderizan con
4 y 32 px de ancho, y el texto se desborda fuera de la caja.

Es un defecto de la Fase 2 que afecta a toda la aplicación, no solo a `/operacion`, y es lo
primero que hay que tener resuelto antes de la Fase 5, porque toda la PWA del aseador se
construye sobre las mismas primitivas.
</objective>

<causa_medida>
En Tailwind v4.3, `max-w-<nombre>` resuelve el nombre contra `--spacing-*` **antes** que contra
`--container-*`. El proyecto declara la escala de espaciado con nombres de talla
(`--spacing-xs: 4px`, `--spacing-sm: 8px`), así que toda primitiva de shadcn que use
`max-w-xs|sm|md|lg` queda con un ancho de entre 4 y 16 px.

Medido en el CSS del build de producción por el plan 04-14:

```
max-w-sm{max-width:var(--spacing-sm)}   ->   8px   (deberían ser 384px)
max-w-xs{max-width:var(--spacing-xs)}   ->   4px   (deberían ser 320px)
```

**Ya probado y DESCARTADO por el plan 04-14, no reintentar:**
- Declarar `--container-xs/sm/md/lg` a mano en `@theme` NO lo corrige: el espaciado gana igual.
- `@utility max-w-sm { … }` tampoco: Tailwind emite su declaración después de la del usuario
  dentro de la misma regla.
</causa_medida>

<decision>
Opción 3 del diferido: editar las dos primitivas, siguiendo **el patrón que el propio repo ya
usa** en `Sheet` y `Dialog` — declarar un token `--container-<nombre-propio>` y usarlo como
`max-w-<nombre-propio>`. Los tokens con nombre propio no colisionan con la escala de espaciado.

Se descarta la opción 1 (renombrar `--spacing-*`) porque toca cientos de usos en todo el repo,
y la opción 2 (override en cada sitio de uso) porque es dispersa y cada nuevo uso de
`AlertDialog` volvería a nacer roto.
</decision>

## Task 1 — Los tres tokens

En `app/globals.css`, junto a los `--container-*` que ya existen (`--container-dialogo`,
`--container-sheet`, `--container-login`), añadir:

```css
--container-alerta:        320px;
--container-alerta-ancha:  384px;
--container-tooltip:       320px;
```

Con un comentario que explique la colisión `--spacing-*` vs `--container-*` y por qué estos
tokens llevan nombre propio, para que nadie los vuelva a poner con nombre de talla.

## Task 2 — Las dos primitivas

`components/ui/alert-dialog.tsx` (~línea 55):
- `data-[size=default]:max-w-xs`    -> `data-[size=default]:max-w-alerta`
- `data-[size=sm]:max-w-xs`         -> `data-[size=sm]:max-w-alerta`
- `data-[size=default]:sm:max-w-sm` -> `data-[size=default]:sm:max-w-alerta-ancha`

`components/ui/tooltip.tsx` (~línea 53):
- `max-w-xs` -> `max-w-tooltip`

Consumidores afectados: `DialogoCerrarAseo`, `DialogoCancelarAseo`,
`DialogoDesactivarApartamento`, `DialogoDesactivarAseador`, el tooltip de la marca de frescura
y el del botón de confirmar sin responsable.

## Task 3 — Cerrar el diferido

Marcar la entrada como RESUELTA en
`.planning/phases/04-dashboard-operativo-del-admin/deferred-items.md`, con la fecha y la opción
elegida, igual que están marcadas las otras entradas resueltas del archivo.

## Verificación

| Comando | Esperado |
|---|---|
| `npm run build` | termina en cero |
| grep del CSS de producción | `max-w-alerta` resuelve a **320px**, no a 4px |
| `npm run test:unit` | 568 verdes, 31 archivos. No puede bajar |
| `npx tsc --noEmit` | sin salida |

La verificación que importa es la del CSS construido: el bug es invisible en el código fuente y
solo aparece en el `max-width` emitido.

<entorno>
El repo vive en iCloud y el I/O en frío domina el reloj: `tsc --noEmit` en frío tardó 6 min 39 s
consumiendo 6 s de CPU (1% de utilización). **No interpretar un proceso a 0% de CPU como
colgado** — mirar el tiempo de CPU acumulado con `ps -o time` antes de matar nada. Correr
`npx tsc --noEmit` una vez al empezar para dejar la caché caliente.

iCloud también genera duplicados con sufijo numérico (`routes.d 2.ts`) dentro de `.next/types/`
que rompen `tsc` con TS2300/TS2428. Son artefactos de build, `.next/` está en `.gitignore`:
apartarlos, no commitear nada sobre ellos.
</entorno>
