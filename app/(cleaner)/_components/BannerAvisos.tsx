'use client';

import { Bell, BellOff, CircleAlert, Smartphone, TriangleAlert } from 'lucide-react';
import { useCallback, useState } from 'react';

import { registrarSuscripcion } from '@/app/(cleaner)/_actions';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useEstadoDeAvisos } from '@/hooks/usarEstadoDeAvisos';
import type { ClaveEstadoAvisos, IconoEstadoAvisos } from '@/lib/domain/avisos';
import {
  aFormDataDeSuscripcion,
  esNavegadorEmbebido,
  plataformaVisible,
} from '@/lib/push/plataforma';
import { cn } from '@/lib/utils';

import { BotonActivarAvisos } from './BotonActivarAvisos';

/**
 * EL BANNER DE AVISOS (PWA-03, criterio 4 del ROADMAP, 05-UI-SPEC §7).
 *
 * Vive como PRIMER HIJO de `<main>` en `app/(cleaner)/layout.tsx`, encima del
 * `<h1>` de cada pagina. No es sticky, no es modal, no flota, NO ROBA EL FOCO al
 * montar ni al cambiar de estado, y no tiene animacion de entrada.
 *
 * ── LAS DOS REGLAS QUE DECIDEN COMO SE VE ───────────────────────────────────
 *
 * 1. **"Ya lo negué" NO SE PINTA DE ROJO** (§4.2). El token de las acciones que
 *    revocan o borran esta reservado a eso desde `02-UI-SPEC` §4.6, y aqui no se
 *    usa ni una vez. Dos razones, y la segunda es de producto: el aseador con el
 *    permiso bloqueado **no hizo nada malo** —o nunca se lo preguntaron, o toco
 *    "No permitir" en un dialogo del sistema que dura dos segundos— y pintarle
 *    una pantalla roja lo trata como un error. Hay un criterio de aceptacion que
 *    cuenta cero apariciones de ese token en todo el archivo, comentarios
 *    incluidos, y por eso este parrafo no lo nombra.
 *
 * 2. **Los dos estados que PWA-03 exige diferenciar comparten color** (§4.3), y
 *    se separan por los tres canales que si cargan significado: distinto ICONO
 *    (`Bell` contra `BellOff`), distinto TITULO y distinto CUERPO. Uno tiene
 *    ademas ACCION y el otro no, que es el cuarto canal.
 *
 * ── LO QUE EL BANNER DE PERMISO BLOQUEADO NO HACE, Y POR QUE (§7.4) ─────────
 *
 * · NO vuelve a pedir el permiso. Con el permiso ya bloqueado, esa llamada
 *   devuelve `denied` de inmediato y sin dialogo, y un boton que no produce nada
 *   visible se lee como app rota. La unica llamada de todo el arbol del aseador
 *   vive dentro del `onClick` de `BotonActivarAvisos`, y hay un criterio de
 *   aceptacion por grep que cuenta cero en ESTE archivo.
 * · NO dice "haz clic aquí para activar": no hay ningun clic que active nada
 *   desde dentro de la app.
 * · **YA NO DIFERENCIA POR SISTEMA OPERATIVO** (2026-09-18, quick `260918-h47`).
 *   Tenia dos ramas, iPhone y Android, y existian UNICAMENTE para enlazar al
 *   asistente de instalacion, que se elimino. Sin el, las dos decian lo mismo
 *   por caminos distintos: desde dentro de la app no hay ningun clic que
 *   desbloquee un permiso ya denegado, en ninguno de los dos sistemas. En iPhone
 *   la denegacion es irreversible sin reinstalar, y quien reinstala es el
 *   administrador; en Android la ruta por los ajustes del sistema nunca fue la
 *   que resolvio el caso en campo. La salida real es la misma para los dos y es
 *   una persona, asi que hoy es UN SOLO renglon sin plataforma y sin accion.
 *   Mantener dos cuerpos distintos seria conservar la ayuda diferenciada del
 *   asistente despues de borrar el asistente.
 *
 * ── MIENTRAS EL ESTADO NO SE SEPA, NO SE RENDERIZA NADA (§15.2) ────────────
 *
 * El banner no tiene estado de carga propio. Un banner que aparece medio segundo
 * despues de cargar y a veces se cae solo es peor que uno que aparece un poco
 * tarde.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// COPY — literal de §18.1, §7.2 a §7.6 y §15.3. No se reescribe.
// ═══════════════════════════════════════════════════════════════════════════════

const CUERPO_SIN_INSTALAR =
  'Desde el navegador no te llegan los avisos de aseo. Avísale a tu administrador para que te la instale en el teléfono.';

const CUERPO_NUNCA_PEDIDO =
  'Te avisamos apenas te asignen un aseo. Sin esto no te enteras.';

/** Uno solo, sin plataforma. Ver la cabecera: las dos ramas se fundieron. */
const CUERPO_NEGADO =
  'Los avisos están bloqueados en este teléfono y desde aquí no se pueden desbloquear. Avísale a tu administrador para que lo deje listo otra vez.';

