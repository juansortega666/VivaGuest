'use client';

import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

import type { FilaDeOperacion } from '@/lib/data/operacion';
import { estadoDeAseo } from '@/lib/domain/cleanings';
import { formatFechaBog } from '@/lib/domain/dates';

import type { ContextoDeAcciones } from './MenuAseo';
import { TablaDia } from './TablaDia';

/**
 * Un bloque de dia: la cabecera colapsable de 48px mas su tabla (04-UI-SPEC.md
 * §8.1).
 *
 * ── CLIENT COMPONENT, Y SOLO POR EL COLAPSO ─────────────────────────────────
 * Dos estados de cliente: si el dia esta abierto y si se ven los cancelados. Nada
 * mas. Las filas llegan ya leidas por el RSC.
 *
 * ── EL ESTADO DE COLAPSO NO SE PERSISTE ─────────────────────────────────────
 * Cada carga abre `Hoy` y cierra los otros dos. No se construye `localStorage`:
 * el admin entra a esta pantalla a ver el dia de hoy, y recordar que ayer dejo
 * `Siguientes` abierto no le ahorra nada que valga el estado que hay que
 * mantener.
 *
 * ── LOS CANCELADOS NO SE ESCONDEN, SE PLIEGAN ───────────────────────────────
 * No se muestran por defecto porque un aseo cancelado no tiene ninguna accion
 * posible, y ocupar una fila de 40px con el, en una lista de 30, empuja fuera
 * algo accionable. Pero el conteo esta a la vista y estan a un clic. Los
 * TERMINADOS si se quedan visibles: son el avance del dia.
 *
 * ── LA UNICA EXCEPCION AL "NACE COLAPSADO": EL ANCLA DE UNA ALERTA ─────────
 * §11.3 pide que el clic de una alerta lleve a su fila «expandiendolo si estaba
 * colapsado». `FilaAlerta` navega a `/operacion#aseo-{id}` y `FilaAseo` pone ese
 * `id`, pero el contenido colapsado va con `hidden`: el navegador encuentra el
 * elemento y no puede llevarlo a pantalla, asi que el clic no hace NADA y no
 * avisa. Lo cierra `useAnclaDeAlerta()`, abajo.
 */

