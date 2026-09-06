import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';
import { diaBog } from '@/lib/domain/dates';

/**
 * EL HISTORIAL DE UN APARTAMENTO: SUS ASEOS Y SUS DAÑOS, EN UNA SOLA LISTA
 * (DASH-06, REPORT-04).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DOS CONSULTAS, UNA LISTA. Y LA MEZCLA ES LO QUE HAY QUE PROBAR.
 *
 * `cleanings` y `damages` son dos tablas y no hay forma de traerlas en una sola
 * consulta de PostgREST sin colgar una de la otra, que es justo lo que no se
 * quiere: un daño se reporta DENTRO de un aseo (`damages.cleaning_id` es NOT
 * NULL), pero en la ficha del apartamento son dos hechos hermanos en la línea de
 * tiempo, no uno anidado en el otro.
 *
 * El error natural al pegar dos listas que ya vienen ordenadas es concatenarlas.
 * `[...aseos, ...danos]` deja todos los aseos arriba y todos los daños abajo, y
 * la pantalla dice que un daño de hoy es más viejo que un aseo del mes pasado.
 * Por eso `mezclarHistorial()` está exportada aparte y es pura: ahí es donde
 * viven las aserciones que fijan el orden.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LOS DAÑOS RESUELTOS NO SE FILTRAN, Y HAY QUE DEJARLO ESCRITO ───────────
 *
 * `damages_open_idx` (migración 04) es un índice PARCIAL:
 *
 *     create index damages_open_idx on public.damages (property_id, created_at desc)
 *       where resolved_at is null;
 *
 * Quien lea el schema para escribir esta consulta va a querer copiar ese
 * predicado, porque es lo que la haría usar el índice. NO SE HACE. El historial
 * es completo por definición: un daño resuelto sigue siendo parte de la historia
 * del apartamento, y esconderlo convierte "esta unidad se rompe cada mes" en
 * "esta unidad no se rompe nunca", que es exactamente el dato con el que se
 * decide si vale la pena seguir operándola. Un daño resuelto se marca, no se
 * oculta (04-UI-SPEC.md §14).
 *
 * Consecuencia asumida: esta consulta NO usa `damages_open_idx`, usa
 * `damages_cleaning_idx` o un seq scan. Con retención de seis meses y decenas de
 * aseos al día son unas pocas decenas de filas por apartamento.
 *
 * ── LOS EMBEDS VAN CALIFICADOS POR NOMBRE DE CLAVE FORÁNEA ─────────────────
 *
 * `damages` tiene DOS claves foráneas hacia `profiles` (`damages_reported_by_fkey`
 * y `damages_resolved_by_fkey`) y `cleanings` tiene otras dos (`aseador_id` y
 * `confirmado_by`). Un embed `profiles(...)` sin calificar es ambiguo y PostgREST
 * responde `PGRST201` EN TIEMPO DE EJECUCIÓN: `lib/database.types.ts` tipa el
 * embed pero no ve la ambigüedad, así que el fallo aparece la primera vez que un
 * admin abre una ficha. Lo mide `historial.integration.test.ts`.
 *
 * ── EL CLIENTE LLEGA POR PARÁMETRO ────────────────────────────────────────
 *
 * Igual que en `lib/data/apartamentos.ts` y `lib/data/operacion.ts`. Así la misma
 * función sirve a un RSC (con el JWT del admin, filtrada por `damages_admin_all`
 * y `cleanings_admin_all`) y a un test de integración con el JWT que se quiera
 * probar. NADA DE CLIENTE DE SERVICIO (T-04-06): `damages` tiene `grant select`
 * para `authenticated` desde la Fase 1 y `damages_admin_all` ya deja ver todo al
 * admin, así que saltar la RLS no haría falta ni aunque estuviera permitido.
 * `scripts/ci/check-service-role.sh` lo vigila.
 *
 * NADA DE CACHE, misma regla que el resto de `lib/data/`: son datos por usuario y
 * una entrada compartida se le sirve a otro.
 */

/**
 * El tamaño del bloque de paginación (04-UI-SPEC.md §14).
 *
 * La retención del proyecto es de SEIS MESES, así que la lista tiene un techo
 * natural: no hace falta virtualizar ni una paginación con cursor. Treinta
 * entradas y un `Ver 30 más`.
 */
export const BLOQUE_HISTORIAL = 30;

/** Un perfil resuelto por embed: lo mínimo que la fila pinta. */
export interface PerfilDeHistorial {
  id: string;
  full_name: string;
}

