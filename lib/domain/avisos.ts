import { diaBog, formatFechaLargaBog, tiempoRelativo } from './dates';

/**
 * UNICA derivacion de estado de avisos del repo (05-UI-SPEC §5.1 y §5.2).
 *
 * Mismo patron y misma razon que `estadoDeAseo()` en `./cleanings` y que
 * `estadoDeApartamento()` en `./properties`: `05-UI-SPEC` §5.1 dice literal que la
 * derivacion vive en UNA SOLA FUNCION, porque duplicar el `if` en dos componentes es
 * como se desincroniza el banner de la realidad.
 *
 * ── ESTE MODULO ES PURO, Y AQUI ESO SIGNIFICA DOS COSAS ────────────────────────
 *
 * 1. No importa React, ni `lucide-react`, ni nada de `app/`. Devuelve NOMBRES de
 *    icono y etiquetas; quien los pinta es el componente. Misma regla que la
 *    cabecera de `./alertas`.
 * 2. Y una mas, propia de esta fase: NO LEE EL NAVEGADOR. Ni `window`, ni
 *    `navigator`, ni `Notification`. Todo el estado real entra POR PARAMETRO.
 *    Quien lo recoge es `lib/push/plataforma.ts`, que rompe la regla a proposito y
 *    por eso vive fuera de `lib/domain/`. Sin esa separacion, estos seis casos no
 *    se podrian probar sin un navegador, que es justo donde no se pueden probar.
 *
 * Hay un test que lee los imports de este archivo y falla si alguna de las dos se
 * rompe.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1/2 — EL ASEADOR: los seis casos de §5.1
// ─────────────────────────────────────────────────────────────────────────────

/** Los seis estados posibles del cliente. `activo` es el unico sin banner. */
export type ClaveEstadoAvisos =
  | 'no_soportado'
  | 'sin_instalar'
  | 'nunca_pedido'
  | 'negado'
  | 'roto'
  | 'activo';

/**
 * Los cinco iconos de la lista cerrada de §17.5 que usa esta derivacion.
 *
 * Union de literales y no `string`, misma razon que en `./cleanings`: con `string`,
 * el dia que alguien escriba un nombre que lucide no exporta el error saldria en el
 * navegador y no en `tsc`. Los cinco estan verificados contra `lucide-react@1.39.0`.
 */
export type IconoEstadoAvisos =
  | 'CircleAlert'
  | 'Smartphone'
  | 'Bell'
  | 'BellOff'
  | 'TriangleAlert';

/** Los tres valores de `Notification.permission`. */
export type PermisoDeAvisos = 'default' | 'granted' | 'denied';

/**
 * El estado real del navegador, recogido por `lib/push/plataforma.ts` y por el hook
 * `hooks/usarEstadoDeAvisos.ts`. ABSOLUTAMENTE TODO entra por aqui.
 */
export type EntradaEstadoAvisos = {
  /** `display-mode: standalone`, o el indicador heredado de Safari. */
  instalada: boolean;
  soportaServiceWorker: boolean;
  soportaPushManager: boolean;
  /** En una pestana de Safari iOS es `false`, y ese es el feature detect de S1. */
  soportaNotification: boolean;
  permiso: PermisoDeAvisos;
  haySuscripcion: boolean;
  /** El `endpoint` de la suscripcion viva coincide con el registrado en el servidor. */
  endpointCoincide: boolean;
  /** La reparacion silenciosa YA se intento y fallo. Sin esto, S4 no se muestra. */
  reparacionFallida: boolean;
};

/**
 * La presentacion del banner, o la ausencia de banner.
 *
 * Es una union discriminada por `banner` y no un objeto con campos opcionales, y esa
 * decision es la que implementa "S5 no se renderiza banner" EN EL TIPO: en la rama
 * `activo` no hay ni icono ni titulo que pintar, asi que un componente no puede
 * renderizar una caja vacia ni por descuido. `tsc` lo impide.
 */
export type PresentacionEstadoAvisos =
  | { banner: false }
  | { banner: true; icono: IconoEstadoAvisos; titulo: string; clase: string };

/** Discriminante tipado que consume el banner (§7). */
export type EstadoAvisos = { clave: ClaveEstadoAvisos } & PresentacionEstadoAvisos;

