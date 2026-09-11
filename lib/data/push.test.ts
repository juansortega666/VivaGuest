import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LEASE_MS,
  leerSuscripcionesVivas,
  marcarNotificacionDescartada,
  marcarNotificacionEnviada,
  marcarNotificacionParaReintento,
  reclamarNotificacion,
  registrarExitoDeSuscripcion,
  registrarFalloDeSuscripcion,
  revocarSuscripcion,
  type ClienteDePush,
} from './push';

/**
 * `lib/data/push.ts` es la capa de datos del outbox. Estos tests defienden tres
 * cosas, y las tres tienen un modo de fallo caro y silencioso detras:
 *
 *   1. EL RECLAMO FILTRA POR ESTADO. Sin ese filtro, drenar dos veces la misma
 *      notificacion manda dos avisos (I5, T-05-18).
 *   2. CADA FUNCION ESCRIBE EXACTAMENTE LAS COLUMNAS QUE LE TOCAN. Es la
 *      «disciplina de una sola columna» que ya usa
 *      `app/(admin)/operacion/_actions.test.ts`: una clave de mas en un `update`
 *      pisa datos que nadie pidio pisar.
 *   3. LA REVOCACION TIENE UNA SOLA PUERTA, escribe dos columnas y NO toca
 *      `notifications` (T-05-05).
 */

// ── Un cliente falso que registra lo que se le pide, sin red ni base ─────────

type Llamada = {
  tabla: string;
  verbo: string;
  valores: unknown;
  columnas?: string;
  filtros: Record<string, unknown>;
};

type Espia = {
  cliente: ClienteDePush;
  llamadas: Llamada[];
};

function espiar(respuesta: unknown = null): Espia {
  const llamadas: Llamada[] = [];

  const cadena = (registro: Llamada) => {
    const obj = {
      eq(columna: string, valor: unknown) {
        registro.filtros[columna] = valor;
        return obj;
      },
      is(columna: string, valor: unknown) {
        registro.filtros[`is:${columna}`] = valor;
        return obj;
      },
      select(columnas: string) {
        registro.columnas = columnas;
        return obj;
      },
      maybeSingle() {
        return Promise.resolve({ data: respuesta, error: null });
      },
      then(resolver: (r: { data: unknown; error: null }) => unknown) {
        return Promise.resolve({ data: respuesta, error: null }).then(resolver);
      },
    };
    return obj;
  };

  const cliente = {
    from(tabla: string) {
      return {
        update(valores: unknown) {
          const registro: Llamada = { tabla, verbo: 'update', valores, filtros: {} };
          llamadas.push(registro);
          return cadena(registro);
        },
        select(columnas: string) {
          const registro: Llamada = {
            tabla,
            verbo: 'select',
            valores: null,
            columnas,
            filtros: {},
          };
          llamadas.push(registro);
          return cadena(registro);
        },
      };
    },
  } as unknown as ClienteDePush;

  return { cliente, llamadas };
}

const NOTI = '00000000-0000-4000-8000-000000000001';
const SUB = '00000000-0000-4000-8000-000000000002';
const USUARIO = '00000000-0000-4000-8000-000000000003';

function unica(espia: Espia): Llamada {
  expect(espia.llamadas).toHaveLength(1);
  return espia.llamadas[0];
}

function claves(l: Llamada): string[] {
  return Object.keys(l.valores as Record<string, unknown>).sort();
}

// ── 1 a 4. El reclamo, que es la idempotencia del sistema ───────────────────

