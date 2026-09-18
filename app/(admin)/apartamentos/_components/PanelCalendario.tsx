'use client';

import {
  ArrowLeft,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, use } from 'react';

import { Button } from '@/components/ui/button';
import type { ApartamentoDeLista } from '@/lib/data/apartamentos';
import type { FeedDeApartamento } from '@/lib/data/panel-apartamento';
import {
  checkoutsDelMes,
  distanciaHastaCheckout,
  proximoCheckout,
  type DistanciaHastaCheckout,
} from '@/lib/domain/checkouts';
import {
  formatDiaCortoBog,
  formatFechaLargaBog,
  formatSincronizacionBog,
  nombreDeDiaBog,
  nombreDeMesBog,
} from '@/lib/domain/dates';
import { saludDelFeed, type ClaveDeEstadoDeFeed, type EstadoDeFeed } from '@/lib/domain/feeds';
import { cn } from '@/lib/utils';

import { EsqueletoDePanel } from '../../_components/EsqueletoDePanel';
import { EstadoVacio } from '../../_components/EstadoVacio';
import { FilaDeDato } from '../../_components/FilaDeDato';
import { GrupoDePanel } from '../../_components/GrupoDePanel';
import { PanelLectura } from '../../_components/PanelLectura';

/**
 * LA VISTA DE CALENDARIO DEL PANEL DE APARTAMENTO (08-UI-SPEC §8).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTO NO REEMPLAZA A NINGUNA PANTALLA. ES CONTENIDO DE LECTURA NUEVO.
 *
 * El ROADMAP decía que `/apartamentos/[id]/calendario` pasaba a panel. Medido,
 * esa pantalla es otra cosa: es la de APTO-12, con su campo de dirección del
 * feed, siete estados de validación en vivo, una guía de cuatro pasos con
 * capturas, duración máxima declarada, espera abortable de diez segundos y
 * ejecución en Node. Es una llamada de red asíncrona con siete desenlaces.
 *
 * **Y D8-4 lista otra cosa completamente distinta para el panel:** próximo
 * checkout, los checkouts del mes, y el estado del feed con su última
 * sincronización. Ninguna de esas tres está hoy en esa pantalla. Manda D8-1:
 * validar un feed contra la red no es *"información adicional sobre una
 * selección"*, igual que editar no lo es. **Esa pantalla se queda como página,
 * sin tocar**, y este archivo lee lo que ya está en la base.
 *
 * ── ES UNA VISTA DEL MISMO PANEL, NO UN SEGUNDO PANEL ───────────────────
 *
 * §1.2 descarta por nombre el panel apilado: dos velos, dos trampas de foco
 * anidadas y una tecla de escape que nadie sabe qué cierra. La alternancia va
 * por la dirección y no por pestañas, porque un estado en el cliente no sería
 * enlazable, no sobreviviría a un refresco, no se compartiría por chat y
 * contradiría D8-8 de frente.
 *
 * ── LA CREDENCIAL DEL CALENDARIO NO APARECE ACÁ, NI ENMASCARADA ─────────
 *
 * La dirección de exportación del feed es una credencial: un GET a ella revela
 * la ocupación completa del apartamento sin autenticarse. Su superficie de
 * lectura es la página de conexión, que ya la enmascara y tiene su propio
 * control con acción propia, y **D8-4 no la lista**. Duplicarla acá sería abrir
 * una segunda ruta a la misma credencial con la mitad de las salvaguardas.
 *
 * ── Y NINGÚN DATO DEL HUÉSPED ENTRA POR LA PUERTA DE ATRÁS ──────────────
 *
 * La tabla de reservas guarda un campo de texto libre que llega tal cual del
 * proveedor y arrastra dato personal. `lib/data/panel-apartamento.ts` lo
 * explica con detalle y **no lo nombra**, porque el guardarraíl 9 rompe el build
 * si aparece en cualquier archivo de aplicación, también en un comentario. Acá
 * pasa lo mismo: este panel pinta fechas, y fechas es todo lo que recibe.
 *
 * ── POR QUÉ ESTE ARCHIVO ES DE CLIENTE, QUE ES LA PREGUNTA RAZONABLE ────
 *
 * Por el chevron de volver, y solo por él: §8.2 pide **dos ramas** de
 * navegación (hacia atrás cuando el panel llegó desde la ficha, reemplazo
 * cuando se entró por dirección directa) y las dos necesitan el enrutador del
 * cliente. La alternativa era un archivo aparte, y entonces el enlace que tiene
 * que llevar la desactivación del salto de scroll (§5.2, la sexta ocurrencia de
 * la regla) viviría fuera de este archivo, que es justo donde se busca.
 *
 * La lectura sigue siendo del servidor: llega como promesa sin resolver y la
 * espera la barrera de suspensión de abajo, igual que en `PanelApartamento`.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE, Y VA POR NOMBRE ────────────────────────
 *
 *   1. **No deriva ninguna fecha.** El próximo checkout, la lista del mes y la
 *      distancia en días salen de `lib/domain/checkouts.ts`; los tres estados
 *      del feed, de `lib/domain/feeds.ts`; y las formas de pantalla, de
 *      `lib/domain/dates.ts`. Los tres tienen sus unitarios. En particular **no
 *      se construye ninguna fecha a partir de una cadena**: se parsea como
 *      tiempo universal y en Bogotá renderiza el día de antes, que acá sería
 *      anunciar el checkout un día temprano (§14.4 lo prohíbe por nombre).
 *   2. **No navega entre meses.** D8-4 lo excluye por nombre y §17.4 lo declara
 *      como deuda con su consecuencia escrita: los checkouts que caen en los
 *      primeros días del mes que viene no se ven desde acá aunque sean los
 *      próximos.
 *   3. **No escribe un segundo componente de estado vacío.** Lo prohíbe el
 *      contrato de la Fase 4, lo repite el de la 7, y el que existe ya sirve a
 *      ocho superficies con dos variantes.
 *   4. **No añade ningún icono fuera de la lista cerrada de §14.5.** Los cinco
 *      que usa (la flecha de volver, los dos de calendario y los dos de estado)
 *      están los cinco.
 *   5. No muta nada. Los cuatro paneles de la fase son de lectura.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El copy de §15.2, literal y en un solo sitio, para que comparar con el
 * contrato sea leer una lista y no recorrer un árbol de JSX. Es el patrón que
 * dejó `CodigoDeAccesoAdmin` en el plan 08-09.
 */
