'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

/**
 * El sub-nav de la seccion: `Resumen` y `Pagos` (07-UI-SPEC §5.2).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SON DOS RUTAS REALES, NO DOS PESTANAS DE ESTADO DE CLIENTE.
 *
 * La primitiva `tabs` guarda el estado en el cliente, y eso tiene tres
 * consecuencias practicas que descalifican la opcion (§1.2): la sub-pestana no
 * seria enlazable, no sobreviviria a un refresco, y no se podria compartir por
 * chat. Y hay una cuarta, especifica de esta seccion: el filtro de periodo ya
 * vive en la direccion de la pagina, asi que con pestanas de cliente la mitad
 * del estado de la pantalla estaria en la URL y la otra mitad no.
 *
 * Es ademas el patron que `TopNav` ya usa, un nivel mas arriba.
 *
 * ── POR QUE EL ACTIVO NO VA EN EL COLOR DE ACENTO (§4.3) ──────────────────
 *
 * El subrayado del link activo de la barra superior SI usa el acento, y esta en
 * la lista cerrada de nueve usos. Este, no: dos subrayados del mismo color
 * apilados con 40px de separacion se leen como dos navegaciones del mismo
 * rango, y entonces no se sabe cual manda. La jerarquia la da la POSICION, asi
 * que aqui el subrayado va en el color de texto principal.
 *
 * ── EL ACTIVO EN LAS HIJAS DEL RESUMEN ────────────────────────────────────
 *
 * `/finanzas/aseos` y `/finanzas/aseadoras/[id]` marcan `Resumen`: son sus
 * hijas, se llega a ellas desde ahi y se vuelve ahi. Por eso la activacion NO se
 * puede escribir como `ruta.startsWith(href)` para los dos enlaces: `/finanzas`
 * es prefijo de `/finanzas/pagos`, asi que las dos quedarian activas a la vez.
 * Cada enlace declara su propio predicado.
 * ════════════════════════════════════════════════════════════════════════════
 */
const ENLACES: { href: string; etiqueta: string; activo: (ruta: string) => boolean }[] = [
  {
    href: '/finanzas',
    etiqueta: 'Resumen',
    // Todo lo que cuelga de la seccion MENOS Pagos. Escrito como exclusion y no
    // como lista de hijas para que una ruta nueva del Resumen no nazca sin
    // marcar nada.
    activo: (ruta) => ruta === '/finanzas' || !ruta.startsWith('/finanzas/pagos'),
  },
  {
    href: '/finanzas/pagos',
    etiqueta: 'Pagos',
    activo: (ruta) => ruta.startsWith('/finanzas/pagos'),
  },
];

export function SubNavFinanzas() {
  const ruta = usePathname();

  return (
    // La linea base de 1px va en el <nav> y a todo el ancho, para que el
    // subrayado de 2px del activo se apoye en algo en vez de flotar.
    <nav aria-label="Secciones de finanzas" className="border-b border-border">
      <ul className="flex items-stretch gap-xs">
        {ENLACES.map(({ href, etiqueta, activo }) => {
          const esActivo = activo(ruta);

          return (
            <li key={href} className="flex items-stretch">
              <Link
                href={href}
                aria-current={esActivo ? 'page' : undefined}
                className={cn(
                  // El `-mb-px` monta el borde del link sobre la linea base del
                  // <nav>, en vez de dejar dos lineas de 1px y 2px apiladas.
                  'transicion -mb-px flex h-fila items-center border-b-2 px-md text-body',
                  esActivo
                    ? 'border-foreground font-semibold text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {etiqueta}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
