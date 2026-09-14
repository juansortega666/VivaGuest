import { ArrowLeft, ListFilter } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { listarAseadoresActivos } from '@/lib/data/apartamentos';
import {
  identificadorValido,
  leerRentabilidadDeAseos,
  listarApartamentosGestionados,
  normalizarFiltroDeTipo,
  totalizarDetalle,
} from '@/lib/data/finanzas-detalle';
import { hoyBog } from '@/lib/domain/dates';
import {
  etiquetaDeRango,
  rangoDePeriodo,
  type RangoDePeriodo,
} from '@/lib/domain/periodo';
import { createClient } from '@/lib/supabase/server';

import { EstadoVacio } from '../../_components/EstadoVacio';
import { FiltrosDeAseos } from '../_components/FiltrosDeAseos';
import { SubNavFinanzas } from '../_components/SubNavFinanzas';
import { TablaAseosFinanciera } from '../_components/TablaAseosFinanciera';

export const metadata: Metadata = {
  title: 'Aseos del periodo · VivaGuest',
};

/**
 * `/finanzas/aseos` — el detalle aseo por aseo (FIN-02, FIN-05, 07-UI-SPEC §7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AQUI VIVE EL CRITERIO 2 DE LA DEFINICION.
 *
 * El Resumen responde «como va el mes». Esta pantalla responde las preguntas
 * concretas: **cuanto me dejo el Apto 07 este mes, cuanto le pague a Maria en
 * septiembre.** Eso no son indicadores, es una tabla con filtros, y por eso es
 * una pagina propia con su propia direccion y no un panel del Resumen.
 *
 * ── LA PROPIEDAD QUE NO ES COSMETICA: LA CONCILIACION ────────────────────
 *
 * La fila de totales del pie tiene que cuadrar EXACTAMENTE con los indicadores
 * del Resumen del mismo periodo. Si no cuadran, el admin deja de creerle a los
 * dos numeros a la vez y vuelve al Excel, que es lo que esta fase existe para
 * reemplazar. Se sostiene en dos sitios y en ninguno mas:
 *
 *   1. **En la base:** `rentabilidad_aseos` y `resumen_financiero` usan la misma
 *      conversion de dia y el mismo filtro de gestion propia. Ahi es donde se
 *      puede medir, y ahi esta la asercion de pgTAP.
 *   2. **Aqui:** el pie SUMA LAS FILAS QUE SE PINTAN, no una segunda consulta
 *      agregada. Dos consultas distintas divergen en algun caso de borde y
 *      dejan al dueno con dos cifras y ninguna forma de saber cual vale.
 *
 * ── COMPONENTE DE SERVIDOR, Y LA AUTORIZACION NO ESTA AQUI ───────────────
 *
 * El layout del arbol de admin ya exige admin contra el servidor de
 * autenticacion, y las funciones de la base vuelven a comprobar el rol por
 * dentro. Esa es la frontera. Este archivo no anade ninguna comprobacion propia.
 *
 * Los cuatro filtros llegan de fuera y SOLO ACOTAN una lectura ya autorizada: un
 * valor manipulado devuelve una lista vacia, no un dato ajeno. Lo que si se hace
 * es normalizar los cuatro, para que un valor cualquiera no llegue a Postgres y
 * levante un error de tipo que la pantalla no sabria explicar.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Igual que en el Resumen: cualquier cosa que no sea uno de los tres cae en `mes`. */
function normalizarRango(valor: string | undefined): RangoDePeriodo {
  return valor === 'dia' || valor === 'semana' || valor === 'mes' ? valor : 'mes';
}

/** Igual que en el Resumen: se comprueba la FORMA, no solo que exista. */
function normalizarAncla(valor: string | undefined, hoy: string): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoy;
}

/** Lo que llega por la direccion, ya reducido a cadena o nada. */
function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