const COPY = {
  volver: 'Volver a la ficha',
  proximoCheckout: 'PRÓXIMO CHECKOUT',
  calendario: 'CALENDARIO',
  estado: 'Estado',
  sincronizacion: 'Última sincronización',
  /**
   * Sirve a los DOS vacíos del panel y es el único de §11.2 para esta
   * superficie. En el grupo 1 es literal: no queda ningún checkout por delante.
   * En el grupo 2 es el mes sin ninguno, que implica lo anterior.
   */
  sinCheckouts: 'No hay checkouts en lo que queda del mes.',
  conectar: 'Conectar calendario',
  cambiar: 'Cambiar calendario',
  vacioEncabezado: 'Sin calendario conectado.',
  vacioCuerpo:
    'Este apartamento no va a generar aseos automáticos hasta que conectes su calendario.',
} as const;

/**
 * Los tres estados del grupo `CALENDARIO` (§8.2), con su icono y su color.
 *
 * La CLAVE la decide `saludDelFeed()`, que tiene nueve casos unitarios y fija
 * el orden de evaluación. Acá solo se pinta: ni un condicional sobre la fila
 * del feed dentro del JSX, que es cómo la interfaz se desincroniza del dominio.
 *
 * El número de fallos entra en la etiqueta y sale de la misma derivación, así
 * que no hay que volver a la fila para componerla.
 */
