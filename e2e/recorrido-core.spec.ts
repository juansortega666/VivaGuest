import type { Locator, Page } from '@playwright/test';

import { formatFechaBog, formatFechaCortaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { construirPayload } from '@/lib/push/payload';

import {
  BYTES_DEL_RECIBO,
  contextoPersistente,
  diaDeNegocio,
  emularInstalada,
  esperarControlHidratado,
  esperarUrlDeCliente,
  esperarWorkerListo,
  expect,
  idPorEmail,
  leerCredenciales,
  sumarDias,
  test,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio, USUARIOS_E2E } from './global-setup';
import {
  adelantarElCalendarioDelAseo,
  aseosDe,
  aseosVivosDe,
  conectarFeed,
  correrSync,
  correrSyncEncadenado,
  entregarPushAlWorker,
  icsDe,
  limpiarRecorrido,
  periodoVencidoSinCerrar,
  sembrarUnidadDeRecorrido,
} from './recorrido.fixtures';

/**
 * EL RECORRIDO DEL CORE VALUE, Y LAS TRES PRUEBAS DE LA JUNTA QUE LO ABRE.
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
 *
 * ── BITÁCORA DE SEÑUELOS (plan 09-04, 2026-09-18) ──────────────────────────
 *
 * Siete señuelos, uno por junta y dos de seguridad, todos sobre el RECORRIDO DEL
 * CORE VALUE. Cada defecto se metió en el PRODUCTO, se corrió, se anotó el
 * mensaje literal que salió en rojo, se revirtió y se volvió a verde.
 *
 * | # | Junta | Qué se rompió | Qué se puso rojo (mensaje literal) |
 * |---|---|---|---|
 * | 1 | sync → aseo | `ical-normalizar.ts`: un día menos al `DTEND` | «JUNTA 1 · el aseo va el día del DTEND (2026-09-18), SIN sumarle ni restarle un día…». Esperado `2026-09-18`, recibido `2026-09-17` |
 * | 2 | confirmación → asignación | migración 09, `confirm_cleaning`: `aseador_id = (select auth.uid())`, o sea a quien confirma | «JUNTA 2 · el aseo queda asignado a la RESPONSABLE FIJA del apartamento (Aseador Uno E2E)…». La aserción de PANTALLA («Queda asignado a …») siguió VERDE, y es correcto: ese texto sale del catálogo, no de lo que la RPC escribe. Es la medición que justifica tener las dos |
 * | 3 | asignación → push | migración 09: el `insert` del outbox con `and false` | «JUNTA 3 · confirmar deja UN aviso en el outbox…». Esperado 1, recibido 0. Con `expect.soft` se midió el radio: el caso muere con `TypeError: Cannot read properties of undefined (reading 'type')`. **La mitad del dispositivo NO puede atrapar este defecto**, y no por descuido: su payload se construye A PARTIR de la fila, así que sin fila no hay nada que entregar. Por eso la mitad del servidor no es redundante |
 * | 4 | ejecución → evidencia | `lib/data/recibos.ts`: firmar una ruta que no existe (firma fallida con la foto subida) | SOLO «JUNTA 4 · el admin ve la MINIATURA FIRMADA de la foto que subió la aseadora…». Esperado 1, recibido 0. Las aserciones de la fila, de los bytes y del objeto en el bucket siguieron verdes: miden otra capa |
 * | 5 | aseo → dinero | migración 26, `rentabilidad_aseos`: `coalesce(pr.tarifa_huesped…)` en vez de `c.` | «JUNTA 5 · lo COBRADO es la tarifa que el aseo congeló al nacer (214609), no la que el apartamento tiene hoy (333137)…». Con `expect.soft`, radio completo: caen SEIS (cobrado, pagado, el margen contra su valor, y las tres negativas de las cifras del apartamento). **La que NO cae es «el margen es lo cobrado menos lo pagado»**, y es correcto: leerlo todo del apartamento es internamente consistente. Esa aserción no puede atrapar este defecto y no se puede confundir con la que sí |
 * | 6 | seguridad, formato crudo | `DesgloseDeMiPago.tsx`: la tarifa del aseo colgada de la línea como atributo de datos (viaja, no se pinta) | «JUNTA 5 · FUGA: la cifra 214609 viajó al navegador de la aseadora en /mis-pagos/{id}…». **Solo la mitad de RED.** La mitad del DOM NO la ve, porque un atributo no está en el texto de la página: es la demostración de que las dos mitades no son redundantes. Este señuelo fue además el que obligó a cambiar el instrumento DOS veces (ver abajo) |
 * | 7 | seguridad, formato pintado | `DesgloseDeMiPago.tsx`: el margen pintado al lado del monto | «JUNTA 5 · FUGA: la cifra 152.766 viajó…» y, con `expect.soft`, también «JUNTA 5 · y la cifra 152.766 tampoco está pintada en la pantalla de la aseadora». **Las DOS mitades**, y en el formato con separador, que es el único en el que un árbol renderizado en el servidor deja viajar una cifra |
 *
 * ── LOS DOS HALLAZGOS DEL SEÑUELO 6, QUE CAMBIARON EL INSTRUMENTO ──────────
 *
 * El señuelo 6 dejó el caso EN VERDE dos veces seguidas antes de poder atraparlo,
 * y las dos causas son trampas de instrumento que no se descubren solas:
 *
 *   1. El control era «el interceptor capturó ALGUNA carga», copiado de
 *      `mis-pagos.spec.ts`. Quedaba satisfecho con el documento de la LISTA, y el
 *      bucle corría antes de que la carga del DESGLOSE terminara de leerse.
 *      Volcado: `CARGA /mis-pagos len 15686 214609? false` con
 *      `HTML de la pantalla incluye 214609? true`.
 *   2. Cambiar el control a «se capturó la carga de ESTA dirección» tampoco
 *      bastó: Next PREFETCHEA el enlace, así que hay dos respuestas contra la
 *      misma URL y la primera es un tocón cuyo cuerpo el navegador descarta
 *      (`response.text: Protocol error (Network.getResponseBody): No data found
 *      for resource with given identifier`).
 *
 * El instrumento quedó con las dos correcciones: la fuga se mide navegando POR
 * DIRECCIÓN (documento completo, cuerpo siempre disponible) y el control es POR
 * CONTENIDO (alguna carga trae el nombre del apartamento, que solo está en el
 * desglose). Ninguna aserción se debilitó: las dos correcciones hacen que se mire
 * MÁS, no menos.
 *
 * ── Y UNA INTERMITENCIA MEDIDA, CON SU ARREGLO DE INSTRUMENTO ──────────────
 *
 * Con el recorrido ya en verde, `--repeat-each=5` dio **1 rojo de 5** en «El
 * service worker no mostró ninguna notificación». Es la misma intermitencia que
 * `deferred-items.md` de la Fase 8 declara para el caso E2 de
 * `push-instalacion.spec.ts`, reproducida aquí con el archivo aislado.
 * `entregarPushAlWorker()` reintenta la ENTREGA una vez, nunca la medida; ver su
 * cabecera. Tras el arreglo: **6 de 6 en verde**.
 */

/**
 * Escapa lo que va a entrar en una expresión regular.
 *
 * Los nombres de los apartamentos de este arnés llevan espacios y podrían llevar
 * paréntesis o puntos; sin escapar, el nombre deja de ser texto literal y el
 * localizador empieza a buscar otra cosa.
 */
function escaparParaRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * ── `rotuloDeFecha` Y `abrirBloque` SE FUERON (plan 10-05) ────────────────
 *
 * Servian a los acordeones `Hoy / Mañana / Siguientes` de `/operacion`, que
 * murieron con el rediseño: la pantalla se filtra por UN dia con el selector de su
 * cabecera y la lista es una sola.
 *
 * Lo que los sustituye es `irAlDia()`: en vez de expandir un bloque, se NAVEGA al
 * dia del aseo. Es la misma pregunta —¿el admin ve esto?— contra la pantalla nueva.
 */

/**
 * Lleva `/operacion` al dia pedido y espera a que su lista este pintada.
 *
 * `?dia=` es el parametro que gobierna la pantalla entera desde el plan 10-05. Se
 * navega con `goto` y no pulsando el selector: lo que estos casos miden es que el
 * aseo SE VE en su dia, no como se llega.
 */
async function irAlDia(p: Page, dia: string): Promise<void> {
  await p.goto(`/operacion?dia=${dia}`);
  await expect(p.locator('[data-slot="lista-dia"]')).toBeVisible();
}

/** La tarjeta de un aseo, por el nombre de su apartamento. Ya no hay filas de tabla. */
function tarjetaDe(p: Page, apartamento: string): Locator {
  return p.locator('[data-slot="tarjeta-aseo"]').filter({ hasText: apartamento });
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

  // El checkout cae en `hoy + 2`. En la pantalla vieja eso era el bloque
  // `Siguientes`, que nacia colapsado y habia que expandir dos veces; ahora se
  // NAVEGA a ese dia, que es lo que el selector hace de verdad.
  await irAlDia(paginaAdmin, checkout);

  const fila = tarjetaDe(paginaAdmin, unidad.nombre);

  await expect(
    fila,
    'el aseo que salió del feed tiene que verse en /operacion, en el día de su checkout, con el nombre de su apartamento',
  ).toHaveCount(1);

  await expect(
    fila.locator('[data-estado="sin_confirmar"]'),
    'y se ve SIN CONFIRMAR: es lo que lo mete en la bandeja del admin, que es el siguiente eslabón de la cadena',
  ).toHaveCount(1);

  await expect(
    fila.getByText('Sin confirmar', { exact: true }),
    'con su etiqueta de texto y no solo con el color: la tarjeta tiene que decirlo con palabras',
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

// ───────────────────────────────────────────────────────────────────────────
// 3. EL RECORRIDO DEL CORE VALUE, ENTERO Y EN UN SOLO CASO
// ───────────────────────────────────────────────────────────────────────────

/**
 * Espera un aviso flotante POR PREFIJO, porque el de la confirmación lleva
 * coletilla y en esta suite la lleva SIEMPRE.
 *
 * `mensajeDeTandaCompleta()` añade ` 1 quedó con un aseador sin avisos.` cuando
 * la persona a la que se le asignó no tiene suscripción de push viva, y los
 * usuarios de `global-setup.ts` nunca la tienen: nadie les concede permiso de
 * notificaciones en un navegador de pruebas. Comparar la cadena exacta de la
 * Fase 4 sería la misma trampa que `e2e/operacion.spec.ts` pagó en el 06-10.
 *
 * El puntero se aparta antes de mirar por la misma razón que allá: la pila de
 * avisos vive abajo a la derecha y un puntero encima pausa su temporizador.
 */
async function esperarAvisoQueEmpiezaCon(p: Page, prefijo: string) {
  await p.mouse.move(4, 4);

  const aviso = p
    .locator('[data-sonner-toast]')
    .getByText(new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  await expect(aviso, `tiene que salir el aviso que empieza por «${prefijo}»`).toBeVisible({
    timeout: 15_000,
  });
}

/** Lo que el admin le escribe a la aseadora al confirmar. Se afirma literal. */
const INSTRUCCIONES_DEL_ADMIN =
  'Llegan cuatro personas: deja dos juegos de toallas extra en el clóset.';

/**
 * Los nombres de las dos aseadoras de la semilla, SACADOS DE `global-setup.ts`.
 *
 * No se escriben a mano: son los mismos que el `globalSetup` mete en
 * `user_metadata.full_name`, que es de donde `tg_handle_new_user` materializa la
 * fila de `public.profiles` y, por ahí, lo que la hoja de confirmación y el panel
 * del admin pintan. Copiarlos aquí sería un segundo sitio del que divergir.
 */
const NOMBRE_RESPONSABLE = USUARIOS_E2E.find((u) => u.clave === 'aseador1')!.nombre;
const NOMBRE_SUPLENTE = USUARIOS_E2E.find((u) => u.clave === 'aseador2')!.nombre;

/**
 * Las tarifas que el APARTAMENTO gana DESPUÉS de que el aseo congeló las suyas.
 *
 * ── ES FIN-01 Y ES UNA ASERCIÓN, NO UN DETALLE DE SIEMBRA ─────────────────
 *
 * `tg_cleanings_snapshot()` copia las dos cifras del apartamento al aseo AL
 * CREARLO, y a partir de ahí las congela: en todo `UPDATE` sobre un aseo en
 * estado terminal reimpone los valores viejos, incluso con la clave de servicio.
 * Lo que la pantalla del dinero tiene que leer es EL SNAPSHOT DEL ASEO.
 *
 * Con el apartamento y el aseo llevando la misma cifra, una implementación que
 * uniera contra `properties` daría exactamente el mismo número y la aserción del
 * margen no estaría mirando nada. Cambiándolas después de que el aseo nació, las
 * dos lecturas se separan y el defecto se vuelve visible: corregir una tarifa
 * hoy no puede mover lo que se cobró y se pagó el mes pasado.
 *
 * No comparten prefijo con ninguna cifra del recorrido ni entre sí, para que una
 * búsqueda de texto no dé positivos por accidente.
 */
const TARIFA_NUEVA_DEL_APARTAMENTO = 333_137;
const PAGO_NUEVO_DEL_APARTAMENTO = 99_401;

/** `'$ 214.609'` o `'214.609'` → `214609`. Sirve para leer una celda de dinero. */
function pesos(texto: string): number {
  const digitos = texto.replace(/[^\d]/g, '');
  if (digitos === '') throw new Error(`No hay ninguna cifra en «${texto}»`);
  return Number(digitos);
}

/**
 * Una cifra EN LAS DOS FORMAS EN QUE PUEDE VIAJAR: el entero crudo de una carga
 * de datos y el formateado con separador de miles.
 *
 * ── BUSCAR UNA SOLA ES EL DEFECTO QUE LA FASE 7 PAGÓ, Y ESTÁ MEDIDO ───────
 *
 * Con el árbol del aseador renderizado entero en el servidor, EL ENTERO CRUDO NO
 * VIAJA NUNCA: el formateo ocurre en el servidor, así que lo que cruza el cable
 * es `61.843` y jamás `61843`. Una prueba de fuga que buscara solo el entero
 * crudo no podía dispararse aunque la fuga existiera, y una que buscara solo el
 * formateado se perdería la carga JSON de un componente de cliente.
 */
function enLasDosFormas(n: number): string[] {
  return [String(n), n.toLocaleString('es-CO')];
}

/** Lo que una respuesta del servidor le entregó al navegador. */
type CargaUtil = { url: string; cuerpo: string };

/**
 * Engancha un oyente que guarda el CUERPO de cada respuesta de este origen.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES GEMELO DEL `interceptarCargaUtil()` DE `e2e/mis-pagos.spec.ts`, Y LA
 * DUPLICACIÓN ES DELIBERADA POR LA MISMA RAZÓN QUE `entregarPushAlWorker()`: un
 * spec que importa otro spec registra sus casos una segunda vez, y este plan
 * tiene prohibido editar los specs anteriores.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ LA ASERCIÓN NEGATIVA VA CONTRA LA RED Y NO SOLO CONTRA EL DOM ──
 *
 * Porque que la pantalla no PINTE un número no significa que el número no haya
 * VIAJADO. Cuando `mis-pagos.spec.ts` se escribió, el sistema tenía la fuga
 * abierta y ninguna pantalla la mostraba: una aserción sobre el DOM habría
 * pasado con la fuga puesta. El dato ya estaba en el teléfono.
 *
 * Se miran documento, carga de servidor de React y JSON, que es donde puede ir
 * una cifra. Se descarta `/_next/static/`: son los bundles, con hashes de build
 * de dieciséis dígitos que producen coincidencias por puro azar.
 */
function interceptarCargaUtil(p: Page): CargaUtil[] {
  const cargas: CargaUtil[] = [];

  p.on('response', (respuesta) => {
    if (new URL(respuesta.url()).pathname.startsWith('/_next/static/')) return;

    const tipo = respuesta.headers()['content-type'] ?? '';
    if (!/text\/html|text\/x-component|application\/json|text\/plain/.test(tipo)) return;

    void respuesta
      .text()
      .then((cuerpo) => cargas.push({ url: respuesta.url(), cuerpo }))
      .catch(() => {
        /* sin cuerpo disponible: no puede filtrar nada */
      });
  });

  return cargas;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CASO MÁS IMPORTANTE DEL REPO. SI ESTE CASO PASA, EL PRODUCTO EXISTE.
 *
 * El Core Value de VivaGuest, literal del `PROJECT.md`, es: «que ningún aseo se
 * pierda: todo checkout detectado en calendario termina en un aseo confirmado,
 * asignado y ejecutado con evidencia». Esa cadena estaba probada EN PEDAZOS —una
 * suite por pantalla— y la junta entre pedazos es donde se rompen los productos.
 * Este caso la recorre entera, de una punta a la otra, con UN SOLO aseo:
 *
 *     feed iCal con un checkout
 *       → corre la sincronización
 *       → aparece UN aseo pendiente, en la fecha del DTEND
 *       → el admin lo confirma con huéspedes e instrucciones
 *       → queda asignado a su responsable fija
 *       → le llega el push
 *       → la aseadora marca el checklist y sube su foto
 *       → pulsa Terminé
 *       → el admin lo ve completado con su evidencia
 *       → aparece en /finanzas/aseos con su margen
 *       → entra en el pago del periodo
 *
 * LAS CINCO JUNTAS QUE PRUEBA, Y QUE HOY NO PRUEBA NADIE MÁS:
 *
 *   1. `sync → aseo`            un checkout publicado se vuelve un aseo, el día
 *                               del `DTEND` y no el de la última noche.
 *   2. `confirmación → asignación`  confirmar asigna a la RESPONSABLE FIJA del
 *                               apartamento y materializa el checklist.
 *   3. `asignación → push`      la confirmación escribe el aviso, y el teléfono
 *                               lo pinta con el destino de ESTE aseo.
 *   4. `ejecución → evidencia`  la foto sube bytes de verdad al bucket y el
 *                               admin ve su miniatura firmada.
 *   5. `aseo → dinero`          el margen sale del ASEO y no del apartamento, y
 *                               el aseo entra en el pago del periodo cerrado.
 *
 * ── POR QUÉ ES UN CASO Y NO CINCO ─────────────────────────────────────────
 *
 * Cinco casos que comparten siembra vuelven a probar cinco pedazos, que es justo
 * lo que este archivo existe para dejar de hacer. El sujeto es EL MISMO ASEO de
 * principio a fin: el que nació del feed es el que se confirma, el que se
 * ejecuta, el que se fotografía y el que se paga. Si en algún punto la cadena
 * cambia de sujeto, este caso se cae; cinco casos independientes, no.
 *
 * ── Y POR QUÉ CADA JUNTA SE AFIRMA JUSTO DESPUÉS DE CRUZARLA ──────────────
 *
 * Un recorrido que da los diez pasos y afirma solo el último falla en el paso
 * diez cuando el defecto está en el tres, y el rojo acusa a la pantalla
 * equivocada. Cada paso lleva su aserción CONTRA LA BASE, y los que el usuario
 * ve llevan además la suya CONTRA LA PANTALLA, porque son dos cosas distintas:
 * una RPC que confirma perfectamente y una pantalla que nunca llega a llamarla
 * dan una suite verde y un producto roto.
 *
 * TODA aserción lleva mensaje propio. Un caso de treinta aserciones aborta en la
 * primera que falle, y sin mensaje el señuelo pone rojo «el caso» sin que nadie
 * sepa qué aserción lo atrapó.
 *
 * ── LA RESPONSABLE FIJA ES EL `aseador1` DE `global-setup.ts`, A PROPÓSITO ──
 *
 * Confirmar asigna al responsable del apartamento, así que para que el tramo de
 * campo tenga sesión con la que entrar, la responsable TIENE que ser un usuario
 * de la semilla: es el único que tiene `storageState` (`paginaAseador`) y perfil
 * persistente (`contextoPersistente(browser, 'aseador1', …)`). La suplente es el
 * `aseador2`, y no es simetría: es la otra candidata plausible contra la que la
 * aserción de la asignación se puede comparar por id y nombrar en su mensaje.
 * ════════════════════════════════════════════════════════════════════════════
 */
test('EL RECORRIDO DEL CORE VALUE: un checkout del .ics acaba en el pago de la aseadora, sin que nadie escriba una fila de aseo', async ({
  paginaAdmin,
  paginaAseador,
  browser,
  baseURL,
  request,
}) => {
  // El recorrido cruza cinco juntas, tres sesiones y dos navegadores. No cabe en
  // el timeout por defecto y eso no es síntoma de nada: es lo que dura el Core
  // Value completo contra un servidor de producción real.
  test.setTimeout(300_000);

  const credenciales = leerCredenciales();
  const idResponsable = await idPorEmail(servicio, credenciales.aseador1.email);
  const idSuplente = await idPorEmail(servicio, credenciales.aseador2.email);
  const idQuienConfirma = await idPorEmail(servicio, credenciales.admin.email);

  const unidad = await sembrarUnidadDeRecorrido(servicio, {
    etiqueta: 'Core',
    responsable: idResponsable,
    suplente: idSuplente,
  });

  // ═════════════════════════════════════════════════════════════════════════
  // JUNTA 1 · DEL `.ics` AL ASEO
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * EL CHECKOUT ES HOY, Y NO MAÑANA, Y LO DECIDE EL TRAMO DE CAMPO.
   *
   * `leerAseosDeHoy()` (`lib/data/aseos-del-aseador.ts`) solo pone en la lista de
   * la aseadora los aseos cuyo `scheduled_date` es el día de negocio: los de
   * mañana los CUENTA, pero no los abre. Con el checkout mañana, el recorrido se
   * quedaría sin poder entrar al aseo por donde entra la aseadora de verdad, que
   * es su propia lista, y habría que llegar por dirección directa, que es
   * exactamente el atajo que esta fase existe para no tomar.
   *
   * La estadía es de TRES noches y no de una: con una sola, cualquier defecto que
   * mueva un extremo del rango lo colapsa, `res_dates_ok` tumba la reserva y el
   * fallo se manifiesta como «cero reservas» varias aserciones antes de la que
   * debía atraparlo. Es la lección del señuelo 1 del plan 09-01.
   */
  const checkout = hoy;
  const ultimaNoche = sumarDias(hoy, -1);

  const cuerpo = icsDe(hoy, [
    { desde: -3, hasta: 0, uid: `rec-core-${unidad.sufijo}@airbnb.com`, codigo: 'HMYXB825YD' },
  ]);

  // El estado de partida real: el admin YA conectó el calendario con este mismo
  // cuerpo y todavía no ha corrido ninguna sincronización. Ver la cabecera de
  // `conectarFeed()`: sin esto el recorrido arranca de un estado que en
  // producción no existe.
  await conectarFeed(unidad.feedId, cuerpo);

  const corrida = await correrSync(request, unidad.feedId, cuerpo);

  expect(
    corrida.cuerpo.outcome,
    'JUNTA 1 · el worker tiene que terminar en `ok`: cualquier otro outcome significa que una guarda cortó antes del RPC y el aseo no llegó a nacer',
  ).toBe('ok');

  expect(
    corrida.cuerpo.reservation_count,
    'JUNTA 1 · el cuerpo trae UNA reserva clasificada: si sale 0 el clasificador dejó de reconocer el `Reserved`',
  ).toBe(1);

  const aseosTrasSync = await aseosDe(servicio, unidad.propiedadId);

  expect(
    aseosTrasSync,
    'JUNTA 1 · el checkout produce UN aseo: cero significa que la cadena se rompe en el primer eslabón y todo lo que sigue sobra',
  ).toHaveLength(1);

  const aseoId = aseosTrasSync[0].id;

  expect(
    aseosTrasSync[0].origin,
    'JUNTA 1 · el aseo nació del calendario (`origin = ical`) y no de una mano: si dijera `manual`, este recorrido estaría probando otra cosa',
  ).toBe('ical');

  expect(
    aseosTrasSync[0].scheduled_date,
    `JUNTA 1 · el aseo va el día del DTEND (${checkout}), SIN sumarle ni restarle un día: restarlo lo mandaría a la última noche (${ultimaNoche}), con el huésped todavía dentro`,
  ).toBe(checkout);

  expect(
    aseosTrasSync[0].confirmado_at,
    'JUNTA 1 · y nace SIN confirmar: el número de huéspedes y las instrucciones los pone el admin, no el sync',
  ).toBeNull();

  expect(
    aseosTrasSync[0].aseador_id,
    'JUNTA 1 · y nace SIN dueño: el sync detecta, no asigna. Asignar es lo que hace la junta 2, y si el sync ya lo hiciera, la junta 2 no probaría nada',
  ).toBeNull();

  const tarifasDelAseo = unidad.tarifas!;

  expect(
    { tarifa: aseosTrasSync[0].tarifa_huesped, pago: aseosTrasSync[0].pago_aseador },
    'JUNTA 1 · y nace con las DOS CIFRAS CONGELADAS del apartamento: es el snapshot de FIN-01, y es lo que la junta 5 tiene que ver en pantalla',
  ).toEqual({ tarifa: tarifasDelAseo.tarifaHuesped, pago: tarifasDelAseo.pagoAseador });

  // ── EL APARTAMENTO CAMBIA DE TARIFAS, Y EL ASEO NO ───────────────────────
  // Ver la cabecera de `TARIFA_NUEVA_DEL_APARTAMENTO`: sin esta divergencia, la
  // aserción del margen de la junta 5 no distinguiría una lectura del aseo de
  // una lectura del apartamento, porque las dos darían el mismo número.
  const { error: errorTarifas } = await servicio
    .from('properties')
    .update({
      tarifa_huesped: TARIFA_NUEVA_DEL_APARTAMENTO,
      pago_aseador: PAGO_NUEVO_DEL_APARTAMENTO,
    })
    .eq('id', unidad.propiedadId);
  if (errorTarifas) throw new Error(`No se pudieron subir las tarifas: ${errorTarifas.message}`);

  // ═════════════════════════════════════════════════════════════════════════
  // JUNTA 2 · DE LA CONFIRMACIÓN A LA ASIGNACIÓN
  // ═════════════════════════════════════════════════════════════════════════

  // El aseo cae en el dia de su checkout, que no es hoy: se navega a ese dia. En la
  // pantalla vieja bastaba con expandir el bloque `Hoy` porque el aseo estaba ahi;
  // con el eje del dia hay que ir a donde esta.
  await irAlDia(paginaAdmin, checkout);

  const filaDelAseo = tarjetaDe(paginaAdmin, unidad.nombre);

  await expect(
    filaDelAseo.locator('[data-estado="sin_confirmar"]'),
    'JUNTA 2 · el aseo que salió del feed llega a /operacion SIN CONFIRMAR, que es lo que lo mete en la bandeja del admin',
  ).toHaveCount(1);

  // Se confirma desde el menú de LA TARJETA y no desde el boton de la tanda. Desde
  // el plan 10-05 la tanda cuenta los sin confirmar DEL DIA —antes eran los de la
  // ventana entera— pero el argumento no cambia: su rotulo (`Confirmar N aseos`)
  // sigue dependiendo de lo que hayan dejado los demas casos del archivo en ese dia,
  // y una tanda de mas de uno cambia el boton primario y el copy del aviso. El menu
  // de la tarjeta abre la misma hoja con una tanda de uno.
  const menuDelAseo = paginaAdmin.getByRole('button', {
    name: `Acciones del aseo de ${unidad.nombre} del ${formatFechaBog(checkout)}`,
  });
  await esperarControlHidratado(menuDelAseo);
  await menuDelAseo.click();
  await paginaAdmin.getByRole('menuitem', { name: 'Confirmar', exact: true }).click();

  // TRAMPA 1 DE `TESTING.md`: la hoja se portalea a `document.body`, así que todo
  // lo que se afirme de ella va acotado al diálogo y nunca al contenedor de
  // página, que el portal deja vacío.
  const hoja = paginaAdmin.getByRole('dialog');
  await expect(hoja, 'JUNTA 2 · el menú de la fila abre la hoja de confirmación').toBeVisible();

  await expect(
    hoja.getByText(`Queda asignado a ${NOMBRE_RESPONSABLE}`),
    'JUNTA 2 · la hoja dice A QUIÉN va a quedar asignado ANTES de confirmar: confirmar asigna al responsable fijo, no elige',
  ).toBeVisible();

  await hoja.getByLabel('Número de huéspedes').fill('4');
  await hoja.getByLabel('Instrucciones').fill(INSTRUCCIONES_DEL_ADMIN);
  await hoja.getByRole('button', { name: 'Confirmar y cerrar' }).click();

  // ── (a) LO QUE DICE LA PANTALLA ──────────────────────────────────────────
  await esperarAvisoQueEmpiezaCon(paginaAdmin, 'Listo: 1 aseo confirmado.');

  await expect(
    paginaAdmin.getByRole('dialog'),
    'JUNTA 2 · la hoja se cierra sola al confirmar la tanda entera',
  ).toHaveCount(0);

  await expect(
    filaDelAseo.locator('[data-estado="pendiente"]'),
    'JUNTA 2 · y la fila se repinta como CONFIRMADA: el aseo sigue pendiente de hacerse, pero ya no está sin confirmar',
  ).toHaveCount(1);

  // La negativa va DESPUÉS de su positiva y con el diálogo ya cerrado: una
  // negativa evaluada con un panel abierto, o contra un contenedor que el portal
  // vació, pasa sin mirar nada (trampa 2 de `TESTING.md`).
  await expect(
    filaDelAseo.locator('[data-estado="sin_confirmar"]'),
    'JUNTA 2 · y deja de estar sin confirmar: si siguiera, la bandeja lo volvería a ofrecer y el admin lo confirmaría dos veces',
  ).toHaveCount(0);

  // ── (b) LO QUE QUEDÓ ESCRITO ─────────────────────────────────────────────
  // El aviso dice lo que la pantalla cree; esto dice lo que la base tiene. Una
  // hoja que muestre el mensaje correcto y no llame a la RPC pasa el aviso y se
  // cae aquí.
  const [aseoConfirmado] = await aseosDe(servicio, unidad.propiedadId);

  expect(
    aseoConfirmado.id,
    'JUNTA 2 · la confirmación cae sobre EL MISMO aseo que nació del feed: el sujeto del recorrido no cambia a mitad de camino',
  ).toBe(aseoId);

  expect(
    aseoConfirmado.confirmado_at,
    'JUNTA 2 · `confirmado_at` queda escrito: es lo que separa la bandeja del resto de la pantalla',
  ).not.toBeNull();

  expect(
    aseoConfirmado.num_huespedes,
    'JUNTA 2 · el número de huéspedes que el admin escribió queda guardado: es lo que la aseadora necesita para saber cuántas camas tender',
  ).toBe(4);

  expect(
    aseoConfirmado.instrucciones,
    'JUNTA 2 · y las instrucciones también, literales: un recorte o un recorrido que las pierda deja a la aseadora sin la mitad del encargo',
  ).toBe(INSTRUCCIONES_DEL_ADMIN);

  // ── (c) LA ASERCIÓN QUE DA SENTIDO A LA JUNTA ────────────────────────────
  expect(
    aseoConfirmado.aseador_id,
    `JUNTA 2 · el aseo queda asignado a la RESPONSABLE FIJA del apartamento (${NOMBRE_RESPONSABLE}). Es lo que significa «asignado en firme»: no se elige al confirmar, sale del catálogo`,
  ).toBe(idResponsable);

  expect(
    aseoConfirmado.aseador_id,
    `JUNTA 2 · y NO a la suplente (${NOMBRE_SUPLENTE}): la suplente es para cuando la responsable no puede, no para el camino normal`,
  ).not.toBe(idSuplente);

  expect(
    aseoConfirmado.aseador_id,
    'JUNTA 2 · y NO a quien confirmó (el admin): «asignar a quien confirma» es el defecto que esta aserción existe para atrapar',
  ).not.toBe(idQuienConfirma);

  // ── (d) EL CHECKLIST MATERIALIZADO ───────────────────────────────────────
  // Sin esto, el tramo de la evidencia no tendría nada que fotografiar y el
  // defecto aparecería allá, tres juntas más adelante, acusando a la pantalla
  // equivocada.
  const { data: tareas, error: errorTareas } = await servicio
    .from('cleaning_checklist_items')
    .select('id, room_label, task_label, requiere_foto')
    .eq('cleaning_id', aseoId);
  if (errorTareas) throw new Error(`No se pudo leer el checklist: ${errorTareas.message}`);

  expect(
    tareas ?? [],
    'JUNTA 2 · confirmar materializa el checklist: 6 tareas, que son los DOS cuartos de la unidad por las TRES tareas activas de su tipo en el catálogo. Cero significa que el aseo llega a la aseadora sin nada que marcar',
  ).toHaveLength(6);

  const conFoto = (tareas ?? []).filter((t) => t.requiere_foto);

  expect(
    conFoto,
    'JUNTA 2 · y TRES de ellas exigen foto, las de la habitación: son las que hacen que el asistente de evidencia tenga un paso y que la junta 4 pueda subir bytes',
  ).toHaveLength(3);

  expect(
    conFoto.map((t) => t.room_label),
    'JUNTA 2 · y las que exigen foto son las del cuarto que la exige, no las del general: el snapshot copió `requiere_foto` de la tarea y no lo inventó',
  ).toEqual(['Habitación 1', 'Habitación 1', 'Habitación 1']);

  // ═════════════════════════════════════════════════════════════════════════
  // JUNTA 3 · DE LA ASIGNACIÓN AL AVISO, EN SUS DOS MITADES
  //
  // ── LO QUE ESTE TRAMO NO PRUEBA, Y NO SE ESCONDE ────────────────────────
  //
  // EL SALTO DE `web-push` A FCM NO SE PRUEBA AQUÍ, y no se debilita nada para
  // probarlo. Tres razones, las tres medidas:
  //
  //   1. `HOSTS_DE_PUSH` de `lib/domain/suscripcion.schema.ts` NO admite
  //      loopback a propósito, y su propio comentario lo dice: «aquí no hay la
  //      concesión de loopback que `ical-url.schema.ts` sí tiene». Ampliarla
  //      sería abrir una SSRF por comodidad de test.
  //   2. La única forma honesta de ejercitarlo es el servicio falso por TLS de
  //      `lib/test/push.ts`, que instala su autoridad de confianza EN EL PROCESO
  //      QUE HACE LA PETICIÓN. En E2E esa petición la hace el proceso del
  //      servidor de Next, que no tiene ese agente, y la alternativa sería
  //      apagar la verificación de TLS, que el arnés prohíbe por nombre (T-05-29).
  //   3. YA ESTÁ CUBIERTO: `lib/domain/push-drenaje.integration.test.ts` mide ese
  //      salto entero, con cuerpos cifrados de verdad y respuestas hostiles a
  //      demanda. Repetirlo aquí no compra garantía; lo que costaría es bajar
  //      una defensa.
  //
  // Quien lea este verde tiene que saber qué NO dice, y por eso está aquí y no
  // solo en un SUMMARY.
  //
  // ── Y UN AVISO DE ENTORNO ──────────────────────────────────────────────
  //
  // Si el Vault local tiene `app_base_url` y `cron_shared_secret` (los siembra
  // `scripts/dev/sync-local.sh`), el trigger de la migración 17 despacha un
  // DRENAJE DE VERDAD al confirmar, contra el `app_base_url` que haya escrito.
  // Este caso no depende de eso ni se rompe por eso, pero explica un intento de
  // envío que aparece sin que nadie lo pida.
  // ═════════════════════════════════════════════════════════════════════════

  // ── MITAD DEL SERVIDOR: CONFIRMAR PRODUJO EL AVISO ───────────────────────
  const { data: avisos, error: errorAvisos } = await servicio
    .from('notifications')
    .select('id, type, title, body, url, recipient_id, cleaning_id')
    .eq('cleaning_id', aseoId);
  if (errorAvisos) throw new Error(`No se pudieron leer los avisos: ${errorAvisos.message}`);

  expect(
    avisos ?? [],
    'JUNTA 3 · confirmar deja UN aviso en el outbox: cero significa que el aseo quedó asignado y la aseadora no se va a enterar, que es el modo de fallo que este producto existe para eliminar',
  ).toHaveLength(1);

  const aviso = (avisos ?? [])[0];

  expect(
    aviso.type,
    'JUNTA 3 · el aviso es de tipo `asignacion`: el tipo es lo que decide la urgencia del envío y el copy del teléfono',
  ).toBe('asignacion');

  expect(
    aviso.recipient_id,
    `JUNTA 3 · y va dirigido a la RESPONSABLE FIJA (${NOMBRE_RESPONSABLE}), que es a quien se le acaba de asignar el aseo: un aviso al admin o a la suplente deja el teléfono correcto en silencio`,
  ).toBe(idResponsable);

  expect(
    aviso.cleaning_id,
    'JUNTA 3 · y cuelga del MISMO aseo del recorrido: un aviso sin aseo no se puede deduplicar ni abrir',
  ).toBe(aseoId);

  expect(
    aviso.url,
    'JUNTA 3 · y su destino apunta a ESE aseo: es el enlace que el dedo de la aseadora va a tocar, y una ruta genérica la deja buscando cuál de los cinco es',
  ).toBe(`/aseos/${aseoId}`);

  // ── MITAD DEL DISPOSITIVO: EL TELÉFONO LO PINTA ──────────────────────────
  // El contexto persistente, el canal `chrome` y la emulación de instalada son
  // las tres cosas que la Fase 5 midió como obligatorias. Ver la cabecera de
  // `contextoPersistente()` y la trampa 7 de `TESTING.md`.
  const { contexto, pagina: telefono } = await contextoPersistente(browser, 'aseador1', baseURL!);

  try {
    await emularInstalada(telefono);
    await telefono.goto('/mis-aseos');
    await esperarWorkerListo(telefono);

    const origen = new URL(telefono.url()).origin;

    // EL PAYLOAD LO CONSTRUYE LA FUNCIÓN DE PRODUCCIÓN, A PARTIR DE LA FILA QUE
    // EL PRODUCTO ACABA DE ESCRIBIR. Un objeto escrito a mano mediría el handler
    // contra una forma inventada, que es lo que `push-instalacion.spec.ts`
    // prohíbe por escrito: la junta que se prueba es «lo que la base guardó llega
    // al teléfono», y eso solo lo dice un payload que salió de la base.
    const payload = construirPayload(
      {
        id: aviso.id,
        type: aviso.type,
        title: aviso.title,
        body: aviso.body,
        url: aviso.url,
      },
      { soportaDeclarativo: false, origen },
    );

    const pintados = await entregarPushAlWorker(telefono, payload);

    expect(
      pintados,
      'JUNTA 3 · el service worker pinta UNA notificación: cero significa que el aviso llegó al dispositivo y murió dentro del handler, que en iOS cuesta la suscripción entera',
    ).toHaveLength(1);

    expect(
      pintados[0].title,
      'JUNTA 3 · con el título que escribió la RPC, verbatim: el copy no se recompone en el camino',
    ).toBe(aviso.title);

    expect(
      pintados[0].body,
      'JUNTA 3 · y con su cuerpo, que es el que nombra el apartamento y la hora límite',
    ).toBe(aviso.body);

    expect(
      pintados[0].data,
      'JUNTA 3 · y su destino es el del ASEO DE ESTE RECORRIDO, resuelto contra el origen: es lo que hace que tocar el aviso abra este aseo y no la lista',
    ).toMatchObject({ url: `${origen}/aseos/${aseoId}` });
  } finally {
    await contexto.close();
  }

  // ═════════════════════════════════════════════════════════════════════════
  // JUNTA 4 · DE LA EJECUCIÓN A LA EVIDENCIA
  //
  // ESTE TRAMO SUBE BYTES DE VERDAD AL BUCKET, Y NO ES NEGOCIABLE. El plan 08-13
  // midió que NINGÚN escenario de prueba del repo había subido un solo byte, y
  // por eso un error de servidor vivió tres planes sin que nadie lo viera: con
  // las siete fotos del andamio sin objeto en el almacenamiento, las siete caían
  // en firma fallida y la rama de la miniatura FIRMADA no se ejecutaba nunca.
  // `deQueEsLaFoto()` se llamaba desde el servidor estando exportada de un módulo
  // `'use client'`, y el panel de cualquier aseo con evidencia real reventaba.
  //
  // Las tres aserciones de abajo son las tres capas de esa lección: la fila, el
  // objeto en el bucket, y la miniatura firmada en la pantalla del admin.
  // ═════════════════════════════════════════════════════════════════════════

  await paginaAseador.goto('/mis-aseos');

  const tarjeta = paginaAseador
    .getByRole('button', { name: new RegExp(escaparParaRegex(unidad.nombre)) })
    .first();
  await esperarControlHidratado(tarjeta);
  await tarjeta.click();
  await paginaAseador.getByRole('button', { name: 'Comenzar aseo' }).click();

  // TRAMPA 8 DE `TESTING.md`: la navegación es de cliente, así que la URL se
  // sondea DESDE Node. `page.waitForURL` inyecta su bucle dentro del documento y
  // se traba con el propio commit de la transición de React que está esperando.
  await esperarUrlDeCliente(paginaAseador, new RegExp(`/aseos/${aseoId}$`));

  expect(
    paginaAseador.url(),
    'JUNTA 4 · la aseadora entra al aseo DESDE SU PROPIA LISTA: llegar por dirección directa probaría la pantalla, no la junta',
  ).toContain(`/aseos/${aseoId}`);

  // ── (a) EL CHECKLIST, CUARTO POR CUARTO Y TAREA POR TAREA ────────────────
  //
  // El acordeón RECOGE un cuarto en cuanto queda completo, y NO abre el
  // siguiente: `marcar()` de `ChecklistPorCuarto.tsx` solo quita el cuarto
  // terminado de la lista de abiertos. Al montar, el único abierto es el primer
  // cuarto incompleto. O sea que un bucle que solo mirara casillas visibles
  // marcaría el primer cuarto y se quedaría sin nada que tocar, con la mitad del
  // checklist sin marcar y el aseo entrando al asistente por la hoja de «te
  // faltan tareas». Medido en la primera corrida de este caso: 3 de 6.
  //
  // Los cuartos salen del checklist que la junta 2 acaba de leer, así que este
  // bucle no sabe cuántos hay ni cómo se llaman: lo dice la base.
  const cuartos = [...new Set((tareas ?? []).map((t) => t.room_label))];

  for (const cuarto of cuartos) {
    // El nombre accesible de la cabecera es `{cuarto}, {n} de {total} tareas`,
    // así que se ancla al principio y no se compara entero: el contador cambia
    // con cada toque.
    const cabecera = paginaAseador
      .getByRole('button', { name: new RegExp(`^${escaparParaRegex(cuarto)},`) })
      .first();
    await esperarControlHidratado(cabecera);
    if ((await cabecera.getAttribute('aria-expanded')) === 'false') await cabecera.click();

    // Se vuelve a buscar en cada vuelta: marcar la última tarea del cuarto lo
    // recoge, y la lista de casillas visibles cambia debajo del bucle.
    for (let vuelta = 0; vuelta < 10; vuelta += 1) {
      const pendientes = paginaAseador.locator(
        'label:has(input[type=checkbox]:not(:checked)):visible',
      );
      if ((await pendientes.count()) === 0) break;
      await pendientes.first().click();
    }
  }

  // El marcado es OPTIMISTA a propósito (§11.2 del contrato del aseador): la
  // casilla cambia antes de que el servidor responda. Afirmar de golpe mediría
  // una carrera; se sondea lo único que importa, que es que la marca ACABA en la
  // base.
  await expect
    .poll(
      async () => {
        const r = await servicio
          .from('cleaning_checklist_items')
          .select('id')
          .eq('cleaning_id', aseoId)
          .not('done_at', 'is', null);
        return r.data?.length ?? 0;
      },
      {
        timeout: 30_000,
        message:
          'JUNTA 4 · las seis tareas del checklist quedan marcadas EN LA BASE, no solo en la casilla: una marca optimista que nunca llega al servidor deja al admin viendo un aseo sin hacer',
      },
    )
    .toBe(6);

  // ── (b) LA EVIDENCIA, CON BYTES DE VERDAD ────────────────────────────────
  // Con el checklist completo, `Terminar aseo` entra directo al asistente y no
  // pasa por la hoja de «te faltan tareas».
  await paginaAseador.getByRole('button', { name: 'Terminar aseo' }).click();
  await esperarUrlDeCliente(paginaAseador, new RegExp(`/aseos/${aseoId}/evidencia$`));

  await expect(
    paginaAseador.getByRole('heading', { name: 'Habitación 1' }),
    'JUNTA 4 · el asistente tiene UN paso, el del cuarto cuyas tareas exigen foto: si no tuviera ninguno, no habría nada que fotografiar y esta junta quedaría sin sujeto',
  ).toBeVisible();

  await paginaAseador.setInputFiles('input[type="file"]', {
    name: 'habitacion.jpg',
    mimeType: 'image/jpeg',
    // El JPEG real de `e2e/fixtures.ts`, exportado por el plan 08-13 justo para
    // esto. Tiene que ser DECODIFICABLE y no solo tener la cabecera correcta: el
    // bucket limita los tipos y, si el navegador no lo puede pintar, el manejador
    // de error de la etiqueta sustituye la foto por el estado de ausencia.
    buffer: BYTES_DEL_RECIBO,
  });

  const continuar = paginaAseador.getByRole('button', { name: 'Continuar' });
  await expect(
    continuar,
    'JUNTA 4 · el botón de avanzar se habilita cuando la foto TERMINÓ de subir: es la señal de la propia pantalla de que hubo subida y no solo selección de archivo',
  ).toBeEnabled({ timeout: 30_000 });
  await continuar.click();

  await expect(
    paginaAseador.getByRole('heading', { name: '¿Pasó algo?' }),
    'JUNTA 4 · tras el último cuarto viene el paso del reporte, que es opcional y desde el que se cierra el aseo',
  ).toBeVisible();

  await paginaAseador.getByRole('button', { name: 'Terminar el aseo' }).click();

  await expect(
    paginaAseador.getByRole('heading', { name: 'Listo.' }),
    'JUNTA 4 · y la aseadora ve el cierre: es la única pantalla que puede decir «listo» con fundamento, porque solo se llega a ella con el aseo ya guardado',
  ).toBeVisible({ timeout: 30_000 });

  await expect(
    paginaAseador.getByText(`Terminaste el aseo de ${unidad.nombre}.`),
    'JUNTA 4 · y el cierre nombra EL APARTAMENTO del recorrido, no uno genérico',
  ).toBeVisible();

  // ── (c) LO QUE QUEDÓ ESCRITO ─────────────────────────────────────────────
  const [aseoTerminado] = await aseosDe(servicio, unidad.propiedadId);

  expect(
    aseoTerminado.state,
    'JUNTA 4 · el aseo queda `completada` en la base: la pantalla de cierre dice lo que cree, esto dice lo que hay',
  ).toBe('completada');

  expect(
    aseoTerminado.finished_at,
    'JUNTA 4 · con su instante de fin, que es lo que decide a qué periodo de pago pertenece (D7-8) y por lo tanto en qué recibo entra',
  ).not.toBeNull();

  const { data: fotos, error: errorFotos } = await servicio
    .from('cleaning_photos')
    .select('id, kind, storage_bucket, storage_path, bytes')
    .eq('cleaning_id', aseoId);
  if (errorFotos) throw new Error(`No se pudieron leer las fotos: ${errorFotos.message}`);

  expect(
    fotos ?? [],
    'JUNTA 4 · la foto del cuarto deja UNA fila de evidencia: cero significa que la pantalla dio el visto bueno y no registró nada',
  ).toHaveLength(1);

  const foto = (fotos ?? [])[0];

  expect(
    foto.bytes,
    'JUNTA 4 · con BYTES DE VERDAD, mayores que cero: un registro con cero bytes es una promesa de evidencia sin evidencia',
  ).toBeGreaterThan(0);

  expect(
    foto.storage_path,
    'JUNTA 4 · y con su ruta dentro del bucket, que es por donde el admin la va a pedir firmada',
  ).toBeTruthy();

  // ── (d) Y EL OBJETO EXISTE EN EL ALMACENAMIENTO ──────────────────────────
  // La fila puede estar perfecta y el objeto no existir: son dos sistemas. Es
  // exactamente el estado en el que vivían las siete fotos del andamio de la
  // Fase 8, y el que hacía inalcanzable la rama de la miniatura firmada.
  const descarga = await servicio.storage.from(foto.storage_bucket).download(foto.storage_path);

  expect(
    descarga.error,
    `JUNTA 4 · el objeto existe DE VERDAD en el bucket \`${foto.storage_bucket}\`: una fila sin objeto detrás es una fila que el panel del admin no puede firmar`,
  ).toBeNull();

  expect(
    descarga.data?.size ?? 0,
    'JUNTA 4 · y pesa lo que la fila dice que pesa: si no coincidiera, el registro y el objeto serían de dos subidas distintas',
  ).toBe(foto.bytes);

  // ── (e) Y EL ADMIN VE LA MINIATURA FIRMADA ───────────────────────────────
  // ESTA ES LA QUE PAGA LA LECCIÓN DE 08-13. Es la única rama del panel que
  // ejecuta `deQueEsLaFoto()` desde el servidor, y la que reventaba con
  // «Attempted to call deQueEsLaFoto() from the server but deQueEsLaFoto is on
  // the client». Sin bytes de verdad no se ejecuta nunca.
  await paginaAdmin.goto(`/operacion?aseo=${aseoId}`);

  /*
    ── LA TRAMPA 1 DE `TESTING.md` TIENE UNA EXCEPCIÓN DESDE EL PLAN 10-05 ────

    Decía, y sigue valiendo para `/apartamentos` y `/finanzas`: el panel se
    portalea a `document.body`, así que todo lo que se afirme de él va acotado al
    diálogo, porque el contenedor de página queda vacío.

    **El detalle del aseo de `/operacion` ya NO es un diálogo.** El plan 10-05 lo
    sacó del `Sheet` y lo metió inline en la columna derecha de la pantalla, así
    que el rol de diálogo dejó de estar disponible como ámbito y lo sustituye un
    localizador propio. El problema de fondo no desaparece, **cambia de forma**:
    ahora la lista del día pinta el mismo nombre de apartamento que el detalle,
    así que un ámbito demasiado ancho vuelve a dar verdes por accidente. El
    control que lo mide en los dos sentidos vive en `e2e/operacion.spec.ts`,
    en el caso `CONTROL DE ALCANCE (08-11)`.
  */
  const panel = paginaAdmin.locator('[data-slot="detalle-aseo"]');
  await expect(panel, 'JUNTA 4 · el detalle del aseo abre por dirección directa').toBeVisible();
  await expect(
    paginaAdmin.getByRole('dialog'),
    'JUNTA 4 · y lo hace SIN ningún diálogo: el detalle es inline desde el plan 10-05',
  ).toHaveCount(0);

  await expect(
    panel.getByRole('button', { name: 'Ver la foto de Habitación 1' }),
    'JUNTA 4 · el admin ve la MINIATURA FIRMADA de la foto que subió la aseadora, con su nombre accesible: este botón solo existe en la rama de la firma que funcionó, que es la que ningún escenario de prueba había ejercido antes del plan 08-13',
  ).toHaveCount(1);

  // La negativa va después de su positiva y acotada al mismo diálogo: una casilla
  // de ausencia significa que la firma falló, y con la tira entera en ausencia la
  // aserción de arriba sería la única que se cae y nadie sabría por qué.
  await expect(
    panel.getByLabel('Foto no disponible'),
    'JUNTA 4 · y NINGUNA casilla de ausencia: una firma fallida pinta la casilla atenuada en vez de desaparecer, y eso es lo que el admin vería si la evidencia no se pudiera abrir',
  ).toHaveCount(0);

  // ═════════════════════════════════════════════════════════════════════════
  // JUNTA 5 · DEL ASEO AL DINERO, Y DE AHÍ AL PAGO DE LA ASEADORA
  // ═════════════════════════════════════════════════════════════════════════

  // El aseo se terminó HOY, así que pertenece al periodo EN CURSO, y el periodo
  // en curso no se puede cerrar: cerrarlo pagaría trabajo que aún no ocurrió.
  // Este recorrido no puede esperar tres semanas, así que se le corre el
  // calendario entero al aseo hasta el periodo vencido. La razón larga, y todo
  // lo que este movimiento NO debilita, está en la cabecera de
  // `adelantarElCalendarioDelAseo()`.
  const periodo = await periodoVencidoSinCerrar(servicio);
  await adelantarElCalendarioDelAseo(servicio, aseoId, periodo.hasta);

  const margenDelAseo = tarifasDelAseo.tarifaHuesped - tarifasDelAseo.pagoAseador;

  // ── (a) EL MARGEN, Y SALE DEL ASEO Y NO DEL APARTAMENTO ──────────────────
  await paginaAdmin.goto(`/finanzas/aseos?rango=dia&ancla=${periodo.hasta}&filtro=todos`);

  const filaDeDinero = paginaAdmin.getByRole('row').filter({ hasText: unidad.nombre });

  await expect(
    filaDeDinero,
    'JUNTA 5 · el aseo que la aseadora terminó aparece en el detalle del dinero: si no está, el trabajo se hizo y no lo cobró ni lo pagó nadie',
  ).toHaveCount(1);

  const celdas = await filaDeDinero.getByRole('cell').allTextContents();
  const cobrado = pesos(celdas[4]);
  const pagado = pesos(celdas[5]);
  const margen = pesos(celdas[6]);

  expect(
    cobrado,
    `JUNTA 5 · lo COBRADO es la tarifa que el aseo congeló al nacer (${tarifasDelAseo.tarifaHuesped}), no la que el apartamento tiene hoy (${TARIFA_NUEVA_DEL_APARTAMENTO}): FIN-01 dice que corregir una tarifa no puede mover el mes pasado`,
  ).toBe(tarifasDelAseo.tarifaHuesped);

  expect(
    pagado,
    `JUNTA 5 · y lo PAGADO es el pago congelado del aseo (${tarifasDelAseo.pagoAseador}), no el vigente del apartamento (${PAGO_NUEVO_DEL_APARTAMENTO})`,
  ).toBe(tarifasDelAseo.pagoAseador);

  expect(
    margen,
    'JUNTA 5 · y el MARGEN es lo cobrado menos lo pagado, fila por fila: un margen que no cuadre con sus propias dos celdas es una cifra que el dueño no puede auditar',
  ).toBe(cobrado - pagado);

  expect(
    margen,
    `JUNTA 5 · y vale ${margenDelAseo}, que es la resta de las cifras DEL ASEO: con las del apartamento daría ${TARIFA_NUEVA_DEL_APARTAMENTO - PAGO_NUEVO_DEL_APARTAMENTO}`,
  ).toBe(margenDelAseo);

  // La negativa va contra EL DOCUMENTO y después de sus positivas. Acotarla a la
  // tabla la dejaría sin ver una cifra que se colara en un KPI, en un pie o en
  // una carga de datos del mismo árbol (trampa 2 de `TESTING.md`).
  const pantallaDelDinero = (await paginaAdmin.locator('body').textContent()) ?? '';

  for (const cifra of [
    ...enLasDosFormas(TARIFA_NUEVA_DEL_APARTAMENTO),
    ...enLasDosFormas(PAGO_NUEVO_DEL_APARTAMENTO),
    ...enLasDosFormas(TARIFA_NUEVA_DEL_APARTAMENTO - PAGO_NUEVO_DEL_APARTAMENTO),
  ]) {
    expect(
      pantallaDelDinero.includes(cifra),
      `JUNTA 5 · la cifra ${cifra} es la del APARTAMENTO DE HOY y no puede aparecer en el detalle: si aparece, la pantalla está uniendo contra properties y el mes pasado se mueve cada vez que alguien corrige una tarifa`,
    ).toBe(false);
  }

  // ── (b) EL CIERRE DEL PERIODO, DESDE LA PANTALLA DEL ADMIN ───────────────
  await paginaAdmin.goto('/finanzas/pagos');

  // TRAMPA 3 DE `TESTING.md`: se localiza por `[data-slot=alert]` y no por el rol
  // `alert`, porque Next monta un anunciador de ruta vacío con ese rol en cada
  // página y el conteo siempre saldría uno de más.
  const avisoDelCierre = paginaAdmin
    .locator('[data-slot=alert]')
    .filter({ hasText: 'no se cerró' });

  await expect(
    avisoDelCierre,
    'JUNTA 5 · la pantalla de Pagos ofrece cerrar el periodo vencido: el botón NO existe en el DOM cuando no hay nada que cerrar, así que su presencia ya es la mitad de la aserción',
  ).toBeVisible();

  const disparadorDelCierre = avisoDelCierre.getByRole('button', { name: 'Cerrar el periodo' });
  await esperarControlHidratado(disparadorDelCierre);
  await disparadorDelCierre.click();

  const dialogoDelCierre = paginaAdmin.getByRole('alertdialog');
  await expect(
    dialogoDelCierre,
    'JUNTA 5 · y pide confirmación antes: un periodo cerrado no se recalcula nunca (D7-3)',
  ).toBeVisible();

  await dialogoDelCierre.getByRole('button', { name: 'Cerrar el periodo' }).click();
  await esperarAvisoQueEmpiezaCon(paginaAdmin, 'El periodo quedó cerrado.');

  // ── (c) LO QUE EL CIERRE ESCRIBIÓ ────────────────────────────────────────
  const { data: pagos, error: errorPagos } = await servicio
    .from('cleaner_payouts')
    .select('id, aseador_id, monto_aseos, monto_gastos, monto_total, cantidad_aseos')
    .eq('periodo_desde', periodo.desde);
  if (errorPagos) throw new Error(`No se pudieron leer los pagos: ${errorPagos.message}`);

  const pagoDeLaResponsable = (pagos ?? []).find((p) => p.aseador_id === idResponsable);

  expect(
    pagoDeLaResponsable,
    `JUNTA 5 · el cierre produce el pago de ${NOMBRE_RESPONSABLE}: sin fila de pago, la persona que hizo el trabajo no cobra, que es el final que esta cadena existe para evitar`,
  ).toBeDefined();

  expect(
    pagoDeLaResponsable!.monto_total,
    `JUNTA 5 · y su total es el pago congelado del aseo (${tarifasDelAseo.pagoAseador}), sin gastos y sin descuentos: el cierre lee el snapshot del aseo, no la tarifa vigente`,
  ).toBe(tarifasDelAseo.pagoAseador);

  expect(
    pagoDeLaResponsable!.cantidad_aseos,
    'JUNTA 5 · por UN aseo, que es el del recorrido',
  ).toBe(1);

  const { data: lineas, error: errorLineas } = await servicio
    .from('cleaner_payout_lines')
    .select('tipo, cleaning_id, property_nombre, monto, fecha_programada, fecha_ejecucion')
    .eq('payout_id', pagoDeLaResponsable!.id);
  if (errorLineas) throw new Error(`No se pudo leer el desglose: ${errorLineas.message}`);

  expect(
    (lineas ?? []).map((l) => l.cleaning_id),
    'JUNTA 5 · y el desglose del pago contiene EL ASEO DE ESTE RECORRIDO: un total sin desglose no se puede reclamar ni auditar (D7-2)',
  ).toEqual([aseoId]);

  expect(
    (lineas ?? [])[0].property_nombre,
    'JUNTA 5 · con el nombre del apartamento COPIADO como texto, que es lo que hace que la línea siga contando de qué se compone el día que el aseo se purgue (FIN-04)',
  ).toBe(unidad.nombre);

  // ── (d) Y LAS DOS PANTALLAS QUE LO ENSEÑAN ───────────────────────────────
  await paginaAdmin.goto('/finanzas/pagos');

  const filaDelPago = paginaAdmin.getByRole('row').filter({ hasText: NOMBRE_RESPONSABLE });
  await expect(
    filaDelPago,
    'JUNTA 5 · el admin ve el pago de la aseadora en el periodo recién cerrado',
  ).toHaveCount(1);

  await filaDelPago.getByRole('link', { name: NOMBRE_RESPONSABLE }).click();

  const panelDelPago = paginaAdmin.getByRole('dialog');
  await expect(
    panelDelPago.getByText(unidad.nombre),
    'JUNTA 5 · y al abrir el desglose ve el aseo del recorrido dentro, acotado al panel porque el panel se portalea fuera de la página',
  ).toBeVisible();

  // ── (e) LA ASEADORA, EN SUS PAGOS ────────────────────────────────────────
  await paginaAseador.goto('/mis-pagos');

  // El periodo se busca por SU RÓTULO, que es lo que la persona lee, y no por el
  // identificador del pago: un `href` afirmaría que el enlace existe, no que la
  // aseadora puede reconocer de qué mes le están hablando.
  const diaDesde = Number(periodo.desde.slice(8));
  const diaHasta = Number(periodo.hasta.slice(8));
  const mesDelCierre = formatFechaLargaBog(periodo.hasta).split(' de ')[1];

  const tarjetaDelPeriodo = paginaAseador.getByRole('link').filter({
    hasText: new RegExp(`Del\\s+${diaDesde}\\s+al\\s+${diaHasta}\\s+de\\s+${mesDelCierre}`, 'i'),
  });

  await expect(
    tarjetaDelPeriodo,
    'JUNTA 5 · la aseadora ve el periodo cerrado en sus pagos, rotulado con sus DOS fechas reales: el periodo va de cierre a cierre y no del 1 al 31 (D7-5)',
  ).toHaveCount(1);

  await tarjetaDelPeriodo.click();
  await esperarUrlDeCliente(paginaAseador, /\/mis-pagos\/[0-9a-f-]{36}$/);

  expect(
    paginaAseador.url(),
    `JUNTA 5 · y la tarjeta abre SU pago, el que el cierre acaba de escribir`,
  ).toContain(`/mis-pagos/${pagoDeLaResponsable!.id}`);

  await expect(
    paginaAseador.getByText('Tus aseos', { exact: true }),
    'JUNTA 5 · el desglose se abre con el vocabulario del aseador: no se dice «por aseos» ni «liquidación», se dice lo que ella hizo',
  ).toBeVisible();

  await expect(
    paginaAseador.getByText(unidad.nombre),
    'JUNTA 5 · y el aseo del recorrido está dentro del recibo: AQUÍ TERMINA LA CADENA. Del .ics al dinero que alguien cobra',
  ).toBeVisible();

  await expect(
    paginaAseador.getByText(
      `Programado ${formatFechaCortaBog(periodo.hasta)} · Hecho ${formatFechaCortaBog(periodo.hasta)}`,
    ),
    'JUNTA 5 · con las DOS fechas del aseo y sin abreviar aunque coincidan (D7-8): sin ellas, un aseo de un mes que aparece en el recibo de otro parece un error y el reclamo llega igual',
  ).toBeVisible();

  // ── (f) LA CONTRAPARTE DE SEGURIDAD, QUE ES LA OTRA MITAD DE LA GARANTÍA ──
  //
  // El margen y la tarifa de huésped salen de columnas que la migración 24 le
  // quitó a la aseadora del grant: el admin las recupera por funciones definer.
  // Que la pantalla no las pinte es la TERCERA capa; esta aserción mide la
  // primera y la segunda a la vez, mirando lo que de verdad cruzó el cable.
  // ── LAS DOS PANTALLAS SE VUELVEN A RECORRER, Y ESTA VEZ POR DIRECCIÓN ────
  //
  // El tramo (e) entró al desglose COMO ENTRA LA ASEADORA, tocando su tarjeta, y
  // eso es lo que hay que probar de la interfaz. Pero para MEDIR LA FUGA no sirve,
  // y es un defecto de instrumento medido aquí, con su error literal:
  //
  //     response.text: Protocol error (Network.getResponseBody):
  //     No data found for resource with given identifier
  //
  // En una navegación de cliente, Next PREFETCHEA el enlace, y el navegador
  // DESCARTA el cuerpo de esas respuestas: `response.text()` rechaza. Además, el
  // cuerpo de la carga buena se puede evacuar al confirmar la navegación, así que
  // capturarlo o no depende del reloj de la máquina. Un interceptor que a veces
  // lee y a veces no es un interceptor que a veces no mira, y una aserción
  // negativa que no mira pasa siempre.
  //
  // Con `goto()` la respuesta es un DOCUMENTO completo, su cuerpo está disponible
  // siempre, y trae exactamente lo mismo que habría traído la carga de cliente. Es
  // el mismo camino que usa `e2e/mis-pagos.spec.ts` para medir esta frontera.
  const cargas = interceptarCargaUtil(paginaAseador);

  await paginaAseador.goto('/mis-pagos');
  await paginaAseador.waitForLoadState('networkidle');

  await paginaAseador.goto(`/mis-pagos/${pagoDeLaResponsable!.id}`);
  await paginaAseador.waitForLoadState('networkidle');

  await expect(
    paginaAseador.getByText('Tus aseos', { exact: true }),
    'JUNTA 5 · y el desglose se abre igual por dirección directa: es el camino que trae el documento entero del pago, que es donde se mide la fuga',
  ).toBeVisible();

  // ── EL CONTROL DEL ALCANCE, Y LO ESCRIBIÓ UN SEÑUELO QUE NO PUSO NADA ROJO ─
  //
  // La primera versión de este tramo exigía solo que el interceptor hubiera
  // capturado ALGUNA carga, que es lo que hace `mis-pagos.spec.ts`. Con el señuelo
  // 6 puesto (la tarifa del aseo colgada de la línea del desglose como atributo de
  // datos, que viaja y no se pinta) **el caso se quedó EN VERDE**. El volcado dijo
  // por qué, y son dos trampas encadenadas que conviene no descubrir dos veces:
  //
  //     CARGA /mis-pagos                        len 15686  214609? false
  //     HTML de la pantalla incluye 214609?     true
  //
  //   1. `response.text()` es asíncrono y el oyente NO bloquea la navegación. El
  //      sondeo de «alguna carga» ya quedaba satisfecho con el documento de la
  //      LISTA, así que el bucle corría antes de que la carga del DESGLOSE
  //      terminara de leerse. La fuga estaba en la pantalla que no se miró.
  //
  //   2. Sondear por la URL del desglose TAMPOCO basta, y esto es lo que costó la
  //      segunda vuelta: Next PREFETCHEA el enlace, así que hay DOS respuestas
  //      contra esa misma dirección y la primera es un tocón de 260 bytes:
  //
  //          /mis-pagos/{id}?_rsc=liegek…   len  260   214609? false   ← prefetch
  //          /mis-pagos/{id}?_rsc=0eShry…   len 4744   214609? TRUE    ← la de verdad
  //
  // Por eso el control es POR CONTENIDO y no por dirección ni por conteo: se exige
  // que alguna carga traiga el NOMBRE DEL APARTAMENTO, que solo está en el
  // desglose. Cuando eso es cierto, el interceptor leyó la carga buena.
  await expect
    .poll(() => cargas.filter((c) => c.cuerpo.includes(unidad.nombre)).length, {
      timeout: 15_000,
      message:
        'JUNTA 5 · CONTROL DEL ALCANCE: alguna carga tiene que traer el nombre del apartamento, que solo viaja en el DESGLOSE. Sin eso, el interceptor se quedó en la lista o leyó el tocón del prefetch, y la ausencia de las cifras prohibidas no probaría nada sobre la pantalla donde más fácil se esconden',
    })
    .toBeGreaterThan(0);

  const prohibidas = [
    ...enLasDosFormas(tarifasDelAseo.tarifaHuesped),
    ...enLasDosFormas(margenDelAseo),
  ];
  const permitidas = enLasDosFormas(tarifasDelAseo.pagoAseador);

  // EL CONTROL DEL MÉTODO, Y NO ES ADORNO. Un interceptor que no capturó nada
  // haría pasar la negativa sin haber mirado: probaría que no se miró, no que no
  // hay fuga. Se exige que alguna carga traiga una cifra que la aseadora SÍ
  // puede ver.
  expect(
    cargas.some(({ cuerpo }) => permitidas.some((cifra) => cuerpo.includes(cifra))),
    'JUNTA 5 · CONTROL DEL MÉTODO: alguna carga trae el pago que la aseadora SÍ puede ver. Sin esto, la ausencia de las prohibidas no probaría nada',
  ).toBe(true);

  for (const { url, cuerpo } of cargas) {
    for (const prohibida of prohibidas) {
      expect(
        cuerpo.includes(prohibida),
        `JUNTA 5 · FUGA: la cifra ${prohibida} viajó al navegador de la aseadora en ${url}. Una pantalla que no la pinta no arregla esto: el dato ya está en el teléfono`,
      ).toBe(false);
    }
  }

  // Y la mitad del DOM, que sigue haciendo falta: una cifra puede entrar
  // calculada en el cliente a partir de dos que sí viajaron.
  const pintadoEnElTelefono = (await paginaAseador.locator('body').textContent()) ?? '';
  for (const prohibida of prohibidas) {
    expect(
      pintadoEnElTelefono.includes(prohibida),
      `JUNTA 5 · y la cifra ${prohibida} tampoco está pintada en la pantalla de la aseadora`,
    ).toBe(false);
  }
});
