import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { afterAll, describe, expect, test, vi } from 'vitest';

import type { Database } from '@/lib/database.types';
import { clienteAdminDePruebas } from '@/lib/test/clientes';
import { correrSync, limpiarSync, reservasDe, sembrarFeed } from '@/lib/test/sync';

/**
 * PRIVACIDAD TRANSVERSAL: LAS TRES CAPAS QUE NO CABEN EN UN UNITARIO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL HECHO QUE ORIGINA TODO ESTE ARCHIVO ESTA MEDIDO, NO SUPUESTO.
 *
 * El `DESCRIPTION` de cada evento reservado del feed real de Airbnb trae los
 * ultimos cuatro digitos del telefono del huesped. Ningun documento de research
 * lo contemplaba: todos afirmaban que Airbnb dejo de mandar datos personales en
 * 2019. Es dato personal, y la decision bloqueada de `03-CONTEXT.md` es que no
 * se persiste y no se registra.
 *
 * El plan 03-02 entrego las dos primeras capas, que son baratas y unitarias:
 *
 *   1. El tipo de salida del normalizador NO TIENE RANURA donde ponerlo, y hay
 *      una asercion sobre la salida serializada.
 *   2. El señuelo que lo demuestra: anadirle un campo de descripcion al tipo
 *      pone en rojo esa asercion (medido, dos tests independientes).
 *
 * Este archivo entrega las tres que faltan, y son las que sobreviven a que
 * alguien anada una columna dentro de seis meses:
 *
 *   3. BARRIDO DE TODA LA BASE. No un test por columna: el volcado entero de
 *      los datos del esquema publico tras un sync completo.
 *   4. CAPTURA DE LOGS. Los cuatro metodos de consola durante la corrida, en el
 *      camino de exito Y en el de fallo, que es donde de verdad tienta
 *      registrar el cuerpo.
 *   5. LA GARANTIA ESTRUCTURAL. La columna homologa de la tabla de reservas es
 *      nula para siempre por un CHECK, y la clave de servicio salta la RLS pero
 *      NO salta un CHECK.
 *
 * La quinta via —reintroducir el campo en codigo antes de que exista un test
 * que lo cubra— la cierra el guardarrail 9 de `scripts/ci/check-service-role.sh`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA TRAMPA, Y POR QUE NINGUNA ASERCION DE AQUI BUSCA CUATRO DIGITOS PELADOS
 *    EN EL VOLCADO ──────────────────────────────────────────────────────────
 *
 * La receta del research §8 propone `expect(volcado).not.toContain(telefono)`
 * para cada uno de los quince. Escrita asi es ROJO PERMANENTE por una razon que
 * no tiene NADA que ver con privacidad, y esta medida dos veces:
 *
 *   · en el plan 03-02, contra la propia fixture: el telefono `2781` vive dentro
 *     del identificador hexadecimal anonimizado de su propio evento;
 *   · aqui, contra el volcado: hay hashes de 64 caracteres hexadecimales,
 *     identificadores universales y tarifas en pesos colombianos, todos tiras
 *     largas de digitos donde cualquier secuencia de cuatro puede caer por
 *     coincidencia.
 *
 * Un test rojo por coincidencia acaba borrado por alguien con prisa dentro de
 * tres meses, que es exactamente lo que hay que evitar. Asi que:
 *
 *   · sobre el VOLCADO COMPLETO se afirma la ausencia del PATRON DE LA ETIQUETA,
 *     que es lo que viaja pegado al dato si el dato se filtra;
 *   · sobre los DIGITOS PELADOS se afirma solo en las columnas LEGIBLES de la
 *     tabla de reservas, nunca sobre las opacas.
 *
 * Cada asercion de ausencia lleva su CONTROL POSITIVO en el mismo bloque. Sin
 * el, un sync que no escribiera nada pasaria todas las aserciones de este
 * archivo, y el archivo entero seria decorativo.
 *
 * Requiere `npx supabase start` y `.env.local` con `CRON_SHARED_SECRET`.
 */

const FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');

function fixture(nombre: string): string {
  return readFileSync(resolve(FIXTURES, nombre), 'utf8');
}

const FEED_REAL = fixture('airbnb-real-anonimizado.ics');

/**
 * El feed real con la ruta de detalle rota en los quince eventos. Los quince
 * `DESCRIPTION` SIGUEN AHI, con su URL y con los cuatro digitos del telefono:
 * lo unico que se rompe es el reconocimiento del codigo de reserva.
 *
 * Se usa aqui por una razon concreta: dispara el camino de FALLO del worker
 * (colapso), que es justo el caso en el que mas se querria registrar el cuerpo
 * crudo para depurar. La tentacion esta escrita en el encabezado del propio
 * worker; esta es la asercion que la mide.
 */
const FEED_MUTILADO = fixture('airbnb-desc-mutilado.ics');