const ESTADO_DEL_FEED: Record<
  ClaveDeEstadoDeFeed,
  { icono: LucideIcon; clase: string; etiqueta: (fallos: number) => string }
> = {
  sano: { icono: CircleCheck, clase: 'text-status-ok', etiqueta: () => 'Conectado' },
  'con-fallos': {
    icono: TriangleAlert,
    clase: 'text-status-warn',
    etiqueta: (fallos) => `${fallos} fallos seguidos`,
  },
  ausente: { icono: CalendarX, clase: 'text-muted-foreground', etiqueta: () => 'Sin conectar' },
};

/** Lo que la vista de calendario lee, ya en paralelo desde el anfitrión. */
export interface DatosDelCalendario {
  /** Las fechas de fin del mes corriente, crudas y ordenadas. */
  checkouts: string[];
  /** La fila de salud del feed, o `null` si no hay calendario conectado. */
  feed: FeedDeApartamento | null;
}

export function PanelCalendario({
  fila,
  hoy,
  mes,
  datos,
  rutaAlCerrar,
  rutaDeLaFicha,
}: {
  /** La fila que la página ya leyó. No se vuelve a la base por ella (§11.4). */
  fila: ApartamentoDeLista;
  /**
   * El día de negocio de Bogotá, **leído en el servidor** con `hoyBog()`.
   *
   * Llega por prop y no se lee del reloj acá por dos razones, y la segunda es
   * la que importa: el reloj del navegador es el del visitante, y un panel
   * renderizado en el servidor y luego hidratado con otro "hoy" produciría dos
   * árboles distintos para la misma dirección.
   */
  hoy: string;
  /** El mes corriente, `'YYYY-MM'`. El mismo con el que se leyó la base. */
  mes: string;
  /**
   * Los checkouts y el feed, **como promesa sin resolver**. Igual que en
   * `PanelApartamento`: la cabecera se pinta con el nombre real desde el primer
   * frame y solo el cuerpo espera, que es por lo que el esqueleto no lleva
   * cabecera en gris.
   */
  datos: Promise<DatosDelCalendario>;
  /** La dirección del anfitrión ya compuesta, sin los dos parámetros del panel. */
  rutaAlCerrar: string;
  /** La misma con el apartamento y **sin** la vista: la ficha de §7. */
  rutaDeLaFicha: string;
}) {
  return (
    <PanelLectura
      titulo={
        <span className="inline-flex items-center gap-sm">
          <VolverALaFicha rutaDeLaFicha={rutaDeLaFicha} />
          {fila.nombre}
        </span>
      }
      /*
        `Calendario · septiembre de 2026`. El mes es SIEMPRE el corriente y no
        hay forma de moverse a otro: D8-4 lo excluye por nombre. La composición
        con el año es la misma de `lib/domain/periodo.ts:143`, que es texto sobre
        dos piezas ya resueltas y no aritmética de calendario.
      */
      apoyo={`Calendario · ${nombreDeMesBog(hoy)} de ${hoy.slice(0, 4)}`}
      rutaAlCerrar={rutaAlCerrar}
      pie={
        /*
          §8.2. El label cambia según haya calendario o no, y la distinción sale
          del MISMO dato que usa el menú de la lista (`MenuApartamento.tsx:114`)
          en vez de inventar una segunda: así las dos superficies no pueden decir
          cosas distintas del mismo apartamento.

          Acá SÍ se sale de la lista, hacia la página de conexión, así que este
          enlace no lleva la desactivación del salto de scroll: no cambia los
          parámetros sobre la misma página, cambia de página.

          **No se esqueletiza** (§11.1 punto 3): es navegación, no depende del
          dato, y se pinta con su label real desde el primer frame.
        */
        <div className="flex flex-row justify-end">
          <Button variant="outline" render={<Link href={`/apartamentos/${fila.id}/calendario`} />}>
            <CalendarCheck aria-hidden="true" />
            {fila.tieneCalendario ? COPY.cambiar : COPY.conectar}
          </Button>
        </div>
      }
    >
      {/*
        LA BARRERA DE SUSPENSIÓN ES DEL PANEL, NO DEL SEGMENTO (INSTRUCCIÓN 4).
        Y **sin clave**: la del identificador va sobre el panel entero y la pone
        la página. Una clave derivada de los parámetros acá forzaría el remonte
        del subárbol y se llevaría por delante el filtro de la lista de detrás,
        que hoy sobrevive y sobrevive medido (INSTRUCCIÓN 3).

        La geometría típica: el próximo checkout es una línea, el mes trae unos
        cuatro checkouts, y el grupo del feed son dos filas.
      */}
      <Suspense fallback={<EsqueletoDePanel grupos={[1, 4, 2]} />}>
        <CuerpoDelCalendario fila={fila} hoy={hoy} mes={mes} datos={datos} />
      </Suspense>
    </PanelLectura>
  );
}