/** Un dia con cero filas tambien pinta su cabecera: que no haya nada es informacion. */
export function BloqueDia({
  rotulo,
  fecha,
  filas,
  acciones,
  expandidoInicial = false,
  resumen,
  children,
}: {
  /** El rotulo relativo (`Hoy`, `Mañana`, `Siguientes (5 días)`, `Atrasados`). Opcional. */
  rotulo?: string;
  /** `'YYYY-MM-DD'` de negocio. Se formatea con `formatFechaBog()`. */
  fecha?: string;
  /** Las filas del dia. En el bloque agregado, las de todos sus dias, solo para contar. */
  filas: FilaDeOperacion[];
  /**
   * Lo que el menu de cada fila necesita y la fila no trae. Atraviesa este
   * componente sin usarse; en el bloque agregado lo reciben los dias de dentro.
   */
  acciones: ContextoDeAcciones;
  expandidoInicial?: boolean;
  /**
   * El texto de la derecha de la cabecera, YA COMPUESTO por el llamador.
   *
   * Existe por un solo caso y se declara para que no crezca: `Atrasados` dice
   * `3 aseos · el más viejo del 4 de septiembre` (05-UI-SPEC §12.2), y ese
   * `el más viejo del …` sale de `masViejoAtrasado`, un dato de la proyeccion que
   * este componente no recibe y que no tiene por que recibir. Componerlo aqui
   * dentro obligaria a meterle a un bloque de dia la nocion de "atrasado".
   *
   * Sin esta prop, la cabecera compone lo suyo de siempre: `N aseos` mas
   * `· N sin confirmar` si lo hay.
   */
  resumen?: string;
  /**
   * Contenido propio en vez de la tabla. Lo usa `Siguientes`, que no es un dia:
   * agrupa cinco, y cada uno trae su cabecera y su tabla. Cuando hay `children`
   * NO se pinta el toggle de cancelados, porque cada dia de dentro tiene el suyo
   * y dos toggles sobre las mismas filas se contradicen a la primera.
   */
  children?: ReactNode;
}) {
  const idCabecera = useId();
  const idContenido = useId();

  const [expandido, setExpandido] = useState(expandidoInicial);
  const [verCancelados, setVerCancelados] = useState(false);

  const { visibles, cancelados, sinConfirmar } = useMemo(() => particionar(filas), [filas]);

  // El bloque agregado (`Siguientes`) tambien recibe las filas de sus cinco dias,
  // asi que se expande y deja que el dia de dentro haga lo propio con las suyas.
  useAnclaDeAlerta(filas, () => setExpandido(true));

  const agregado = children !== undefined;
  const total = visibles.length;

  return (
    <section aria-labelledby={idCabecera} className="rounded-md border border-border bg-background">
      {/*
        `relative` para que el `::after` del boton cubra la cabecera entera: toda
        ella es el control de colapso (§8.1). El toggle de cancelados es un
        hermano con `relative z-10`, y NO un boton anidado dentro del otro, que
        seria HTML invalido y ademas inalcanzable por teclado en varios lectores.
        Por eso tampoco hace falta ningun `stopPropagation`: no hay evento que
        propagar hacia arriba.
      */}
      <div className="relative flex h-dia-cabecera items-center gap-md rounded-t-md border-b border-border bg-canvas px-md">
        <button
          type="button"
          id={idCabecera}
          aria-expanded={expandido}
          aria-controls={idContenido}
          onClick={() => setExpandido((v) => !v)}
          className="transicion flex items-center gap-sm rounded-sm text-heading text-foreground after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expandido ? (
            <ChevronDown className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          ) : (
            <ChevronRight className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
          )}

          {/*
            EL ROTULO RELATIVO VA PRIMERO porque es lo que se escanea; la fecha
            absoluta detras porque es lo que se verifica.
          */}
          {etiquetaDeCabecera(rotulo, fecha)}
        </button>

        <span className="ml-auto text-micro tabular-nums text-muted-foreground">
          {resumen === undefined ? (
            <>
              {total} {total === 1 ? 'aseo' : 'aseos'}
              {/* `3 sin confirmar` solo si es mayor que cero: un `0 sin confirmar` es
                  una linea de texto que dice que no hay nada que decir. */}
              {sinConfirmar > 0 && ` · ${sinConfirmar} sin confirmar`}
            </>
          ) : (
            resumen
          )}
        </span>

        {!agregado && cancelados.length > 0 && (
          <button
            type="button"
            aria-pressed={verCancelados}
            onClick={() => setVerCancelados((v) => !v)}
            className="transicion relative z-10 shrink-0 rounded-sm text-micro text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {verCancelados ? 'Ocultar cancelados' : `Ver cancelados (${cancelados.length})`}
          </button>
        )}
      </div>

      {/*
        `hidden` y no desmontar: el contenido colapsado sigue en el DOM, asi que el
        buscador del navegador lo encuentra y `aria-controls` apunta a algo que
        existe siempre, que es lo que el atributo promete.
      */}
      <div id={idContenido} hidden={!expandido}>
        {agregado ? (
          children
        ) : (
          <TablaDia
            filas={verCancelados ? [...visibles, ...cancelados] : visibles}
            acciones={acciones}
          />
        )}
      </div>
    </section>
  );
}

/**
 * EXPANDE EL BLOQUE CUANDO EL ANCLA DE UNA ALERTA APUNTA A UNA DE SUS FILAS.
 *
 * ── EL PROBLEMA, MEDIDO Y NO SUPUESTO (diferido del plan 04-13) ────────────
 * `FilaAlerta` navega a `/operacion#aseo-{id}` y `FilaAseo` pone `id="aseo-{id}"`
 * con su `scroll-mt-barra`. Funciona mientras el dia este abierto, que es el caso
 * de `Hoy`. Pero `Mañana` y `Siguientes` NACEN COLAPSADOS (§8.1) y el contenido
 * colapsado va con `hidden`, a proposito, para que el buscador del navegador lo
 * siga encontrando. Un elemento `hidden` no tiene caja: el navegador resuelve el
 * ancla, no puede desplazarse a el, y **el clic no hace absolutamente nada y
 * tampoco avisa**. §11.3 pide lo contrario, con esas palabras: «expandiendolo si
 * estaba colapsado».
 *
 * ── POR QUE TRES DISPARADORES Y NO SOLO `hashchange` ──────────────────────
 * El caso MAYORITARIO —el admin ya esta en `/operacion` y pulsa una alerta del
 * carril— no emite `hashchange`. El `<Link>` del App Router resuelve una
 * navegacion de solo-hash sobre la misma ruta con `history.pushState`, y
 * `pushState` no dispara ese evento por especificacion. Un `useEffect` que solo
 * escuchara `hashchange` quedaria bonito y no arreglaria nada.
 *
 *   1. AL MONTAR. Cubre llegar desde otra ruta con el ancla ya en la URL
 *      (una alerta pulsada desde `/apartamentos`, o el enlace pegado a mano).
 *   2. `hashchange`. Cubre atras/adelante del navegador y cualquier ancla que no
 *      pase por el router.
 *   3. EL CLIC, EN FASE DE CAPTURA. Cubre el caso mayoritario. Se lee el `hash`
 *      del `<a>` pulsado y no `location.hash`, porque en ese instante la URL
 *      todavia es la vieja. Va en captura para llegar antes de que el router
 *      haga lo suyo.
 *
 * ── Y EL DESPLAZAMIENTO SE HACE AQUI ──────────────────────────────────────
 * Expandir no basta: para cuando React repinta, el intento de desplazamiento del
 * navegador ya ocurrio contra un elemento sin caja. Por eso hay un segundo efecto
 * que lleva la fila a pantalla DESPUES del repintado. `block: 'center'` y no el
 * `start` por defecto: la fila queda a media altura y se ve el dia alrededor, que
 * es lo que se fue a mirar.
 *
 * ── LO QUE NO HACE: REACCIONAR A CADA REFRESCO ────────────────────────────
 * `SincronizacionEnVivo` llama a `router.refresh()` cuando entra un cambio por
 * Realtime, y el `hash` sigue en la URL despues del primer clic. Si el efecto
 * dependiera de `filas` —un array nuevo en cada render del RSC— cada refresco
 * volveria a desplazar la pagina bajo el cursor. La dependencia es la CADENA de
 * ids, que es estable mientras las filas sean las mismas.
 */