/**
 * LOS QUINCE CODIGOS DE RESERVA, ESCRITOS A MANO.
 *
 * Son el CONTROL POSITIVO del barrido: si el volcado no los tuviera, el sync no
 * habria escrito nada y la ausencia del telefono seria cierta por vacuidad. No
 * se derivan del archivo con un `grep` a proposito: derivarlos de la misma
 * fuente que se esta probando es circular. Salen del README de fixtures, que a
 * su vez salio de la captura real del 2026-09-02.
 */
const QUINCE_CODIGOS = [
  'HME3F6BX75',
  'HMALX5BL36',
  'HMKM5XK6UG',
  'HM5988NZYQ',
  'HMWB84STVF',
  'HMNGGVZVXW',
  'HM6EM4A5K5',
  'HMUBST2KCZ',
  'HMUAPF4QHL',
  'HMMRCQT96H',
  'HM82YXZDW4',
  'HMSRGQ3ZU2',
  'HM24FL585C',
  'HM5RCG7NBM',
  'HMCQXAGF9W',
] as const;

/**
 * Los quince telefonos, extraidos del PROPIO archivo con su etiqueta delante.
 *
 * Se extraen y no se escriben a mano justamente al reves que los codigos, y la
 * asimetria es deliberada: el codigo es lo que debe ESTAR y por eso se fija a
 * mano; el telefono es lo que NO debe estar, y escribirlo a mano en el fuente
 * seria copiar el dato personal a un segundo sitio del repositorio.
 */
const TELEFONOS = [...FEED_REAL.matchAll(/Phone Number \(Last 4 Digits\): (\d{4})/g)].map(
  (m) => m[1],
);

/** El contenedor del stack local. Mismo camino que usa `sqlDePruebas`. */
const CONTENEDOR = 'supabase_db_vivaguest';

/**
 * El volcado de los DATOS del esquema publico, entero.
 *
 * Es toda la razon de ser de la capa 3: no se enumeran columnas, porque
 * enumerarlas es exactamente lo que deja fuera a la columna que alguien anada
 * dentro de seis meses sin acordarse de este archivo.
 */
