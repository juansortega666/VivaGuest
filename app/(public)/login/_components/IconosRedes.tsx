import type { SVGProps } from 'react';

/**
 * Los dos glifos de marca del pie de `/login`, dibujados en el proyecto.
 *
 * POR QUE NO SALEN DE `lucide-react`. Medido contra el paquete instalado
 * (`lucide-react@1.39.0`) el 2026-09-18: expone 6143 exports y CERO marcas
 * comerciales. No es que falten Instagram y TikTok: esta biblioteca ya no
 * distribuye marcas, tampoco Facebook, Twitter, Youtube, Linkedin ni Github.
 * Anadir un paquete de iconos de marca por dos glifos de un pie de pagina no
 * entra: 10-UI-SPEC §1.1 y §14. Se transcriben a mano desde los recursos
 * oficiales de cada marca, y la unica comprobacion AUTOMATICA que los cubre es
 * el guardarrail 6 de `scripts/ci/check-service-role.sh`, que atrapa el valor de
 * color literal. Que el path sea el correcto y que el glifo se lea a 16px es
 * revision humana.
 *
 * POR QUE UNO ES DE TRAZO Y EL OTRO DE RELLENO, y que nadie lo "unifique" dentro
 * de seis meses: la marca de Instagram es un contorno, asi que va de trazo con
 * strokeWidth 2 para igualar el peso optico de los iconos lucide del producto.
 * El glifo de TikTok solo existe solido, asi que va de relleno. La asimetria de
 * peso entre los dos ES INEVITABLE y no es un defecto que perseguir: son dos
 * marcas ajenas, no dos iconos de un mismo set (§11.3 regla 4).
 *
 * LAS CINCO REGLAS DE §11.3, que son el contrato de estos dos archivos:
 *   1. `currentColor` o `none`. NUNCA un valor de color literal: un hexadecimal
 *      en un `.tsx` bajo `app/` rompe el guardarrail 6 y, antes que eso, rompe
 *      el swap de marca de dos lineas de `app/globals.css`.
 *   2. `viewBox="0 0 24 24"` y tamano por clase `size-4` (16px). Sin `width` ni
 *      `height` en el svg, para que el punto de uso pueda reescalarlo.
 *   3. `aria-hidden="true"` y `focusable="false"`. El nombre accesible vive en
 *      el `aria-label` del boton que los envuelve (§8.3), o el lector de
 *      pantalla lo leeria dos veces.
 *   4. Instagram de trazo, TikTok de relleno.
 *   5. No se envuelven en un componente genérico `Icono` ni se mueven a
 *      `components/ui/`: son dos glifos de un pie, no primitivas del sistema.
 *
 * El spread de props va DESPUES de los valores por defecto a proposito, para que
 * §8.3 pueda reafirmar `aria-hidden="true"` en el sitio de uso sin pelear con el
 * valor por defecto.
 */

export function IconoInstagram(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      // `strokeLinecap="round"` no es cosmetica: el punto del flash es una linea
      // de longitud cero y sin remate redondo no se dibuja nada. Es tambien la
      // metrica de los lucide del producto.
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-4"
      {...props}
    >
      <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
    </svg>
  );
}

export function IconoTikTok(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className="size-4"
      {...props}
    >
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
    </svg>
  );
}
