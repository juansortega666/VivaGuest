import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { limpiarAseos, sembrarPeriodoCompleto, type EscenarioFinanciero } from '@/lib/test/aseos';
import { clienteAdminDePruebas } from '@/lib/test/clientes';

/**
 * NO PAGARLE DOS VECES A UNA PERSONA, MEDIDO BAJO CONCURRENCIA DE VERDAD.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE ARCHIVO EXISTE, Y NO ES CELO DE INGENIERO
 *
 * El bloque F de `supabase/tests/11_financiero.test.sql` ya ejerce la
 * idempotencia del cierre, pero LA EJERCE EN SECUENCIA: una corrida después de
 * otra, dentro de la misma sesión de pgTAP. Ese no es el escenario que la
 * garantía existe para cubrir.
 *
 * El escenario real es el que la propia migración 25 describe: **el job de
 * `pg_cron` y el botón «Cerrar el periodo ahora» del admin disparando a la
 * vez**, o dos ticks del cron solapándose porque el primero se demoró. Son DOS
 * PUERTAS distintas sobre UN solo núcleo, y nada fuera de Postgres las
 * coordina.
 *
 * La garantía se sostiene por construcción —`insert ... on conflict do nothing`
 * sobre la clave primaria de la cabecera lo serializa EL MOTOR, no el código—,
 * pero hasta este archivo no estaba MEDIDA. Y el modo de fallo no es una
 * pantalla fea: es una transferencia doble a un ser humano, descubierta por el
 * extracto bancario y sin forma de corregirse recalculando, porque D7-3 prohíbe
 * recalcular un periodo cerrado.
 *
 * ── POR QUÉ NO CABE EN pgTAP, Y POR QUÉ AQUÍ SÍ ────────────────────────────
 *
 * pgTAP corre en UNA sesión y dentro de UNA transacción: la concurrencia real
 * no cabe dentro de `11_financiero.test.sql` ni con trucos. El plan 07-14 dejó
 * dos caminos abiertos (un script de shell con dos `psql`, o un test de
 * integración) y se eligió ÉSTE, por una razón de mantenimiento y no de gusto:
 * un script suelto en `scripts/dev/` es un script que nadie vuelve a correr.
 * Aquí entra en `npm run test:integration` y se cae solo el día que alguien
 * toque el núcleo del cierre.
 *
 * ── LAS DOS CONEXIONES SON PROCESOS `psql` DE VERDAD ───────────────────────
 *
 * No son dos `Promise.all` sobre el mismo cliente ni dos peticiones a PostgREST:
 * son dos procesos independientes, cada uno con SU backend de Postgres, cada
 * uno con SU transacción explícita. Se lanzan con `docker exec` contra el
 * contenedor del stack local, que es una dependencia que esta suite YA tiene
 * (sin Docker no hay `npx supabase start` y no corre ni un test de este
 * proyecto de Vitest).
 *
 * ── LA BARRERA: `pg_sleep_until`, NO «a ver si coinciden» ──────────────────
 *
 * Las dos sesiones se conectan, entran en su transacción y se PARAN en un
 * `pg_sleep_until` sobre el MISMO instante, calculado por el propio Postgres
 * para que no dependa del reloj del proceso de Node. Cuando ese instante llega,
 * las dos despiertan a la vez y se pelean por la inserción de la cabecera. Sin
 * la barrera, la carrera dependería de cuánto tarde `docker exec` en arrancar,
 * que es justo el tipo de test que pasa en verde sin haber medido nada.
 *
 * Y el solape NO se asume: cada sesión anota `clock_timestamp()` justo antes y
 * justo después de la llamada al cierre, y el test EXIGE que los dos intervalos
 * se crucen. Si no se cruzan, la corrida no midió concurrencia y el test falla
 * diciéndolo, en vez de dar un verde tranquilizador.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El contenedor de Postgres del stack local, derivado de `supabase/config.toml`.
 *
 * Se lee del archivo y no se escribe literal: el nombre lo compone el CLI como
 * `supabase_db_<project_id>`, y quien renombre el proyecto no tiene por qué
 * acordarse de venir aquí.
 */
