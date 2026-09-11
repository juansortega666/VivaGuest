import type { MetadataRoute } from "next";

/**
 * EL MANIFEST DE LA PWA. SE SIRVE EN `/manifest.webmanifest`.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * `display: 'standalone'` NO ES UNA PREFERENCIA ESTÉTICA: ES LO QUE SOSTIENE LA
 * FASE ENTERA.
 *
 * MDN BCD, sobre push en iOS: *"The app's manifest must have a non-default
 * display value."* Con el valor por defecto —`browser`— la API `Notification`
 * NO EXISTE en iOS, y entonces no hay suscripción, no hay aviso y no hay nada
 * que probar. El criterio 1 del ROADMAP no se podría ni intentar.
 *
 * O sea: si alguien alguna vez "simplifica" este archivo quitando `display`,
 * no rompe la instalación. Rompe las notificaciones, en un solo sistema
 * operativo, y sin ningún error visible.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Los valores salen de `05-UI-SPEC.md` §14.1 y cada uno no obvio lleva su razón.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VivaGuest",
    // 9 caracteres. El corte de la pantalla de inicio de iOS ronda los 12: cabe
    // sin elipsis.
    short_name: "VivaGuest",
    // Es lo que se lee en el prompt de instalación de Android. NO promete
    // checklist ni fotos: eso es Fase 6, y una promesa que la app todavía no
    // cumple se paga con una aseadora buscando una pantalla que no existe.
    description: "Tus aseos asignados, en el teléfono.",
    // La identidad estable de la aplicación. Sin `id`, cambiar `start_url` en
    // el futuro haría que Android considere la app como OTRA y ofrezca
    // instalarla de nuevo, dejando dos iconos del mismo producto.
    id: "/",
    // La raíz rutea por rol: un admin también puede instalarla.
    start_url: "/",
    scope: "/",
    display: "standalone",
    // `--background`. Es lo que pinta la pantalla de arranque.
    background_color: "#FFFFFF",
    // Tiñe la barra de estado en Android. Blanco y no negro porque la app es
    // solo clara y su barra superior es `--background`: un `#000000` daría una
    // banda negra que no existe en ninguna pantalla del producto.
    theme_color: "#FFFFFF",
    lang: "es-CO",
    dir: "ltr",
    categories: ["productivity", "business"],
    // `orientation` NO SE DECLARA, y es deliberado: bloquear a `portrait` no
    // aporta nada y le quita a la aseadora la opción de apoyar el teléfono de
    // lado mientras trabaja.
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        // Android recorta este icono con la forma que elija el fabricante. El
        // generador mete la marca dentro del círculo central de 410 px por eso.
        purpose: "maskable",
      },
    ],
  };
}