/**
 * Iconos, titulos y color, de §7.2 a §7.6. Los titulos son los del contrato,
 * verbatim.
 *
 * `no_soportado` es el unico cuyo titulo NO esta escrito como titulo en §7.6: ese
 * apartado da tres cuerpos distintos segun el sub-caso (iOS viejo, navegador
 * embebido, cualquier otro) y ninguno de los tres es el titulo. Se usa la primera
 * oracion del cuerpo generico, y el cuerpo concreto lo elige el componente con
 * `esNavegadorEmbebido()`.
 *
 * El color viaja como CLASE de Tailwind y no como token CSS crudo, misma razon que
 * en `./cleanings`: para que el consumidor no tenga que traducir el token a clase.
 * `no_soportado` va en gris y no en ambar A PROPOSITO (§7.6): no hay nada que el
 * aseador pueda hacer, y el ambar promete una accion que no existe.
 *
 * Exportado porque los tests recorren el mapa entero para afirmar que hay
 * exactamente seis entradas; es la misma tecnica que usa `./alertas`.
 */
export const PRESENTACION_AVISOS: Record<ClaveEstadoAvisos, PresentacionEstadoAvisos> = {
  no_soportado: {
    banner: true,
    icono: 'CircleAlert',
    titulo: 'Este teléfono no puede recibir avisos',
    clase: 'text-muted-foreground',
  },
  sin_instalar: {
    banner: true,
    icono: 'Smartphone',
    titulo: 'Instala VivaGuest en tu teléfono',
    clase: 'text-status-warn',
  },
  nunca_pedido: {
    banner: true,
    icono: 'Bell',
    titulo: 'Activa los avisos de aseo',
    clase: 'text-status-warn',
  },
  negado: {
    banner: true,
    icono: 'BellOff',
    titulo: 'Los avisos están bloqueados en este teléfono',
    clase: 'text-status-warn',
  },
  roto: {
    // `TriangleAlert` y NO `BellOff` (§7.5): es una falla, no un estado de permiso.
    banner: true,
    icono: 'TriangleAlert',
    titulo: 'Los avisos dejaron de funcionar',
    clase: 'text-status-warn',
  },
  activo: { banner: false },
};

/**
 * Deriva el estado de los avisos del aseador.
 *
 * EL ORDEN DE EVALUACION ES PARTE DE LA REGLA, igual que en `estadoDeAseo()`: S1 se
 * mira ANTES que S0. Los dos se ven igual desde el codigo (falta `Notification`) y lo
 * unico que los separa es si la app esta instalada. Invertir el orden manda a una
 * aseadora con una pestana de Safari abierta a "habla con tu administrador" cuando lo
 * unico que le falta es anadir un icono a la pantalla de inicio.
 */
export function estadoDeAvisos(e: EntradaEstadoAvisos): EstadoAvisos {
  const clave = derivarClaveDeAvisos(e);
  return { clave, ...PRESENTACION_AVISOS[clave] };
}

