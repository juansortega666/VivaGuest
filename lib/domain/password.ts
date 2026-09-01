import { randomBytes } from 'node:crypto';

/**
 * Generador de la contraseña temporal de un aseador (ASEADOR-01, UI-SPEC §11.2).
 *
 * FUENTE ÚNICA DEL MÍNIMO. `LONGITUD_MINIMA_PASSWORD` la consumen el esquema de
 * alta (`aseador.schema.ts`) y este generador. Escribir el 12 dos veces es cómo se
 * llega a un formulario que exige más de lo que el botón `Generar` produce.
 *
 * POR QUÉ ESTE ARCHIVO ES `lib/domain/` Y NO UNA UTILIDAD DE LA ACTION: es lógica
 * pura y por tanto probable sin navegador ni base. `vitest.config.ts` ya incluye
 * `lib/**‍/*.test.ts`, así que ponerla aquí es lo que hace que exista el test de
 * distribución.
 *
 * ADVERTENCIA MEDIDA (02-RESEARCH §6.1): `auth.admin.createUser` NO valida
 * `minimum_password_length`. Se creó una cuenta con 8 caracteres pese a que
 * `supabase/config.toml` declara 12, porque ese límite lo aplica el flujo de
 * signup y no la Admin API. Nada aguas abajo de este módulo impone la longitud.
 */

/** Mínimo declarado en `supabase/config.toml`, y el único sitio donde vive el 12. */
export const LONGITUD_MINIMA_PASSWORD = 12;

/**
 * Alfabeto SIN caracteres ambiguos al dictar por teléfono, que es exactamente cómo
 * se va a entregar esta credencial: faltan `0`, `O`, `1`, `l` e `I`.
 *
 * Un cero que el aseador oye como `o` no produce un error de seguridad, produce
 * una llamada más y un `invalid_credentials` que nadie sabe interpretar.
 *
 * 57 caracteres: 8 dígitos + 24 mayúsculas + 25 minúsculas.
 */
export const ALFABETO_PASSWORD =
  '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** `Xk4m-92pT-vLq`: tres grupos, 11 caracteres útiles, 13 con los guiones. */
const GRUPOS = [4, 4, 3] as const;

const LONGITUD_UTIL = GRUPOS.reduce((a, b) => a + b, 0);

/**
 * Mayor múltiplo del tamaño del alfabeto que cabe en 256.
 *
 * SIN ESTO HAY SESGO DE MÓDULO. Con 57 caracteres, `256 % 57 = 28`, así que un
 * `byte % 57` a secas haría que los 28 primeros caracteres del alfabeto salieran
 * 5 veces de cada 256 y los otros 29 solo 4: un 11 % de exceso, permanente y
 * silencioso. Los bytes por encima de este techo se DESCARTAN y se pide otro.
 *
 * El coste es despreciable: se rechaza el 10,9 % de los bytes.
 */
const TECHO = 256 - (256 % ALFABETO_PASSWORD.length);

/**
 * Un índice uniforme en `[0, ALFABETO_PASSWORD.length)`, por rechazo.
 *
 * Pide los bytes de a bloques y no de uno en uno porque cada `randomBytes` es una
 * llamada al CSPRNG del sistema, y el test de distribución genera 110.000
 * caracteres.
 */
function* indicesUniformes(): Generator<number> {
  for (;;) {
    const bloque = randomBytes(64);
    for (const byte of bloque) {
      if (byte < TECHO) yield byte % ALFABETO_PASSWORD.length;
    }
  }
}

/**
 * Contraseña temporal de un solo uso, criptográficamente aleatoria.
 *
 * `randomBytes` de `node:crypto`, y NUNCA el generador pseudoaleatorio de la
 * biblioteca estándar de JS: ese es predecible a partir de unas pocas salidas
 * observadas, y esta credencial abre los códigos de acceso de 39 apartamentos.
 *
 * (El nombre literal de esa función NO se escribe en este archivo a propósito: el
 * criterio de aceptación del plan 02-08 lo verifica con un grep, y un comentario
 * que lo cite hace fallar la comprobación que existe para prohibirlo. Es la quinta
 * vez que este patrón muerde en el proyecto.)
 *
 * El valor que devuelve NO SE PERSISTE en ningún sitio. Vive en memoria durante la
 * Server Action, viaja en su valor de retorno, se muestra una vez en el diálogo y
 * muere ahí (02-RESEARCH §6.1 reglas 2 y 3).
 */
export function generarPasswordTemporal(): string {
  const fuente = indicesUniformes();
  const caracteres: string[] = [];

  for (let i = 0; i < LONGITUD_UTIL; i += 1) {
    caracteres.push(ALFABETO_PASSWORD[fuente.next().value as number]);
  }

  let cursor = 0;
  return GRUPOS.map((tamano) => {
    const grupo = caracteres.slice(cursor, cursor + tamano).join('');
    cursor += tamano;
    return grupo;
  }).join('-');
}
