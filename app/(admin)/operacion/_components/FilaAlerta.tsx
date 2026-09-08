'use client';

import {
  ArrowLeftRight,
  Bell,
  CalendarX,
  Check,
  CircleCheck,
  CircleSlash,
  Hammer,
  History,
  Hourglass,
  PackageOpen,
  Undo2,
  UserRoundCog,
  UserRoundX,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import type { Alerta, IconoDeAlerta } from '@/lib/domain/alertas';
import { presentacionDeAlerta } from '@/lib/domain/alertas';
import { formatInstanteBog, tiempoRelativo } from '@/lib/domain/dates';

import { devolverAlertaAlPanel, marcarAlertaAtendida } from '../_actions';

/**
 * La fila de 64px del panel de alertas (04-UI-SPEC.md §11.3).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA REGLA DURA, Y ES LA MAS FACIL DE ROMPER POR ACCIDENTE (D-07, UI-SPEC §4.3)
 *
 *   EL COLOR NO CODIFICA EL TIPO DE ALERTA. PUNTO.
 *
 * Los doce iconos van en `text-status-warn`, las doce etiquetas en
 * `text-muted-foreground` y los doce titulos en `text-foreground`. Prohibido rojo
 * para "urgente", ambar para "hora limite", gris para "faltantes", un
 * `border-left` de color por tipo, un `Badge` de color por tipo, o cualquier
 * variacion de tamano, peso o fondo entre tipos.
 *
 * El unico uso de color dentro del panel es ese `--status-warn` uniforme, que
 * separa el panel entero del resto de la pantalla sin decir nada sobre ninguna
 * alerta en particular.
 *
 * Ni el color ni el tamano salen de aqui: los fija `MAPA_DE_ALERTAS` en
 * `lib/domain/alertas.ts`, cuyo tipo `PresentacionDeAlerta` tiene las tres clases
 * como literales cerrados. Este componente los LEE; no puede elegirlos aunque
 * quiera, y el test de homogeneidad recorre el mapa entero para que no cambie en
 * silencio. Si al anadir un tipo te nace la tentacion de destacarlo, esa
 * tentacion ES el bug.
 *
 * Verificacion operativa, no opinion: una captura del panel en escala de grises
 * tiene que seguir distinguiendo los tipos (§16.2). Lo mide el e2e del plan 04-14.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── LAS DOS COSAS QUE ESTA FILA NO HACE ────────────────────────────────────
 *
 * 1. NO REESCRIBE EL COPY. `notifications` ya trae `title` y `body` redactados en
 *    espanol desde la migracion 13, y las tres computadas los traen escritos en
 *    `alertasComputadas()`. Lo que la UI anade es el icono, la etiqueta de tipo,
 *    el tiempo relativo y el destino del clic (§0).
 * 2. NO USA `read_at` COMO "LEIDA". No hay negrita para no leidas ni gris para
 *    leidas: cualquier tratamiento de leido contra no leido reintroduce
 *    exactamente la jerarquia que el criterio 4 prohibe, y ademas "leida" no es
 *    "resuelta".
 */

/**
 * Los doce nombres de icono de `IconoDeAlerta`, resueltos a componentes.
 *
 * `lib/domain/alertas.ts` es puro y devuelve NOMBRES: no importa React ni lucide.
 * La resolucion vive aca, que es la capa que pinta. El `Record<IconoDeAlerta, …>`
 * cierra el circulo: anadir un nombre al tipo sin anadirlo a esta tabla rompe el
 * build, que es donde tiene que romper.
 */
const ICONOS: Record<IconoDeAlerta, LucideIcon> = {
  Zap,
  ArrowLeftRight,
  UserRoundX,
  Hammer,
  PackageOpen,
  CalendarX,
  Hourglass,
  CircleSlash,
  CircleCheck,
  UserRoundCog,
  History,
  Bell,
};

/**
 * La URL almacenada, aceptada SOLO si es una ruta interna (T-04-10).
 *
 * `notifications.url` la escriben funciones de la base y hoy no hay ninguna ruta
 * de INSERT abierta a nadie (`notifications` no tiene policy ni grant de insert),
 * asi que el vector esta cerrado por construccion. Este filtro es la segunda
 * capa, y es barata: una cadena que empiece por `javascript:`, por `data:` o por
 * `//host` no llega nunca al `href`.
 *
 * `//` se rechaza aparte porque `//evil.com` ES una URL absoluta protocol-relative
 * pese a empezar por barra: sin ese caso, el filtro dejaria pasar justo el
 * redirect externo que pretende cortar.
 *
 * Se renderiza como `href` de un `<Link>` interno y NUNCA como HTML: en toda la
 * fase no hay una sola inyeccion de HTML crudo, y hay un grep que lo comprueba
 * sobre este directorio. Por eso el nombre de esa prop de React no se escribe
 * aca ni dentro de un comentario: el grep no distingue.
 */
export function rutaInterna(url: string | null): string | null {
  if (url === null) return null;
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  return url;
}

export function FilaAlerta({
  alerta,
  ahoraMs,
  modo,
  onOptimista,
}: {
  alerta: Alerta;
  /**
   * El instante de la lectura, UNO SOLO para toda la pantalla (D-14). NO se llama
   * `Date.now()` aca: treinta filas leyendo el reloj cada una darian treinta
   * respuestas distintas a la misma pregunta, que es exactamente la mentira que
   * D-14 existe para evitar.
   */
  ahoraMs: number;
  /** `atendidas` invierte la accion: el boton pasa a `Devolver al panel`. */
  modo: 'sin_atender' | 'atendidas';
  /**
   * Saca la fila de la lista ANTES de que responda el servidor. Lo implementa
   * `PanelAlertas` con `useOptimistic`, que es quien tiene la lista; aca solo se
   * dispara, dentro de la transicion que envuelve la llamada.
   */
  onOptimista: (id: string) => void;
}) {
  const router = useRouter();
  const [enVuelo, startTransition] = useTransition();

  const presentacion = presentacionDeAlerta(alerta.clave);
  const Icono = ICONOS[presentacion.icono];

  const relativo = tiempoRelativo(alerta.ocurrioEnMs, ahoraMs);
  const absoluto = formatInstanteBog(alerta.ocurrioEnMs);

  const destino = rutaInterna(alerta.url);
  const atendidas = modo === 'atendidas';

  // Nombre accesible del ancla estirada. El texto visible NO esta dentro del
  // `<a>` (ver abajo por que), asi que sin esto el enlace no tendria nombre.
  const nombreDelEnlace = alerta.apartamento
    ? `${presentacion.etiqueta}: ${alerta.apartamento} · ${alerta.titulo}`
    : `${presentacion.etiqueta}: ${alerta.titulo}`;

  /**
   * EL UNICO CASO DE ESTADO OPTIMISTA DE TODA LA FASE (§15.2).
   *
   * La fila sale de la lista de inmediato y vuelve con un toast destructivo si el
   * `UPDATE` falla. Es la unica mutacion cuyo resultado se puede adivinar con
   * certeza y la unica que se hace varias veces seguidas; todo lo demas
   * (confirmar, reasignar, reprogramar, cerrar, cancelar, crear) espera respuesta
   * del servidor porque tiene constraints que pueden rechazarla.
   *
   * `ok: false` TAMBIEN LLEGA CON CERO FILAS AFECTADAS, no solo con un error de
   * Postgres: la alerta puede ser de otro destinatario y la policy
   * `notifications_own_update` la deja fuera sin levantar error. Por eso la rama
   * de fallo es una sola y cubre las dos: se avisa y la fila vuelve. Si se
   * tratara solo el `error` de Postgres, el panel se quedaria con el optimista
   * aplicado sobre algo que nunca se escribio.
   *
   * La vuelta NO se programa aca: `useOptimistic` revierte solo al terminar la
   * transicion, y para entonces el `router.refresh()` de abajo ya trajo la lista
   * de verdad. En el camino feliz la fila ya no esta; en el de fallo, vuelve.
   *
   * ── EL `router.refresh()` ES LO QUE TRAE LA LISTA DE VERDAD (plan 04-14) ──
   * Hasta el 04-14 este era el UNICO sitio de la pantalla que no lo llamaba,
   * porque se apoyaba en el `revalidatePath('/operacion')` de la action. Esa
   * llamada se quito de las nueve actions: colgaba el navegador entero, con el
   * boton en su estado pendiente para siempre y sin aplicar nunca la respuesta
   * del servidor. La medicion completa esta en la cabecera de `_actions.ts`.
   *
   * Sin este refresco, `useOptimistic` revertiria al terminar la transicion y la
   * fila atendida REAPARECERIA en el panel pese a estar escrita en la base, que
   * es peor que no tener estado optimista.
   */
  function resolver() {
    startTransition(async () => {
      onOptimista(alerta.id);

      const resultado = atendidas
        ? await devolverAlertaAlPanel(alerta.id)
        : await marcarAlertaAtendida(alerta.id);

      if (!resultado.ok) toast.error(resultado.error);

      router.refresh();
    });
  }

  return (
    <li className="transicion relative border-b border-border last:border-b-0 hover:bg-canvas">
      {/*
        Alto FIJO de 64px: `--spacing-fila-alerta`. Que la fila mida siempre lo
        mismo es parte del criterio 4, no una comodidad de layout. Los calculos
        estan en §11.3: 12·1.4 (16.8) + 14·1.5 (21) + 24 de padding = 61.8.
      */}
      <div className="flex h-fila-alerta items-start gap-md p-md">
        {/*
          `aria-hidden`: la etiqueta de texto que va justo al lado dice lo mismo, y
          un `aria-label` aca lo leeria dos veces (§16.3). El icono es el ancla de
          escaneo; la etiqueta es la que carga el significado.
        */}
        <Icono
          className={`size-4 shrink-0 ${presentacion.claseIcono}`}
          strokeWidth={2}
          aria-hidden="true"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Linea 1: etiqueta de tipo a la izquierda, tiempo relativo a la derecha. */}
          <div className="flex items-baseline justify-between gap-sm">
            {/*
              12/600 uppercase con `tracking-columna`, EXACTAMENTE el mismo
              tratamiento que un encabezado de columna (§3). Es deliberado: la
              etiqueta es el rotulo de la fila, no su contenido.
            */}
            <span
              className={`truncate text-micro font-semibold uppercase tracking-columna ${presentacion.claseEtiqueta}`}
            >
              {presentacion.etiqueta}
            </span>

            {/*
              `tabular-nums` (§3): sin el, `hace 8 min` y `hace 11 min` tienen
              anchos distintos y la columna derecha de treinta filas no alinea.
              El absoluto va en el `title`, porque un relativo solo obliga a hacer
              la cuenta a mano.
            */}
            {relativo && (
              <span
                className="shrink-0 text-micro tabular-nums text-muted-foreground"
                title={absoluto ?? undefined}
              >
                {relativo}
              </span>
            )}
          </div>

          {/* Linea 2: apartamento + titulo, una sola linea con truncado. */}
          <div className="flex items-center gap-sm">
            {/*
              El `body` COMPLETO en el `title` del elemento: truncar sin `title` es
              esconder el dato, y esconder es justo lo que este panel no hace.
            */}
            <p className="min-w-0 flex-1 truncate text-body" title={alerta.cuerpo}>
              {alerta.apartamento && (
                <>
                  <span className="font-semibold text-foreground">{alerta.apartamento}</span>
                  <span className="text-muted-foreground"> · </span>
                </>
              )}
              <span className="text-muted-foreground">{alerta.titulo}</span>
            </p>

            {/*
              LA RANURA DEL BOTON, RESERVADA EXISTA EL BOTON O NO (§11.3).

              32px de ancho mas el `gap-sm` de 8px. En una alerta computada queda
              VACIA y el texto no se estira para ocuparla. Sin la reserva, el
              titulo de una fila computada mediria 40px mas que el de la de al lado
              y el punto de truncado bailaria de fila en fila: ese desnivel SI
              seria una diferencia visual entre tipos, que es lo que el criterio 4
              prohibe.
            */}
            <span className="size-8 shrink-0" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/*
        ── TODA LA FILA ES EL DESTINO DEL CLIC (D-08) ──────────────────────────
        Ancla ESTIRADA sobre la fila entera, y no un `<a>` que envuelva el
        contenido, porque el boton de atender es interactivo y un control dentro de
        un ancla es HTML invalido: el navegador rompe el arbol y el teclado deja de
        alcanzar uno de los dos. Con el ancla estirada los dos son alcanzables por
        `Tab` y el boton queda por encima con su `z-10`.

        Una alerta que no es accionable desde donde se ve es una notificacion, no
        una alerta. Cuando `url` es nula (o no es una ruta interna) no hay ancla:
        no se inventa un destino.
      */}
      {destino && (
        <Link
          href={destino}
          aria-label={nombreDelEnlace}
          className="absolute inset-0 rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        />
      )}

      {/*
        ── SOLO LAS ALERTAS RESPALDADAS POR `notifications` SON ATENDIBLES ────
        Las tres computadas (urgente, hora limite vencida, calendario caido) no
        tienen `read_at` y su boton NO SE RENDERIZA, porque seria un boton que
        miente: la alerta reaparece en la siguiente lectura. La ranura de arriba se
        reserva igual.

        Y esa diferencia de affordance no rompe el criterio 4: "ninguna alerta se
        esconde" es sobre visibilidad y prominencia, y los tipos comparten alto,
        color, tipografia, sitio en el orden y destino del clic. La diferencia NO
        correlaciona con severidad —entre las computadas estan Urgente y Hora
        limite vencida, las dos que mas cuestan si se pierden—: sigue la
        procedencia del dato, no la importancia.

        VISIBLE SIEMPRE, no solo en hover: un control que solo existe al pasar el
        mouse no existe para el teclado.

        `bottom-sm` y no un centrado vertical: el centro del boton queda a 40px del
        borde superior y el de la linea 2 a 39.3px. Centrarlo en la fila entera lo
        subiria 7px y lo dejaria flotando entre las dos lineas.
      */}
      {alerta.atendible && (
        <button
          type="button"
          onClick={resolver}
          disabled={enVuelo}
          aria-label={`${atendidas ? 'Devolver al panel' : 'Marcar como atendida'}: ${alerta.titulo}`}
          className="transicion absolute bottom-sm right-md z-10 flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          {atendidas ? (
            <Undo2 className="size-3.5" strokeWidth={2} aria-hidden="true" />
          ) : (
            <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
          )}
        </button>
      )}
    </li>
  );
}
