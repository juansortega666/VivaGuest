import type { Page } from '@playwright/test';

import { formatFechaBog } from '@/lib/domain/dates';

import {
  diaDeNegocio,
  esperarControlHidratado,
  expect,
  sumarDias,
  test,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';
import {
  aseosDe,
  aseosVivosDe,
  conectarFeed,
  correrSync,
  correrSyncEncadenado,
  icsDe,
  limpiarRecorrido,
  sembrarUnidadDeRecorrido,
} from './recorrido.fixtures';

/**
 * LA PRIMERA JUNTA DEL CORE VALUE: DEL `.ics` AL ASEO QUE EL ADMIN VE.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO ES EL ÚNICO DEL REPO CUYO ASEO NO LO ESCRIBIÓ NADIE.
 *
 * Los otros 160 casos E2E siembran el aseo con un `insert` directo en
 * `cleanings`. Prueban la pantalla, que es legítimo, pero no pueden probar la
 * junta: una sincronización que nunca genera el aseo, o que lo genera un día
 * antes, deja los 160 en verde y el producto roto. El Core Value dice «todo
 * checkout detectado en calendario termina en un aseo confirmado», y hasta aquí
 * el «detectado en calendario» no lo afirmaba ninguna prueba de interfaz.
 *
 * LA PROHIBICIÓN QUE ESTE ARCHIVO ENCARNA: aquí no hay ni un `insert` sobre
 * `cleanings`. El aseo nace del feed o el caso no prueba nada, y el grep que lo
 * vigila es parte de la compuerta de la fase.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── CÓMO SE CORRE ──────────────────────────────────────────────────────────
 *
 *     PLAYWRIGHT_PORT=3210 npx playwright test e2e/recorrido-core.spec.ts
 *
 * El puerto propio no es opcional en una máquina con más de un checkout: con el
 * 3000 ocupado por otro proyecto, `reuseExistingServer` reutiliza el ajeno sin
 * avisar y la suite mide otra aplicación. La medición está en
 * `playwright.config.ts` y en `.planning/codebase/TESTING.md`.
 *
 * ── LA DISCIPLINA DE ASERCIONES DE UN RECORRIDO LARGO ──────────────────────
 *
 * Un caso de veinte aserciones aborta en la primera que falle, así que un
 * señuelo puede poner rojo el caso sin que nadie sepa QUÉ aserción lo atrapó, o
 * peor: puede estar atrapándolo una aserción anterior por otro motivo. Por eso
 * TODA aserción de este archivo lleva mensaje propio, y la bitácora de abajo
 * anota el mensaje literal que salió en rojo, no «el caso falló».
 *
 * ── BITÁCORA DE SEÑUELOS (plan 09-01, 2026-09-18) ──────────────────────────
 *
 * Una suite en verde demuestra que el código pasa los tests. NO demuestra que
 * los tests puedan fallar. Los cinco defectos de abajo se metieron a propósito
 * EN EL PRODUCTO, se corrieron, se anotó qué se puso rojo y se revirtieron.
 *
 * | # | Qué se rompió | Qué se puso rojo |
 * |---|---|---|
 * | 1 | `ical-normalizar.ts`: un día menos al `DTEND` | (1ª vuelta, estadía de UNA noche) «el cuerpo trae UNA reserva clasificada…», NO la de la fecha. Con el rango colapsado, `res_dates_ok` la tumba antes. (2ª vuelta, cuatro noches) «el aseo va el día del DTEND (…), SIN sumarle ni restarle un día…», y ninguna otra: 1 caso rojo de 3 |
 * | 2 | `ical-clasificar.ts`: el bloqueo devuelto como `reserva` | «el cuerpo trae UNA reserva clasificada…». Con `expect.soft` se midió el radio completo: caen también «el cuerpo trae UN bloqueo clasificado…» y «un checkout produce UN aseo…». Tres capas distintas, ninguna redundante |
 * | 3 | migración 04: los dos índices únicos parciales dejan de cubrir los aseos VIVOS (`where state = 'cancelada'`) | los 3 casos. «un checkout produce UN aseo…», «después de la segunda corrida sigue habiendo UN aseo…» y «y lo crea DE VERDAD: `cleanings_created` en 1…». El duplicado del primer sync lo mete la REPESCA ADITIVA del paso (e.3) de la migración 13, que repite el paso (c): su idempotencia es el índice y nada más |
 * | 4 | `route.ts` bloque 8: el atajo del hash sin su segunda condición | (1ª vuelta) NADA. El sembrador dejaba `last_payload_hash` en nulo, así que el atajo no se alcanzaba nunca. Es lo que obligó a escribir `conectarFeed()`. (2ª vuelta) «el worker tiene que terminar en `ok`…», y con `expect.soft` también «…UNA reserva clasificada», «…UN bloqueo clasificado» y «un checkout produce UN aseo…». `hits` sigue verde: el fetch sí ocurre |
 * | 5 | `lib/data/operacion.ts`: ventana de lectura estrechada a `hoy + 1` | SOLO «el aseo que salió del feed tiene que verse en /operacion…». Las cinco aserciones de base pasaron. Es lo que demuestra que la pantalla y la base no miden lo mismo |
 */

/** La cabecera colapsable de un bloque de día, por su rótulo. */
function cabeceraDeBloque(p: Page, rotulo: string) {
  return p.getByRole('button', {
    name: new RegExp(`^${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
  });
}

/**
 * El rótulo de un día sin rótulo relativo: la fecha corta capitalizada, que es
 * lo que compone la cabecera de cada uno de los cinco días de `Siguientes`.
 */
function rotuloDeFecha(fecha: string): string {
  const corta = formatFechaBog(fecha);
  return corta.charAt(0).toUpperCase() + corta.slice(1);
}

/**
 * Abre un bloque si estaba cerrado, y lo deja como está si ya estaba abierto.
 *
 * Un `.click()` a secas sobre un bloque ya abierto lo CIERRA, y el fallo aparece
 * después, buscando una fila que sí existe. Y el `esperarControlHidratado()` de
 * delante no sobra: la cabecera es de un client component que llega por
 * streaming, y un clic sobre el nodo antes de que React le monte el manejador
 * «funciona» sin hacer nada.
 */
async function abrirBloque(p: Page, rotulo: string) {
  const cabecera = cabeceraDeBloque(p, rotulo);
  await esperarControlHidratado(cabecera);
  if ((await cabecera.getAttribute('aria-expanded')) === 'false') await cabecera.click();
  await expect(cabecera, `el bloque ${rotulo} tiene que quedar abierto`).toHaveAttribute(
    'aria-expanded',
    'true',
  );
}

let servicio: Servicio;
/** El día de negocio SEGÚN LA BASE. Nunca del reloj del proceso. */
let hoy = '';

test.beforeAll(async () => {
  // El `globalSetup` cargó el entorno en SU proceso; este worker es otro. Sin
  // esto, `correrSync()` no vería `CRON_SHARED_SECRET` y lanzaría antes de
  // llegar al worker.
  cargarEnvLocal();
  servicio = clienteDeServicio();
  hoy = await diaDeNegocio(servicio);
});

test.afterAll(async () => {
  await limpiarRecorrido(servicio);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. EL TRAMO COMPLETO: `.ics` → SYNC → ASEO → PANTALLA DEL ADMIN
// ───────────────────────────────────────────────────────────────────────────

test('un checkout publicado en el .ics se vuelve un aseo con su fecha, y el admin lo ve en /operacion', async ({
  paginaAdmin,
  request,
}) => {
  const unidad = await sembrarUnidadDeRecorrido(servicio, { etiqueta: 'Tracer' });

  // La última noche es mañana y el CHECKOUT es pasado mañana. Las dos fechas son
  // relativas al día de negocio: un `.ics` con fechas escritas a mano deja de
  // probar lo que dice en cuanto pasa el mes.
  const ultimaNoche = sumarDias(hoy, 1);
  const checkout = sumarDias(hoy, 2);

  const cuerpo = icsDe(hoy, [
    // Una reserva, con su código dentro de la `DESCRIPTION` como en los feeds de
    // verdad.
    //
    // ── LA ESTADÍA ES DE CUATRO NOCHES Y NO DE UNA, Y ESO LO DECIDIÓ UN SEÑUELO ─
    // Con `desde: 1` (una sola noche), restarle un día al `DTEND` en el
    // normalizador deja `ends_on === starts_on`, la reserva incumple
    // `res_dates_ok` del RPC y sale contada como DESCONOCIDA. O sea que el
    // defecto de la fecha se manifestaba como «cero reservas» y lo atrapaba la
    // aserción de conteos, tres aserciones ANTES de llegar a la de la fecha, que
    // es la que este caso existe para sostener. Con cuatro noches el rango sigue
    // siendo válido tras el defecto y el aseo aterriza en el día equivocado, que
    // es lo que hay que poder ver.
    { desde: -2, hasta: 2, uid: `rec-reserva-${unidad.sufijo}@airbnb.com`, codigo: 'HMYXB825YD' },
    // Y un bloqueo del propietario, que NO debe generar nada. Va en el mismo
    // cuerpo a propósito: si estuviera en otro caso, la aserción de «un solo
    // aseo» pasaría por no haber visto nunca un bloqueo.
    { desde: 20, hasta: 25, uid: `rec-bloqueo-${unidad.sufijo}@airbnb.com` },
  ]);

  // El admin ya conectó el calendario con ESTE cuerpo, que es el estado de
  // partida real: `last_payload_hash` escrito y ninguna corrida hecha todavía.
  // Sin esto, el primer sync nunca entra en el atajo del hash y la guarda que lo
  // impide se queda sin ejercitar (ver la cabecera de `conectarFeed`).
  await conectarFeed(unidad.feedId, cuerpo);

  const corrida = await correrSync(request, unidad.feedId, cuerpo);

  // ── (a) LO QUE DICE EL WORKER ────────────────────────────────────────────
  expect(
    corrida.cuerpo.outcome,
    'el worker tiene que terminar en `ok`: cualquier otro outcome significa que una guarda cortó antes del RPC y el aseo no llegó a nacer',
  ).toBe('ok');

  expect(
    corrida.hits,
    'el proveedor tiene que recibir EXACTAMENTE un hit: cero significa que el fetch no ocurrió y la corrida se resolvió sin mirar el feed',
  ).toBe(1);

  expect(
    corrida.cuerpo.reservation_count,
    'el cuerpo trae UNA reserva clasificada: si sale 0 el clasificador dejó de reconocer el `Reserved`, y si sale 2 se tragó el bloqueo como reserva',
  ).toBe(1);

  expect(
    corrida.cuerpo.block_count,
    'el cuerpo trae UN bloqueo clasificado: si sale 0 el `Airbnb (Not available)` se fue por otra rama y dejaría de ser inocuo',
  ).toBe(1);

  // ── (b) LO QUE QUEDÓ ESCRITO, QUE ES LA ASERCIÓN CENTRAL DEL TRAMO ───────
  const aseos = await aseosDe(servicio, unidad.propiedadId);

  expect(
    aseos,
    'un checkout produce UN aseo y el bloqueo no produce ninguno: dos aseos significan que el bloqueo generó el suyo',
  ).toHaveLength(1);

  expect(
    aseos[0].origin,
    'el aseo nació del calendario (`origin = ical`) y no de una mano: si dijera `manual`, este caso estaría probando otra cosa',
  ).toBe('ical');

  expect(
    aseos[0].state,
    'el aseo nace `pendiente`: es un aseo de trabajo que todavía nadie confirmó',
  ).toBe('pendiente');

  expect(
    aseos[0].confirmado_at,
    'y nace SIN confirmar: el número de huéspedes y las instrucciones los pone el admin, no el sync',
  ).toBeNull();

  expect(
    aseos[0].scheduled_date,
    `el aseo va el día del DTEND (${checkout}), SIN sumarle ni restarle un día: restarlo lo mandaría a la última noche (${ultimaNoche}), con el huésped todavía dentro`,
  ).toBe(checkout);

  // ── (c) Y LO QUE EL ADMIN VE, QUE ES OTRA COSA QUE LA BASE ───────────────
  // La base puede tener el aseo perfecto y la pantalla no pintarlo: una ventana
  // de lectura estrecha, un filtro de más, un bloque que no agrupa. Esta parte
  // es la que separa «el dato existe» de «el producto lo muestra».
  await paginaAdmin.goto('/operacion');

  // El checkout cae en `hoy + 2`, o sea dentro de `Siguientes`, que nace
  // colapsado (§8.1). El día de dentro nace expandido porque al montar ya tenía
  // su fila; `abrirBloque()` cubre los dos casos.
  await abrirBloque(paginaAdmin, 'Siguientes');
  await abrirBloque(paginaAdmin, rotuloDeFecha(checkout));

  const fila = paginaAdmin.getByRole('row').filter({ hasText: unidad.nombre });

  await expect(
    fila,
    'el aseo que salió del feed tiene que verse en /operacion, en el bloque del día de su checkout, con el nombre de su apartamento',
  ).toHaveCount(1);

  await expect(
    fila.locator('[data-estado="sin_confirmar"]'),
    'y se ve SIN CONFIRMAR: es lo que lo mete en la bandeja del admin, que es el siguiente eslabón de la cadena',
  ).toHaveCount(1);

  await expect(
    fila.getByText('Sin confirmar', { exact: true }),
    'con su etiqueta de texto y no solo con el color: la fila tiene que decirlo con palabras',
  ).toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────
// 2. LA SEGUNDA CORRIDA, QUE ES DONDE SE CUELA UN ASEO DUPLICADO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Un `.ics` de UNA reserva cuyo checkout cae pasado mañana. Es el cuerpo que
 * usan los dos casos de esta sección: lo que cambia entre ellos no es el
 * contenido, es si el `DTSTAMP` se mueve.
 */
function icsDeUnaReserva(sufijo: string): string {
  return icsDe(hoy, [
    // Cuatro noches, por la misma razón que el caso del tramo completo: una
    // estadía de una sola noche se vuelve inválida ante cualquier defecto que
    // mueva un extremo, y el caso deja de medir lo que dice.
    { desde: -2, hasta: 2, uid: `rec-repetida-${sufijo}@airbnb.com`, codigo: 'HMYXB825YD' },
  ]);
}

test('el mismo cuerpo servido dos veces corta por el hash y deja el mismo aseo', async ({
  request,
}) => {
  const unidad = await sembrarUnidadDeRecorrido(servicio, { etiqueta: 'Hash' });
  const cuerpo = icsDeUnaReserva(unidad.sufijo);

  const primera = await correrSync(request, unidad.feedId, cuerpo);
  expect(
    primera.cuerpo.outcome,
    'la primera corrida tiene que llegar al RPC (`ok`): sin ella la segunda no mediría nada',
  ).toBe('ok');

  const [aseoPrimero] = await aseosDe(servicio, unidad.propiedadId);
  expect(
    aseoPrimero,
    'la primera corrida deja el aseo del checkout: es el sujeto de todo lo que viene',
  ).toBeDefined();

  // ── LA SEGUNDA, CON EL MISMO TEXTO EXACTO ────────────────────────────────
  // Airbnb reemite el mismo cuerpo cada ~3 h. El bloque 8 del worker compara el
  // sha256 del cuerpo con el de la corrida anterior y corta SIN llamar al RPC.
  const segunda = await correrSync(request, unidad.feedId, cuerpo);

  expect(
    segunda.cuerpo.outcome,
    'la segunda corrida sobre el MISMO cuerpo corta por el atajo del hash (`sin_cambios`): si dijera `ok`, el worker estaría pagando el diff entero cada media hora',
  ).toBe('sin_cambios');

  const despues = await aseosDe(servicio, unidad.propiedadId);
  expect(
    despues,
    'después de la segunda corrida sigue habiendo UN aseo: dos significan que la reserva se volvió a mirar como nueva',
  ).toHaveLength(1);

  expect(
    despues[0].id,
    'y es EL MISMO aseo, por id: si fuera otro, el aseo se habría recreado y el checklist, la evidencia y el dinero de lo que hubiera encima se habrían ido con el viejo',
  ).toBe(aseoPrimero.id);
});

test('el mismo contenido con DTSTAMP distinto sí llega al diff, y el diff no duplica el aseo', async ({
  request,
}) => {
  const unidad = await sembrarUnidadDeRecorrido(servicio, { etiqueta: 'Diff' });
  const cuerpo = icsDeUnaReserva(unidad.sufijo);

  // ── POR QUÉ EL CASO DE ARRIBA NO BASTA, Y ES LA RAZÓN DE ESTE ────────────
  // Con el mismo `DTSTAMP`, la segunda corrida se queda en el atajo del hash del
  // worker y NO LLEGA A `sync_feed_apply()`. O sea que aquel caso mide el atajo,
  // no la idempotencia: un diff que duplicara aseos pasaría verde igual, porque
  // nunca se habría ejecutado. `correrSyncEncadenado()` mueve el `DTSTAMP`, que
  // cambia el hash del cuerpo y no entra en la identidad del evento, así que el
  // RPC sí corre sobre una reserva que YA existía. Es el único de los dos
  // caminos donde la función de Postgres tiene la oportunidad de equivocarse.
  const primera = await correrSyncEncadenado(request, unidad.feedId, cuerpo);
  expect(
    primera.cuerpo.outcome,
    'la primera corrida encadenada llega al RPC (`ok`) y crea el aseo',
  ).toBe('ok');

  expect(
    primera.corrida?.cleanings_created,
    'y lo crea DE VERDAD: `cleanings_created` en 1 es lo que distingue "el aseo nació aquí" de "ya estaba"',
  ).toBe(1);

  const [aseoPrimero] = await aseosDe(servicio, unidad.propiedadId);

  const segunda = await correrSyncEncadenado(request, unidad.feedId, cuerpo);

  expect(
    segunda.cuerpo.outcome,
    'la segunda corrida encadenada NO corta por el hash y llega al RPC (`ok`): si dijera `sin_cambios`, este caso no habría probado el diff y sería el de arriba otra vez',
  ).toBe('ok');

  expect(
    segunda.corrida?.cleanings_created,
    'el diff corre sobre una reserva que ya existía y no crea nada: `cleanings_created` tiene que ser 0',
  ).toBe(0);

  const despues = await aseosVivosDe(servicio, unidad.propiedadId);
  expect(
    despues,
    'y sigue habiendo UN aseo vivo después de que el diff se ejecutara de verdad',
  ).toHaveLength(1);

  expect(
    despues[0].id,
    'con EL MISMO id: la identidad del aseo es (apartamento, fecha) y no la reserva, y eso es lo que hace que el trabajo humano sobreviva al ruido de la fuente',
  ).toBe(aseoPrimero.id);
});