/**
 * El chevron de la cabecera, con **las dos ramas de §8.2**.
 *
 * ── POR QUÉ HAY DOS Y NO UNA ────────────────────────────────────────────
 *
 * El botón `Calendario` de la ficha abre con EMPUJE (§5.2), así que cuando el
 * panel llegó por ahí la entrada anterior del historial **es** la ficha, y
 * volver atrás la devuelve sin añadir una entrada nueva. Pero la dirección de
 * este panel es compartible por diseño (criterio 2 del ROADMAP): entrando por
 * un enlace pegado en un chat **no hay a dónde volver**, y un `back()` ahí
 * sacaría del producto. Por eso la segunda rama reemplaza hacia la ficha.
 *
 * ── CÓMO SE DISTINGUEN, SIN ADIVINAR ────────────────────────────────────
 *
 * Por la dirección con la que se CARGÓ EL DOCUMENTO. Una navegación de cliente
 * no crea una entrada de tiempos de navegación nueva, así que esa entrada dice
 * con qué dirección entró el navegador a esta pestaña. Si ya traía la vista de
 * calendario puesta, nadie navegó hasta acá y no hay ficha detrás.
 *
 * El caso que esto resuelve de más (entrar por dirección directa y llegar a
 * esta vista otra vez después de pasear) cae en la rama del reemplazo. Se pierde
 * una entrada de historial y **no se pierde el destino**, que es lo que importa.
 *
 * ── SIGUE SIENDO UN ENLACE DE VERDAD ────────────────────────────────────
 *
 * Con su `href` real, así que el teclado lo alcanza, el clic con modificador
 * abre en otra pestaña y sin JavaScript todavía lleva a la ficha. Y lleva
 * `scroll={false}` porque cambia los parámetros sobre la MISMA página: sin él
 * manda la lista de detrás al tope, exactamente igual que el enlace que abre
 * (§5.2, la sexta y última ocurrencia de la regla).
 */
function VolverALaFicha({ rutaDeLaFicha }: { rutaDeLaFicha: string }) {
  const router = useRouter();

  return (
    <Link
      href={rutaDeLaFicha}
      scroll={false}
      aria-label={COPY.volver}
      className="transicion shrink-0 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onClick={(evento) => {
        // El clic con modificador y el del botón secundario se dejan al
        // navegador: son "abrir en otra pestaña", y ahí el enrutador no pinta
        // nada.
        if (
          evento.defaultPrevented ||
          evento.metaKey ||
          evento.ctrlKey ||
          evento.shiftKey ||
          evento.altKey ||
          evento.button !== 0
        ) {
          return;
        }

        evento.preventDefault();

        if (llegoDesdeLaFicha()) router.back();
        else router.replace(rutaDeLaFicha, { scroll: false });
      }}
    >
      {/* 16px, y oculto al lector porque el nombre accesible lo pone la etiqueta. */}
      <ArrowLeft className="size-4" strokeWidth={2} aria-hidden="true" />
    </Link>
  );
}

