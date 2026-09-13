import { CalendarX } from 'lucide-react';
import type { Metadata } from 'next';

import { leerCostoPorAseadora, leerResumenFinanciero } from '@/lib/data/finanzas';
import { hoyBog } from '@/lib/domain/dates';
import {
  etiquetaDeRango,
  rangoDePeriodo,
  type RangoDePeriodo,
} from '@/lib/domain/periodo';
import { createClient } from '@/lib/supabase/server';

import { EstadoVacio } from '../_components/EstadoVacio';
import { BloqueAseosDelPeriodo } from './_components/BloqueAseosDelPeriodo';
import { BloqueCostoPorAseadora } from './_components/BloqueCostoPorAseadora';
import { FiltroPeriodo } from './_components/FiltroPeriodo';
import { SubNavFinanzas } from './_components/SubNavFinanzas';
import { TarjetaKPI } from './_components/TarjetaKPI';

export const metadata: Metadata = {
  title: 'Finanzas · VivaGuest',
};

/**
 * `/finanzas` — la sub-pestana Resumen (FIN-02, FIN-05, 07-UI-SPEC §6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTA PANTALLA EXISTE APARTE, Y NO DENTRO DE LA DE OPERACION.
 *
 * D7-1 da dos razones y la segunda conviene dejarla escrita: **cualquiera que
 * abra la pantalla de operacion durante una jornada veria los margenes, y eso
 * incluye pantallas compartidas.** La primera es que la pantalla operativa es
 * donde se coordinan los aseos del dia y el dinero la ensucia.
 *
 * Por eso la suite afirma las DOS mitades: que esta seccion existe, y que la
 * tabla del dia de operacion no tiene ni una cifra de pesos. Una decision sobre
 * donde NO va el dinero solo se verifica mirando lo que tenia que no cambiar.
 *
 * ── COMPONENTE DE SERVIDOR, Y LA AUTORIZACION NO ESTA AQUI ───────────────
 *
 * El layout del arbol de admin ya exige admin contra el servidor de
 * autenticacion, no contra un claim del token, y las dos funciones de la base
 * vuelven a comprobar el rol por dentro. Esa es la frontera. Este archivo no
 * anade ninguna comprobacion propia: una tercera copia de la misma regla es un
 * sitio mas donde equivocarse.
 *
 * El layout declara ademas render dinamico, asi que esta pagina nunca se cachea:
 * son datos por usuario y una respuesta cacheada se le sirve a otro.
 *
 * ── EL RANGO LLEGA DE FUERA Y SE DERIVA AQUI ─────────────────────────────
 *
 * Un rango manipulado en la direccion solo acota una lectura de admin ya
 * autorizada: devuelve una lista vacia, no un dato ajeno. Lo que si se hace es
 * normalizar, para que un valor cualquiera no llegue a la base como texto y
 * levante un error que la pantalla no sabria explicar.
 *
 * ── ESTA PANTALLA NO TIENE NINGUNA ACCION PRIMARIA ───────────────────────
 *
 * Es de lectura. Ningun relleno de acento, porque no hay nada que hacer aqui
 * mas que mirar y entrar al detalle.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Normaliza el rango que llega por la direccion.
 *
 * Cualquier cosa que no sea uno de los tres cae en `mes`, que es el defecto del
 * contrato. No se lanza: una direccion mal escrita a mano tiene que enseniar la
 * pantalla, no un error.
 */
function normalizarRango(valor: string | undefined): RangoDePeriodo {
  return valor === 'dia' || valor === 'semana' || valor === 'mes' ? valor : 'mes';
}

/**
 * Normaliza el ancla. Cualquier cosa que no sea un dia de negocio cae en hoy.
 *
 * Se comprueba la FORMA y no solo que exista: una cadena arbitraria llegaria a
 * Postgres como fecha y ahi el fallo seria un error de tipo, no una pantalla.
 */
function normalizarAncla(valor: string | undefined, hoy: string): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoy;
}