function contenedorDeLaBase(): string {
  const toml = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8');
  const encontrado = /^project_id\s*=\s*"([^"]+)"/m.exec(toml);
  if (!encontrado) {
    throw new Error('No se pudo leer project_id de supabase/config.toml');
  }
  return `supabase_db_${encontrado[1]}`;
}

type Corrida = {
  codigo: number | null;
  salida: string;
  error: string;
};

/**
 * Un proceso `psql` dentro del contenedor, con el guion por la entrada estándar.
 *
 * `ON_ERROR_STOP` va en ON a propósito: si el cierre revienta, el proceso sale
 * con código distinto de cero y el test lo ve. Es lo que hace que el señuelo de
 * este archivo (quitar el `on conflict do nothing`) se pueda detectar: sin esa
 * bandera, psql se tragaría el 23505 y seguiría hasta el `commit`.
 */
function psql(guion: string): Promise<Corrida> {
  return new Promise((resolve, reject) => {
    const proceso = spawn(
      'docker',
      [
        'exec',
        '-i',
        contenedorDeLaBase(),
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-X',
        '-q',
        '-t',
        '-A',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );

    let salida = '';
    let error = '';
    proceso.stdout.on('data', (trozo: Buffer) => {
      salida += trozo.toString('utf8');
    });
    proceso.stderr.on('data', (trozo: Buffer) => {
      error += trozo.toString('utf8');
    });
    proceso.on('error', reject);
    proceso.on('close', (codigo) => resolve({ codigo, salida, error }));

    proceso.stdin.write(guion);
    proceso.stdin.end();
  });
}

/** Lectura escalar rápida como `postgres`. Lanza si psql sale con error. */
async function escalar(consulta: string): Promise<string> {
  const r = await psql(`${consulta};\n`);
  if (r.codigo !== 0) {
    throw new Error(`psql salió con ${r.codigo}: ${r.error.trim()}`);
  }
  return r.salida.trim();
}

/** Una marca `ETIQUETA|valor` de la salida de una de las dos sesiones. */
function marca(corrida: Corrida, etiqueta: string): string {
  const linea = corrida.salida
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith(`${etiqueta}|`));
  if (!linea) {
    throw new Error(
      `La sesión no imprimió «${etiqueta}». Salida: ${JSON.stringify(corrida.salida)} · Error: ${corrida.error}`,
    );
  }
  return linea.slice(etiqueta.length + 1);
}

/** El SQL que ejecuta cada sesión, con su barrera y sus dos marcas de reloj. */
function guionDeCarrera(instante: string, llamada: string, preludio: string): string {
  return [
    'begin;',
    preludio,
    `select pg_sleep_until('${instante}'::timestamptz);`,
    "select 'T0|' || clock_timestamp()::text;",
    `select 'PAGOS|' || (${llamada})::text;`,
    "select 'T1|' || clock_timestamp()::text;",
    'commit;',
    '',
  ].join('\n');
}

/** Borra el snapshot de un periodo, para poder volver a cerrarlo. */
async function borrarSnapshot(desde: string): Promise<void> {
  await escalar(
    `delete from public.cleaner_payouts where periodo_desde = date '${desde}'`,
  );
  await escalar(
    `delete from public.payout_periods where periodo_desde = date '${desde}'`,
  );
}

const ADMIN_SEMILLA = '00000000-0000-4000-8000-000000000001';

let escenario: EscenarioFinanciero;
let adminId: string;
let adminCreadoAqui = false;

/** La referencia: lo que produce UNA corrida sola sobre el mismo escenario. */
let solaPagos: string;
let solaFilasDePago: string;
let solaLineas: string;

/** El resultado de la carrera. */
let sesionAdmin: Corrida;
let sesionJob: Corrida;