/**
 * Si el documento se cargó en una dirección que **no** era esta vista, o sea si
 * alguien navegó hasta acá dentro de la aplicación. Ver `VolverALaFicha`.
 */
function llegoDesdeLaFicha(): boolean {
  const [entrada] = performance.getEntriesByType('navigation');
  if (entrada === undefined) return false;

  return new URL(entrada.name).searchParams.get('vista') !== 'calendario';
}

/** El cuerpo: lo único que espera al viaje de las dos lecturas. */
function CuerpoDelCalendario({
  fila,
  hoy,
  mes,
  datos,
}: {
  fila: ApartamentoDeLista;
  hoy: string;
  mes: string;
  datos: Promise<DatosDelCalendario>;
}) {
  const { checkouts, feed } = use(datos);

  /*
    EL VACÍO DE TODO EL PANEL (§11.2), Y LA CONDICIÓN ES QUE NO HAYA FILA DE
    FEED, no que el feed esté apagado.

    Sin fila no hay reservas que enseñar: las reservas cuelgan del feed, así que
    los tres grupos saldrían vacíos y un panel de tres vacíos no es un panel.
    Con la fila apagada sí hay historial que leer, y ese caso lo cuenta el grupo
    3 con su tercer estado, que es justamente el que §8.2 pide con su icono.

    Variante COMPACTA: el panel tiene 448px útiles, muy por encima de los 360 del
    carril lateral para los que se hizo.
  */
  if (feed === null) {
    return (
      <EstadoVacio
        compacto
        icono={CalendarX}
        encabezado={COPY.vacioEncabezado}
        cuerpo={COPY.vacioCuerpo}
        accion={
          <Button variant="outline" render={<Link href={`/apartamentos/${fila.id}/calendario`} />}>
            <CalendarCheck aria-hidden="true" />
            {COPY.conectar}
          </Button>
        }
      />
    );
  }

  // LAS TRES DERIVACIONES, LLAMADAS Y NO REIMPLEMENTADAS. `proximoCheckout`
  // barre y no supone la lista ordenada; `checkoutsDelMes` filtra por prefijo,
  // que es lo que no falla en febrero; y la distancia solo se pide con la salida
  // del primero, que es la única entrada con la que no lanza.
  const delMes = checkoutsDelMes(checkouts, mes);
  const proximo = proximoCheckout(delMes, hoy);
  const salud = saludDelFeed(feed);

  return (
    <>
      <GrupoDePanel encabezado={COPY.proximoCheckout} conSeparador>
        {proximo === null ? (
          <div>
            <dt className="sr-only">Próximo checkout</dt>
            <dd className="text-micro text-muted-foreground">{COPY.sinCheckouts}</dd>
          </div>
        ) : (
          <div>
            {/*
              `jueves 18 de septiembre`, compuesto de los dos formateadores que
              ya existen. Uno solo con día y fecha los junta con `", "` en es-CO,
              que no es el copy de §8.1. Mismo criterio que `PanelApartamento`.

              La FECHA es el término y la distancia su definición: acá el dato es
              la fecha, no un rótulo, así que `FilaDeDato` no sirve.
            */}
            <dt className="text-body font-semibold text-foreground">
              {`${nombreDeDiaBog(proximo)} ${formatFechaLargaBog(proximo)}`}
            </dt>
            <dd className="text-micro text-muted-foreground">
              {rotuloDeDistancia(distanciaHastaCheckout(proximo, hoy))}
            </dd>
          </div>
        )}
      </GrupoDePanel>

      {/*
        §8.3: A PARTIR DE DIEZ CHECKOUTS EL CUERPO SE DESPLAZA, y está bien.

        El umbral está medido: el contenido fijo son 237 píxeles y cada fila
        cuesta 29, así que sobre los 506 disponibles caben nueve. Un mes de un
        apartamento muy ocupado llega a quince. **No se pagina, no se corta con
        un `y N más` y no se pliega en un acordeón:** los checkouts del mes son
        la razón de existir de este panel, y la cabecera se queda fija, así que
        nunca se pierde de vista qué apartamento y qué mes se está mirando.
      */}
      <GrupoDePanel encabezado={`CHECKOUTS DE ${nombreDeMesBog(hoy).toUpperCase()}`} conSeparador>
        {delMes.length === 0 ? (
          <div>
            <dt className="sr-only">Checkouts del mes</dt>
            <dd className="text-micro text-muted-foreground">{COPY.sinCheckouts}</dd>
          </div>
        ) : (
          delMes.map((fecha, indice) => (
            /*
              La clave lleva el índice porque `checkoutsDelMes` NO deduplica a
              propósito: dos reservas que terminan el mismo día son dos
              checkouts el mismo día, y esconder uno sería una decisión de
              producto que nadie tomó.
            */
            <div key={`${fecha}-${indice}`}>
              <dt className="sr-only">Checkout</dt>
              <dd
                className={cn(
                  'text-body tabular-nums',
                  // El de hoy pesa 600; los ya pasados van atenuados. La
                  // comparación es lexicográfica sobre `'YYYY-MM-DD'`, donde el
                  // orden alfabético y el cronológico son el mismo orden.
                  fecha === hoy && 'font-semibold text-foreground',
                  fecha < hoy && 'text-muted-foreground',
                  fecha > hoy && 'text-foreground',
                )}
              >
                {formatDiaCortoBog(fecha)}
              </dd>
            </div>
          ))
        )}
      </GrupoDePanel>

      <GrupoDePanel encabezado={COPY.calendario}>
        <FilaDeDato etiqueta={COPY.estado} valor={<EstadoDelFeed salud={salud} />} />
        <FilaDeDato etiqueta={COPY.sincronizacion} {...filaDeSincronizacion(feed, hoy)} />
      </GrupoDePanel>
    </>
  );
}