function useAnclaDeAlerta(filas: FilaDeOperacion[], expandir: () => void): void {
  const claveDeFilas = filas.map((f) => f.id).join(',');

  const [ancla, setAncla] = useState<string | null>(null);

  useEffect(() => {
    const ids = new Set(claveDeFilas === '' ? [] : claveDeFilas.split(',').map((id) => `aseo-${id}`));

    function atender(hash: string) {
      const id = hash.startsWith('#') ? hash.slice(1) : hash;
      if (id === '' || !ids.has(id)) return;
      expandir();
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
    // `expandir` es un `setState` envuelto en una flecha nueva en cada render;
    // meterlo en las dependencias reinstalaria los listeners en cada uno.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveDeFilas]);

  useEffect(() => {
    if (ancla === null) return;
    document.getElementById(ancla)?.scrollIntoView({ block: 'center' });
    // Se limpia para que un repintado posterior no vuelva a mover la pagina.
    setAncla(null);
  }, [ancla]);
}

/**
 * Reparte las filas del dia en lo que se ve, lo cancelado y lo que falta por
 * confirmar.
 *
 * Los tres salen de `estadoDeAseo()`, la unica derivacion del repo: contar aqui
 * con un `state === 'cancelada'` propio seria el mismo `if` duplicado que esa
 * funcion existe para evitar.
 *
 * `N aseos` cuenta lo VISIBLE, no el total bruto: los cancelados llevan su propio
 * conteo al lado, y sumarlos en los dos sitios haria que 14 y 2 no cuadraran con
 * las 14 filas que el admin tiene delante.
 */
function particionar(filas: FilaDeOperacion[]) {
  const visibles: FilaDeOperacion[] = [];
  const cancelados: FilaDeOperacion[] = [];
  let sinConfirmar = 0;

  for (const fila of filas) {
    const { clave } = estadoDeAseo(fila);

    if (clave === 'cancelado') {
      cancelados.push(fila);
      continue;
    }

    if (clave === 'sin_confirmar') sinConfirmar += 1;
    visibles.push(fila);
  }

  return { visibles, cancelados, sinConfirmar };
}

/**
 * `Hoy · jue, 3 de septiembre`, o solo la fecha cuando el dia no tiene rotulo
 * propio, o SOLO EL ROTULO cuando el bloque no es un dia.
 *
 * Ese tercer caso ya existia para `Siguientes (5 días)` y es el que usa
 * `Atrasados`: no lleva fecha relativa detras porque no es un dia, es un filtro
 * sobre varios (05-UI-SPEC §12.2).
 */
function etiquetaDeCabecera(rotulo: string | undefined, fecha: string | undefined): string {
  if (!fecha) return rotulo ?? '';

  const absoluta = formatFechaBog(fecha);
  if (rotulo) return `${rotulo} · ${absoluta}`;

  // `Intl` emite el dia de la semana en minuscula en es-CO, y esta cadena arranca
  // una cabecera. Se capitaliza aqui y no en `formatFechaBog()`, que la sirve
  // tambien a mitad de frase.
  return absoluta.charAt(0).toUpperCase() + absoluta.slice(1);
}