function derivarClaveDeAvisos(e: EntradaEstadoAvisos): ClaveEstadoAvisos {
  // S1 primero, por lo que dice la cabecera de `estadoDeAvisos()`.
  if (!e.instalada && !e.soportaNotification) return 'sin_instalar';

  // S0: la maquinaria falta de verdad. Con la app instalada esto ya no es una
  // instalacion pendiente, es un telefono que no puede.
  if (!e.soportaServiceWorker || !e.soportaPushManager || !e.soportaNotification) {
    return 'no_soportado';
  }

  // Sin rama por defecto A PROPOSITO, misma regla que `derivarClave()` de
  // `./cleanings`: el `switch` es exhaustivo sobre los tres valores de
  // `Notification.permission`, y si algun dia esa union crece, `tsc` rompe aqui con
  // TS2366 en vez de dejar que el valor nuevo se renderice como el que un `default`
  // hubiera elegido.
  switch (e.permiso) {
    case 'default':
      return 'nunca_pedido';
    case 'denied':
      return 'negado';
    case 'granted': {
      if (e.haySuscripcion && e.endpointCoincide) return 'activo';

      // S4 NUNCA SE MUESTRA DE ENTRADA (§5.1). Mientras la reparacion silenciosa no
      // haya fallado no hay veredicto que dar, y el unico caso sin banner es
      // `activo`: es la forma de decir "todavia no hay nada que mostrar" con el
      // vocabulario de seis estados que el contrato fija.
      //
      // No es una mentira que se quede: el hook AWAITA la reparacion antes de
      // componer la entrada, asi que en el camino real esta rama no se alcanza con
      // una suscripcion rota y viva a la vez; y mientras la primera medicion no
      // termina, el hook mantiene su estado en `null` y no renderiza nada (§15.2).
      // Es la rama defensiva de la ventana en vuelo, y por eso hay un test con ese
      // nombre exacto.
      return e.reparacionFallida ? 'roto' : 'activo';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2/2 — EL ADMIN: los tres casos de §5.2
// ─────────────────────────────────────────────────────────────────────────────

/** Los tres estados que el admin ve sobre un aseador ACTIVO. */
export type ClaveEstadoAvisosAseador = 'activos' | 'sin_probar' | 'sin_avisos';

/** Los tres iconos de §5.2, de la lista cerrada de §17.5. */
export type IconoEstadoAvisosAseador = 'BellRing' | 'Bell' | 'BellOff';

/**
 * Exactamente lo que `public.estado_avisos_aseadores()` devuelve para un aseador,
 * mas `is_active`.
 *
 * Las cinco marcas van como `string | null` aunque `lib/database.types.ts` las declare
 * `string` a secas: la RPC las calcula con `max()` y `min()` sobre un `left join`, asi
 * que la fila del aseador sin telefono las trae nulas. El generador de tipos de
 * Supabase no marca la nulabilidad de una funcion que devuelve tabla; la base si.
 * `is_active` no sale de la RPC (que ya filtra por activo) sino de la lista de
 * aseadores con la que la pantalla la cruza.
 */
export type EntradaEstadoAvisosAseador = {
  is_active: boolean;
  suscripciones_vivas: number;
  /** `bool_or(verificacion_grado = 'toque')`: con dos telefonos basta que uno lo sea. */
  verificado_por_toque: boolean;
  primera_suscripcion_at: string | null;
  ultima_verificacion: string | null;
  ultimo_visto: string | null;
  ultimo_exito: string | null;
};

/**
 * Discriminante tipado de la columna `AVISOS` de `/aseadores` (§11.1).
 *
 * `sin_estado` NO es un cuarto estado: es la ausencia de estado. Un aseador inactivo
 * pinta una raya (§15.1) y su telefono ya no importa. Va como rama propia de la union
 * —y fuera del mapa de presentacion, que tiene exactamente tres entradas— para que un
 * componente no pueda leerle un icono ni una etiqueta que no existen.
 */
export type EstadoAvisosAseador =
  | { clave: 'sin_estado' }
  | {
      clave: ClaveEstadoAvisosAseador;
      icono: IconoEstadoAvisosAseador;
      etiqueta: string;
      clase: string;
    };

/**
 * Icono, etiqueta y color de los tres, §5.2.
 *
 * NUNCA COLOR SOLO: icono de forma distinta + etiqueta + color, los tres. Es la misma
 * regla de §5.2 y la que hace que una captura en escala de grises siga distinguiendo
 * los estados.
 *
 * `sin_probar` va en `idle` y NO en `warn`, y eso no es un matiz cosmetico: no es un
 * error, es "hay a donde enviar, pero nadie comprobo que llegue". Pintarlo de ambar
 * lo igualaria con `sin_avisos`, que si es el aseador que se queda mudo.
 */
export const PRESENTACION_AVISOS_ASEADOR: Record<
  ClaveEstadoAvisosAseador,
  { icono: IconoEstadoAvisosAseador; etiqueta: string; clase: string }
> = {
  activos: { icono: 'BellRing', etiqueta: 'Activos', clase: 'text-status-ok' },
  sin_probar: { icono: 'Bell', etiqueta: 'Sin probar', clase: 'text-status-idle' },
  sin_avisos: { icono: 'BellOff', etiqueta: 'Sin avisos', clase: 'text-status-warn' },
};

/**
 * Deriva lo que el admin ve sobre un aseador.
 *
 * LA REGLA QUE SOSTIENE §8.6: `Activos` exige verificacion POR TOQUE. Una
 * confirmacion a mano ("Ya sonó, no alcancé a tocarlo") deja al aseador en
 * `Sin probar`. Si no se distinguieran, ese boton seria un atajo para saltarse la
 * unica verificacion de la fase. La otra mitad de esa garantia no esta aqui: la
 * impone la migracion 16 quitandole al aseador el `grant update` de tabla sobre
 * `push_subscriptions` y dejando la evidencia en manos de tres funciones
 * `security definer`.
 */
export function estadoDeAvisosDeAseador(e: EntradaEstadoAvisosAseador): EstadoAvisosAseador {
  const clave = derivarClaveDeAseador(e);
  if (clave === 'sin_estado') return { clave };
  return { clave, ...PRESENTACION_AVISOS_ASEADOR[clave] };
}

function derivarClaveDeAseador(
  e: EntradaEstadoAvisosAseador,
): ClaveEstadoAvisosAseador | 'sin_estado' {
  if (!e.is_active) return 'sin_estado';

  if (e.suscripciones_vivas < 0) {
    // Inalcanzable: la RPC lo calcula con `count(s.id)::int` sobre un `left join`, y
    // un conteo no puede ser negativo. Se lanza en vez de inventar una clave por la
    // misma razon que en `estadoDeAseo()`: un badge que miente sobre si a un aseador
    // le suena el telefono es peor que una pantalla que se cae, porque la promesa
    // del producto es que ningun aseo se pierda y ESTA es la pantalla donde el admin
    // descubre quien se quedo mudo.
    throw new Error(
      'estadoDeAvisosDeAseador: suscripciones_vivas negativo, no puede venir de count()',
    );
  }

  if (e.suscripciones_vivas === 0) return 'sin_avisos';

  // ── `activos` QUEDO INALCANZABLE EL 2026-09-18, Y ESTA ESCRITO A PROPOSITO ──
  //
  // El quick `260918-h47` elimino el asistente de instalacion, y con el la unica
  // superficie de TypeScript que llamaba a las tres funciones de la migracion 16
  // —`registrar_prueba_de_aviso`, `confirmar_prueba_por_toque` y
  // `confirmar_prueba_a_mano`— que son lo unico en todo el sistema que escribe
  // `verificacion_grado`, la columna de la que sale `verificado_por_toque`.
  //
  //   (a) EL TECHO DE HOY ES `Sin probar` para cualquier aseador con telefono
  //       registrado. Ningun camino vivo puede llevarlo a `Activos`.
  //   (b) NO ES UN DEFECTO, y este es el punto que hay que leer antes de
  //       "arreglarlo": el significado literal de `Sin probar` es *hay a donde
  //       enviar, pero nadie comprobo que llegue*, y a partir de hoy eso es
  //       exactamente cierto para todos. La etiqueta no miente.
  //   (c) LA SENAL QUE EL PRODUCTO NECESITA DE VERDAD ES `sin_avisos`, que es
  //       quien se quedo mudo. No depende de la prueba para nada, se deriva de
  //       `suscripciones_vivas = 0`, y sigue siendo exacta.
  //   (d) LA CAPACIDAD ESTA DORMIDA EN LA BASE, NO DESTRUIDA. La migracion 16 no
  //       se toco: las tres funciones, el token de un solo uso, su indice unico y
  //       el CHECK siguen ahi. Se recupera escribiendo superficie nueva que las
  //       llame, SIN ninguna migracion.
  //
  // La rama se conserva por eso: borrarla obligaria a una migracion para volver.
  return e.verificado_por_toque ? 'activos' : 'sin_probar';
}

/**
 * El texto del `title` de la celda (§5.2).
 *
 * Vive aqui y no en el componente porque interpola FECHAS, y las fechas de este
 * proyecto se formatean en `./dates`, nunca construyendo un `Date` en el sitio de
 * uso. `ahoraMs` entra por parametro y no se lee `Date.now()` dentro, misma regla que
 * `tiempoRelativo()`: una funcion que lee el reloj no se puede probar.
 *
 * Devuelve `null` cuando no hay nada honesto que decir —aseador inactivo, o un estado
 * con suscripciones pero sin fecha de alta— en vez de rellenar. Misma regla que
 * `tiempoRelativo()`: inventar un valor seria peor que no decir nada.
 *
 * NOTA DE COPY, anotada porque se ve al comparar con el contrato: §5.2 ilustra la
 * segunda frase con `hace 3 días`, y `tiempoRelativo()` no tiene ese escalon (salta de
 * `hace 3 h` a `ayer 14:20` y de ahi a `1 sep 14:20`). Esa escala la fijo
 * `04-UI-SPEC` §13 y cambiarla seria una modificacion de aquel contrato, no de este
 * archivo. Se usa el formateador del repo.
 */
export function tituloDeEstadoDeAvisos(
  e: EntradaEstadoAvisosAseador,
  ahoraMs: number,
): string | null {
  const clave = derivarClaveDeAseador(e);

  if (clave === 'sin_estado') return null;
  if (clave === 'sin_avisos') return 'No hay ningún teléfono registrado.';

  const dia = diaBog(e.primera_suscripcion_at);
  if (dia === null) return null;
  const fecha = formatFechaLargaBog(dia);

  if (clave === 'sin_probar') {
    return `Se registró el teléfono el ${fecha}, pero la prueba nunca llegó.`;
  }

  const visto = tiempoRelativo(e.ultimo_visto, ahoraMs);
  return visto === null
    ? `Activos desde el ${fecha}.`
    : `Activos desde el ${fecha}. Última vez que abrió la app: ${visto}.`;
}