describe('reclamarNotificacion', () => {
  it('FILTRA POR ESTADO: sin ese filtro se podria reclamar una ya enviada', async () => {
    const espia = espiar({ id: NOTI });

    await reclamarNotificacion(espia.cliente, NOTI);

    const l = unica(espia);
    expect(l.tabla).toBe('notifications');
    expect(l.verbo).toBe('update');
    // El senuelo del plan: quitar esta linea del modulo pone este test en rojo.
    expect(l.filtros.push_status).toBe('pendiente');
    expect(l.filtros.id).toBe(NOTI);
  });

  it('empuja next_attempt_at el lease entero, que es mayor que el tick de un minuto', async () => {
    const espia = espiar({ id: NOTI });
    const antes = Date.now();

    await reclamarNotificacion(espia.cliente, NOTI);

    const escrito = unica(espia).valores as { next_attempt_at: string };
    const delta = new Date(escrito.next_attempt_at).getTime() - antes;
    expect(delta).toBeGreaterThanOrEqual(LEASE_MS);
    expect(delta).toBeLessThan(LEASE_MS + 5_000);
    // Estrictamente mayor que el tick de `dispatch-push-notifications`.
    expect(LEASE_MS).toBeGreaterThan(60_000);
  });

  it('el reclamo escribe UNA SOLA columna: no toca el estado ni el contador', async () => {
    const espia = espiar({ id: NOTI });

    await reclamarNotificacion(espia.cliente, NOTI);

    expect(claves(unica(espia))).toEqual(['next_attempt_at']);
  });

  it('devuelve null cuando otra invocacion llego antes, y eso NO es un error', async () => {
    const espia = espiar(null);

    await expect(reclamarNotificacion(espia.cliente, NOTI)).resolves.toBeNull();
  });
});

// ── 5 y 6. Las suscripciones vivas ──────────────────────────────────────────

describe('leerSuscripcionesVivas', () => {
  it('pide solo lo que el envio necesita y filtra las revocadas', async () => {
    const espia = espiar([]);

    await leerSuscripcionesVivas(espia.cliente, USUARIO);

    const l = unica(espia);
    expect(l.tabla).toBe('push_subscriptions');
    expect(l.filtros.user_id).toBe(USUARIO);
    // El predicado del indice parcial `push_subs_user_idx`.
    expect(l.filtros['is:revoked_at']).toBeNull();
    // `soporta_declarativo` es POR DISPOSITIVO: sin el no se puede elegir la
    // rama del cuerpo que exige D-07.
    expect(l.columnas).toContain('soporta_declarativo');
    // Ni las columnas de evidencia ni el token de verificacion: no hacen falta
    // para enviar y son las que la migracion 16 dejo fuera de los grants.
    expect(l.columnas).not.toContain('verificacion_token');
  });

  it('sin ninguna suscripcion viva devuelve un arreglo vacio, nunca null', async () => {
    const espia = espiar(null);

    await expect(leerSuscripcionesVivas(espia.cliente, USUARIO)).resolves.toEqual([]);
  });
});

// ── 7 a 9. El estado de la notificacion ─────────────────────────────────────

describe('el estado de la notificacion', () => {
  it('enviada: tres columnas, y limpia el codigo del intento anterior', async () => {
    const espia = espiar();

    await marcarNotificacionEnviada(espia.cliente, NOTI, 2);

    const l = unica(espia);
    expect(l.tabla).toBe('notifications');
    expect(claves(l)).toEqual(['push_attempts', 'push_last_error', 'push_status']);
    expect(l.valores).toMatchObject({
      push_status: 'enviado',
      push_attempts: 2,
      push_last_error: null,
    });
  });

  it('reintento: vuelve a pendiente con el backoff que le dieron, no uno inventado', async () => {
    const espia = espiar();
    const antes = Date.now();

    await marcarNotificacionParaReintento(espia.cliente, {
      id: NOTI,
      intentos: 1,
      esperarMs: 300_000,
      codigo: 'http_503',
    });

    const l = unica(espia);
    expect(claves(l)).toEqual([
      'next_attempt_at',
      'push_attempts',
      'push_last_error',
      'push_status',
    ]);
    const escrito = l.valores as { push_status: string; next_attempt_at: string };
    expect(escrito.push_status).toBe('pendiente');
    const delta = new Date(escrito.next_attempt_at).getTime() - antes;
    expect(delta).toBeGreaterThanOrEqual(300_000);
    expect(delta).toBeLessThan(305_000);
  });

  it('descartada por falta de destino: deja el codigo visible, nunca un enviado mentiroso', async () => {
    const espia = espiar();

    await marcarNotificacionDescartada(espia.cliente, {
      id: NOTI,
      intentos: 1,
      codigo: 'sin_suscripciones',
    });

    const l = unica(espia);
    expect(claves(l)).toEqual(['push_attempts', 'push_last_error', 'push_status']);
    expect(l.valores).toMatchObject({
      push_status: 'descartado',
      push_last_error: 'sin_suscripciones',
    });
  });
});