beforeAll(async () => {
  const admin = clienteAdminDePruebas();

  // ── UN ADMIN ACTIVO, QUE ES LO QUE LA PUERTA DEL ADMIN EXIGE ─────────────
  // `public.cerrar_periodo` llama a `private.is_admin()`, que consulta
  // `public.profiles` EN VIVO. Se reutiliza el admin del seed de desarrollo si
  // está, y si no se crea uno y se borra al final: `e2e/global-setup.ts` borra y
  // recrea los usuarios semilla, así que dar por hecho que el del seed existe es
  // exactamente la clase de suposición que contaminó la Wave 7 de esta fase.
  const { data: perfilSemilla } = await admin
    .from('profiles')
    .select('id')
    .eq('id', ADMIN_SEMILLA)
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle();

  if (perfilSemilla) {
    adminId = perfilSemilla.id;
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: `int.cierre.admin.${Date.now()}@vivaguest.test`,
      password: `pw-${Date.now()}`,
      email_confirm: true,
      app_metadata: { role: 'admin' },
      user_metadata: { role: 'admin', full_name: 'Admin del cierre concurrente' },
    });
    if (error || !data.user) {
      throw new Error(`No se pudo crear el admin de la prueba: ${error?.message}`);
    }
    adminId = data.user.id;
    adminCreadoAqui = true;
  }

  escenario = await sembrarPeriodoCompleto();

  const { desde, hasta } = escenario.periodo;

  // ── PASO 1. LA CORRIDA SOLA, QUE ES EL PATRÓN ORO ────────────────────────
  // Sin ella, «el mismo número de líneas» no tendría contra qué compararse y la
  // aserción sería un número mágico que envejece con el sembrador.
  solaPagos = await escalar(
    `select private.cerrar_periodo_core(date '${desde}', date '${hasta}')::text`,
  );
  solaFilasDePago = await escalar(
    `select coalesce(string_agg(p.aseador_id::text || '=' || p.monto_total::text, ',' order by p.aseador_id::text), '<vacio>')
       from public.cleaner_payouts p where p.periodo_desde = date '${desde}'`,
  );
  solaLineas = await escalar(
    `select count(*)::text from public.cleaner_payout_lines l
      where l.payout_id in (select id from public.cleaner_payouts where periodo_desde = date '${desde}')`,
  );

  // ── PASO 2. SE BORRA EL SNAPSHOT Y SE REPITE, PERO A DOS MANOS ───────────
  await borrarSnapshot(desde);

  // El instante de la barrera lo calcula POSTGRES, no Node: el reloj del
  // contenedor es el único que las dos sesiones comparten con certeza.
  const instante = await escalar(
    "select (clock_timestamp() + interval '5 seconds')::text",
  );

  const claims = JSON.stringify({ sub: adminId, role: 'authenticated' });

  [sesionAdmin, sesionJob] = await Promise.all([
    // LA PUERTA DEL ADMIN: el botón «Cerrar el periodo ahora» de UI-SPEC §9.5,
    // con la sesión de un admin real, guarda de rol incluida.
    psql(
      guionDeCarrera(
        instante,
        `public.cerrar_periodo(date '${desde}', date '${hasta}')`,
        [
          `select set_config('request.jwt.claims', '${claims}', true);`,
          'set local role authenticated;',
        ].join('\n'),
      ),
    ),
    // LA PUERTA DEL JOB: lo mismo que ejecuta `public.cerrar_periodo_si_toca()`
    // desde `pg_cron` una vez pasada su guarda de calendario.
    psql(
      guionDeCarrera(
        instante,
        `private.cerrar_periodo_core(date '${desde}', date '${hasta}')`,
        '',
      ),
    ),
  ]);
}, 180_000);

afterAll(async () => {
  // El snapshot NO cae con `limpiarAseos`: las tres tablas de la migración 23 no
  // tienen clave foránea hacia el mundo vivo, que es justo el requisito FIN-04.
  // Dejarlo aquí le encendería el aviso de «periodo pendiente» a la suite
  // siguiente y le movería los conteos.
  if (escenario) {
    await borrarSnapshot(escenario.periodo.desde);
  }
  await limpiarAseos();
  if (adminCreadoAqui && adminId) {
    await clienteAdminDePruebas().auth.admin.deleteUser(adminId);
  }
}, 120_000);

