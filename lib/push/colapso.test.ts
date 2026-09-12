import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LARGO_DE_CLAVE,
  LARGO_MAXIMO_DE_TOPIC,
  claveDeColapso,
  esClaveDeTopicValida,
  type ClaseDeAviso,
  type EntradaDeColapso,
} from './colapso';

/**
 * LA AUDITORÍA EMISOR POR EMISOR DE D-05, ESCRITA COMO FIXTURE Y NO COMO
 * COMENTARIO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE ARCHIVO ES UNA TABLA Y NO CUATRO CASOS SUELTOS.
 *
 * Un aviso colapsado BORRA al anterior en la bandeja del teléfono: el texto
 * viejo no vuelve (`05-UI-SPEC.md` §10.2). Si dos CLASES de evento distintas
 * cayeran en la misma clave, un daño reportado borraría un "no puedo" del mismo
 * aseo antes de que el admin lo leyera. Comprobarlo con cuatro ejemplos
 * escogidos a mano no demuestra nada: la propiedad es sobre TODOS los pares de
 * emisores, así que el test recorre el inventario completo por pares.
 *
 * Y el inventario no se escribió de memoria: sale de leer los catorce
 * `insert into public.notifications` del repo. La última aserción del archivo
 * vuelve a contarlos en disco y cae si aparece uno nuevo sin clasificar, que es
 * lo que hace que el día que la Fase 6 añada `dano_reportado` y
 * `faltantes_reportados` alguien tenga que mirar esta tabla.
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Los identificadores del escenario ──────────────────────────────────────
const ADMIN = '11111111-1111-4111-8111-111111111111';
const OTRO_ADMIN = '99999999-9999-4999-8999-999999999999';
const ASEADOR = '22222222-2222-4222-8222-222222222222';
const ASEO = '33333333-3333-4333-8333-333333333333';
const OTRO_ASEO = '44444444-4444-4444-8444-444444444444';
const FEED = '55555555-5555-4555-8555-555555555555';
const NOTIF = '66666666-6666-4666-8666-666666666666';

type Emisor = {
  /** Número de orden dentro del inventario, para leer los fallos. */
  n: number;
  migracion: string;
  emisor: string;
  type: ClaseDeAviso;
  /** A quién le llega. Del `where p.role = ...` del propio insert. */
  destinatario: 'admin' | 'aseador';
  /** El `dedupe_key` REAL del emisor, con los identificadores del escenario. */
  dedupe: string;
  /** `cleaning_id` si el insert lo lleva en su lista de columnas; si no, `null`. */
  cleaning: string | null;
};

/**
 * LOS CATORCE EMISORES DE `public.notifications` DEL REPO.
 *
 * Leídos uno por uno de las migraciones. Dos correcciones MEDIDAS sobre la
 * tabla del `05-PATTERNS.md`, que el plan hereda:
 *
 *   1. Son CATORCE inserts, no ocho. La tabla del PATTERNS inventaría FORMATOS
 *      de `dedupe_key` (y lista ocho de los diez que hay), no emisores.
 *   2. `finish_cleaning` y `decline_cleaning` NO usan `<verbo>:<uuid>:<uuid>`:
 *      usan `done:<aseo>` y `decline:<aseo>`, sin el uuid del destinatario. El
 *      destinatario no cabe ahí porque el insert emite UNA FILA POR ADMIN
 *      ACTIVO desde un `cross join`, y meter el uuid del admin en la clave
 *      rompería el `on conflict (recipient_id, dedupe_key)`, que ya discrimina
 *      por destinatario en su primera columna.
 */