// ── 10 a 12. La salud de la suscripcion ─────────────────────────────────────

describe('la salud de la suscripcion', () => {
  it('el exito reinicia el contador de fallos', async () => {
    const espia = espiar();

    await registrarExitoDeSuscripcion(espia.cliente, SUB);

    const l = unica(espia);
    expect(l.tabla).toBe('push_subscriptions');
    expect(claves(l)).toEqual(['failure_count', 'last_success_at']);
    expect(l.valores).toMatchObject({ failure_count: 0 });
  });

  it('el fallo incrementa el contador y NO revoca nada', async () => {
    const espia = espiar();

    await registrarFalloDeSuscripcion(espia.cliente, SUB, 3);

    const l = unica(espia);
    expect(claves(l)).toEqual(['failure_count', 'last_failure_at']);
    expect(l.valores).toMatchObject({ failure_count: 4 });
    // La propiedad que importa: un transitorio no mata un telefono.
    expect(claves(l)).not.toContain('revoked_at');
  });

  it('un contador corrupto no rompe el incremento', async () => {
    const espia = espiar();

    await registrarFalloDeSuscripcion(espia.cliente, SUB, -7);

    expect(unica(espia).valores).toMatchObject({ failure_count: 1 });
  });
});

// ── 13 a 15. La unica puerta de revocacion ──────────────────────────────────

describe('revocarSuscripcion', () => {
  it('escribe EXACTAMENTE DOS columnas', async () => {
    const espia = espiar();

    await revocarSuscripcion(espia.cliente, { id: SUB, motivo: 'http_410' });

    const l = unica(espia);
    expect(claves(l)).toHaveLength(2);
    expect(claves(l)).toEqual(['revoked_at', 'revoked_reason']);
    expect(l.valores).toMatchObject({ revoked_reason: 'http_410' });
    expect(l.filtros.id).toBe(SUB);
  });

  it('NO toca notifications: la suerte del telefono y la del aviso son distintas', async () => {
    const espia = espiar();

    await revocarSuscripcion(espia.cliente, { id: SUB, motivo: 'clave_obsoleta' });

    expect(espia.llamadas.every((l) => l.tabla === 'push_subscriptions')).toBe(true);
  });

  it('el motivo es de la union cerrada: un mensaje libre del push service no compila', async () => {
    const espia = espiar();

    await revocarSuscripcion(espia.cliente, {
      id: SUB,
      // Lo que se evita: el objeto de error de la libreria arrastra el endpoint
      // entero, que es una credencial de envio, y `revoked_reason` se ve en el
      // panel de D-03.
      // @ts-expect-error el motivo no es un `CodigoDePush`
      motivo: 'WebPushError: Received unexpected response code https://fcm.googleapis.com/...',
    });

    expect(unica(espia).valores).toMatchObject({
      revoked_reason: expect.any(String) as unknown as string,
    });
  });
});

// ── 16. La frontera del modulo ──────────────────────────────────────────────

describe('la frontera del modulo', () => {
  const fuente = readFileSync(fileURLToPath(new URL('./push.ts', import.meta.url)), 'utf8');

  it('NO construye la fabrica administrativa: el cliente entra por parametro', () => {
    // Las dos aserciones van por expresion regular y NO por cadena literal: el
    // guardarrail 5 de `check-service-role.sh` busca el especificador del import
    // con un grep de texto fijo sobre todo `lib/`, y escribirlo aqui haria que
    // este mismo test marcara el archivo como importador de la fabrica.
    expect(fuente).not.toMatch(/supabase\/admin/);
    expect(fuente).not.toMatch(/createAdmin[C]lient/);
  });

  it('el codigo de falta de destino esta escrito, porque es lo que hace visible I6', () => {
    expect(fuente).toContain('sin_suscripciones');
  });
});
