import { ExternalLink, X } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { buttonVariants } from '@/components/ui/button';
import type { PanelDeAseo } from '@/lib/data/panel-aseo';
import { formatFechaLargaBog, nombreDeDiaBog } from '@/lib/domain/dates';
import { cn } from '@/lib/utils';

import { EsqueletoDePanel } from '../../_components/EsqueletoDePanel';
import { CuerpoDeAseo } from './CuerpoDeAseo';
import { EstadoAseo } from './EstadoAseo';

/**
 * EL ARMAZÓN **INLINE** DEL DETALLE DE UN ASEO (plan 10-05, Task 5).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * HASTA ESTE PLAN EL DETALLE ERA UN `Sheet` QUE SE DESLIZABA ENCIMA DE LA
 * PANTALLA. AHORA ES EL CONTENIDO DE LA COLUMNA DERECHA.
 *
 * Lo pidió el dueño el 2026-09-28 con esas palabras: dos columnas, la lista del
 * día a la izquierda y **el detalle del aseo seleccionado a la derecha**. Un
 * panel que se desliza ENCIMA de una columna del 70% que ya existe es el mismo
 * contenido pintado dos veces en el mismo sitio, con una superposición de por
 * medio.
 *
 * El CUERPO no cambió: vive en `CuerpoDeAseo.tsx` y se mudó entero, con sus
 * cuatro grupos y sus cifras. Lo que cambió es esto, el armazón.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LAS TRES COSAS QUE LO SEPARAN DEL `Sheet`, Y VAN ESCRITAS ───────────
 *
 * **1. No hay trampa de foco, no hay tecla de escape y no hay superposición, y
 * ninguna de las tres se reimplementa.** Base UI daba las dos primeras y
 * `PanelLectura` §12.4 prohíbe por nombre reimplementarlas con un vigilante
 * propio del teclado. Acá no hacen falta: **esto no es un diálogo**. El
 * contenido no es modal, la lista de al lado sigue viva y operable, y atrapar el
 * foco dentro de una columna que no tapa nada dejaría al admin encerrado en
 * media pantalla. Hay una aserción E2E que cuenta CERO elementos con rol de
 * diálogo mientras el detalle está abierto: es la compuerta contra que alguien
 * devuelva el `Sheet`.
 *
 * Lo que sí lleva es **un control de cerrar**, y devuelve a la dirección sin el
 * parámetro del aseo: es el mismo `rutaAlCerrar` que la página compone en el
 * servidor con los parámetros vivos. Va como enlace y no como botón porque es
 * una navegación de verdad, con `replace` para no llenar el historial de
 * aperturas y cierres (el mismo `router.replace` que hacía `PanelLectura`) y con
 * `scroll={false}` literal de D8-8: la lista de al lado no se ha movido y
 * devolverla al tope perdería el sitio del admin.
 *
 * **2. Los tres overrides obligatorios de `PanelLectura` (§12.1) NO aplican, y
 * dos de sus razones sí.** El ancho de 480px, el peso 500 del título y los 2px
 * de separación de la cabecera son desviaciones **de la primitiva `Sheet`**, y
 * acá no hay primitiva: el ancho lo da la pista de la rejilla (840px a 1280) y
 * no hay ninguna clase base que desplazar. Pero el **peso 600 del título** y la
 * **separación mínima de la escala** son del contrato de tipografía de §3 y de
 * la escala de §2, no de la primitiva, así que se escriben acá, en el sitio de
 * uso, exactamente igual que `PanelLectura` los escribe en el suyo.
 *
 * **3. `PanelLectura.tsx` NO SE TOCA.** Lo comparten cuatro paneles de lectura
 * del admin y su cabecera explica por qué existe como un solo archivo: las tres
 * desviaciones del `Sheet` repartidas por cuatro archivos garantizan que el
 * tercero se olvide. Un quinto consumidor con un "modo inline" lo convertiría en
 * dos componentes disfrazados de uno, con una rama que apaga tres de sus cuatro
 * razones de existir. Se construye un armazón AL LADO, y el precio (que las dos
 * cabeceras se parezcan) se paga a sabiendas. Hay una compuerta de verificación
 * que compara el blob de ese archivo contra `a9d09c5`.
 *
 * ── LA CLAVE POR IDENTIFICADOR VA SOBRE ESTE COMPONENTE ─────────────────
 *
 * `<DetalleDelAseo key={id} …>` desde la página, para que abrir un segundo aseo
 * no reutilice el árbol del primero. **NUNCA sobre la barrera de suspensión y
 * NUNCA sobre nada que envuelva a la lista del día** (INSTRUCCIÓN 3 del
 * VEREDICTO de 08-02): ahí forzaría el remonte del subárbol y se llevaría por
 * delante el estado de cliente de la lista, que es la mitad del criterio 1 del
 * ROADMAP de la Fase 8.
 *
 * ── SCROLLEA POR DENTRO, IGUAL QUE `InfoDelDia` ─────────────────────────
 *
 * `min-h-0` más `overflow-y-auto`: es la otra mitad de "la página no scrollea".
 * Sin borde y sin fondo de card, por el principio de data ink: esto no es una
 * tarjeta flotando, es el contenido de la columna. Lo que lo separa de la lista
 * es el `gap-2xl` de la rejilla, que son 32px de aire.
 */