const INVENTARIO: readonly Emisor[] = [
  {
    n: 1,
    migracion: '09_rpc',
    emisor: 'confirm_cleaning',
    type: 'asignacion',
    destinatario: 'aseador',
    dedupe: `assign:${ASEO}:${ASEADOR}`,
    cleaning: ASEO,
  },
  {
    n: 2,
    migracion: '09_rpc',
    emisor: 'finish_cleaning',
    type: 'aseo_completado',
    destinatario: 'admin',
    dedupe: `done:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 3,
    migracion: '09_rpc',
    emisor: 'decline_cleaning',
    type: 'no_puedo',
    destinatario: 'admin',
    dedupe: `decline:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 4,
    migracion: '15_rpc_admin_y_realtime',
    emisor: 'reassign_cleaning',
    type: 'asignacion',
    destinatario: 'aseador',
    dedupe: `assign:${ASEO}:${ASEADOR}`,
    cleaning: ASEO,
  },
  {
    n: 5,
    migracion: '13_sync_reconcile',
    emisor: 'reconcile / aseo cancelado por reserva desaparecida',
    type: 'aseo_cancelado',
    destinatario: 'admin',
    dedupe: `cancel:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 6,
    migracion: '13_sync_reconcile',
    emisor: 'reconcile / aseo cancelado por reserva movida',
    type: 'aseo_cancelado',
    destinatario: 'admin',
    dedupe: `cancel:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 7,
    migracion: '13_sync_reconcile',
    emisor: 'reconcile / aseo a revisión por desaparición',
    type: 'aseo_cancelado',
    destinatario: 'admin',
    dedupe: `rev:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 8,
    migracion: '13_sync_reconcile',
    emisor: 'reconcile / aseo a revisión por movimiento',
    type: 'aseo_cancelado',
    destinatario: 'admin',
    dedupe: `rev:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 9,
    migracion: '13_sync_reconcile',
    emisor: 'reconcile / extensión sospechosa',
    type: 'extension_sospechosa',
    destinatario: 'admin',
    dedupe: `ext:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 10,
    migracion: '13_sync_reconcile',
    emisor: 'reconcile / feed con formato desconocido',
    type: 'calendario_caido',
    destinatario: 'admin',
    dedupe: `fmt:${FEED}:20260911`,
    cleaning: null,
  },
  {
    n: 11,
    migracion: '14_sync_jobs',
    emisor: 'watchdog / todos los feeds obsoletos',
    type: 'calendario_caido',
    destinatario: 'admin',
    dedupe: 'job_dead:2026091108',
    cleaning: null,
  },
  {
    n: 12,
    migracion: '14_sync_jobs',
    emisor: 'watchdog / feed sin respuesta',
    type: 'calendario_caido',
    destinatario: 'admin',
    dedupe: `feed_dead:${FEED}:2026091108`,
    cleaning: null,
  },
  {
    n: 13,
    migracion: '14_sync_jobs',
    emisor: 'watchdog / todos los feeds colapsados',
    type: 'calendario_caido',
    destinatario: 'admin',
    dedupe: 'job_fmt:20260911',
    cleaning: null,
  },
  {
    n: 14,
    migracion: '14_sync_jobs',
    emisor: 'watchdog / feed con formato desconocido',
    type: 'calendario_caido',
    destinatario: 'admin',
    dedupe: `fmt:${FEED}:20260911`,
    cleaning: null,
  },

  // ── Fase 6 ────────────────────────────────────────────────────────────────
  // Los cuatro que la Fase 6 añadió. Este test los cazó al correr, que es
  // exactamente para lo que la Fase 5 lo escribió: un emisor nuevo obliga a
  // mirar si su clase puede colapsar con la de otro del mismo aseo.
  //
  // Veredicto de esa revisión: **ninguno colapsa con ninguno.** Los tres tipos
  // de reporte son clases distintas entre sí y distintas de `no_puedo` y de
  // `asignacion`, que es justo el caso que D-05 de la Fase 5 existe para
  // evitar ("un daño reportado borra un 'no puedo' del mismo aseo antes de que
  // el admin lo lea"). Y el identificador de la fila entra en su `dedupe_key`,
  // así que dos daños del mismo aseo tampoco se borran entre sí.
  {
    n: 15,
    migracion: '18_ejecucion_aseo',
    emisor: 'finish_cleaning (reescrito sin el bloqueo de PWA-07)',
    type: 'aseo_completado',
    destinatario: 'admin',
    dedupe: `done:${ASEO}`,
    cleaning: ASEO,
  },
  {
    n: 16,
    migracion: '19_rpc_reportes',
    emisor: 'report_damage',
    type: 'dano_reportado',
    destinatario: 'admin',
    dedupe: `dano:${ASEO}:${NOTIF}`,
    cleaning: ASEO,
  },
  {
    n: 17,
    migracion: '19_rpc_reportes',
    emisor: 'report_expense',
    type: 'gasto_reportado',
    destinatario: 'admin',
    dedupe: `gasto:${ASEO}:${NOTIF}`,
    cleaning: ASEO,
  },
  {
    n: 18,
    migracion: '19_rpc_reportes',
    emisor: 'report_missing_items',
    type: 'faltantes_reportados',
    destinatario: 'admin',
    dedupe: `falta:${ASEO}:${NOTIF}`,
    cleaning: ASEO,
  },
];

/**
 * Realiza un emisor como fila de `notifications`, FORZANDO el mismo
 * destinatario y el mismo aseo para todos. Es lo que hace comparable el
 * recorrido por pares: si dos emisores producen la misma clave con la peor
 * coincidencia posible de contexto, la producirían siempre.
 */
function comoFila(e: Emisor, recipient = ADMIN): EntradaDeColapso {
  return {
    recipient_id: recipient,
    type: e.type,
    cleaning_id: e.cleaning,
    dedupe_key: e.dedupe,
    id: NOTIF,
  };
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

// ───────────────────────────────────────────────────────────────────────────

describe('la clave cabe en la cabecera Topic', () => {
  it('toda clave del inventario mide <= 32 y solo usa el alfabeto base64url', () => {
    for (const e of INVENTARIO) {
      const clave = claveDeColapso(comoFila(e));
      expect(clave, `emisor ${e.n} (${e.emisor})`).toMatch(BASE64URL);
      expect(clave.length, `emisor ${e.n} (${e.emisor})`).toBeLessThanOrEqual(
        LARGO_MAXIMO_DE_TOPIC,
      );
      expect(clave.length).toBe(LARGO_DE_CLAVE);
      expect(esClaveDeTopicValida(clave)).toBe(true);
      // El relleno y los dos caracteres que `BadWebPushTopic` rechaza.
      expect(clave).not.toContain('=');
      expect(clave).not.toContain('+');
      expect(clave).not.toContain('/');
    }
  });

  it('el señuelo: el UUID crudo del aseo NO es una clave de Topic válida', () => {
    // 36 caracteres y guiones. Es exactamente el error que devuelve
    // `BadWebPushTopic`, y es el atajo que este módulo existe para evitar.
    expect(ASEO.length).toBe(36);
    expect(esClaveDeTopicValida(ASEO)).toBe(false);
    expect(LARGO_MAXIMO_DE_TOPIC).toBe(32);
  });

  it('esClaveDeTopicValida rechaza lo vacío, lo largo y el alfabeto equivocado', () => {
    expect(esClaveDeTopicValida('')).toBe(false);
    expect(esClaveDeTopicValida('a'.repeat(33))).toBe(false);
    expect(esClaveDeTopicValida('a'.repeat(32))).toBe(true);
    expect(esClaveDeTopicValida('abc=')).toBe(false);
    expect(esClaveDeTopicValida('ab+c')).toBe(false);
    expect(esClaveDeTopicValida('ab/c')).toBe(false);
    expect(esClaveDeTopicValida('ab.c')).toBe(false);
    expect(esClaveDeTopicValida('ab-c_D9')).toBe(true);
  });
});

describe('la clave es estable', () => {
  it('dos llamadas con la misma entrada devuelven la misma clave', () => {
    for (const e of INVENTARIO) {
      expect(claveDeColapso(comoFila(e))).toBe(claveDeColapso(comoFila(e)));
    }
  });

  it('no lee reloj ni aleatoriedad: el valor es el mismo en dos momentos', () => {
    const fila = comoFila(INVENTARIO[0]);
    const a = claveDeColapso(fila);
    const b = claveDeColapso({ ...fila });
    expect(a).toBe(b);
  });
});

describe('lo que SÍ tiene que colapsar', () => {
  it('reasignar de vuelta al mismo aseador colapsa: es la misma clase sobre el mismo aseo', () => {
    // §10.2, primera fila de la tabla. `confirm_cleaning` (#1) y
    // `reassign_cleaning` (#4) son verbos distintos de la MISMA clase.
    const confirmar = claveDeColapso(comoFila(INVENTARIO[0], ASEADOR));
    const reasignar = claveDeColapso(comoFila(INVENTARIO[3], ASEADOR));
    expect(confirmar).toBe(reasignar);
  });

  it('los cuatro avisos de aseo_cancelado del reconcile colapsan entre sí', () => {
    // `cancel:` y `rev:` son estados mutuamente excluyentes del MISMO aseo y de
    // la MISMA clase. Que la versión nueva reemplace a la vieja es lo correcto:
    // los dos textos se leen solos, así que ninguno depende del otro.
    const claves = new Set(
      [4, 5, 6, 7].map((i) => claveDeColapso(comoFila(INVENTARIO[i]))),
    );
    expect(claves.size).toBe(1);
  });
});

describe('lo que NO puede colapsar: la razón de ser de D-05', () => {
  it('un daño reportado NUNCA colapsa con un "no puedo" del mismo aseo al mismo admin', () => {
    // ESTE ES EL EJEMPLO LITERAL DEL QUE SALE LA DECISIÓN D-05.
    //
    // `dano_reportado` todavía no tiene emisor: llega en la Fase 6. Se escribe
    // igual, porque la propiedad tiene que estar sostenida ANTES de que exista
    // el emisor, no después del primer aviso borrado.
    const noPuedo = claveDeColapso({
      recipient_id: ADMIN,
      type: 'no_puedo',
      cleaning_id: ASEO,
      dedupe_key: `decline:${ASEO}`,
      id: NOTIF,
    });
    const danoReportado = claveDeColapso({
      recipient_id: ADMIN,
      type: 'dano_reportado',
      cleaning_id: ASEO,
      dedupe_key: `dano:${ASEO}`,
      id: NOTIF,
    });

    expect(danoReportado).not.toBe(noPuedo);
  });

  it('el señuelo del par: ni siquiera con EL MISMO dedupe_key colapsan dos clases', () => {
    // Si la clase saliera del `dedupe_key` en vez de `notifications.type`, esta
    // aserción caería. Es la corrección medida sobre el `05-CONTEXT.md`.
    const mismoDedupe = `x:${ASEO}`;
    const a = claveDeColapso({
      recipient_id: ADMIN,
      type: 'no_puedo',
      cleaning_id: ASEO,
      dedupe_key: mismoDedupe,
      id: NOTIF,
    });
    const b = claveDeColapso({
      recipient_id: ADMIN,
      type: 'dano_reportado',
      cleaning_id: ASEO,
      dedupe_key: mismoDedupe,
      id: NOTIF,
    });
    expect(a).not.toBe(b);
  });

  it('NINGÚN par de emisores con type distinto comparte clave (recorrido completo)', () => {
    const filas = INVENTARIO.map((e) => ({ e, clave: claveDeColapso(comoFila(e)) }));

    for (let i = 0; i < filas.length; i += 1) {
      for (let j = i + 1; j < filas.length; j += 1) {
        if (filas[i].e.type === filas[j].e.type) continue;
        expect(
          filas[i].clave,
          `emisor ${filas[i].e.n} (${filas[i].e.type}) colapsaría con ` +
            `emisor ${filas[j].e.n} (${filas[j].e.type})`,
        ).not.toBe(filas[j].clave);
      }
    }
  });

  it('cada clave del inventario mapea a UNA sola clase de evento', () => {
    // La misma propiedad dicha del otro lado, y es la forma en que se leerá el
    // fallo: no "estos dos chocan", sino "esta clave sirve a dos clases".
    const porClave = new Map<string, Set<ClaseDeAviso>>();
    for (const e of INVENTARIO) {
      const clave = claveDeColapso(comoFila(e));
      const clases = porClave.get(clave) ?? new Set<ClaseDeAviso>();
      clases.add(e.type);
      porClave.set(clave, clases);
    }

    for (const [clave, clases] of porClave) {
      expect([...clases], `la clave ${clave} sirve a varias clases`).toHaveLength(1);
    }

    // Dieciocho emisores producen DOCE claves, y cada fusión tiene dueño:
    //   · asignacion + aseo          -> #1 y #4   (reasignación de vuelta, §10.2)
    //   · aseo_cancelado + aseo      -> #5 a #8   (cancelado y a-revisión del mismo aseo)
    //   · calendario_caido fmt:feed  -> #10 y #14 (reconcile y watchdog dicen lo mismo)
    //   · aseo_completado + aseo     -> #2 y #15  **Fase 6.** NO son dos emisores:
    //     es el MISMO `finish_cleaning`, que la migración 18 reescribió con
    //     `create or replace` para quitarle el bloqueo de PWA-07. El conteo por
    //     líneas en disco lo ve dos veces porque las dos migraciones quedan en
    //     el historial; la clave de colapso lo ve como uno, que es lo correcto.
    // Las tres de reporte de la Fase 6 (#16, #17, #18) son clases distintas
    // entre sí y de todo lo anterior, así que suman tres claves nuevas: es
    // exactamente lo que D-05 exige y el caso que existe para evitar.
    expect(porClave.size).toBe(12);
  });

  it('dos aseos distintos de la misma clase no colapsan: la tanda de quince son quince avisos', () => {
    const uno = claveDeColapso({
      recipient_id: ASEADOR,
      type: 'asignacion',
      cleaning_id: ASEO,
      dedupe_key: `assign:${ASEO}:${ASEADOR}`,
      id: NOTIF,
    });
    const otro = claveDeColapso({
      recipient_id: ASEADOR,
      type: 'asignacion',
      cleaning_id: OTRO_ASEO,
      dedupe_key: `assign:${OTRO_ASEO}:${ASEADOR}`,
      id: NOTIF,
    });
    expect(uno).not.toBe(otro);
  });

  it('dos destinatarios distintos no colapsan: el aviso es de cada bandeja', () => {
    const paraUno = claveDeColapso(comoFila(INVENTARIO[2], ADMIN));
    const paraOtro = claveDeColapso(comoFila(INVENTARIO[2], OTRO_ADMIN));
    expect(paraUno).not.toBe(paraOtro);
  });
});

describe('las notificaciones sin aseo', () => {
  it('dos cubos de tiempo distintos del mismo watchdog NO colapsan', () => {
    // El cubo de hora produce repetición A PROPÓSITO (`14_sync_jobs.sql`): sin
    // él, el índice único mataría la segunda alerta para siempre. Si la clave de
    // colapso ignorase el cubo, la capa de push desharía esa decisión.
    const ochoDeLaManana = claveDeColapso({
      recipient_id: ADMIN,
      type: 'calendario_caido',
      cleaning_id: null,
      dedupe_key: 'job_dead:2026091108',
      id: NOTIF,
    });
    const nueveDeLaManana = claveDeColapso({
      recipient_id: ADMIN,
      type: 'calendario_caido',
      cleaning_id: null,
      dedupe_key: 'job_dead:2026091109',
      id: NOTIF,
    });
    expect(ochoDeLaManana).not.toBe(nueveDeLaManana);
  });

  it('dos feeds distintos de la misma clase y el mismo cubo no colapsan', () => {
    const feedA = claveDeColapso({
      recipient_id: ADMIN,
      type: 'calendario_caido',
      cleaning_id: null,
      dedupe_key: `feed_dead:${FEED}:2026091108`,
      id: NOTIF,
    });
    const feedB = claveDeColapso({
      recipient_id: ADMIN,
      type: 'calendario_caido',
      cleaning_id: null,
      dedupe_key: `feed_dead:${OTRO_ASEO}:2026091108`,
      id: NOTIF,
    });
    expect(feedA).not.toBe(feedB);
  });

  it('sin aseo y sin dedupe_key, el id de la notificación la hace irrepetible', () => {
    const base = {
      recipient_id: ADMIN,
      type: 'retencion_proxima' as ClaseDeAviso,
      cleaning_id: null,
      dedupe_key: null,
    };
    const una = claveDeColapso({ ...base, id: NOTIF });
    const otra = claveDeColapso({ ...base, id: OTRO_ASEO });
    // Sin discriminador compartido, dos avisos nunca se borran entre sí. Es lo
    // correcto para un aviso que no tiene sucesor.
    expect(una).not.toBe(otra);
    expect(esClaveDeTopicValida(una)).toBe(true);
  });
});

describe('el inventario cubre el repo entero', () => {
  it('hay una entrada por cada insert into public.notifications de las migraciones', () => {
    const dir = fileURLToPath(new URL('../../supabase/migrations', import.meta.url));
    const emisoresEnDisco = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
      .join('\n')
      .split('\n')
      // Un comentario no es un emisor. Mismo filtro que `codigoDe()` en
      // `lib/data/sync.test.ts`.
      .filter((l) => !/^\s*--/.test(l))
      .filter((l) => l.includes('insert into public.notifications')).length;

    expect(
      INVENTARIO.length,
      'apareció un emisor de notifications sin clasificar en esta tabla: ' +
        'mira si su `type` puede colapsar con el de otro emisor del mismo aseo',
    ).toBe(emisoresEnDisco);
    // 18 desde la Fase 6: 14 de antes, más `finish_cleaning` reescrito en la
    // migración 18 y los tres RPC de reporte de la 19.
    expect(INVENTARIO.length).toBe(18);
  });

  it('los números de orden del inventario son correlativos y sin huecos', () => {
    expect(INVENTARIO.map((e) => e.n)).toEqual(
      Array.from({ length: INVENTARIO.length }, (_, i) => i + 1),
    );
  });
});

describe('el módulo es puro', () => {
  it('su único import en tiempo de ejecución es node:crypto', () => {
    const fuente = readFileSync(
      fileURLToPath(new URL('./colapso.ts', import.meta.url)),
      'utf8',
    );
    const imports = fuente.split('\n').filter((l) => /^\s*import\s/.test(l));
    const enRuntime = imports.filter((l) => !/^\s*import\s+type\s/.test(l));

    expect(enRuntime).toHaveLength(1);
    expect(enRuntime[0]).toMatch(/from\s+'node:crypto'/);
    expect(imports.join('\n')).not.toMatch(/from\s+['"]react/);
    expect(imports.join('\n')).not.toMatch(/from\s+['"]@?\/?app\//);
  });

  it('deriva con base64url y no con un reemplazo de caracteres a mano', () => {
    const fuente = readFileSync(
      fileURLToPath(new URL('./colapso.ts', import.meta.url)),
      'utf8',
    );
    const codigo = fuente
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .join('\n');

    expect(codigo).toContain('base64url');
    // El relleno `=` y los caracteres `+` y `/` son justo los que
    // `BadWebPushTopic` rechaza, y hacerlo con `replace` es donde se olvida uno
    // de los tres.
    expect(codigo).not.toContain('.replace(');
  });
});