export default async function FinanzasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const parametros = await searchParams;
  const crudoRango = parametros.rango;
  const crudoAncla = parametros.ancla;

  // El reloj se lee UNA vez, en el servidor, y viaja por props hasta el filtro.
  // Dos relojes (el del proceso, en tiempo universal, y el del navegador del
  // admin) decidirían distinto si el botón `Hoy` se ve, y eso además rompe la
  // hidratación.
  const hoy = hoyBog();

  const rango = normalizarRango(typeof crudoRango === 'string' ? crudoRango : undefined);
  const ancla = normalizarAncla(
    typeof crudoAncla === 'string' ? crudoAncla : undefined,
    hoy,
  );

  const { desde, hasta } = rangoDePeriodo(rango, ancla);

  const supabase = await createClient();

  // Las dos lecturas van en paralelo: son dos funciones distintas de la base y
  // encadenarlas sería sumar dos latencias por nada. Si alguna falla, la capa de
  // datos lanza y la pantalla cae entera, que es lo correcto: media pantalla de
  // cifras es peor que ninguna.
  const [resumen, aseadoras] = await Promise.all([
    leerResumenFinanciero(supabase, { desde, hasta }),
    leerCostoPorAseadora(supabase, { desde, hasta }),
  ]);

  const etiqueta = etiquetaDeRango(rango, desde, hasta);
  const periodoSinAseos = resumen.aseos_hechos === 0;

  return (
    <div className="flex flex-col gap-xl">
      <FiltroPeriodo
        rango={rango}
        ancla={ancla}
        desde={desde}
        hasta={hasta}
        etiqueta={etiqueta}
        hoy={hoy}
        subNav={<SubNavFinanzas />}
      >
        <div className="flex flex-col gap-2xl">
          {/*
            Orden FIJO, izquierda a derecha, siempre el mismo: es una lectura de
            suma y resta (ingreso, costo, costo, resultado). Dos columnas de base
            y cuatro desde tablet apaisada, que es el mínimo soportado de esta
            sección.

            Los cuatro se pintan también con el periodo vacío: `$ 0` cobrado es un
            hecho del día, no un dato que falta. El vacío se explica abajo, que es
            donde tiene sentido.
          */}
          <div className="grid grid-cols-2 gap-lg lg:grid-cols-4">
            <TarjetaKPI etiqueta="COBRADO" valor={resumen.cobrado} />
            <TarjetaKPI etiqueta="PAGADO A ASEADORES" valor={resumen.pagado_aseadores} />
            <TarjetaKPI
              etiqueta="GASTOS REEMBOLSADOS"
              valor={resumen.gastos_reembolsados}
            />
            <TarjetaKPI
              etiqueta="GANANCIA"
              valor={resumen.ganancia}
              // El único derivado, y el único con leyenda. Cuatro leyendas serían
              // ruido: los otros tres se explican solos.
              leyenda="Cobrado menos pagos y gastos"
            />
          </div>

          {periodoSinAseos ? (
            <EstadoVacio
              icono={CalendarX}
              encabezado="No hubo aseos en este periodo."
              cuerpo="Prueba con un rango más amplio, o revisa otro mes."
            />
          ) : (
            /*
              `items-start` es deliberado: los dos bloques NO se igualan de alto.
              Igualarlos dejaría 200px de blanco dentro del bloque 2, que es el
              más corto y el más estable.

              Y ninguno tiene scroll interno: nada es fijo en esta pantalla y la
              página se desplaza entera. Si el equipo pasa de doce personas, el
              bloque 3 crece y la página crece con él. Es correcto.
            */
            <div className="grid grid-cols-1 items-start gap-2xl lg:grid-cols-2">
              <BloqueAseosDelPeriodo
                aseosHechos={resumen.aseos_hechos}
                conGastos={resumen.aseos_con_gastos}
                conDanos={resumen.aseos_con_danos}
                margenTotal={resumen.margen_total}
                gastosReembolsados={resumen.gastos_reembolsados}
                margenPromedio={resumen.margen_promedio}
                rango={rango}
                ancla={ancla}
              />

              <BloqueCostoPorAseadora
                aseadoras={aseadoras}
                rango={rango}
                ancla={ancla}
              />
            </div>
          )}
        </div>
      </FiltroPeriodo>
    </div>
  );
}