export function DetalleDelAseo({
  cabecera,
  panel,
  rutaAlCerrar,
  rutaDelApartamento,
}: {
  /**
   * Lo que la cabecera necesita ANTES de que la promesa resuelva, y que la
   * página ya tiene en la mano porque resolvió la lectura para decidir si el
   * detalle se renderiza. Así el nombre y el estado se pintan de verdad desde el
   * primer frame y el esqueleto es solo del cuerpo (§11.1).
   */
  cabecera: PanelDeAseo['cabecera'];
  /**
   * Todo el detalle, **como promesa sin resolver**. Llega así para que la
   * barrera de suspensión de abajo tenga algo que esperar.
   */
  panel: Promise<PanelDeAseo | null>;
  /**
   * La dirección del anfitrión **ya compuesta**, sin el parámetro del aseo y con
   * el resto de los parámetros vivos intactos, `?dia` el primero de todos. Se
   * compone en el servidor; ver la cabecera de `page.tsx`.
   */
  rutaAlCerrar: string;
  /** `/apartamentos?apartamento={id}`, compuesta por la página. */
  rutaDelApartamento: string;
}) {
  return (
    <section
      data-slot="detalle-aseo"
      // El nombre accesible de la región. Ya no hay diálogo que lo compute del
      // título, así que se escribe: una región sin nombre es una región que el
      // lector de pantalla no sabe anunciar.
      aria-label={`Detalle del aseo de ${cabecera.apartamento}`}
      className="flex min-h-0 flex-col gap-xl overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-md">
        {/*
          `gap-sm` son 8px, el mínimo de la escala de §2. `PanelLectura` escribe
          exactamente este valor como su override 3, y acá va por la misma razón
          de contrato y no por herencia de ninguna primitiva.
        */}
        <div className="flex min-w-0 flex-col gap-sm">
          {/*
            ── EL ÚNICO ENLACE QUE SALE DE LA SECCIÓN, Y ES DELIBERADO (§10.2) ──

            El admin lo eligió; no le pasó por tocar una tarjeta. `text-heading`
            ya trae peso 600 por token, y `font-semibold` va escrito igual porque
            §3 declara exactamente dos pesos y este sitio es donde se afirma cuál
            de los dos es.

            SIN `scroll={false}`, a diferencia de los enlaces de apertura: esto es
            una navegación de verdad a OTRA ruta, y una ruta nueva empieza arriba
            de todas formas.
          */}
          <h2 className="text-heading font-semibold text-foreground">
            <Link
              href={rutaDelApartamento}
              className="transicion rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {cabecera.apartamento}
              <ExternalLink
                className="ml-xs inline size-3.5 align-text-bottom"
                strokeWidth={2}
                aria-hidden="true"
              />
            </Link>
          </h2>

          {/*
            La ÚNICA línea de apoyo, nunca dos (§6.1). `jueves 18 de septiembre`,
            de los dos formateadores que ya existen: uno solo con día y fecha los
            junta con `", "` en es-CO, que no es el copy de §10.1.
          */}
          <p className="flex flex-wrap items-center gap-xs text-micro text-muted-foreground">
            {`${nombreDeDiaBog(cabecera.fecha)} ${formatFechaLargaBog(cabecera.fecha)}`} ·
            <EstadoAseo
              aseo={{
                is_managed: cabecera.gestionPropia,
                state: cabecera.estado,
                confirmado_at: cabecera.confirmadoAt,
              }}
            />
          </p>
        </div>

        {/*
          EL CONTROL DE CERRAR, CON LA MISMA FORMA QUE EL ASPA DEL `Sheet`.

          `buttonVariants({ variant: 'ghost', size: 'icon-sm' })` es LITERALMENTE
          lo que `components/ui/sheet.tsx` le pone a su `SheetClose`, y se
          reutiliza en vez de escribir clases a mano por dos razones: ni un color
          nuevo entra a la pantalla, y el día que el sistema cambie el aspecto de
          un botón fantasma este cambia con él.

          **Es un ENLACE y no un botón**, y esa es la diferencia de fondo con el
          `Sheet`: cerrar acá es navegar a la dirección del anfitrión sin el
          parámetro del aseo. Un botón con un manejador haría a mano lo que el
          enrutador ya hace, y de paso rompería el clic con el botón derecho.

          El nombre accesible va en un texto de solo lectura y no en un
          `aria-label`, otra vez igual que el aspa del `Sheet`: el glifo va
          oculto al lector porque ya está anunciado por el texto.
        */}
        <Link
          href={rutaAlCerrar}
          replace
          scroll={false}
          className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }))}
        >
          <X aria-hidden="true" />
          <span className="sr-only">Cerrar</span>
        </Link>
      </div>

      {/*
        LA BARRERA ES DEL DETALLE, NO DEL SEGMENTO (INSTRUCCIÓN 4 del VEREDICTO
        de 08-02), y **sin clave acá** (INSTRUCCIÓN 3).

        Consecuencia honesta, heredada del armazón viejo y que sigue siendo
        verdad: como la página resuelve la promesa para decidir si este detalle
        existe, el esqueleto NO llega a pintarse. Se queda porque es lo que
        mantiene la forma común con los otros cuatro paneles de lectura, y porque
        la alternativa (llamar a la definer una vez para validar y otra vez acá
        dentro) compraría un esqueleto que 08-02 §6.1 midió que no aparece nunca
        a cambio de duplicar una consulta de verdad.

        Las formas salen de §6.4: `EJECUCIÓN` con tres filas, `EVIDENCIA` con una
        (la tira), `REPORTES` con dos en el caso típico, y `DINERO` con tres. En
        una unidad de gestión externa el grupo de dinero no existe.
      */}
      <div className="flex flex-col gap-lg">
        <Suspense
          fallback={<EsqueletoDePanel grupos={cabecera.gestionPropia ? [3, 1, 2, 3] : [3, 1, 2]} />}
        >
          <CuerpoDeAseo panel={panel} />
        </Suspense>
      </div>
    </section>
  );
}
