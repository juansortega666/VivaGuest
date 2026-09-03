/**
 * El umbral de "la sincronizacion esta caida", como funcion pura.
 *
 * ESTO ES TRES LINEAS DE CODIGO Y ES LA UNICA CAPA DEL SISTEMA QUE NO ES CIEGA
 * A SU PROPIA MUERTE. El razonamiento va aqui arriba entero, porque es la parte
 * mas honesta del diseno de la fase y la mas facil de borrar por parecer
 * trivial.
 *
 * EL PROBLEMA. La Fase 3 monta el motor de sincronizacion sobre `pg_cron`: un
 * job cada minuto despacha los feeds vencidos y un job cada hora
 * (`feed_health_watchdog`) alerta de los que dejaron de responder. Ese watchdog
 * cubre bien lo que puede cubrir —el job corre y los feeds fallan— y no cubre
 * en absoluto el caso que importa:
 *
 *   **Si `pg_cron` deja de correr, el watchdog agendado en `pg_cron` tampoco
 *   corre.** Ningun vigilante que viva dentro del scheduler puede ver la muerte
 *   del scheduler.
 *
 * Y subirlo un nivel no lo arregla: un segundo job que vigile al primero muere
 * con el primero, porque los dos dependen del mismo proceso. No hay solucion
 * dentro de la base, y fingir que la hay es peor que no tenerla.
 *
 * LA SOLUCION, Y ES GRATIS. La alerta se computa AL LEER, en el panel de la
 * Fase 4, sobre datos que ya existen:
 *
 *   select max(last_success_at) from public.calendar_feeds where is_active;
 *
 * Si el mas reciente de TODOS los feeds activos tiene mas de tres horas, el
 * panel pinta "sincronizacion caida". **Se dispara aunque no corra
 * absolutamente nada dentro de la base**, porque lo calcula la pagina que el
 * admin abre de todas formas. Cero infraestructura, cero coste, y es imposible
 * que sea ciega a su propia caida porque no depende de ejecutarse
 * periodicamente: no es un vigilante, es una lectura.
 *
 * EL HUECO RESIDUAL, DECLARADO Y NO TAPADO: si el admin no abre el panel, nadie
 * se entera. Para un producto que el admin mira varias veces al dia es
 * aceptable, y hay que decirlo en vez de fingir que esta cubierto. Lo cerraria
 * un dead man's switch externo pingado desde el dispatcher; queda registrado
 * como idea diferida, fuera del MVP.
 *
 * LAS DOS CAPAS NO SON REDUNDANTES. `feed_health_watchdog` ve "el job corre y
 * un feed concreto falla", con `property_id` y todo, y lo dice en una
 * notificacion. Esta funcion ve "no corre nada", y no puede decir cual feed
 * porque no es un feed. Coberturas distintas, las dos hacen falta.
 *
 * LA PANTALLA ES DE LA FASE 4. Lo que este modulo entrega es el umbral y su
 * significado; quien lo pinta es el panel.
 */

/**
 * Tres horas. Es el mismo numero que usa `feed_health_watchdog` en la migracion
 * 14, y tiene que seguir siendolo: dos umbrales distintos para la misma
 * pregunta producen el peor de los estados, el panel en verde mientras la
 * bandeja tiene una alerta roja (o al reves).
 *
 * De donde sale: la cadencia normal de un feed sano es de 30 a 31 minutos, y
 * Airbnb reemite el mismo cuerpo cada ~3 h. Tres horas son casi seis ciclos
 * perdidos seguidos, asi que no lo dispara ni un despliegue de Vercel, ni un
 * reinicio de la base, ni una racha de 500 del proveedor con el backoff en su
 * techo de 60 minutos.
 */
export const UMBRAL_SYNC_CAIDA_MS = 3 * 60 * 60 * 1000;

export type EstadoDeSincronizacion = 'sana' | 'caida';

/**
 * Decide si la sincronizacion del sistema entero esta sana o caida.
 *
 * @param maxLastSuccessAt La marca de tiempo mas reciente de `last_success_at`
 *   entre TODOS los feeds activos, tal como sale de la base. `null` cuando no
 *   hay feeds activos o cuando ninguno sincronizo nunca.
 * @param ahoraMs El instante actual en milisegundos. **Entra por parametro y no
 *   se lee del reloj**: es lo que hace que la funcion sea determinista y que su
 *   comportamiento en el borde se pueda medir sin congelar el tiempo global.
 *
 * No instancia ningun tipo temporal para decidir: compara dos numeros. La zona
 * horaria del proceso no participa, que es la propiedad que el test bajo
 * `TZ=America/Bogota` comprueba.
 */
export function estadoDeSincronizacion(
  maxLastSuccessAt: string | null,
  ahoraMs: number,
): EstadoDeSincronizacion {
  if (maxLastSuccessAt === null) return 'caida';

  // `Date.parse` sobre una marca con desfase explicito es independiente de la
  // zona del proceso. Devuelve `NaN` cuando el texto no es interpretable, y ese
  // caso se trata abajo.
  //
  // LAS DOS NORMALIZACIONES SON NECESARIAS Y LAS DOS SE MIDIERON, la segunda
  // en rojo durante este mismo plan:
  //
  //   1. El separador. Postgres escribe `'2026-09-02 16:00:00+00'` con espacio;
  //      PostgREST devuelve `'2026-09-02T16:00:00+00:00'` con `T`.
  //   2. **El desfase de dos digitos.** Postgres escribe `+00`, y eso NO es
  //      ISO 8601: `Date.parse('2026-09-02T16:00:00+00')` devuelve `NaN`. Con
  //      la primera normalizacion sola, la forma de `psql` caia en la rama de
  //      "ilegible" y se leia como CAIDA con el sistema perfectamente sano. Es
  //      una falsa alarma permanente en el panel, y solo aparecio porque el
  //      test lleva las dos formas.
  const marcaMs = Date.parse(
    maxLastSuccessAt.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'),
  );

  // FALLA CERRADO. Una marca ilegible es una senal de que algo va mal, y el
  // modo seguro es alertar de mas. Escrito como `marcaMs >= corte ? 'sana' :
  // 'caida'` esto se leeria "sana", porque toda comparacion con NaN da false, y
  // el panel pintaria verde justo cuando la lectura esta rota.
  if (Number.isNaN(marcaMs)) return 'caida';

  return ahoraMs - marcaMs > UMBRAL_SYNC_CAIDA_MS ? 'caida' : 'sana';
}