describe('el cierre del periodo, disparado por las dos puertas a la vez', () => {
  test('las dos sesiones terminaron limpias, sin dejar ninguna transacción abierta', () => {
    expect(
      { codigo: sesionAdmin.codigo, error: sesionAdmin.error.trim() },
      'la puerta del admin tenía que confirmar su transacción sin error',
    ).toEqual({ codigo: 0, error: '' });

    expect(
      { codigo: sesionJob.codigo, error: sesionJob.error.trim() },
      'la puerta del job tenía que confirmar su transacción sin error',
    ).toEqual({ codigo: 0, error: '' });

    // Las dos llegaron HASTA EL FINAL: la marca T1 es posterior a la llamada al
    // cierre, así que su presencia descarta un `commit` sobre una transacción
    // abortada a mitad.
    expect(marca(sesionAdmin, 'T1')).not.toHaveLength(0);
    expect(marca(sesionJob, 'T1')).not.toHaveLength(0);
  });

  test('las dos estuvieron DENTRO de la llamada al mismo tiempo: el solape está medido', () => {
    const inicioAdmin = Date.parse(marca(sesionAdmin, 'T0'));
    const finAdmin = Date.parse(marca(sesionAdmin, 'T1'));
    const inicioJob = Date.parse(marca(sesionJob, 'T0'));
    const finJob = Date.parse(marca(sesionJob, 'T1'));

    // Si esto falla, la corrida NO midió concurrencia y ninguna de las
    // aserciones de abajo significa nada: dos llamadas que se estorbaron por
    // casualidad dejan el mismo estado que dos llamadas simultáneas.
    const haySolape = inicioAdmin < finJob && inicioJob < finAdmin;
    expect(
      haySolape,
      `Los intervalos no se cruzaron: admin [${marca(sesionAdmin, 'T0')} .. ${marca(sesionAdmin, 'T1')}] vs job [${marca(sesionJob, 'T0')} .. ${marca(sesionJob, 'T1')}]`,
    ).toBe(true);
  });

  test('una sola de las dos escribió: la otra recibió cero pagos y salió en silencio', () => {
    const pagos = [marca(sesionAdmin, 'PAGOS'), marca(sesionJob, 'PAGOS')].sort();

    // La que gana devuelve lo mismo que la corrida sola; la que pierde devuelve
    // cero. Cuál de las dos gana es indiferente y no se afirma: eso es
    // precisamente lo que significa que las dos puertas sean intercambiables.
    expect(pagos).toEqual(['0', solaPagos].sort());
  });

  test('queda UNA sola cabecera de periodo, no dos', async () => {
    const cabeceras = await escalar(
      `select count(*)::text from public.payout_periods where periodo_desde = date '${escenario.periodo.desde}'`,
    );
    expect(cabeceras).toBe('1');
  });

  test('un pago por aseadora, con el monto correcto y NO el doble', async () => {
    const filas = await escalar(
      `select coalesce(string_agg(p.aseador_id::text || '=' || p.monto_total::text, ',' order by p.aseador_id::text), '<vacio>')
         from public.cleaner_payouts p where p.periodo_desde = date '${escenario.periodo.desde}'`,
    );

    // La comparación es contra la corrida sola y no contra una cifra literal: si
    // el sembrador cambia, esta prueba sigue midiendo lo suyo. Y si la carrera
    // hubiera pagado dos veces, el monto sería el doble y esta cadena no
    // coincidiría.
    expect(filas).toBe(solaFilasDePago);
    expect(filas).not.toBe('<vacio>');
  });

  test('el desglose tiene exactamente las mismas líneas que una corrida sola', async () => {
    const lineas = await escalar(
      `select count(*)::text from public.cleaner_payout_lines l
        where l.payout_id in (select id from public.cleaner_payouts where periodo_desde = date '${escenario.periodo.desde}')`,
    );
    expect(lineas).toBe(solaLineas);
    expect(Number(lineas)).toBeGreaterThan(0);
  });
});
