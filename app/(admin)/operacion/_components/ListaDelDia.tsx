'use client';

import { CalendarX } from 'lucide-react';
import { useEffect, useId, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { bandejaSinConfirmar, type FilaDeOperacion } from '@/lib/data/operacion';
import { estadoDeAseo } from '@/lib/domain/cleanings';

import { EstadoVacio } from '../../_components/EstadoVacio';

import type { ContextoDeAcciones } from './MenuAseo';
import { SheetConfirmar } from './SheetConfirmar';
import { TarjetaAseo } from './TarjetaAseo';

/**
 * LA COLUMNA IZQUIERDA: LA LISTA DE ASEOS DEL DÍA SELECCIONADO (plan 10-05).
 *
 * Sustituye a `BloqueDia` + `TablaDia` + `BandejaSinConfirmar`, que eran tres
 * superficies para lo mismo: los aseos de un día, los que faltan por confirmar, y
 * el control de los cancelados.
 *
 * ── CLIENT COMPONENT, Y POR DOS COSAS SOLAS ──────────────────────────────
 *
 * El toggle de cancelados y la tanda de confirmación. Nada más. Las filas llegan ya
 * leídas por el RSC. **Ya no hay estado de colapso**, porque ya no hay nada que
 * colapsar: el eje de la pantalla es el día del selector.
 *
 * ── LOS CANCELADOS NO SE ESCONDEN, SE PLIEGAN ───────────────────────────
 *
 * Heredado de `BloqueDia` sin cambios, y su razón tampoco cambia: un aseo cancelado
 * no tiene ninguna acción posible, y ocupar una tarjeta con él, en una lista de
 * treinta, empuja fuera algo accionable. Pero el conteo está a la vista y están a un
 * clic. Los TERMINADOS sí se quedan visibles: son el avance del día.
 *
 * ── LA TANDA DE CONFIRMACIÓN PASA A SER **POR DÍA** (D-05-8) ────────────
 *
 * La bandeja confirmaba los sin confirmar de la VENTANA ENTERA de catorce días.
 * Ahora confirma los del día seleccionado, porque el dueño pidió que todo salga de
 * la fecha del selector sin excepción, y dos conteos de sin confirmar distintos en
 * la misma pantalla (la métrica del día y un botón de toda la ventana) es
 * exactamente la incoherencia que este repo evita por escrito.
 *
 * Lo que NO se pierde: los sin confirmar de otros días siguen visibles sin navegar,
 * en la leyenda `+N en otros días` de la métrica del vistazo (D-05-7).
 *
 * ── LA `key` DE LA TANDA, HEREDADA TAL CUAL ─────────────────────────────
 *
 * El botón abre el `Sheet` en el primero; cada tarjeta lo abriría en ese aseo.
 * `sesion` se incrementa en cada apertura y va como `key`, así que reabrir monta un
 * `Sheet` nuevo con su progreso a cero: el `3 de N` cuenta confirmados de la tanda
 * INICIAL, y cerrar en el 3 y volver a abrir empieza una tanda nueva, no continúa la
 * anterior (§10).
 */
export function ListaDelDia({
  filas,
  acciones,
  responsables,
  responsableSinAvisos,
}: {
  /** Las filas del DÍA SELECCIONADO, en el orden de la consulta. */
  filas: FilaDeOperacion[];
  acciones: ContextoDeAcciones;
  /** `property_id` → nombre del responsable fijo del apartamento, o `null`. */
  responsables: Record<string, string | null>;
  /**
   * `property_id` → el responsable fijo se quedó sin canal (D-03, §11.3).
   * Atraviesa este componente sin que lo use: el consumidor es el `Sheet`.
   */
  responsableSinAvisos: Record<string, boolean>;
}) {
  const idTitulo = useId();

  const [verCancelados, setVerCancelados] = useState(false);
  const [tanda, setTanda] = useState<{ desde: number; sesion: number } | null>(null);

  const { visibles, cancelados } = useMemo(() => particionar(filas), [filas]);

  useAnclaDeAlerta(filas);

  /**
   * LOS SIN CONFIRMAR DEL DÍA, POR EL MISMO PREDICADO Y EL MISMO ORDEN DE SIEMPRE.
   *
   * `bandejaSinConfirmar()` restringido al día: su filtro es el predicado LITERAL
   * del índice `cleanings_unconfirmed_idx`, y su orden es el del contrato (§9). Un
   * `filter` propio acá sería la cuarta verdad sobre el mismo dato.
   */
  const sinConfirmar = useMemo(() => bandejaSinConfirmar(filas), [filas]);

  /**
   * EL ORDEN DENTRO DEL DÍA: hora límite y después nombre (§7.2).
   *
   * **LOS SIN CONFIRMAR NO FLOTAN ARRIBA**, y esto invierte a medias el contrato que
   * `TablaDia` tenía escrito. La razón vieja —que su superficie era la bandeja del
   * carril— murió con la bandeja. La nueva: reordenar por estado hace que la MISMA
   * tarjeta cambie de sitio cuando alguien la confirma, debajo del cursor, en una
   * lista que se refresca sola por tiempo real.
   *
   * La consulta ya viene ordenada por `scheduled_date` y `hora_limite`, pero el
   * desempate por nombre no lo puede dar PostgREST: el nombre vive en el embed. Se
   * hace acá, SOBRE UNA COPIA, porque `filas` es la misma lista que alimenta el
   * vistazo y reordenarla por debajo cambiaría la pantalla entera.
   *
   * `localeCompare('es-CO')` y no `<`: un `sort()` a secas compara puntos de código
   * UTF-16 y manda 'Álamos' después de 'Zipaquirá'.
   */
  const enPantalla = useMemo(() => {
    const lista = verCancelados ? [...visibles, ...cancelados] : visibles;
    return [...lista].sort((a, b) => {
      if (a.hora_limite !== b.hora_limite) return a.hora_limite < b.hora_limite ? -1 : 1;
      return (a.property?.nombre ?? '').localeCompare(b.property?.nombre ?? '', 'es-CO');
    });
  }, [visibles, cancelados, verCancelados]);

  const hayInertes = enPantalla.some((fila) => !fila.is_managed);

  function abrirEn(desde: number) {
    setTanda((previa) => ({ desde, sesion: (previa?.sesion ?? 0) + 1 }));
  }

  return (
    // `min-h-0` es lo que permite que el scroll ocurra DENTRO de la lista en vez de
    // que la columna crezca y empuje la página. `flex-1` se lo deja a la lista, no a
    // la cabecera.
    <section
      data-slot="lista-dia"
      aria-labelledby={idTitulo}
      className="flex min-h-0 flex-col rounded-md border border-border bg-background"
    >
      {/* Cabecera FUERA del scrollport: el contador y la tanda no se van nunca. */}
      <div className="flex shrink-0 flex-col gap-sm border-b border-border p-md">
        <div className="flex items-center justify-between gap-sm">
          <h2 id={idTitulo} className="text-heading text-foreground">
            Aseos del día
          </h2>

          <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
            {visibles.length} {visibles.length === 1 ? 'aseo' : 'aseos'}
          </span>
        </div>

        {/*
          EL TOGGLE DE CANCELADOS, con su etiqueta y su conteo LITERALES. Heredado de
          `BloqueDia` palabra por palabra: es la superficie que el caso E2E de la
          cancelación mide, y cambiarle una letra lo deja sin nada que medir.
        */}
        {cancelados.length > 0 && (
          <button
            type="button"
            aria-pressed={verCancelados}
            onClick={() => setVerCancelados((v) => !v)}
            className="transicion self-start rounded-sm text-micro text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {verCancelados ? 'Ocultar cancelados' : `Ver cancelados (${cancelados.length})`}
          </button>
        )}

        {/*
          EL ÚNICO BOTÓN PRIMARIO DE LA PANTALLA (§4.2). `Crear aseo` va en `outline`:
          crear un aseo a mano es una acción rara y deliberada, y confirmar los que
          acaban de caer es el trabajo de la pantalla. Dos rellenos compitiendo
          dejarían al ojo eligiendo entre ellos justo cuando hay cosas pendientes.
        */}
        {sinConfirmar.length > 0 && (
          <Button type="button" size="lg" className="w-full" onClick={() => abrirEn(0)}>
            Confirmar {sinConfirmar.length} {sinConfirmar.length === 1 ? 'aseo' : 'aseos'}
          </Button>
        )}
      </div>

      {enPantalla.length === 0 ? (
        <EstadoVacio
          compacto
          icono={CalendarX}
          encabezado="Ningún aseo para este día."
          cuerpo="Si esperabas alguno, revisa que el calendario del apartamento esté conectado."
        />
      ) : (
        <>
          {/*
            LA LISTA SCROLLEA POR DENTRO, y eso es la mitad de "la página no
            scrollea": `min-h-0` más `flex-1` más `overflow-y-auto`. Sin `min-h-0` una
            lista de treinta tarjetas estira la columna y el scroll se lo lleva el
            documento.

            Sin virtualizar y sin paginar, misma razón de siempre: decenas de tarjetas
            son un solo render, y un "ver más" cuesta que alguien no lo pulse.
          */}
          <ul className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto p-md">
            {enPantalla.map((fila) => (
              <TarjetaAseo key={fila.id} fila={fila} acciones={acciones} />
            ))}
          </ul>

          {/*
            ESTA FRASE ES LO QUE MATA DE RAÍZ LA LECTURA "¿esto está roto?" (§7.4).
            Sin ella, la primera vez que el admin vea una tarjeta sin estado y sin menú
            la va a reportar como bug. Solo aparece si el día tiene al menos una
            inerte: en un día sin ninguna, explicaría algo que no está en pantalla.

            Va FUERA del scrollport para que no se la coma el scroll.
          */}
          {hayInertes && (
            <p className="shrink-0 border-t border-border px-md py-sm text-micro text-muted-foreground">
              Las unidades de gestión externa aparecen para que el día quede completo.
              VivaGuest no las opera.
            </p>
          )}
        </>
      )}

      {tanda && (
        <SheetConfirmar
          key={tanda.sesion}
          filas={sinConfirmar.slice(tanda.desde)}
          responsables={responsables}
          responsableSinAvisos={responsableSinAvisos}
          onCerrar={() => setTanda(null)}
        />
      )}
    </section>
  );
}

/**
 * LLEVA A PANTALLA LA TARJETA A LA QUE APUNTA EL ANCLA DE UNA ALERTA.
 *
 * ── ESTE GANCHO SE REDUJO A LA MITAD, Y HAY QUE DECIR QUÉ MITAD SE FUE ───
 *
 * En `BloqueDia` hacía DOS cosas: expandir el bloque colapsado y después desplazar.
 * **La primera mitad ya no existe**, porque ya no hay bloques que expandir: la
 * pantalla se filtra por un día y el destino de la alerta trae ese día dentro
 * (`/operacion?dia={dia}#aseo-{id}`), así que la tarjeta ya está renderizada y con
 * caja cuando el ancla llega.
 *
 * Lo que SÍ se conserva entero es el desplazamiento y sus TRES DISPARADORES, porque
 * su razón no cambió:
 *
 *   1. AL MONTAR. Cubre llegar desde otra ruta con el ancla ya en la URL. **Y es el
 *      disparador que más trabaja ahora**: pulsar una alerta de otro día es una
 *      navegación de verdad, no un cambio de solo-hash.
 *   2. `hashchange`. Cubre atrás/adelante del navegador.
 *   3. EL CLIC, EN FASE DE CAPTURA. Cubre el caso en que el aseo es del día que ya
 *      está en pantalla: ahí el `<Link>` resuelve una navegación de solo-hash con
 *      `history.pushState`, **y `pushState` no dispara `hashchange` por
 *      especificación**. Un efecto que solo escuchara ese evento quedaría bonito y no
 *      arreglaría nada. Se lee el `hash` del `<a>` pulsado y no `location.hash`,
 *      porque en ese instante la URL todavía es la vieja.
 *
 * ── LO QUE NO HACE: REACCIONAR A CADA REFRESCO ──────────────────────────
 *
 * `SincronizacionEnVivo` llama a `router.refresh()` cuando entra un cambio por
 * Realtime, y el `hash` sigue en la URL después del primer clic. Si el efecto
 * dependiera de `filas` —un array nuevo en cada render del RSC— cada refresco
 * volvería a desplazar la página bajo el cursor. La dependencia es la CADENA de ids,
 * que es estable mientras las filas sean las mismas.
 */
function useAnclaDeAlerta(filas: FilaDeOperacion[]): void {
  const claveDeFilas = filas.map((f) => f.id).join(',');

  const [ancla, setAncla] = useState<string | null>(null);

  useEffect(() => {
    const ids = new Set(
      claveDeFilas === '' ? [] : claveDeFilas.split(',').map((id) => `aseo-${id}`),
    );

    function atender(hash: string) {
      const id = hash.startsWith('#') ? hash.slice(1) : hash;
      if (id === '' || !ids.has(id)) return;
      setAncla(id);
    }

    atender(window.location.hash);

    const alCambiarHash = () => atender(window.location.hash);
    window.addEventListener('hashchange', alCambiarHash);

    const alHacerClic = (evento: MouseEvent) => {
      const objetivo = evento.target;
      if (!(objetivo instanceof Element)) return;
      const enlace = objetivo.closest('a');
      if (enlace === null) return;
      atender(enlace.hash);
    };
    document.addEventListener('click', alHacerClic, true);

    return () => {
      window.removeEventListener('hashchange', alCambiarHash);
      document.removeEventListener('click', alHacerClic, true);
    };
  }, [claveDeFilas]);

  useEffect(() => {
    if (ancla === null) return;
    // `block: 'center'` y no el `start` por defecto: la tarjeta queda a media altura y
    // se ve el día alrededor, que es lo que se fue a mirar.
    document.getElementById(ancla)?.scrollIntoView({ block: 'center' });
    // Se limpia para que un repintado posterior no vuelva a mover la lista.
    setAncla(null);
  }, [ancla]);
}

/**
 * Reparte las filas del día en lo que se ve y lo cancelado.
 *
 * Los dos salen de `estadoDeAseo()`, la única derivación del repo: contar acá con un
 * `state === 'cancelada'` propio sería el mismo `if` duplicado que esa función existe
 * para evitar.
 *
 * `N aseos` cuenta lo VISIBLE, no el total bruto: los cancelados llevan su propio
 * conteo al lado, y sumarlos en los dos sitios haría que 14 y 2 no cuadraran con las
 * 14 tarjetas que el admin tiene delante.
 */
function particionar(filas: FilaDeOperacion[]) {
  const visibles: FilaDeOperacion[] = [];
  const cancelados: FilaDeOperacion[] = [];

  for (const fila of filas) {
    if (estadoDeAseo(fila).clave === 'cancelado') cancelados.push(fila);
    else visibles.push(fila);
  }

  return { visibles, cancelados };
}