/**
 * Un aseo tal como lo pinta la fila del historial.
 *
 * Las columnas son exactamente las que la sección usa: las tres que necesita
 * `estadoDeAseo()` (`is_managed`, `state`, `confirmado_at`), la fecha de negocio,
 * el tipo y `created_at` para desempatar dentro del mismo día. Ni `hora_limite`
 * ni `num_huespedes` ni las de dinero: el historial no las muestra.
 */
export type AseoDeHistorial = Pick<
  Tables<'cleanings'>,
  'id' | 'scheduled_date' | 'state' | 'tipo' | 'is_managed' | 'confirmado_at' | 'created_at'
> & {
  /** `null` en gestión externa y en los aseos que todavía no se han asignado. */
  aseador: PerfilDeHistorial | null;
};

/**
 * Un daño reportado tal como lo pinta la fila del historial.
 *
 * `resolved_at` viaja SIEMPRE, y no como filtro: es lo que decide el sufijo
 * ` · Resuelto` de la línea 2. `resolved_by` y `nota_admin` no vienen porque la
 * sección no los muestra y esta fase no los escribe.
 */
export type DanoDeHistorial = Pick<
  Tables<'damages'>,
  'id' | 'descripcion' | 'created_at' | 'resolved_at'
> & {
  /**
   * Quién lo reportó. En la Fase 6 será un aseador; hoy la tabla está vacía.
   * `null` si la RLS no dejó resolver el perfil.
   */
  reportadoPor: PerfilDeHistorial | null;
};

/**
 * Una entrada de la línea de tiempo. TIPO DISCRIMINADO, no un objeto con las dos
 * mitades opcionales.
 *
 * La alternativa —`{ aseo?, dano? }`— obliga a la UI a comprobar cuál de las dos
 * vino en cada fila, y el día que las dos vengan vacías se renderiza una fila en
 * blanco sin que nada falle. Con la unión discriminada ese estado no se puede
 * escribir, y `tsc` obliga a cubrir las dos ramas al pintar.
 *
 * `id` es el de la fila de origen y sirve de `key` de React: los uuid de
 * `cleanings` y de `damages` no colisionan.
 */
export type EntradaDeHistorial =
  | {
      clase: 'aseo';
      id: string;
      /** El día de negocio al que pertenece, `'YYYY-MM-DD'`. Es lo que se pinta. */
      fecha: string;
      /** El instante que desempata dentro del mismo día. No se muestra. */
      instante: string;
      aseo: AseoDeHistorial;
    }
  | {
      clase: 'dano';
      id: string;
      fecha: string;
      instante: string;
      dano: DanoDeHistorial;
    };

/** Un bloque del historial, con lo que la sección necesita para el pie. */
export interface Historial {
  entradas: EntradaDeHistorial[];
  /** Hay al menos una entrada más allá de este bloque: se pinta `Ver 30 más`. */
  hayMas: boolean;
  /** El desplazamiento con el que se pidió. Lo usa el enlace del pie. */
  desplazamiento: number;
}

/**
 * Mezcla los aseos y los daños de un apartamento en UNA lista cronológica
 * descendente.
 *
 * ── EL DÍA DE UN DAÑO SALE DE `diaBog()`, NUNCA DE UN `slice(0, 10)` ───────
 *
 * `cleanings.scheduled_date` ya es un `date` y llega como `'YYYY-MM-DD'`.
 * `damages.created_at` es un `timestamptz` y llega en UTC, así que recortarle los
 * diez primeros caracteres da el día de UTC: un daño reportado a las 21:00 de
 * Bogotá se pintaría al día SIGUIENTE, y además saltaría por encima del aseo con
 * el que se reportó. `diaBog()` es la única conversión instante → día del repo.
 *
 * ── EL DESEMPATE NO ES COSMÉTICO ──────────────────────────────────────────
 *
 * Dentro del mismo día se ordena por el instante y, si empata, por `id`. Sin él,
 * el orden entre un aseo y un daño del mismo día lo decidiría el orden de llegada
 * de dos consultas independientes, y la lista bailaría entre dos cargas de la
 * misma ficha.
 *
 * Función PURA: no toca las listas que recibe (`toSorted` no existe en el objetivo
 * de compilación de este repo, así que se ordena una copia explícita).
 */
