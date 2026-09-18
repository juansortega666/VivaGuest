import { CalendarX } from 'lucide-react';
import type { Metadata } from 'next';

import { leerCostoPorAseadora, leerResumenFinanciero } from '@/lib/data/finanzas';
import { identificadorValido } from '@/lib/data/finanzas-detalle';
import { leerPanelDeAseadora } from '@/lib/data/panel-aseadora';
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
import { PanelAseadora } from './_components/PanelAseadora';
import { SubNavFinanzas } from './_components/SubNavFinanzas';
import { TarjetaKPI } from './_components/TarjetaKPI';

export const metadata: Metadata = {
  title: 'Finanzas · VivaGuest',
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA RUTA NO TIENE `loading.tsx`, Y ES DELIBERADO. MEDIDO EL 2026-09-13.
 *
 * Lo tuvo, con un esqueleto de geometria real que reproducia las cuatro cards y
 * los dos bloques. Su cabecera afirmaba que **cambiar de rango no pasaba por
 * ahi**, porque el filtro resuelve su propia espera atenuando las cifras viejas
 * con `useTransition`.
 *
 * **Esa afirmacion era falsa, y el precio no era un esqueleto de mas: era que el
 * filtro se colgaba.** En el App Router, `loading.tsx` es el fallback de Suspense
 * DEL SEGMENTO, y tambien se aplica cuando solo cambian los parametros de la
 * consulta. Con el archivo puesto, al cambiar de rango la transicion no
 * terminaba nunca: `aria-busy` se quedaba en `true` para siempre y volver a
 * pulsar no recuperaba. El filtro es el control principal de esta pantalla.
 *
 * Aislado con ocho corridas y las dos variantes del arbol: **sin el archivo,
 * 15 de 15 casos de `e2e/finanzas.spec.ts` en verde; con el, dos rojos
 * reproducibles.** Descartados con medicion: el service worker, el servidor, la
 * hidratacion, el orden entre casos, el prefetch y el reintento.
 *
 * Hallazgo lateral, util para quien depure algo parecido: `page.waitForURL` y
 * `expect(page).toHaveURL` **nunca** ven esa navegacion, ni con 20 s de espera,
 * porque su sondeo corre dentro del documento y se traba con el commit de React.
 * Desde Node la URL aparece en ~200 ms.
 *
 * **Lo que se pierde:** el esqueleto de la PRIMERA carga de esta ruta. Es un
 * coste real y acotado, y es mucho menor que un filtro que se cuelga.
 *
 * **Lo que NO se toca:** las otras dos rutas de Finanzas (`/aseos` y `/pagos`)
 * conservan su `loading.tsx` y sus casos siguen en verde. El defecto es de esta
 * pantalla, que es donde el filtro reescribe los parametros sin cambiar de ruta.
 *
 * *(Eran tres. La tercera, la ficha de una persona, se borro entera en la Fase 8
 * y su contenido vive ahora como panel sobre ESTA ruta.)*
 *
 * **El arreglo fino, si algun dia se quiere recuperar el esqueleto:** envolver
 * solo los bloques de datos en un `Suspense` propio dentro de este archivo, con
 * una `key` que NO dependa de los parametros. Queda en `deferred-items.md`.
 * ════════════════════════════════════════════════════════════════════════════
 */

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
 *
 * ── Y DESDE LA FASE 8 ES TAMBIEN EL ANFITRION DEL PANEL DE ASEADORA ──────
 *
 * `?aseadora={uuid}` abre el panel encima del Resumen, y **reemplaza la pagina
 * `/finanzas/aseadoras/[id]`, que se borro en este mismo plan**. El periodo
 * viaja en los dos sentidos: el enlace que abre lo conserva y la ruta al cerrar
 * se compone aqui con los parametros vivos dentro.
 *
 * ── LA EXISTENCIA NO SE VALIDA CONTRA LA LISTA QUE ESTA PAGINA YA LEYO ───
 *
 * Y esta es la diferencia con `/apartamentos`, que si puede. `leerCostoPorAseadora`
 * devuelve **solo las personas con aseos o gastos EN EL RANGO FILTRADO**: con el
 * filtro en dia, una aseadora que no trabajo ese dia no sale de esa lista aunque
 * exista. Resolver el identificador contra `aseadoras` haria que un enlace
 * perfectamente valido, pegado en un chat, abriera la pantalla **sin panel**.
 *
 * Por eso se valida con `leerPanelDeAseadora`, que empieza por la lectura que
 * filtra por el papel de aseador y devuelve nulo indistintamente para «no
 * existe» y «no lo puedes ver». Los cuatro puntos de §11.4 se cumplen igual: sin
 * 404, sin aviso, sin panel vacio, y **el parametro huerfano SE QUEDA** en la
 * direccion, porque limpiarlo reescribiria el enlace que alguien pego.
 *
 * ── EL PANEL SE RENDERIZA COMO HERMANO DEL FILTRO, NUNCA COMO HIJO ───────
 *
 * Es la regla dura de este anfitrion, y es de POSICION EN EL ARBOL, no de lo que
 * pinta. Todo el contenido de esta pantalla es hijo de `FiltroPeriodo`, que
 * **atenua a sus hijos y les apaga los eventos de puntero** mientras navega.
 * Dentro, cambiar de periodo con el panel abierto lo dejaria atenuado y, sin
 * eventos, **sin poder cerrarse**. El portal lo saca del DOM de todas formas,
 * pero la clase la decide la posicion en el arbol de React, no la del DOM. Y
 * §11.1 prohibe por nombre atenuar durante la apertura de un panel.
 *
 * ── Y EL EFECTO ESPEJO, DECIDIDO A PROPOSITO ─────────────────────────────
 *
 * El filtro navega conservando los parametros que no gobierna, asi que **cambiar
 * de periodo con el panel abierto lo deja abierto**. Es la lectura coherente con
 * D8-1: la seleccion no cambio, solo el periodo de la pantalla de atras. Queda
 * escrito para que el siguiente no lo lea como un defecto.
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

  // PRIMERO LA FORMA, ANTES DE TOCAR LA BASE. Una cadena arbitraria llegaria a
  // Postgres como argumento de tipo identificador y volveria como `22P02`, o sea
  // un error de sintaxis que la pantalla no sabria explicar. La funcion ya
  // existe y se reutiliza: un regex nuevo seria una segunda definicion de la
  // misma forma.
  const crudoAseadora = parametros.aseadora;
  const pedida = identificadorValido(
    typeof crudoAseadora === 'string' ? crudoAseadora : undefined,
  );

  const supabase = await createClient();

  // Las lecturas van en paralelo: son funciones distintas de la base y
  // encadenarlas sería sumar latencias por nada. Si alguna falla, la capa de
  // datos lanza y la pantalla cae entera, que es lo correcto: media pantalla de
  // cifras es peor que ninguna.
  //
  // La tercera solo se dispara con el parámetro puesto, y entra aquí y no
  // después para que su primera consulta no cueste una latencia propia. El
  // presupuesto entero está contado en la cabecera de `lib/data/panel-aseadora.ts`.
  const [resumen, aseadoras, abierta] = await Promise.all([
    leerResumenFinanciero(supabase, { desde, hasta }),
    leerCostoPorAseadora(supabase, { desde, hasta }),
    pedida === null ? null : leerPanelDeAseadora(supabase, pedida),
  ]);

  // LA RUTA AL CERRAR SE COMPONE AQUÍ, EN EL SERVIDOR, donde los parámetros ya
  // están normalizados, y baja como prop. Cerrar contra una constante borraría
  // el rango y el ancla, y el periodo del admin volvería a mes actual sin que
  // nada se lo dijera: es el defecto que la aserción de ancla del spec de
  // finanzas existe para atrapar.
  //
  // Se parte de los parámetros vivos y se quita SOLO el del panel, igual que
  // hace el filtro de periodo con los que no gobierna. Los mismos parámetros,
  // con el del panel añadido, son los que el enlace que ABRE tiene que conservar
  // (INSTRUCCIÓN 5).
  const vivos = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    if (clave === 'aseadora') continue;
    if (typeof valor === 'string') vivos.set(clave, valor);
    else if (Array.isArray(valor)) for (const uno of valor) vivos.append(clave, uno);
  }
  // El rango y el ancla NORMALIZADOS, no los crudos: una dirección sin ellos, o
  // con un valor que no existe, tiene que cerrar en el periodo que la pantalla
  // está mostrando de verdad y no en el que decía la dirección.
  vivos.set('rango', rango);
  vivos.set('ancla', ancla);

  const rutaAlCerrar = `/finanzas?${vivos.toString()}`;

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

      {/*
        HERMANO DEL FILTRO, NO HIJO SUYO, Y ESO NO ES UN DETALLE DE ANIDAMIENTO.

        `FiltroPeriodo` atenúa a sus hijos y les apaga los eventos mientras
        navega. Con el panel dentro, cambiar de periodo con el panel abierto lo
        dejaría atenuado y sin poder cerrarse. Ver la cabecera de este archivo.

        LA CLAVE VA AQUÍ Y EN NINGÚN OTRO SITIO (INSTRUCCIÓN 3): sobre el panel,
        para que abrir una segunda persona no reutilice el árbol de la primera.
        Nunca sobre nada que envuelva al contenido del filtro.
      */}
      {abierta !== null && (
        <PanelAseadora key={abierta.id} datos={abierta} rutaAlCerrar={rutaAlCerrar} />
      )}
    </div>
  );
}
