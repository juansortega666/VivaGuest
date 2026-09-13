import type { Page, Response } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { formatFechaCortaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { publicEnv, readServerSecret } from '@/lib/env';

import {
  CIFRAS_FINANCIERAS,
  expect,
  limpiarFinanzas,
  sembrarFinanzas,
  test,
  type EscenarioFinanciero,
  type PeriodoDePago,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO. Lo pone en verde el plan 07-13.
 *
 * `/mis-pagos` y `/mis-pagos/[id]` no existen cuando esto se escribe. A partir
 * del 07-13, un rojo aquí es una regresión.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA REGLA QUE ORDENA EL ARCHIVO ENTERO, EN PALABRAS DEL DUEÑO ────────────
 *
 *     «El aseador ve lo que le llega y punto.»
 *
 * Nunca lo que cobramos, ni la diferencia, ni el margen de nadie. Cada caso de
 * aquí se juzga contra esa frase.
 *
 * ── Y LA TRAMPA DE MÉTODO QUE JUSTIFICA EL ARCHIVO ──────────────────────────
 *
 * **Se afirma sobre la carga útil de la red, no sobre el DOM.** Que la pantalla
 * no pinte un número no significa que el número no haya viajado.
 *
 * No es un riesgo teórico: HOY, medido contra la base, una sesión de aseadora
 * puede leer la tarifa que se le cobra al huésped. Ninguna pantalla la muestra.
 * El dato viaja al teléfono igual. Un test que solo mirara el DOM pasaría con la
 * fuga abierta, que es exactamente el estado en que está el sistema mientras se
 * escribe esto.
 *
 * Una consulta que trae el dato y una pantalla que no lo pinta siguen siendo una
 * fuga. La pantalla es la TERCERA capa de la frontera: la primera es la función
 * con guarda, la segunda es que las tablas de pago no tengan ninguna columna de
 * huésped (`07-UI-SPEC.md` §10.1).
 *
 * ── LA CONDICIÓN DE ENTORNO QUE PUEDE DAR UN VERDE FALSO ────────────────────
 *
 * `PLAYWRIGHT_PORT` en un puerto libre. `reuseExistingServer` está en `true`
 * fuera de CI, y contra la aplicación equivocada **toda aserción negativa de este
 * archivo pasa trivialmente**: una pantalla que no existe tampoco filtra nada.
 * Es el peor verde posible, sobre la garantía más importante de la fase.
 *
 *     PLAYWRIGHT_PORT=3200 npm run test:e2e e2e/mis-pagos.spec.ts
 */

// ───────────────────────────────────────────────────────────────────────────
// EL INTERCEPTOR DE CARGA ÚTIL
// ───────────────────────────────────────────────────────────────────────────

/**
 * Las cifras que NO pueden viajar al teléfono, en las dos formas en que pueden
 * aparecer: el entero crudo del JSON o de la carga de servidor, y el formateado
 * con separador de miles por si alguien lo pinta en algún sitio.
 *
 * Se buscan los márgenes además de las tarifas: una pantalla que no mande la
 * tarifa pero sí la resta rompe la frontera igual. El margen ES una cifra de
 * huésped disfrazada, porque se despeja con lo que la persona sí puede ver.
 */
const PROHIBIDAS: string[] = [
  CIFRAS_FINANCIERAS.tarifaA,
  CIFRAS_FINANCIERAS.tarifaB,
  CIFRAS_FINANCIERAS.margenA,
  CIFRAS_FINANCIERAS.margenB,
].flatMap((n) => [String(n), n.toLocaleString('es-CO')]);

/**
 * Lo que el aseador SÍ puede ver, y que además sirve de control del método.
 *
 * ── LAS DOS FORMAS, IGUAL QUE LAS PROHIBIDAS, Y ESTÁ MEDIDO (2026-09-13) ────
 *
 * Este arreglo se escribió en Wave 0, antes de que las dos pantallas
 * existieran, y listaba SOLO el entero crudo. Con el árbol del aseador
 * renderizado entero en el servidor, **el entero crudo no viaja nunca**: el
 * formateo ocurre en el servidor, así que lo que cruza es `41.117` y jamás
 * `41117`. Medido sobre las tres cargas que captura el interceptor en el
 * recorrido de este archivo:
 *
 *   pagoA crudo (41117) ........ NO APARECE
 *   pagoA con puntos (41.117) .. /mis-pagos y /mis-pagos/[id]
 *   pagoB crudo (48211) ........ NO APARECE
 *   pagoB con puntos (48.211) .. /mis-pagos/[id]
 *   gasto crudo (33517) ........ NO APARECE
 *   gasto con puntos (33.517) .. /mis-pagos/[id]
 *
 * O sea que el control no podía dispararse nunca, y ponía en rojo el caso 16
 * por una asimetría del propio archivo y no por una fuga: las prohibidas ya se
 * buscaban en las dos formas, y las permitidas en una sola.
 *
 * **Añadir la forma con separador NO debilita nada.** La aserción negativa
 * sigue recorriendo las mismas cargas buscando las prohibidas en sus dos
 * formas. Lo único que cambia es que el control vuelve a poder demostrar lo que
 * existe para demostrar: que el interceptor está mirando donde tiene que
 * mirar. Si mañana alguien pone una cifra del aseador en un componente de
 * cliente, el entero crudo empezará a viajar y el control lo aceptará igual,
 * que es correcto: sigue siendo dinero suyo.
 */
const PERMITIDAS: string[] = [
  CIFRAS_FINANCIERAS.pagoA,
  CIFRAS_FINANCIERAS.pagoB,
  CIFRAS_FINANCIERAS.gasto,
].flatMap((n) => [String(n), n.toLocaleString('es-CO')]);

interface CargaUtil {
  url: string;
  cuerpo: string;
}

/**
 * Engancha un oyente que guarda el CUERPO de cada respuesta de este origen.
 *
 * ── LO QUE SE MIRA Y LO QUE NO, Y POR QUÉ ──────────────────────────────────
 *
 * Se miran las respuestas de documento, de carga de servidor de React y de JSON.
 * Ahí es donde puede ir una cifra: el HTML del render del servidor, la carga que
 * el enrutador pide al navegar sin recargar, y cualquier llamada directa a la
 * base desde el cliente.
 *
 * Se descarta `/_next/static/`: son los bundles y las fuentes, con hashes de
 * build de dieciséis dígitos hexadecimales que producen coincidencias por puro
 * azar. Excluirlos no abre ningún hueco —un bundle no lleva datos de una
 * aseadora concreta— y evita un rojo que costaría una hora entender.
 *
 * `response.text()` puede rechazar cuando el navegador ya descartó el cuerpo (un
 * redirect, un 304). Se traga el error a propósito: una respuesta sin cuerpo no
 * puede filtrar nada.
 */
function interceptarCargaUtil(p: Page): CargaUtil[] {
  const cargas: CargaUtil[] = [];

  const oyente = (respuesta: Response) => {
    const url = new URL(respuesta.url());
    if (url.pathname.startsWith('/_next/static/')) return;

    const tipo = respuesta.headers()['content-type'] ?? '';
    if (!/text\/html|text\/x-component|application\/json|text\/plain/.test(tipo)) return;

    void respuesta
      .text()
      .then((cuerpo) => cargas.push({ url: respuesta.url(), cuerpo }))
      .catch(() => {
        /* sin cuerpo disponible: no puede filtrar nada */
      });
  };

  p.on('response', oyente);
  return cargas;
}

/**
 * Afirma que NINGUNA carga trae una cifra prohibida, y que el método sirve.
 *
 * ── LA SEGUNDA MITAD NO ES ADORNO: ES EL CONTROL ───────────────────────────
 * Un interceptor que no capturó nada —porque el tipo de contenido cambió, porque
 * la ruta dio 404, porque el oyente se enganchó tarde— haría pasar la primera
 * mitad sin haber mirado nada. Por eso se exige que al menos UNA carga contenga
 * una cifra PERMITIDA: si el pago del aseador viajó, el interceptor está mirando
 * donde tiene que mirar, y entonces la ausencia de las prohibidas significa algo.
 *
 * Sin este control, este archivo sería exactamente el tipo de verde que la Fase 5
 * enseñó a desconfiar.
 */
function sinCifrasDeHuesped(cargas: CargaUtil[]): void {
  expect(cargas.length, 'el interceptor capturó alguna respuesta').toBeGreaterThan(0);

  const vioAlgoSuyo = cargas.some(({ cuerpo }) =>
    PERMITIDAS.some((cifra) => cuerpo.includes(cifra)),
  );
  expect(
    vioAlgoSuyo,
    'CONTROL DEL MÉTODO: alguna carga trae una cifra que el aseador SÍ puede ver. ' +
      'Sin esto, la ausencia de las prohibidas no probaría nada: probaría que no se miró.',
  ).toBe(true);

  for (const { url, cuerpo } of cargas) {
    for (const prohibida of PROHIBIDAS) {
      expect(
        cuerpo.includes(prohibida),
        `FUGA: la cifra ${prohibida} viajó al navegador del aseador en ${url}. ` +
          'Una pantalla que no la pinta no arregla esto: el dato ya está en el teléfono.',
      ).toBe(false);
    }
  }
}

/** Afirma que un rótulo lleva sus dos fechas reales y no solo el nombre del mes. */
function rotuloConLasDosFechas(rotulo: string, periodo: PeriodoDePago): void {
  const diaDesde = Number(periodo.desde.slice(8));
  const diaHasta = Number(periodo.hasta.slice(8));
  const mesHasta = formatFechaLargaBog(periodo.hasta).split(' de ')[1];

  expect(rotulo).toMatch(/\bDel\b/i);
  expect(rotulo).toMatch(new RegExp(`(^|\\D)${diaDesde}(\\D|$)`));
  expect(rotulo).toMatch(new RegExp(`(^|\\D)${diaHasta}(\\D|$)`));
  expect(rotulo).toContain(mesHasta);
}

// ───────────────────────────────────────────────────────────────────────────

let servicio: Servicio;
let esc: EscenarioFinanciero;

test.beforeAll(async () => {
  cargarEnvLocal();
  servicio = clienteDeServicio();
  esc = await sembrarFinanzas(servicio);
});

test.afterAll(async () => {
  if (esc) await limpiarFinanzas(servicio, esc);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. LA ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * No existe navegación persistente en el árbol del aseador y esta fase no la
 * inventa: una barra inferior nueva es un cambio de paradigma que le toca a
 * `/mis-aseos`, a `/aseos/[id]` y al asistente de evidencia, y ninguno está en el
 * alcance (§10.2). Así que la entrada es una fila al pie de la lista.
 */
test('la entrada a los pagos está al pie de la lista de aseos, con su texto exacto', async ({
  paginaAseador,
}) => {
  await paginaAseador.goto('/mis-aseos');

  const entrada = paginaAseador.getByRole('link', { name: 'Mis pagos' });
  await expect(entrada).toBeVisible();
  await entrada.click();

  await paginaAseador.waitForURL(/\/mis-pagos$/);
  await expect(paginaAseador.getByRole('heading', { name: 'Mis pagos', level: 1 })).toBeVisible();
  await expect(paginaAseador.getByRole('link', { name: 'Volver a mis aseos' })).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. LA LISTA
// ═══════════════════════════════════════════════════════════════════════════

test('la lista muestra una tarjeta por periodo cerrado, con las fechas exactas y el estado del pago', async ({
  paginaAseador,
}) => {
  await paginaAseador.goto('/mis-pagos');

  // Dos periodos cerrados: el viejo ya pagado, el reciente pendiente.
  const tarjetas = paginaAseador.getByRole('link').filter({ hasText: /^Del\s/ });
  await expect(tarjetas).toHaveCount(2);

  // De la más reciente a la más antigua.
  rotuloConLasDosFechas((await tarjetas.nth(0).textContent()) ?? '', esc.reciente);
  rotuloConLasDosFechas((await tarjetas.nth(1).textContent()) ?? '', esc.viejo);

  // Los dos estados, con el copy del teléfono y no el del admin (§15.2).
  await expect(tarjetas.nth(0).getByText('Pendiente de pago')).toBeVisible();
  await expect(tarjetas.nth(1).getByText(/^Te lo pagaron el /)).toBeVisible();

  // La nota al pie, que es lo que explica la ausencia del mes en curso.
  await expect(
    paginaAseador.getByText('Solo aparecen los periodos ya cerrados.'),
  ).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. EL PERIODO EN CURSO NO APARECE (D7-4.3)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * El acumulado del mes se mueve y **puede bajar**: si se cancela un aseo ya
 * contado, el número baja. Un número que baja en el teléfono de quien lo va a
 * cobrar es una discusión garantizada. Lo cerrado no cambia nunca, así que es lo
 * único que se puede enseñar sin ambigüedad.
 *
 * Se afirma su AUSENCIA por su rango de fechas y no por su monto: un monto puede
 * coincidir por accidente con el de otro periodo; el rango, no.
 */
test('el periodo en curso, que sí tiene aseos completados, no aparece por ninguna parte', async ({
  paginaAseador,
}) => {
  await paginaAseador.goto('/mis-pagos');

  const contenido = (await paginaAseador.locator('body').textContent()) ?? '';

  const diaDesde = Number(esc.enCurso.desde.slice(8));
  const diaHasta = Number(esc.enCurso.hasta.slice(8));
  const mes = formatFechaLargaBog(esc.enCurso.hasta).split(' de ')[1];

  const rotuloDelEnCurso = new RegExp(
    `Del\\s+${diaDesde}\\s+al\\s+${diaHasta}\\s+de\\s+${mes}`,
    'i',
  );
  expect(
    contenido,
    'el periodo en curso no se enseña: su acumulado todavía puede bajar (D7-4.3)',
  ).not.toMatch(rotuloDelEnCurso);

  // Y la prueba de que el periodo en curso EXISTE con aseos, para que la
  // ausencia signifique algo: son exactamente dos tarjetas, no tres.
  await expect(paginaAseador.getByRole('link').filter({ hasText: /^Del\s/ })).toHaveCount(2);
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. EL PAGO DE OTRA PERSONA (T-07-10)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Que no salga en la lista es la mitad fácil. La que importa es la otra: escribir
 * la dirección a mano. La consulta filtra por el usuario **dentro de la función**
 * (§10.1), no en el `where` de la pantalla, así que conocer el identificador no
 * alcanza para nada.
 */
test('el pago de la otra aseadora no sale en la lista, y su desglose no se abre por dirección directa', async ({
  paginaAseador,
}) => {
  await paginaAseador.goto('/mis-pagos');
  await expect(paginaAseador.getByText(esc.aseadoraDos.nombre)).toHaveCount(0);

  const cargas = interceptarCargaUtil(paginaAseador);
  await paginaAseador.goto(`/mis-pagos/${esc.pagos.dosReciente}`);
  await paginaAseador.waitForLoadState('networkidle');

  // Ni el desglose, ni sus partidas. Lo que devuelva —un vacío, un 404, un
  // rebote— es decisión del plan 07-13; lo que NO puede pasar es que se vea.
  await expect(paginaAseador.getByText('Tus aseos')).toHaveCount(0);

  for (const { url, cuerpo } of cargas) {
    expect(
      cuerpo.includes(esc.aptoB.nombre) && cuerpo.includes('Gastos que te devuelven'),
      `el desglose del compañero llegó al navegador en ${url}`,
    ).toBe(false);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. LA FRONTERA. ES LA ASERCIÓN QUE JUSTIFICA EL ARCHIVO.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ── POR QUÉ ESTE CASO SE ESCRIBE ASÍ Y NO CON `expect(pantalla).not.toContain` ─
 *
 * Porque el sistema HOY tiene la fuga abierta y ninguna pantalla la muestra. Una
 * aserción sobre el DOM pasaría con la fuga puesta. Esa es toda la lección.
 *
 * Se recorren las DOS pantallas del aseador en la misma sesión —la lista y un
 * desglose— porque la fuga puede entrar por cualquiera de las dos, y porque el
 * desglose es donde más tienta traerse el aseo entero "para tener el contexto".
 */
test('ninguna cifra de huésped ni ningún margen llega al navegador del aseador, en ninguna de sus dos pantallas', async ({
  paginaAseador,
}) => {
  const cargas = interceptarCargaUtil(paginaAseador);

  await paginaAseador.goto('/mis-pagos');
  await paginaAseador.waitForLoadState('networkidle');

  // Se entra al desglose PROPIO por su dirección, que es el camino que trae el
  // documento completo del pago.
  await paginaAseador.goto(`/mis-pagos/${esc.pagos.unaReciente}`);
  await paginaAseador.waitForLoadState('networkidle');
  await expect(paginaAseador.getByText('Tus aseos')).toBeVisible();

  // Un respiro para que los cuerpos pendientes terminen de leerse: `text()` es
  // asíncrono y el oyente no bloquea la navegación.
  await expect
    .poll(() => cargas.length, { timeout: 5_000 })
    .toBeGreaterThan(0);

  sinCifrasDeHuesped(cargas);

  // Y la mitad del DOM, que sigue haciendo falta: una cifra puede entrar
  // calculada en el cliente a partir de dos que sí viajaron.
  const pintado = ((await paginaAseador.locator('body').textContent()) ?? '').replace(
    /[.\s ]/g,
    '',
  );
  for (const prohibida of PROHIBIDAS) {
    expect(pintado).not.toContain(prohibida.replace(/[.\s]/g, ''));
  }
  // Vocabulario del admin, prohibido en este árbol (§10.4).
  const crudo = (await paginaAseador.locator('body').textContent()) ?? '';
  expect(crudo).not.toMatch(/margen|rentabilidad|cobrado|liquidaci[oó]n|snapshot/i);
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. EL DESGLOSE DEL ASEADOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Mismo contenido que el panel del admin, con la escala móvil y **con el
 * vocabulario del aseador**: se dice `Gastos que te devuelven`, no `Gastos
 * reembolsados`. La persona que lee esto no trabaja en contabilidad.
 *
 * Y las dos fechas por aseo, igual que en el panel del admin y por la misma razón
 * (D7-8): sin ellas, un aseo de enero que aparece en el recibo de febrero parece
 * un error, y el reclamo llega igual.
 */
test('el desglose tiene sus dos secciones con el vocabulario del aseador, las dos fechas por aseo, y su total', async ({
  paginaAseador,
}) => {
  await paginaAseador.goto('/mis-pagos');
  await paginaAseador.getByRole('link').filter({ hasText: /^Del\s/ }).first().click();
  await paginaAseador.waitForURL(/\/mis-pagos\/[0-9a-f-]{36}$/);

  await expect(paginaAseador.getByRole('link', { name: 'Volver a mis pagos' })).toBeVisible();

  for (const seccion of ['Tus aseos', 'Gastos que te devuelven', 'Total']) {
    await expect(paginaAseador.getByText(seccion, { exact: true })).toBeVisible();
  }

  // El estado del pago, arriba.
  await expect(paginaAseador.getByText('Pendiente de pago')).toBeVisible();

  // Las dos fechas de cada aseo, en las dos formas: el que cruza el periodo y el
  // que no. La segunda es la que se cae sola si alguien abrevia el render.
  await expect(
    paginaAseador.getByText(
      `Programado ${formatFechaCortaBog(esc.aseoCruzado.programado)} · Hecho ${formatFechaCortaBog(esc.aseoCruzado.hecho)}`,
    ),
  ).toBeVisible();
  await expect(
    paginaAseador.getByText(
      `Programado ${formatFechaCortaBog(esc.aseoAlineado.fecha)} · Hecho ${formatFechaCortaBog(esc.aseoAlineado.fecha)}`,
    ),
    'la línea de las dos fechas no se abrevia cuando coinciden (D7-8)',
  ).toBeVisible();

  // El gasto, con su concepto, dentro de la sección que le corresponde.
  await expect(paginaAseador.getByText(esc.gasto.concepto)).toBeVisible();
});

// ═══════════════════════════════════════════════════════════════════════════
// 18. EL VACÍO DEL ASEADOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Para ver el vacío hace falta una sesión SIN ningún periodo cerrado propio, y la
 * aseadora Una sí tiene dos. Se le borran los pagos justo antes de mirar.
 *
 * La alternativa era sembrar una aseadora nueva, y no vale: un usuario nuevo no
 * tiene sesión persistida, así que el test tendría que hacer login por UI. La
 * regla de la suite, escrita en la cabecera de `fixtures.ts`, es que **el único
 * test que hace login por UI es el test de login**.
 *
 * Va al final del archivo porque deja el escenario a medias: cualquier caso
 * posterior que esperara ver una tarjeta fallaría por culpa de este. El `afterAll`
 * limpia el resto.
 */
test('sin ningún periodo cerrado propio, el vacío usa su copy exacto', async ({
  paginaAseador,
}) => {
  await borrarPagosDe(esc.aseadoraUna.id);

  await paginaAseador.goto('/mis-pagos');

  await expect(paginaAseador.getByText('Todavía no tienes pagos cerrados.')).toBeVisible();
  await expect(
    paginaAseador.getByText(
      'Cuando termine el mes vas a ver acá cuánto se te paga y de qué se compone.',
    ),
  ).toBeVisible();
});

/**
 * Borra los pagos de una persona con el cliente de servicio.
 *
 * Las tres tablas del snapshot no tienen grant para `authenticated` —todo sale
 * por función con guarda—, así que sembrar y limpiar sobre ellas solo se puede
 * con la clave de servicio, igual que en `fixtures.ts`.
 */
async function borrarPagosDe(aseadora: string): Promise<void> {
  const { NEXT_PUBLIC_SUPABASE_URL } = publicEnv();
  const crudo = createClient(
    NEXT_PUBLIC_SUPABASE_URL,
    readServerSecret('SUPABASE_SECRET_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data } = await crudo.from('cleaner_payouts').select('id').eq('aseador_id', aseadora);
  const ids = ((data ?? []) as { id: string }[]).map((p) => p.id);
  if (ids.length === 0) return;

  await crudo.from('cleaner_payout_lines').delete().in('payout_id', ids);
  await crudo.from('cleaner_payouts').delete().in('id', ids);
}