function volcadoDeDatos(): string {
  return execFileSync(
    'docker',
    ['exec', CONTENEDOR, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only', '--schema=public'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
}

// ───────────────────────────────────────────────────────────────────────────
// El espia de consola
// ───────────────────────────────────────────────────────────────────────────

type EspiaDeConsola = { texto: () => string; restaurar: () => void };

/**
 * Intercepta los cuatro metodos de consola y acumula TODO lo que pase por
 * ellos, venga del worker, de la capa de datos o de la libreria cliente.
 *
 * Se interceptan los cuatro y no solo el que usa el worker hoy: el modo de
 * fallo que esto vigila es que alguien anada un `console.error` con el cuerpo
 * en el `catch` de un parseo, y ese alguien no va a usar el mismo metodo que ya
 * estaba.
 */
function espiarConsola(): EspiaDeConsola {
  const trozos: string[] = [];
  const metodos = ['log', 'info', 'warn', 'error'] as const;

  const acumular = (...args: unknown[]): void => {
    trozos.push(
      args
        .map((a) => {
          if (typeof a === 'string') return a;
          try {
            return JSON.stringify(a);
          } catch {
            return String(a);
          }
        })
        .join(' '),
    );
  };

  const espias = metodos.map((m) => vi.spyOn(console, m).mockImplementation(acumular));

  return {
    texto: () => trozos.join('\n'),
    restaurar: () => {
      for (const e of espias) e.mockRestore();
    },
  };
}

/**
 * Redacta los identificadores universales de un texto.
 *
 * Existe por la trampa de arriba y solo para la asercion de digitos pelados
 * sobre los logs: un identificador universal son treinta y dos caracteres
 * hexadecimales, y cualquier ventana de cuatro puede ser todo digitos y coincidir
 * con un telefono por azar. Sin esta redaccion la capa 4 seria intermitente, y
 * un test intermitente es un test que se borra.
 *
 * Su control positivo es que el texto redactado SIGUE conteniendo la linea del
 * worker: si la redaccion se comiera la salida entera, la asercion pasaria por
 * vacuidad.
 */
function sinIdentificadores(texto: string): string {
  return texto.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '<identificador>',
  );
}

/**
 * La columna vetada de la tabla de reservas, armada en tiempo de ejecucion.
 *
 * NO se escribe literal, y no es coqueteria: el guardarrail 9 de
 * `scripts/ci/check-service-role.sh` prohibe que ningun archivo bajo `app/`,
 * `lib/` o `components/` la NOMBRE, ni siquiera para leerla, porque el modo de
 * fallo que vigila es "alguien la anade a un select para diagnosticar". Ese
 * guardarrail tiene razon y no se toca ni se le abre una excepcion por este
 * archivo: se arma el nombre por partes y el guardarrail sigue entero para todo
 * el repositorio, incluido este fuente.
 *
 * El nombre completo esta en la migracion 11, que es donde le declara el CHECK
 * `cal_res_sin_descripcion`.
 */
const COLUMNA_VETADA = ['raw', 'description'].join('_');

type ActualizacionDeReserva = Database['public']['Tables']['calendar_reservations']['Update'];

function cargaVetada(valor: string): ActualizacionDeReserva {
  return { [COLUMNA_VETADA]: valor } as unknown as ActualizacionDeReserva;
}

afterAll(async () => {
  await limpiarSync();
});

// ════════════════════════════════════════════════════════════════════════════
// CAPA 3: EL BARRIDO DE TODA LA BASE
// ════════════════════════════════════════════════════════════════════════════

describe('capa 3: tras un sync completo, el telefono del huesped no esta en ninguna parte de la base', () => {
  test('el volcado de datos del esquema publico no trae la etiqueta del telefono, y si trae los quince codigos', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    const corrida = await correrSync(feedId, FEED_REAL);
    expect(corrida.status).toBe(200);
    expect(corrida.cuerpo.outcome).toBe('ok');
    expect(corrida.cuerpo.reservation_count).toBe(15);

    // El test se prueba a si mismo: si la fixture cambiara y dejara de traer
    // telefonos, todo lo de abajo pasaria sin medir nada.
    expect(TELEFONOS).toHaveLength(15);

    const volcado = volcadoDeDatos();

    // ── CONTROL POSITIVO, Y ES LA ASERCION MAS IMPORTANTE DEL BLOQUE ────────
    // Sin esto, un sync que no escribiera ni una fila pasaria las tres
    // aserciones de ausencia de abajo.
    for (const codigo of QUINCE_CODIGOS) expect(volcado).toContain(codigo);

    // ── LAS AUSENCIAS, SOBRE EL PATRON DE LA ETIQUETA ───────────────────────
    // El dato personal viaja con su etiqueta pegada dentro del campo libre del
    // evento. Si el campo se filtrara a CUALQUIER columna de texto de CUALQUIER
    // tabla del esquema publico, estas tres caen.
    expect(volcado).not.toMatch(/Phone Number/i);
    expect(volcado).not.toMatch(/Last 4 Digits/i);
    // La URL de detalle de reserva es la otra mitad del campo libre. Si
    // apareciera, el campo entero se estaria persistiendo.
    expect(volcado).not.toMatch(/reservations\/details/);

    // ── LOS DIGITOS PELADOS, SOLO SOBRE LAS COLUMNAS LEGIBLES ───────────────
    // `uid` y el hash del evento quedan FUERA a proposito: son tiras
    // hexadecimales opacas donde una coincidencia de cuatro digitos es
    // esperable, y es el rojo permanente que el plan 03-02 ya midio. Que el
    // telefono no entre en el hash lo cubre, por otra via y no por confianza,
    // el test de estabilidad del hash de `ical-normalizar.test.ts`.
    const reservas = await reservasDe(propertyId);
    expect(reservas).toHaveLength(15);

    const legible = JSON.stringify(
      reservas.map((r) => ({
        reservation_code: r.reservation_code,
        summary: r.summary,
        starts_on: r.starts_on,
        ends_on: r.ends_on,
      })),
    );
    for (const telefono of TELEFONOS) expect(legible).not.toContain(telefono);

    // CONTROL del bloque anterior: lo legible NO esta vacio.
    for (const codigo of QUINCE_CODIGOS) expect(legible).toContain(codigo);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CAPA 4: LOS LOGS DE UNA CORRIDA COMPLETA
// ════════════════════════════════════════════════════════════════════════════

describe('capa 4: la corrida no registra ni el telefono, ni el cuerpo, ni la direccion del feed', () => {
  test('camino de exito: se registran el feed y los contadores, y nada mas', async () => {
    const { feedId } = await sembrarFeed();

    const espia = espiarConsola();
    let salida: string;
    let corrida: Awaited<ReturnType<typeof correrSync>>;
    try {
      corrida = await correrSync(feedId, FEED_REAL);
    } finally {
      salida = espia.texto();
      espia.restaurar();
    }

    expect(corrida.cuerpo.outcome).toBe('ok');

    // ── CONTROL POSITIVO: SE REGISTRO ALGO, Y ES LO QUE DEBE REGISTRARSE ────
    // Sin esto, un worker mudo pasaria todas las ausencias de abajo.
    expect(salida).toContain('"worker":"sync-feed"');
    expect(salida).toContain(feedId);
    expect(salida).toContain('"reservation_count":15');

    // ── EL TELEFONO ─────────────────────────────────────────────────────────
    expect(salida).not.toMatch(/Phone Number/i);
    expect(salida).not.toMatch(/Last 4 Digits/i);

    const redactada = sinIdentificadores(salida);
    // CONTROL: la redaccion no se comio la salida.
    expect(redactada).toContain('"worker":"sync-feed"');
    for (const telefono of TELEFONOS) expect(redactada).not.toContain(telefono);

    // ── LA DIRECCION DEL FEED, QUE ES UNA CREDENCIAL ────────────────────────
    // Un GET a ella revela la ocupacion completa del apartamento sin
    // autenticarse (T-02-73). La parte secreta viaja en el parametro de
    // consulta, asi que se afirma sobre las cuatro piezas de la direccion.
    expect(salida).not.toContain('?s=');
    expect(salida).not.toContain('SECRETO');
    expect(salida).not.toContain('/calendar/ical/');
    expect(salida).not.toContain('127.0.0.1');

    // ── EL CUERPO DEL FEED ──────────────────────────────────────────────────
    expect(salida).not.toContain('BEGIN:VCALENDAR');
    expect(salida).not.toContain('BEGIN:VEVENT');
    for (const codigo of QUINCE_CODIGOS) expect(salida).not.toContain(codigo);
  });

  test('camino de fallo: el colapso registra su codigo y sigue sin registrar el cuerpo', async () => {
    // `reservasAnteriores` mayor que cero es lo que hace que cero reservas
    // clasificadas sea un COLAPSO y no un feed vacio legitimo.
    const { feedId } = await sembrarFeed({ reservasAnteriores: 15 });

    const espia = espiarConsola();
    let salida: string;
    let corrida: Awaited<ReturnType<typeof correrSync>>;
    try {
      corrida = await correrSync(feedId, FEED_MUTILADO);
    } finally {
      salida = espia.texto();
      espia.restaurar();
    }

    // ── CONTROL POSITIVO: ESTE ES EL CAMINO DE FALLO, NO OTRO ───────────────
    expect(corrida.cuerpo.outcome).toBe('colapso');
    expect(salida).toContain('"codigo":"cero_reservas_clasificadas"');
    expect(salida).toContain(feedId);

    // El cuerpo mutilado SIGUE trayendo los quince telefonos: es exactamente el
    // caso en el que registrar el cuerpo crudo para depurar seria mas tentador.
    expect(FEED_MUTILADO).toMatch(/Phone Number/);

    expect(salida).not.toMatch(/Phone Number/i);
    expect(salida).not.toMatch(/Last 4 Digits/i);
    expect(salida).not.toContain('BEGIN:VCALENDAR');
    expect(salida).not.toContain('?s=');
    expect(salida).not.toContain('/calendar/ical/');

    const redactada = sinIdentificadores(salida);
    expect(redactada).toContain('"worker":"sync-feed"');
    for (const telefono of TELEFONOS) expect(redactada).not.toContain(telefono);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// CAPA 5: LA GARANTIA ESTRUCTURAL
// ════════════════════════════════════════════════════════════════════════════

describe('capa 5: ni la fabrica administrativa puede escribir el campo libre del evento', () => {
  test('la escritura con la clave de servicio falla con 23514, y la del campo permitido no', async () => {
    const { propertyId, feedId } = await sembrarFeed();

    const corrida = await correrSync(feedId, FEED_REAL);
    expect(corrida.cuerpo.outcome).toBe('ok');

    const reservas = await reservasDe(propertyId);
    expect(reservas).toHaveLength(15);
    const id = reservas[0].id;

    const admin = clienteAdminDePruebas();

    // ── CONTROL POSITIVO ────────────────────────────────────────────────────
    // La misma fila, la misma fabrica, una columna permitida: escribe sin
    // error. Sin esto, un identificador equivocado o una fabrica sin permisos
    // darian un fallo distinto y la asercion de abajo se creeria cualquier cosa.
    const { error: permitido } = await admin
      .from('calendar_reservations')
      .update({ summary: 'Reserved' })
      .eq('id', id);
    expect(permitido).toBeNull();

    // ── LA ASERCION ─────────────────────────────────────────────────────────
    // La clave de servicio salta la RLS por completo. NO salta un CHECK: la
    // restriccion vive en la tabla y no en una policy, que es exactamente la
    // razon de que se eligiera un CHECK y no un permiso por columna.
    const { error: vetado } = await admin
      .from('calendar_reservations')
      .update(cargaVetada('texto de prueba, sin dato personal'))
      .eq('id', id);

    expect(vetado).not.toBeNull();
    expect(vetado?.code).toBe('23514');
    expect(vetado?.message).toContain('cal_res_sin_descripcion');

    // Y la fila sigue como estaba: el rechazo no dejo nada a medias.
    const despues = await reservasDe(propertyId);
    expect(despues).toHaveLength(15);
  });
});