const CUERPO_ROTO =
  'Este teléfono ya no está recibiendo los aseos. Tócalo para volver a conectarlo.';

/** §15.3: `subscribe()` fallo con el permiso ya concedido. Sin toast. */
const CUERPO_ROTO_TRAS_FALLO =
  'No se pudo conectar este teléfono. Vuelve a intentarlo. Si sigue sin funcionar, avísale a tu administrador.';

/** §7.5: la reconexion fallo OTRA VEZ. Va debajo del boton, no en el cuerpo. */
const APOYO_RECONEXION_FALLIDA =
  'No se pudo. Vuelve a intentarlo o avísale a tu administrador.';

const CUERPO_NO_SOPORTADO_IOS_VIEJO =
  'Tu iPhone necesita iOS 16.4 o más nuevo para recibir avisos. Habla con tu administrador.';

const CUERPO_NO_SOPORTADO_GENERICO = 'Habla con tu administrador.';

function cuerpoNavegadorEmbebido(navegador: string): string {
  return `Estás viendo VivaGuest dentro de otra aplicación. Toca el menú de arriba y elige "Abrir en ${navegador}".`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICONOS — la lista cerrada de §17.5, atada al tipo de `lib/domain/avisos.ts`
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * `Record` sobre la union y no un objeto suelto: si algun dia se anade un estado
 * con un icono nuevo, `tsc` rompe AQUI en vez de dejar un hueco que se
 * descubriria en el telefono de una aseadora.
 */
const ICONOS: Record<IconoEstadoAvisos, typeof Bell> = {
  Bell,
  BellOff,
  CircleAlert,
  Smartphone,
  TriangleAlert,
};

// ═══════════════════════════════════════════════════════════════════════════════
// EL COMPONENTE
// ═══════════════════════════════════════════════════════════════════════════════

/** Que hizo el aseador la ultima vez, para elegir entre §15.3 y §7.5. */
type Intento = 'ninguno' | 'activacion' | 'reconexion';

export function BannerAvisos({
  clavePublica,
  endpointRegistrado,
}: {
  /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, leida en el servidor y bajada como prop. */
  clavePublica: string;
  /** El endpoint que el servidor tiene registrado, o `null` si no hay ninguno. */
  endpointRegistrado: string | null;
}) {
  /**
   * Cambiarlo REMONTA la vista y con ella el hook, que vuelve a medir el estado
   * del navegador desde cero.
   *
   * Es la forma de "pide otra medicion" que no obliga a meter una dependencia
   * artificial en el efecto del hook, cuyas dependencias son su contrato.
   */
  const [medicion, setMedicion] = useState(0);

  /**
   * `Ahora no` (§7.3). Vive EN MEMORIA del cliente y no en el almacenamiento del
   * navegador: PWA-03 dice *persistente*, y una descarga que sobreviviera al
   * cierre de la app lo incumpliria. Vuelve al proximo arranque, que es
   * exactamente lo que el contrato pide.
   *
   * Vive en el componente de fuera a proposito: la remedicion remonta el de
   * dentro, y si viviera ahi se perderia en cada intento.
   */
  const [oculto, setOculto] = useState(false);

  const [intento, setIntento] = useState<Intento>('ninguno');

  return (
    <Vista
      key={medicion}
      clavePublica={clavePublica}
      endpointRegistrado={endpointRegistrado}
      oculto={oculto}
      intentoFallido={intento}
      alOcultar={() => setOculto(true)}
      alTerminar={(exito, modo) => {
        setIntento(exito ? 'ninguno' : modo);
        setMedicion((n) => n + 1);
      }}
    />
  );
}

function Vista({
  clavePublica,
  endpointRegistrado,
  oculto,
  intentoFallido,
  alOcultar,
  alTerminar,
}: {
  clavePublica: string;
  endpointRegistrado: string | null;
  oculto: boolean;
  intentoFallido: Intento;
  alOcultar: () => void;
  alTerminar: (exito: boolean, modo: Exclude<Intento, 'ninguno'>) => void;
}) {
  /**
   * Estable entre renders, que es lo que el hook exige de esta ranura: una
   * funcion escrita en el cuerpo del componente reiniciaria su efecto en cada
   * render. Es lo que refresca `visto_at` en el camino sano y lo que cierra la
   * reparacion silenciosa en el roto.
   */
  const registrar = useCallback(async (suscripcion: PushSubscriptionJSON | null) => {
    // `null` significa "este telefono se quedo sin suscripcion". La baja la
    // escribe otra action y no este camino; aqui no hay nada que registrar.
    if (suscripcion === null) return false;
    const resultado = await registrarSuscripcion(null, aFormDataDeSuscripcion(suscripcion));
    // SE MIRA EL `ok`, y esa es la mitad de cliente del bug de la migracion 22:
    // sin esta linea, un rechazo del servidor se presentaba como estado sano y
    // el aseador veia "todo al dia" sin tener a donde recibir un aviso.
    return resultado.ok;
  }, []);

  const estado = useEstadoDeAvisos({ clavePublica, endpointRegistrado, registrar });

  // §15.2. Todavia no se sabe: no se renderiza NADA. Ademas es lo que hace que
  // el render del servidor no toque el navegador, porque todo lo de abajo si lo
  // mira.
  if (estado === null) return null;

  // S5 `activo`. La union discriminada de `lib/domain/avisos.ts` hace que en
  // esta rama no haya ni icono ni titulo que pintar: lo impone `tsc`.
  if (!estado.banner) return null;

  if (estado.clave === 'nunca_pedido' && oculto) return null;

  const plataforma = plataformaVisible();
  const embebido = esNavegadorEmbebido();
  const contenido = contenidoDelBanner(estado.clave, plataforma, embebido, intentoFallido);

  // A una `const` local si la sigue el estrechamiento dentro de un callback; a
  // `contenido.accion` no, porque es una propiedad y TypeScript no puede
  // garantizar que nadie la reasigne entre el render y el click.
  const accion = contenido.accion;

  const Icono = ICONOS[estado.icono];

  return (
    <Alert
      // `region` y no `alert`: es una superficie de estado persistente, no un
      // anuncio puntual, y un `role="alert"` interrumpiria al lector de pantalla
      // en cada cambio.
      role="region"
      aria-label="Estado de los avisos"
      aria-live="polite"
      className={cn(
        'gap-md border-border p-lg',
        // `no_soportado` va en gris y NO en ambar A PROPOSITO (§7.6): no hay
        // nada que el aseador pueda hacer, y el ambar promete una accion que no
        // existe.
        estado.clave === 'no_soportado' ? 'bg-muted' : 'bg-surface-warn',
      )}
    >
      <Icono className={cn('size-5 shrink-0', estado.clase)} strokeWidth={2} aria-hidden="true" />

      <div className="flex flex-col gap-md">
        <div className="flex flex-col gap-sm">
          {/* El titulo ya dice lo que dice el icono, por eso el icono va oculto
              al lector de pantalla. */}
          <h2 className="text-heading-movil text-foreground">{estado.titulo}</h2>

          {/* `--foreground` y NO `--muted-foreground` (§7.1): este texto es la
              instruccion, no un apoyo. */}
          <p className="text-body-movil text-foreground">{contenido.cuerpo}</p>
        </div>

        {accion !== undefined && (
          <>
            <BotonActivarAvisos
              clavePublica={clavePublica}
              etiqueta={accion.etiqueta}
              reconectar={accion.reconectar}
              alTerminar={(exito) => alTerminar(exito, accion.modo)}
            />

            {/* §7.5: la reconexion fallo OTRA VEZ. El banner se queda y esta
                linea aparece DEBAJO del boton. Sin toast: el banner ya es la
                superficie de estado. */}
            {accion.modo === 'reconexion' && intentoFallido === 'reconexion' && (
              <p className="text-micro-movil text-muted-foreground">
                {APOYO_RECONEXION_FALLIDA}
              </p>
            )}
          </>
        )}

        {estado.clave === 'nunca_pedido' && (
          // `Ahora no` NO TOCA ABSOLUTAMENTE NADA DEL NAVEGADOR (§7.3). Solo
          // oculta el banner. Es la puerta por la que sale el que iba a denegar,
          // y en iPhone esa puerta le salva su unica oportunidad.
          <Button
            type="button"
            variant="ghost"
            onClick={alOcultar}
            className="min-h-toque w-full text-body-movil text-muted-foreground"
          >
            Ahora no
          </Button>
        )}
      </div>
    </Alert>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// EL CUERPO Y LA ACCION DE CADA ESTADO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * UNA SOLA FORMA, Y SIN DISCRIMINANTE (2026-09-18, quick `260918-h47`).
 *
 * Era una union de dos: esta, que dispara el boton, y una de enlace que
 * navegaba al asistente de instalacion. Al eliminarse el asistente, la forma de
 * enlace se quedo sin un solo caso que la produjera. Se borro entera, y con ella
 * el campo `tipo`: un discriminante sobre un unico miembro afirma que existe
 * otra forma, y ya no existe. Misma regla con la que 07-06 borro sus tres `.d.ts`
 * al implementarlos: el andamio que sobrevive a su motivo queda invisible y
 * muerto.
 */
type Accion = {
  etiqueta: string;
  reconectar: boolean;
  modo: Exclude<Intento, 'ninguno'>;
};

type Contenido = { cuerpo: string; accion?: Accion };

/**
 * Los cinco casos visibles de §7.2 a §7.6.
 *
 * SIN RAMA POR DEFECTO, misma regla que `derivarClaveDeAvisos()` en
 * `lib/domain/avisos.ts`: si algun dia la union de estados crece, `tsc` rompe
 * aqui en vez de dejar que el estado nuevo se pinte con el cuerpo del que un
 * `default` hubiera elegido.
 */
function contenidoDelBanner(
  clave: ClaveEstadoAvisos,
  plataforma: 'iphone' | 'android' | 'otro',
  embebido: boolean,
  intentoFallido: Intento,
): Contenido {
  switch (clave) {
    case 'activo':
      // Inalcanzable: el llamador corta antes, en el `if (!estado.banner)`, y
      // `activo` es la UNICA rama de la union sin banner. Se lanza en vez de
      // devolver una caja vacia por la misma razon que en `estadoDeAseo()`: un
      // banner en blanco encima de la pantalla del aseador no dice nada y no se
      // puede depurar, y este es el sitio donde se descubre que los dos tipos se
      // desalinearon.
      throw new Error('contenidoDelBanner: `activo` no renderiza banner (§5.1, S5)');

    case 'sin_instalar':
      // SIN ACCION. El estado es real —se llega por un link en una pestana del
      // navegador— y silenciarlo dejaria al aseador sin saber por que no recibe
      // nada. Pero no hay boton que sirva: este estado se deriva precisamente de
      // que la maquinaria de avisos no existe en esa pestana, asi que pedir el
      // permiso desde aqui es imposible. Queda el renglon que nombra la salida
      // real, que es el administrador.
      return { cuerpo: CUERPO_SIN_INSTALAR };

    case 'nunca_pedido':
      return {
        cuerpo: CUERPO_NUNCA_PEDIDO,
        accion: {
          etiqueta: 'Activar los avisos',
          reconectar: false,
          modo: 'activacion',
        },
      };

    case 'negado':
      // UN SOLO RETORNO, SIN MIRAR LA PLATAFORMA Y SIN ACCION. Ver la cabecera:
      // las dos ramas existian solo para enlazar al asistente.
      return { cuerpo: CUERPO_NEGADO };

    case 'roto':
      return {
        cuerpo: intentoFallido === 'ninguno' ? CUERPO_ROTO : CUERPO_ROTO_TRAS_FALLO,
        accion: {
          etiqueta: 'Reconectar los avisos',
          reconectar: true,
          modo: 'reconexion',
        },
      };

    case 'no_soportado': {
      // EL SUB-CASO MAS PROBABLE DE LOS TRES: el link del onboarding se manda
      // por WhatsApp, asi que la app se abre dentro de otra aplicacion mas veces
      // que en ningun otro sitio. Su instruccion cabe en un renglon y se resuelve
      // sin salir de donde esta, asi que el cuerpo se conserva. SIN ACCION: el
      // menu que hay que tocar es el de la otra aplicacion, no el nuestro.
      if (embebido) {
        const navegador = plataforma === 'android' ? 'Chrome' : 'Safari';
        return { cuerpo: cuerpoNavegadorEmbebido(navegador) };
      }

      // Instalada, iPhone y sin la maquinaria de avisos: es iOS anterior a 16.4,
      // que es la version en la que Apple la trajo. SIN BOTON: no hay nada que
      // el aseador pueda hacer desde aqui.
      if (plataforma === 'iphone') return { cuerpo: CUERPO_NO_SOPORTADO_IOS_VIEJO };

      return { cuerpo: CUERPO_NO_SOPORTADO_GENERICO };
    }
  }
}
