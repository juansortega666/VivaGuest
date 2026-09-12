import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Tables } from '@/lib/database.types';
import { hoyBog } from '@/lib/domain/dates';

/**
 * Los aseos de HOY del aseador que pregunta. Es PWA-01.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LA CONSULTA NO FILTRA POR ASEADOR, Y ESO NO ES UN OLVIDO.
 *
 * La policy `cleanings_cleaner_select` ya lo hace: la frontera de autorizacion
 * de este proyecto es la RLS, escrito en `01-CONTEXT.md` y repetido en cada
 * fase. Anadir aqui un `.eq('aseador_id', ...)` seria un SEGUNDO sitio donde
 * equivocarse, y el dia que los dos discrepen gana el que esta mal.
 *
 * Hay un test que lo deja escrito: con filas de otro aseador en el doble, esta
 * funcion NO las filtra, **y eso es correcto**.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/** Exactamente lo que pinta la tarjeta del home, y nada mas. */
const SELECT_ASEOS_DEL_ASEADOR = `
  id, scheduled_date, state, hora_limite, is_managed, num_huespedes,
  property:properties!cleanings_property_id_fkey ( id, nombre, cluster )
`;

export type PropiedadDeTarjeta = Pick<Tables<'properties'>, 'id' | 'nombre' | 'cluster'>;

export type FilaDeAseoDelAseador = Pick<
  Tables<'cleanings'>,
  'id' | 'scheduled_date' | 'state' | 'hora_limite' | 'is_managed' | 'num_huespedes'
> & { property: PropiedadDeTarjeta | null };

export interface AseosDelDia {
  /** Los de hoy, ya ordenados como los pinta el home. */
  deHoy: FilaDeAseoDelAseador[];
  /** Cuantos hay manana. Se CUENTAN, no se agrupan: hoy no son accionables. */
  conteoDeManana: number;
  /** El dia de negocio usado, para que la pantalla no vuelva a leer el reloj. */
  hoy: string;
  /** El instante de la lectura. Una sola marca para toda la pantalla. */
  leidoEnMs: number;
}

/** Los estados que siguen vivos. `completada` tambien se muestra: ver el orden. */
const ORDEN_DE_ESTADO: Record<string, number> = {
  en_curso: 0,
  pendiente: 1,
  completada: 2,
};

/**
 * El orden del home, y es una regla de PRODUCTO, no una columna.
 *
 * 1. **El que esta `en_curso` va primero**, aunque su hora limite sea mas tarde.
 *    Es el que la aseadora tiene abierto y el que buscaba al abrir la app.
 * 2. Despues por hora limite ascendente: urgencia real.
 * 3. Los `completada` de hoy van al final, **pero no desaparecen**: verlos en
 *    verde es la confirmacion de que quedaron hechos.
 *
 * Se ordena EN MEMORIA y no con `order` de PostgREST, y esa es la razon: "el
 * `en_curso` primero" no es una columna, y ponerlo en la base lo esconde de los
 * tests.
 */
export function ordenarParaElHome(
  filas: readonly FilaDeAseoDelAseador[],
): FilaDeAseoDelAseador[] {
  return [...filas].sort((a, b) => {
    const ea = ORDEN_DE_ESTADO[a.state ?? ''] ?? 9;
    const eb = ORDEN_DE_ESTADO[b.state ?? ''] ?? 9;
    if (ea !== eb) return ea - eb;
    if (a.hora_limite !== b.hora_limite) return a.hora_limite < b.hora_limite ? -1 : 1;
    return (a.property?.nombre ?? '').localeCompare(b.property?.nombre ?? '', 'es-CO');
  });
}

/** `cancelada` no se muestra: no hay nada que hacer con un aseo cancelado. */
export function esVisibleEnElHome(fila: FilaDeAseoDelAseador): boolean {
  return fila.is_managed && fila.state !== null && fila.state !== 'cancelada';
}

/**
 * Lee los aseos de hoy y cuenta los de manana.
 *
 * `ahoraMs` entra POR PARAMETRO y no se lee el reloj dentro, misma disciplina
 * que `leerOperacion()` de la Fase 4: la pantalla tiene una sola marca de tiempo
 * y el test es determinista.
 */
export async function leerAseosDeHoy(
  supabase: Cliente,
  ahoraMs: number = Date.now(),
): Promise<AseosDelDia> {
  const hoy = hoyBog();
  const manana = sumarUnDia(hoy);

  const { data, error } = await supabase
    .from('cleanings')
    .select(SELECT_ASEOS_DEL_ASEADOR)
    .gte('scheduled_date', hoy)
    .lte('scheduled_date', manana);

  if (error) throw new Error(error.message);

  const filas = (data ?? []) as unknown as FilaDeAseoDelAseador[];
  const visibles = filas.filter(esVisibleEnElHome);

  return {
    deHoy: ordenarParaElHome(visibles.filter((f) => f.scheduled_date === hoy)),
    conteoDeManana: visibles.filter((f) => f.scheduled_date === manana).length,
    hoy,
    leidoEnMs: ahoraMs,
  };
}

/**
 * Suma un dia a un dia de negocio en forma `'YYYY-MM-DD'`.
 *
 * Anclado en UTC con `Date.UTC` sobre componentes YA resueltos por `hoyBog()`.
 * Lo que la regla del proyecto prohibe es LEER EL RELOJ para deducir el dia;
 * esto es aritmetica de calendario y no depende de cuando corra el proceso.
 * Se hace asi y no sumando 86.400.000 ms porque el cruce de mes y el ano
 * bisiesto son donde la resta a pelo falla.
 */
function sumarUnDia(fecha: string): string {
  const [ano, mes, dia] = fecha.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}
