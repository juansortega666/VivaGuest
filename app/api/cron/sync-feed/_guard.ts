import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';

import { readServerSecret } from '@/lib/env';

/**
 * El guard del worker de sincronizacion de calendarios.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ES EL UNICO CONTROL DE ACCESO DE UN ENDPOINT PUBLICO DE INTERNET.
 *
 * `app/api/cron/sync-feed/route.ts` no tiene cookie, no tiene sesion y no tiene
 * RLS detras: lo invoca un job de la base por `pg_net`, no un navegador, y su
 * primera accion util es construir la fabrica administrativa, que salta la RLS
 * por completo. Aqui no hay defensa en profundidad: si este archivo se equivoca,
 * cualquiera dispara una corrida de sincronizacion sobre cualquier feed.
 *
 * Es un guard de pleno derecho y el guardarrail 7 de `check-service-role.sh` lo
 * reconoce como tal (junto a `exigirAdmin` y `exigirSesion`): responde la misma
 * pregunta que los otros dos —quien esta preguntando— antes de que exista un
 * cliente privilegiado.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * POR QUE EL ARCHIVO SE LLAMA `_guard.ts` CON GUION BAJO: los archivos con `_`
 * delante quedan fuera del enrutador del App Router. Un `guard.ts` a secas
 * tampoco crearia una ruta por si solo —solo `route.ts` lo hace—, pero el guion
 * bajo lo vuelve explicito y es la convencion que ya usa el repo en
 * `app/(admin)/**\/_actions.ts` y `_components/`.
 */

/** El nombre de la variable. Sin prefijo publico: ver `.env.example`. */
const NOMBRE_VARIABLE = 'CRON_SHARED_SECRET';

/**
 * Por que se niega, para el diagnostico del servidor. NUNCA viaja al cliente:
 * la respuesta del handler es un 401 SIN CUERPO, porque distinguir "no mandaste
 * header" de "el secreto no coincide" es informacion gratis para quien sondea.
 */
export type MotivoDeNegacion =
  | 'sin_secreto_configurado'
  | 'header_ausente'
  | 'secreto_no_coincide';

/**
 * El llamador no trae el secreto compartido.
 *
 * Clase propia y no un `Error` generico para que el handler pueda distinguirla
 * con `instanceof` y responder 401 en vez de 500, igual que `NoAutorizado` en
 * `lib/auth/guards.ts`. El mensaje es fijo y no interpola nada: ni el valor
 * recibido, ni el esperado, ni su longitud.
 */
export class SecretoCronInvalido extends Error {
  readonly status = 401;
  readonly motivo: MotivoDeNegacion;

  constructor(motivo: MotivoDeNegacion) {
    super('No autorizado.');
    this.name = 'SecretoCronInvalido';
    this.motivo = motivo;
  }
}

/** sha256 crudo, 32 bytes siempre, sea cual sea la entrada. */
function sha256(valor: string): Buffer {
  return createHash('sha256').update(valor, 'utf8').digest();
}

/**
 * Exige el secreto compartido. Lanza `SecretoCronInvalido` si no casa.
 *
 * ── LA COMPARACION VA SOBRE EL HASH, NO SOBRE LAS CADENAS, Y ESA ES LA PARTE
 *    QUE SE PASA POR ALTO ─────────────────────────────────────────────────────
 *
 * `timingSafeEqual` **lanza** `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` cuando los
 * dos buferes miden distinto. Esa excepcion es, ella misma, un canal lateral de
 * longitud: quien prueba secretos distingue el fallo por excepcion (longitud
 * equivocada) del fallo por comparacion (longitud correcta, valor equivocado), y
 * con eso averigua cuantos caracteres tiene el secreto antes de empezar a
 * adivinarlo. Comparar la longitud a mano antes tiene exactamente el mismo
 * problema, solo que sin excepcion.
 *
 * Hasheando los DOS lados primero, los dos buferes miden siempre 32 bytes, la
 * excepcion de longitud no puede ocurrir, y la comparacion es de verdad de
 * tiempo constante sobre todo el espacio de entradas. El coste es un sha256 por
 * peticion, que es ruido al lado del fetch del feed.
 *
 * El tercer caso de `_guard.test.ts` es exactamente esta propiedad: afirma que
 * un secreto de distinta longitud produce la MISMA excepcion de autorizacion que
 * uno de igual longitud, y que no es la de la comparacion.
 *
 * ── SIN SECRETO CONFIGURADO SE NIEGA ────────────────────────────────────────
 * Nunca se acepta por defecto. `readServerSecret` rechaza la variable ausente y
 * la vacia, y ademas rechaza por runtime cualquier nombre con prefijo publico.
 * Su excepcion se convierte aqui en la de autorizacion para que el handler
 * responda 401 y no 500: un 500 le dice a quien sondea que el endpoint existe y
 * que esta mal configurado.
 */
export function exigirSecretoCron(recibido: string | null): void {
  // La cadena vacia se trata igual que el header ausente. Un header presente y
  // vacio no es "un secreto que resulto no coincidir": es no haberlo mandado.
  if (recibido === null || recibido === '') {
    throw new SecretoCronInvalido('header_ausente');
  }

  let esperado: string;
  try {
    esperado = readServerSecret(NOMBRE_VARIABLE);
  } catch {
    // El error original NO se propaga: su mensaje nombra la variable, y este
    // error viaja hacia una respuesta HTTP.
    throw new SecretoCronInvalido('sin_secreto_configurado');
  }

  if (!timingSafeEqual(sha256(recibido), sha256(esperado))) {
    throw new SecretoCronInvalido('secreto_no_coincide');
  }
}
