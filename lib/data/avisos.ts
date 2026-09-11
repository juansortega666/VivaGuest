import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import type { EntradaEstadoAvisosAseador } from '@/lib/domain/avisos';

/**
 * LA UNICA LECTURA DEL AGREGADO DE AVISOS DE TODO EL REPO (D-03, criterio 6).
 *
 * Existe como modulo propio y no como una funcion mas dentro de
 * `./aseadores.ts` porque lo consumen DOS pantallas: `/aseadores` (columna
 * `AVISOS`, 05-UI-SPEC §11.1) y `/operacion` (marca en el chip de la franja de
 * carga, §11.2). Dos copias de la misma llamada serian dos sitios donde cambiar
 * la forma del dato el dia que la funcion crezca una columna.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE SE LLEGA POR RPC Y NO POR UN `select` SOBRE LA TABLA, QUE SERIA MAS
 * CORTO.
 *
 * El identificador de destino de una suscripcion es una CREDENCIAL PORTADORA:
 * quien lo tiene puede escribirle avisos a ese telefono, y las dos claves que lo
 * acompanan son con las que se cifra el contenido. El admin NO necesita ninguna
 * de las tres para cumplir D-03: necesita un agregado que le diga a quien llamar
 * por telefono.
 *
 * Por eso el admin NO tiene `select` sobre la tabla `push_subscriptions` y no se
 * le anade ninguna policy que se lo de. Todo entra por la funcion agregada de la
 * migracion 16 —la que nombra `RPC_ESTADO_AVISOS`, unas lineas mas abajo—, que
 * es `security definer`, comprueba `private.is_admin()` por dentro y cuyo
 * `returns table` NO TIENE RANURA para ninguna de las tres columnas de
 * credencial (T-05-07). La migracion 16 lo afirma contra el catalogo.
 *
 * Ampliar la firma de esa funcion para hacerle la vida mas facil a la UI es
 * exactamente el cambio que no se hace.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta lectura, como la de `./aseadores.ts`, NO se memoiza entre peticiones: son
 * datos por usuario y una entrada de cache compartida se le sirve a otro.
 */

/**
 * El nombre de la funcion, como constante y exportado.
 *
 * No es ceremonia: asi el test puede afirmar CONTRA QUE se llamo sin escribir el
 * nombre otra vez, y el repo conserva una sola ocurrencia literal del nombre en
 * todo `lib/data/`. `as const` es lo que mantiene el tipo literal que
 * `supabase.rpc()` exige para resolver la firma generada.
 */
export const RPC_ESTADO_AVISOS = 'estado_avisos_aseadores' as const;

/**
 * Lo que la funcion devuelve para UN aseador, sin `is_active`.
 *
 * Se deriva de `EntradaEstadoAvisosAseador` de `lib/domain/avisos.ts` en vez de
 * repetir sus seis campos: la derivacion vive alli y dos declaraciones de la
 * misma forma se desincronizan. `is_active` se quita porque NO sale de la RPC
 * —que ya filtra por aseador activo— sino de la lista de aseadores con la que la
 * pantalla la cruza.
 */
export type EstadoDeAvisosCrudo = Omit<EntradaEstadoAvisosAseador, 'is_active'>;

/**
 * El estado de un aseador que no aparece en el resultado.
 *
 * NO es dato ausente: es CERO suscripciones vivas, que es exactamente el estado
 * `Sin avisos` de §5.2. La funcion devuelve fila por cada aseador activo, asi
 * que en el camino real esta constante no se usa; la defensa cuesta una linea y
 * evita que un `undefined` llegue a pintarse.
 */
export const SIN_AVISOS_REGISTRADOS: EstadoDeAvisosCrudo = {
  suscripciones_vivas: 0,
  verificado_por_toque: false,
  primera_suscripcion_at: null,
  ultima_verificacion: null,
  ultimo_visto: null,
  ultimo_exito: null,
};

/**
 * Lee el agregado de avisos de TODOS los aseadores en UNA sola llamada.
 *
 * El cliente entra POR PARAMETRO, como el resto de `lib/data/`: asi la misma
 * funcion sirve a un RSC con el JWT del admin y a un test con el JWT que se
 * quiera probar.
 *
 * Devuelve un `Map` indexado por aseador y no la lista cruda porque sus dos
 * consumidores lo que hacen es CRUZARLO con una lista de aseadores que ya
 * tienen. Indexar aqui evita que cada uno se escriba su propio bucle.
 *
 * El objeto se compone CAMPO A CAMPO y no con un `...fila`: si algun dia la
 * funcion de la base creciera una columna, se quedaria fuera de este mapa en vez
 * de propagarse sola hasta el navegador del admin.
 */
export async function leerEstadoDeAvisosPorAseador(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, EstadoDeAvisosCrudo>> {
  const { data, error } = await supabase.rpc(RPC_ESTADO_AVISOS);

  // Se propaga en vez de devolver un mapa vacio: un mapa vacio pintaria a los
  // ocho aseadores como `Sin avisos`, que es una alarma falsa indistinguible de
  // la verdadera, justo en la pantalla donde el admin decide a quien llamar.
  if (error) throw new Error(error.message);

  const indice = new Map<string, EstadoDeAvisosCrudo>();

  for (const fila of data ?? []) {
    indice.set(fila.aseador_id, {
      suscripciones_vivas: fila.suscripciones_vivas,
      verificado_por_toque: fila.verificado_por_toque,
      primera_suscripcion_at: fila.primera_suscripcion_at,
      ultima_verificacion: fila.ultima_verificacion,
      ultimo_visto: fila.ultimo_visto,
      ultimo_exito: fila.ultimo_exito,
    });
  }

  return indice;
}
