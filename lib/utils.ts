import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `cn()` — clsx + tailwind-merge, con los `max-w-*` DEL PROYECTO declarados.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ `extendTailwindMerge` Y NO `twMerge` A SECAS. ESTÁ MEDIDO, Y LO QUE
 * ARREGLA ES QUE EL `Sheet` DE CONFIRMACIÓN MEDÍA 8 PÍXELES DE ANCHO.
 *
 * `tailwind-merge` solo puede resolver un conflicto entre dos clases si RECONOCE
 * a las dos como del mismo grupo. Los anchos con nombre de este proyecto
 * (`max-w-sheet`, `max-w-dialogo`, `max-w-login`, …) salen del namespace
 * `--container-*` de Tailwind v4 y son invisibles para la configuración por
 * defecto de la librería: no los clasifica en el grupo `max-w`, así que NO
 * desplazan al `max-w-sm` que traen las primitivas generadas por shadcn.
 *
 * Las dos clases sobreviven al `cn()` y gana la que el CSS emita después, que no
 * está garantizado. Y en este proyecto la que ganaba era la equivocada.
 *
 * ── LA SEGUNDA MITAD DEL PROBLEMA, QUE ES LA QUE LO VUELVE GRAVE ────────────
 *
 * `02-UI-SPEC.md` §2 declara la escala de espaciado con nombres de talla:
 * `--spacing-xs: 4px`, `--spacing-sm: 8px`, `--spacing-md: 12px`,
 * `--spacing-lg: 16px`. Y `max-w-<nombre>` en Tailwind v4.3 resuelve el nombre
 * contra `--spacing-*` ANTES que contra `--container-*`. Medido en el CSS
 * generado del build de producción:
 *
 *     max-w-sm{max-width:var(--spacing-sm)}      ->  8px, no 384px
 *
 * Es decir: toda primitiva de shadcn que use `max-w-xs`, `max-w-sm`, `max-w-md`
 * o `max-w-lg` se renderiza con un ancho de 4 a 16 píxeles. Declarar
 * `--container-sm` a mano NO lo corrige (probado): el espaciado gana igual.
 *
 * Este archivo cierra la mitad que se puede cerrar sin tocar el sistema de
 * tokens: hace que el override en el sitio de uso —el patrón que la cabecera de
 * `components/ui/sheet.tsx` documenta desde el plan 04-10— de verdad DESPLACE al
 * `max-w-sm` de la primitiva. Con esto el `Sheet` mide sus 480px de D-09 y los
 * `Dialog` con `sm:max-w-dialogo` los suyos.
 *
 * LO QUE FALTABA, CERRADO EL 2026-09-07 (quick 260907-703): las primitivas que
 * NO llevan override en su sitio de uso —`alert-dialog` y `tooltip`— ya no usan
 * `max-w-xs` / `sm:max-w-sm`, sino los tokens con nombre propio
 * `--container-alerta`, `--container-alerta-ancha` y `--container-tooltip`.
 * Un nombre propio no colisiona con la escala de espaciado.
 * ════════════════════════════════════════════════════════════════════════════
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      // Los anchos con nombre de `app/globals.css`. Cuando aparezca uno nuevo
      // hay que añadirlo AQUÍ TAMBIÉN, o volverá el fallo silencioso: la clase
      // se aplica, la de la primitiva también, y el ancho depende del orden del
      // CSS.
      "max-w": [
        "max-w-admin",
        "max-w-alerta",
        "max-w-alerta-ancha",
        "max-w-aseador",
        "max-w-col-acargo",
        "max-w-col-responsable-apto",
        "max-w-dialogo",
        "max-w-formulario",
        "max-w-login",
        "max-w-sheet",
        "max-w-tooltip",
        "max-w-vacio",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
