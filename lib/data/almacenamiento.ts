import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { ConsumoDeStorage } from '@/lib/domain/almacenamiento';

/**
 * LA LECTURA DEL CONSUMO DE STORAGE (RET-07).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * UNA LLAMADA, Y NINGUNA LÓGICA DE AUTORIZACIÓN AQUÍ.
 *
 * `consumo_de_storage()` (migración 29) es `security definer` y comprueba el rol
 * como PRIMERA sentencia de su cuerpo. ESA es la frontera, y está afirmada
 * impersonando en `12_almacenamiento.test.sql`. Una segunda comprobación en
 * TypeScript no añadiría ninguna garantía —el dato ya viajó o no viajó antes de
 * llegar aquí— y sí crearía un sitio más donde equivocarse: el día que las dos
 * discrepen, la que manda sigue siendo la de Postgres y la de aquí solo confunde
 * el diagnóstico.
 *
 * Por qué por función y no por grant: en Supabase el admin y la aseadora
 * comparten el rol Postgres `authenticated`, así que "solo el admin" no existe
 * como categoría de grant.
 *
 * ── EL CLIENTE LLEGA POR PARÁMETRO ────────────────────────────────────────
 *
 * Como en todo `lib/data/`: así la misma función sirve a un componente de
 * servidor con el JWT del admin y a un test con el JWT que se quiera probar.
 *
 * ── Y LA REGLA QUE AQUÍ ES LA MÁS IMPORTANTE DE TODAS: LANZAR ─────────────
 *
 * Esta función NO devuelve ceros cuando falla. Un cero silencioso aquí sería el
 * peor resultado posible del requisito entero: la cabecera diría que hay espacio
 * de sobra justo el día que no lo hay, y la alerta no saldría. Se lanza, y quien
 * llama decide qué pinta con el fallo (en `/operacion`, un `.catch(() => null)`
 * pegado A ESTA promesa y un medidor que dice "no se pudo medir").
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/**
 * El nombre de la función, como constante exportada. Así el test puede afirmar
 * CONTRA QUÉ se llamó sin volver a escribir el nombre, y el repo conserva una
 * sola ocurrencia literal. `as const` es lo que mantiene el tipo literal que la
 * firma generada del cliente exige.
 */
export const RPC_CONSUMO_STORAGE = 'consumo_de_storage' as const;

/**
 * Los cuatro números crudos del consumo de Storage.
 *
 * ── CERO FILAS ES UN DEFECTO, NO UN STORAGE VACÍO ─────────────────────────
 *
 * La función agrega con `coalesce` y no lleva `group by`, así que un bucket sin
 * un solo objeto devuelve UNA fila con `usado_bytes = 0`. Cero filas solo puede
 * significar que la función cambió de forma, y devolver ceros ahí sería
 * inventarse un Storage limpio.
 *
 * ── LA FILA SE COMPONE CAMPO A CAMPO ──────────────────────────────────────
 *
 * Y se renombra a la forma del dominio aquí, en la frontera, no en el
 * componente: `lib/domain/almacenamiento.ts` es quien decide y sus tests están
 * escritos contra ese tipo.
 */
export async function leerConsumoDeStorage(supabase: Cliente): Promise<ConsumoDeStorage> {
  const { data, error } = await supabase.rpc(RPC_CONSUMO_STORAGE);

  if (error) throw new Error(error.message);

  const fila = data?.[0];
  if (!fila) {
    throw new Error(
      `${RPC_CONSUMO_STORAGE} no devolvió ninguna fila. ` +
        'La función agrega con coalesce y sin group by, así que un bucket vacío devuelve una fila con 0: ' +
        'cero filas solo puede ser un cambio de forma de la función.',
    );
  }

  return {
    usadoBytes: fila.usado_bytes,
    cupoBytes: fila.cupo_bytes,
    umbralPct: fila.umbral_pct,
    cruceAt: fila.cruce_at,
  };
}
