'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

/**
 * El armazón de las cinco zonas del panel de lectura (08-UI-SPEC.md §6.1).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTO EXISTE COMO UN SOLO ARCHIVO Y NO COMO CUATRO COPIAS.
 *
 * §12 pone el listón: `SheetDesglosePago` y `SheetConfirmar` llevan meses en
 * producción, y **los cuatro paneles nuevos tienen que verse hermanos de esos
 * dos, no primos**. La razón concreta está en la cabecera de
 * `components/ui/sheet.tsx`: documenta TRES desviaciones del contrato de
 * tipografía y espaciado, y **solo una está arreglada dentro de la primitiva**.
 * Las otras dos hay que arreglarlas en el sitio de uso, en los cuatro, sin
 * excepción. Repartirlas por cuatro archivos es garantizar que el tercero se
 * olvide, y el síntoma del olvido más caro es silencioso (ver abajo).
 *
 * ── LOS TRES OVERRIDES OBLIGATORIOS (§12.1), Y VIVEN AQUÍ ────────────────
 *
 *   1. El ancho de 480px, con la CADENA DE VARIANTES COMPLETA. La base son
 *      384px. Ver el comentario del `SheetContent`, que es donde se pierde el
 *      dinero.
 *   2. Peso 600 en el título. La primitiva trae peso 500, que NO EXISTE en el
 *      sistema de este proyecto: §3 declara exactamente dos pesos, 400 y 600.
 *   3. Separación de 8px en la cabecera. La primitiva trae 2px, por debajo del
 *      mínimo declarado de la escala, que son 4.
 *
 * ── LA RUTA AL CERRAR LLEGA COMO PROP, Y NO ES UN CAPRICHO ───────────────
 *
 * `SheetDesglosePago` cierra contra una constante y funciona, pero funciona
 * porque su anfitrión no tiene más parámetros que el suyo. Los otros tres sí
 * los tienen: `/operacion` ya lee `alertas` y `/finanzas` ya lee `rango` y
 * `ancla`. Una constante se los borra, y cerrar el panel resetearía el filtro
 * del anfitrión sin que el admin entienda por qué (§5.1 punto 3).
 *
 * Por eso la dirección llega **ya compuesta desde el servidor**: se toman los
 * parámetros vivos de la pantalla, se quita el del panel y se dejan los demás.
 * El enlace que ABRE hace lo inverso, y esa mitad no es teoría: está medida en
 * `08-02-MEDICION.md` §4.3, donde una consulta literal `?aseo={id}` borró el
 * `?alertas=atendidas` AL ABRIR, antes de que el cierre tuviera nada que
 * conservar.
 *
 * ── `scroll: false`, EN LOS DOS SENTIDOS ─────────────────────────────────
 *
 * Al cerrar lo pone este componente, literal, como manda D8-8. **Al abrir lo
 * tiene que poner el `<Link>` del anfitrión**, y eso NO lo puede garantizar
 * este archivo: es una prop del enlace, no del panel. La regla de §5.2 no tiene
 * excepciones y son seis enlaces.
 *
 * ── LA CLAVE POR IDENTIFICADOR VA SOBRE ESTE COMPONENTE ──────────────────
 *
 * `<PanelLectura key={id} …>` desde la página, para que abrir un segundo panel
 * no reutilice el árbol del primero (§12.2). **NUNCA sobre el `<Suspense>` ni
 * sobre nada que envuelva a la tabla del anfitrión**, y la razón completa, con
 * su medición, está escrita en la cabecera de `EsqueletoDePanel.tsx`.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE, Y ESTÁ PROHIBIDO POR NOMBRE (§12.4) ─────
 *
 * No desactiva la trampa de foco, no desactiva la tecla de escape y no
 * reimplementa ninguna de las dos con un vigilante propio del teclado. Las dos
 * las da Base UI, los dos paneles que ya están en producción lo demuestran, y
 * una segunda copia del comportamiento es una segunda cosa que mantener.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function PanelLectura({
  titulo,
  apoyo,
  rutaAlCerrar,
  pie,
  children,
}: {
  /**
   * El nombre de lo seleccionado. Es el nombre accesible del diálogo (§13.1).
   *
   * ── POR QUÉ NO ES UNA CADENA, Y QUÉ SIGUE SIENDO OBLIGATORIO ───────────
   *
   * El panel de aseo pide, en §10.2, que su título SEA UN ENLACE al apartamento,
   * y es el único enlace que sale de la sección a propósito: el admin lo eligió,
   * no le pasó por tocar una fila. Un título de tipo cadena lo hace imposible.
   *
   * **Lo que no cambia:** el nombre accesible del diálogo se computa del
   * CONTENIDO de este título, así que lo que se pase tiene que llevar el nombre
   * de lo seleccionado como texto de verdad. Un icono suelto, una imagen sin
   * texto alternativo o un nodo vacío dejarían el diálogo sin nombre, que es un
   * control sin nombre y está prohibido por §13.
   */
  titulo: ReactNode;
  /**
   * La ÚNICA línea de apoyo, nunca dos (§6.1). Sin ella la cabecera mide 61px
   * en vez de 78 y el cuerpo gana ese espacio.
   */
  apoyo?: ReactNode;
  /**
   * La dirección **ya compuesta** a la que se reemplaza al cerrar: la del
   * anfitrión con sus parámetros vivos y sin el del panel.
   *
   * Es un prop y no una constante a propósito. Una constante borra `alertas`
   * en `/operacion` y `rango` más `ancla` en `/finanzas`. Ver la cabecera.
   */
  rutaAlCerrar: string;
  /**
   * El contenido del pie. Sin él, el panel no tiene zona de pie y el cuerpo
   * disponible pasa de 506px a 590px a 700 de viewport (§6.4).
   */
  pie?: ReactNode;
  /** El cuerpo: grupos de filas, o el esqueleto mientras llegan. */
  children: ReactNode;
}) {
  const router = useRouter();

  const cuerpoRef = useRef<HTMLDivElement>(null);
  const [desborda, setDesborda] = useState(false);

  /**
   * §13.1: el cuerpo scrollable es enfocable **solo cuando de verdad desborda**.
   * Con contenido que cabe, un contenedor enfocable es una parada muerta en el
   * orden de tabulación; sin él, cuando desborda, un usuario de teclado no
   * puede recorrerlo.
   *
   * Hacen falta los DOS observadores y no es redundancia: redimensionar la
   * ventana cambia la caja del contenedor sin mutar su contenido, y resolver el
   * `<Suspense>` sustituye el contenido sin cambiar la caja del contenedor.
   */
  useEffect(() => {
    const nodo = cuerpoRef.current;
    if (nodo === null) return;

    const medir = () => {
      setDesborda(nodo.scrollHeight > nodo.clientHeight);
    };

    medir();

    const porTamano = new ResizeObserver(medir);
    porTamano.observe(nodo);

    const porContenido = new MutationObserver(medir);
    porContenido.observe(nodo, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      porTamano.disconnect();
      porContenido.disconnect();
    };
  }, []);

  return (
    <Sheet
      open
      onOpenChange={(abierto) => {
        // D8-8, literal. `scroll: false` porque la lista de detrás no se ha
        // movido y devolverla al tope perdería el sitio del admin, que es la
        // mitad del criterio 1 del ROADMAP.
        if (!abierto) router.replace(rutaAlCerrar, { scroll: false });
      }}
    >
      {/*
        OVERRIDE 1 DE 3. El ancho repite la cadena de variantes EXACTA que
        documenta la cabecera de `components/ui/sheet.tsx`, y no se puede
        abreviar: `tailwind-merge` solo considera en conflicto dos clases del
        mismo grupo con la MISMA cadena de variantes. Un `sm:max-w-sheet` suelto
        NO desplaza a la clase base de la primitiva, las dos sobreviven, y el
        ancho pasa a depender de un orden del CSS que no está garantizado.

        El síntoma es silencioso: el código se lee perfectamente bien, `tsc`
        pasa en verde, y el panel mide 384 en vez de 480.
      */}
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-sheet">
        {/* OVERRIDE 3 DE 3: la primitiva trae 2px de separación. */}
        <SheetHeader className="gap-sm">
          {/* OVERRIDE 2 DE 3: la primitiva trae peso 500. */}
          <SheetTitle className="text-heading font-semibold">{titulo}</SheetTitle>

          {apoyo === undefined ? null : (
            <SheetDescription className="text-micro text-muted-foreground">
              {/*
                El espacio inicial es deliberado y se copia de
                `SheetDesglosePago` con su razón, o el siguiente que lo vea lo
                borra por limpieza. El título y esta línea son hermanos, así que
                en cualquier lectura PLANA del panel —copiar y pegar, un volcado
                de texto, una aserción sobre el contenido— los dos se concatenan
                sin separador y sale `Bogotá 3Bogotá · Activa`. Un espacio al
                principio de un bloque no se pinta, así que no cuesta nada
                visualmente.
              */}
              {' '}
              {apoyo}
            </SheetDescription>
          )}
        </SheetHeader>

        {/*
          El scroll vive AQUÍ DENTRO y no en el panel entero (§6.1). Es la
          decisión que ya tomó `SheetDesglosePago` y su razón vale igual: así el
          nombre de lo que estás mirando se queda fijo mientras recorres su
          contenido. Un panel que scrollea entero pierde su propio título.
        */}
        <div
          ref={cuerpoRef}
          tabIndex={desborda ? 0 : undefined}
          className="flex flex-col gap-lg overflow-y-auto px-lg pb-lg"
        >
          {children}
        </div>

        {/*
          El pie solo existe cuando hay acción: lo tienen dos de los cuatro
          paneles. Sin él se ahorran los 68px del pie y 16 más de la separación
          que la primitiva pone entre sus hijos (§6.4).
        */}
        {pie === undefined ? null : <SheetFooter>{pie}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