/** Los tres rótulos de la línea de apoyo del próximo checkout (§15.2). */
function rotuloDeDistancia({ clave, dias }: DistanciaHastaCheckout): string {
  if (clave === 'hoy') return 'hoy';
  // `mañana` tiene clave propia y no es el caso de N a uno: `dentro de 1 días`
  // es agramatical. La concordancia se resuelve acá, que es donde vive el copy.
  if (clave === 'manana') return 'mañana';
  return `dentro de ${dias} días`;
}

/** El estado del feed con su icono, conmutando sobre la clave y nada más. */
function EstadoDelFeed({ salud }: { salud: EstadoDeFeed }) {
  const { icono: Icono, clase, etiqueta } = ESTADO_DEL_FEED[salud.clave];

  return (
    <span className={cn('inline-flex items-center gap-xs', clase)}>
      <Icono className="size-4 shrink-0" strokeWidth={2} aria-hidden="true" />
      {etiqueta(salud.fallos)}
    </span>
  );
}

/**
 * La última sincronización, que **sí es un instante** y por eso lleva hora.
 *
 * Es la distinción que sostiene todo este panel: el checkout es un día
 * calendario de negocio y se formatea sin hora; esto es un `timestamptz` de
 * verdad y se convierte a la hora de Bogotá.
 *
 * Sin marca, la ausencia es `sin definir` y no `no aplica`: un feed recién
 * conectado todavía no ha sincronizado, y eso se resuelve solo en la próxima
 * corrida del cron. `no aplica` diría que la base lo prohíbe, y no lo prohíbe.
 */
function filaDeSincronizacion(feed: FeedDeApartamento, hoy: string) {
  const texto = formatSincronizacionBog(feed.last_success_at, hoy);

  return texto === null
    ? ({ valor: null, ausencia: 'sin definir' } as const)
    : ({ valor: texto, cifra: true } as const);
}