export default async function DetalleDeAseosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;

  // El reloj se lee UNA vez, en el servidor. Es la misma regla del Resumen: el
  // proceso corre en tiempo universal y pasadas las 19:00 de Bogotá un reloj
  // leído en el navegador ya dice mañana.
  const hoy = hoyBog();

  const rango = normalizarRango(texto(parametros.rango));
  const ancla = normalizarAncla(texto(parametros.ancla), hoy);
  const { desde, hasta } = rangoDePeriodo(rango, ancla);

  // Los dos identificadores pasan por la comprobación de forma (T-07-56). Una
  // cadena arbitraria llegaría a Postgres como argumento de tipo identificador y
  // respondería 22P02; acá simplemente significa «sin filtro».
  const apartamentoId = identificadorValido(texto(parametros.apartamento));
  const aseadorId = identificadorValido(texto(parametros.aseador));
  const tipo = normalizarFiltroDeTipo(texto(parametros.filtro));

  const supabase = await createClient();

  // Las tres lecturas van en paralelo: son independientes y encadenarlas sería
  // sumar tres latencias por nada. Si alguna falla, la capa de datos lanza y la
  // pantalla cae entera, que es lo correcto: media tabla de cifras es peor que
  // ninguna.
  const [filas, apartamentos, aseadores] = await Promise.all([
    leerRentabilidadDeAseos(supabase, { desde, hasta, apartamentoId, aseadorId, tipo }),
    listarApartamentosGestionados(supabase),
    listarAseadoresActivos(supabase),
  ]);

  const totales = totalizarDetalle(filas);
  const etiqueta = etiquetaDeRango(rango, desde, hasta);

  // El enlace de vuelta LLEVA EL PERIODO. Volver al resumen no puede cambiar el
  // rango que el admin venía mirando: sería un cambio de contexto invisible.
  const volver = `/finanzas?rango=${rango}&ancla=${ancla}`;

  // Quitar los filtros deja el PERIODO intacto y se queda en esta pantalla: lo
  // que el admin pide con ese botón es ver todo lo del rango que está mirando, no
  // volver al resumen ni saltar a otro mes.
  const sinFiltros = `/finanzas/aseos?rango=${rango}&ancla=${ancla}&filtro=todos`;

  const hayFiltro = apartamentoId !== null || aseadorId !== null || tipo !== 'todos';

  return (
    <div className="flex flex-col gap-xl">
      <div className="flex flex-col gap-md">
        {/*
          Encima del `<h1>` y a la izquierda (§5.2). El nombre accesible es el
          texto: un enlace de vuelta con solo un icono obliga a adivinar a dónde
          vuelve, y esta pantalla tiene un sitio del que se viene y uno solo.
        */}
        <Link
          href={volver}
          className="transicion flex w-fit items-center gap-xs rounded-sm text-micro text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
          Volver al resumen
        </Link>

        <div className="flex flex-wrap items-baseline justify-between gap-lg">
          <h1 className="text-display text-foreground">Aseos del periodo</h1>

          {/*
            EL PERIODO NO SE VUELVE A DECLARAR AQUI: llega heredado y se muestra
            como TEXTO. Un segundo control de periodo en la hija sería un sitio
            más donde el admin puede acabar mirando un rango distinto del que
            pidió. Para cambiarlo se vuelve al resumen, que es de donde manda.
          */}
          <span className="text-body font-semibold tabular-nums text-foreground">
            {etiqueta}
          </span>
        </div>
      </div>

      <SubNavFinanzas />

      <FiltrosDeAseos
        apartamentos={apartamentos}
        aseadores={aseadores}
        apartamentoId={apartamentoId}
        aseadorId={aseadorId}
        tipo={tipo}
      >
        {filas.length === 0 ? (
          <EstadoVacio
            icono={ListFilter}
            encabezado="Ningún aseo coincide con estos filtros."
            cuerpo="Quita algún filtro, o amplía el periodo."
            // La acción solo aparece cuando hay algo que quitar. Con el periodo
            // sin aseos y los tres filtros en su defecto, un botón de quitar
            // filtros no haría nada y sería un control muerto.
            accion={
              hayFiltro ? (
                <Button variant="outline" render={<Link href={sinFiltros} />}>
                  Quitar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TablaAseosFinanciera
            filas={filas}
            totales={totales}
            etiquetaDelPeriodo={etiqueta}
          />
        )}
      </FiltrosDeAseos>
    </div>
  );
}