export function mezclarHistorial(
  aseos: AseoDeHistorial[],
  danos: DanoDeHistorial[],
): EntradaDeHistorial[] {
  const entradas: EntradaDeHistorial[] = [];

  for (const aseo of aseos) {
    entradas.push({
      clase: 'aseo',
      id: aseo.id,
      fecha: aseo.scheduled_date,
      instante: aseo.created_at,
      aseo,
    });
  }

  for (const dano of danos) {
    const fecha = diaBog(dano.created_at);
    if (fecha === null) {
      // `damages.created_at` es NOT NULL con default `now()`, así que esto es
      // inalcanzable desde la base. Se lanza en vez de inventar una fecha porque
      // una entrada con el día equivocado se cuela en medio de la línea de tiempo
      // sin que nada lo diga, que es peor que una sección que no carga.
      throw new Error(`mezclarHistorial: el daño ${dano.id} tiene un created_at ilegible`);
    }

    entradas.push({
      clase: 'dano',
      id: dano.id,
      fecha,
      instante: dano.created_at,
      dano,
    });
  }

  // Comparación de cadenas y no de `Date`: `'YYYY-MM-DD'` ordena lexicográficamente
  // igual que cronológicamente, y `new Date('2026-09-10')` se parsea como
  // medianoche UTC, que en Bogotá es el día anterior.
  return entradas.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
    if (a.instante !== b.instante) return a.instante < b.instante ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

const SELECT_ASEOS = `
  id, scheduled_date, state, tipo, is_managed, confirmado_at, created_at,
  aseador:profiles!cleanings_aseador_id_fkey ( id, full_name )
`;

const SELECT_DANOS = `
  id, descripcion, created_at, resolved_at,
  reportadoPor:profiles!damages_reported_by_fkey ( id, full_name )
`;

/**
 * Un bloque del historial de un apartamento, ya mezclado.
 *
 * ── POR QUÉ SE PIDE `techo + 1` A CADA FUENTE ─────────────────────────────
 *
 * Las N primeras entradas de la mezcla solo pueden salir de las N primeras de
 * cada lista, así que pedir `desplazamiento + limite` a cada tabla basta para
 * componer la página correcta. La fila EXTRA es lo que responde `hayMas` sin un
 * segundo viaje ni un `count`: si tras mezclar quedan más entradas que el techo,
 * hay siguiente bloque.
 *
 * Se sobre-pide, sí. Con retención de seis meses el peor caso son unas decenas de
 * filas por apartamento, y la alternativa —una vista SQL que una las dos tablas—
 * sería una migración para ahorrar una lectura que no duele.
 *
 * ── NO SE USA `.range()` ──────────────────────────────────────────────────
 *
 * `.range(desplazamiento, techo)` aplicado a cada tabla POR SEPARADO paginaría
 * cada lista por su cuenta y la mezcla saltaría entradas: el bloque 2 del
 * historial no es el bloque 2 de los aseos más el bloque 2 de los daños. El
 * desplazamiento se aplica a la lista YA mezclada.
 */
export async function leerHistorial(
  supabase: SupabaseClient<Database>,
  propertyId: string,
  limite: number = BLOQUE_HISTORIAL,
  desplazamiento = 0,
): Promise<Historial> {
  const techo = desplazamiento + limite;

  const [aseos, danos] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from('cleanings')
        .select(SELECT_ASEOS)
        .eq('property_id', propertyId)
        // El soft delete de la purga por retención (Fase 9). Una fila marcada ya
        // no es historia que mostrar: está esperando su borrado físico.
        .is('deleted_at', null)
        .order('scheduled_date', { ascending: false })
        // Desempate estable dentro del día. Sin él, dos aseos de la misma fecha
        // salen en orden arbitrario y la lista cambia entre dos cargas.
        .order('created_at', { ascending: false })
        .limit(techo + 1);

      if (error) throw new Error(error.message);
      return (data ?? []) as AseoDeHistorial[];
    })(),

    (async () => {
      // SIN filtro por `resolved_at`. Ver la cabecera del módulo: copiar el
      // predicado de `damages_open_idx` es el error obvio y esconde justo el dato
      // que hace útil el historial.
      const { data, error } = await supabase
        .from('damages')
        .select(SELECT_DANOS)
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(techo + 1);

      if (error) throw new Error(error.message);
      return (data ?? []) as DanoDeHistorial[];
    })(),
  ]);

  const mezcladas = mezclarHistorial(aseos, danos);

  return {
    entradas: mezcladas.slice(desplazamiento, techo),
    hayMas: mezcladas.length > techo,
    desplazamiento,
  };
}
