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
 * CERRADO EL 2026-09-07 (quick 260907-703): las primitivas que NO llevan
 * override en su sitio de uso —`alert-dialog` y `tooltip`— dejaron de usar
 * `max-w-xs` / `sm:max-w-sm` y pasaron a los tokens con nombre propio
 * `--container-alerta`, `--container-alerta-ancha` y `--container-tooltip`.
 * Un nombre propio no colisiona con la escala de espaciado.
 *
 * CERRADO EL 2026-09-08 (quick 260908-7w0): las otras dos, `dialog` y `sheet`.
 * Su clase base seguía emitiendo 8px y el defecto estaba tapado, no cerrado: se
 * veían bien solo porque los cuatro `DialogContent` y el único `SheetContent` de
 * la app repiten un override en su sitio de uso. El `Sheet` con `side="left"`,
 * que nadie pisa, medía 8px de verdad. Ahora la base son `--container-dialogo-base`
 * y `--container-sheet-base`, los 384px del registry con nombre propio. Los
 * overrides de 480px siguen siendo necesarios y no cambian.
 *
 * Con eso las CUATRO primitivas afectadas quedan cerradas y no queda deuda de
 * este defecto en el código. Lo que sigue vivo es la colisión de fondo entre la
 * escala `--spacing-*` con nombres de talla y el namespace `--container-*`: no se
 * arregla, se vigila. `scripts/ci/check-max-w-tallas.sh`, encadenado en
 * `npm run ci:arch`, falla si vuelve a aparecer una clase de ancho con nombre de
 * talla en `app/`, `components/` o `lib/`. Cuando la Fase 5 instale primitivas
 * nuevas con el CLI, ese check es lo que las atrapa: cada una nace con
 * `max-w-xs` / `sm:max-w-sm` en su clase base.
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
        "max-w-captura",
        "max-w-codigo",
        "max-w-col-acargo",
        "max-w-col-responsable-apto",
        "max-w-dialogo",
        "max-w-dialogo-base",
        "max-w-foto",
        "max-w-formulario",
        "max-w-login",
        "max-w-motivo",
        "max-w-sheet",
        "max-w-sheet-base",
        "max-w-tooltip",
        "max-w-vacio",
      ],

      /**
       * Los ocho roles tipograficos del proyecto: los cuatro de `02-UI-SPEC` §3
       * y los cuatro moviles de `05-UI-SPEC` §3.1.
       *
       * ── ES EL MISMO DEFECTO QUE EL DE ARRIBA, Y AQUI ES PEOR ──────────────
       *
       * `tailwind-merge` no reconoce estos nombres como tamanos de fuente, asi
       * que por defecto los clasifica en el grupo de COLOR DE TEXTO, que es el
       * comodin de `text-*`. Medido con la libreria instalada, las dos mitades:
       *
       *     cn('text-sm', 'text-body-movil')
       *       -> "text-sm text-body-movil"   las DOS sobreviven, y gana el
       *          orden del CSS: el override del sitio de uso no desplaza al
       *          `text-sm` que traen `Alert`, `Button` y compania.
       *
       *     cn('text-micro-movil', 'text-muted-foreground')
       *       -> "text-muted-foreground"     el TAMANO DESAPARECE, porque los
       *          dos caen en el grupo de color y el ultimo gana.
       *
       * La segunda es la grave: la clase se escribe, el codigo se lee bien, y el
       * tamano simplemente no llega al DOM. Con el grupo declarado aqui, la
       * primera resuelve a `text-body-movil` y la segunda conserva las dos.
       *
       * Igual que con los anchos: cuando aparezca un rol nuevo hay que anadirlo
       * AQUI TAMBIEN.
       */
      "font-size": [
        "text-display",
        "text-heading",
        "text-body",
        "text-micro",
        "text-display-movil",
        "text-heading-movil",
        "text-body-movil",
        "text-micro-movil",
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
