import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

import type { Page } from '@playwright/test';

import { formatFechaBog } from '@/lib/domain/dates';

import { expect, test } from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * Criterio 6 del ROADMAP: la validación en vivo del feed (APTO-12, UI-SPEC §10).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ HAY UN SERVIDOR HTTP DENTRO DE ESTE SPEC Y NO UN `page.route()`.
 *
 * `page.route()` intercepta lo que pide EL NAVEGADOR. El fetch de validación lo
 * hace EL SERVIDOR de Next, dentro de una Server Action: la petición no pasa por
 * el navegador y el intercept no la ve. Así que se levanta un servidor HTTP
 * local que sirve las fixtures `.ics` del plan 02-03, y la allowlist de host
 * admite `127.0.0.1` bajo el candado documentado en `lib/domain/ical-url.schema.ts`.
 * `playwright.config.ts` enciende ese candado con `NEXT_PUBLIC_VIVAGUEST_FEED_LOCAL`.
 *
 * El servidor lleva CONTADOR DE HITS por ruta, y eso no es diagnóstico: es la
 * única forma de demostrar que un link con formato inválido no dispara NINGUNA
 * petición, y que un 302 NO se sigue.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── QUÉ FIXTURES SON SEGURAS EN EL TIEMPO Y CUÁLES NO ───────────────────────
 * `vacio.ics`, `solo-pasado.ics` y `html-200.html` del plan 02-03 se sirven tal
 * cual: la primera y la tercera no tienen fechas, y la segunda solo envejece
 * hacia el pasado, que es justo lo que prueba. `feliz.ics` NO se sirve tal cual:
 * sus `DTEND` son de septiembre de 2026 y a partir de octubre caería en el
 * estado 5, convirtiendo el test del caso feliz en un test de otra cosa sin que
 * nadie se entere. Para ese caso se genera un `.ics` con la MISMA forma y fechas
 * relativas a hoy.
 *
 * ── LA TRAMPA DE PLAYWRIGHT QUE ESTE ARCHIVO PISA ───────────────────────────
 * `getByRole(name:)` casa por SUBCADENA. `Guardar y conectar calendario`
 * contiene `Guardar`, y `Validar de nuevo` contiene `Validar`. Todo nombre que
 * sea prefijo de otro lleva `exact: true`.
 */

type Servicio = ReturnType<typeof clienteDeServicio>;

let servicio: Servicio;
let servidor: Server;
let base = '';

/** Hits por ruta. Es lo que convierte "no hubo red" en una aserción. */
const hits = new Map<string, number>();

const creados = new Set<string>();

/** El `?s=` de la URL de prueba: la parte que NUNCA puede aparecer en el DOM. */
const SECRETO = `SECRETOE2E${Date.now()}`;

const DIR_FIXTURES = resolve(process.cwd(), 'lib/domain/__fixtures__/ical');

function fixture(nombre: string): string {
  return readFileSync(resolve(DIR_FIXTURES, nombre), 'utf8');
}

/** Hoy en Bogotá, `'YYYY-MM-DD'`. El mismo día de negocio que usa el servidor. */
function hoyBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Bogota',
  }).format(new Date());
}

/** `'2026-09-04'` + n días, sin salirse de cadenas hasta el último paso. */
function masDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** `'2026-09-04'` → `'20260904'`, la forma del `DTEND;VALUE=DATE`. */
function compacta(iso: string): string {
  return iso.replaceAll('-', '');
}

const HOY = hoyBogota();
/** Última noche de la reserva. Si algún día alguien "arregla" el off-by-one
 *  restándole un día al `DTEND`, la pantalla mostraría ESTA fecha. */
const ULTIMA_NOCHE = masDias(HOY, 1);
/** El `DTEND`, que ES el día del checkout y del aseo. Sin sumar ni restar. */
const CHECKOUT = masDias(HOY, 2);

/**
 * El caso feliz con la forma medida en 02-RESEARCH §2: dos `Reserved` con su
 * `Reservation URL` en la `DESCRIPTION` y un `Airbnb (Not available)` sin ella.
 * El conteo correcto es 2 reservas, no 3 eventos.
 */
function icsFeliz(): string {
  return [
    'BEGIN:VCALENDAR',
    'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'DTSTAMP:20260901T120000Z',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${compacta(ULTIMA_NOCHE)}`,
    `DTEND;VALUE=DATE:${compacta(CHECKOUT)}`,
    'UID:e2e-1@airbnb.com',
    'SUMMARY:Reserved',
    'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HMYXB825YD',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${compacta(masDias(HOY, 20))}`,
    `DTEND;VALUE=DATE:${compacta(masDias(HOY, 25))}`,
    'UID:e2e-2@airbnb.com',
    'SUMMARY:Reserved',
    'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/QQWE44RTZ1',
    'END:VEVENT',
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${compacta(masDias(HOY, 40))}`,
    `DTEND;VALUE=DATE:${compacta(masDias(HOY, 45))}`,
    'UID:e2e-3@airbnb.com',
    'SUMMARY:Airbnb (Not available)',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** Las rutas del servidor de fixtures. Todas cumplen la forma de la allowlist. */
const RUTAS = {
  feliz: '/calendar/ical/feliz.ics',
  vacio: '/calendar/ical/vacio.ics',
  pasado: '/calendar/ical/pasado.ics',
  noEsIcal: '/calendar/ical/no-es-ical.ics',
  ausente: '/calendar/ical/ausente.ics',
  prohibido: '/calendar/ical/prohibido.ics',
  roto: '/calendar/ical/roto.ics',
  redirigido: '/calendar/ical/redirigido.ics',
} as const;

function url(ruta: string): string {
  return `${base}${ruta}?s=${SECRETO}`;
}

function hitsDe(ruta: string): number {
  return hits.get(ruta) ?? 0;
}

function hitsTotales(): number {
  return [...hits.values()].reduce((a, b) => a + b, 0);
}

test.beforeAll(async () => {
  cargarEnvLocal();
  servicio = clienteDeServicio();

  servidor = createServer((req, res) => {
    const ruta = (req.url ?? '').split('?')[0];
    hits.set(ruta, hitsDe(ruta) + 1);

    switch (ruta) {
      case RUTAS.feliz:
        res.writeHead(200, { 'content-type': 'text/calendar' });
        res.end(icsFeliz());
        return;
      case RUTAS.vacio:
        res.writeHead(200, { 'content-type': 'text/calendar' });
        res.end(fixture('vacio.ics'));
        return;
      case RUTAS.pasado:
        res.writeHead(200, { 'content-type': 'text/calendar' });
        res.end(fixture('solo-pasado.ics'));
        return;
      case RUTAS.noEsIcal:
        // El modo de falla peligroso: 200 con HTML. Medido en 02-03.
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(fixture('html-200.html'));
        return;
      case RUTAS.ausente:
        res.writeHead(404).end('no');
        return;
      case RUTAS.prohibido:
        res.writeHead(403).end('no');
        return;
      case RUTAS.roto:
        res.writeHead(500).end('no');
        return;
      case RUTAS.redirigido:
        // Si el servidor de Next siguiera esta redirección, el contador de
        // `feliz` subiría y la pantalla mostraría el estado 4. Con
        // `redirect: 'manual'` no la sigue y ninguna de las dos cosas pasa.
        res.writeHead(302, { location: RUTAS.feliz }).end();
        return;
      default:
        res.writeHead(404).end('no');
    }
  });

  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const { port } = servidor.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((ok) => servidor.close(() => ok()));

  for (const id of creados) {
    await servicio.from('properties').delete().eq('id', id);
  }

  const { count } = await servicio
    .from('properties')
    .select('id', { count: 'exact', head: true });

  // Las 39 sembradas no se tocan y el stack local es COMPARTIDO entre worktrees.
  if (count !== 39) {
    throw new Error(`La limpieza dejó restos: ${count} unidades donde había 39.`);
  }
});

/** Un apartamento propio por test: así ninguno hereda el feed de otro. */
async function crearApartamento(etiqueta: string): Promise<string> {
  const { data, error } = await servicio
    .from('properties')
    .insert({ nombre: `[E2E-CAL-${Date.now()}] ${etiqueta}`, cluster: 'E2E Cal' })
    .select('id')
    .single();

  if (error) throw new Error(`No se pudo crear el apartamento: ${error.message}`);
  creados.add(data.id);
  return data.id;
}

async function abrirCalendario(pagina: Page, etiqueta: string): Promise<string> {
  const id = await crearApartamento(etiqueta);
  await pagina.goto(`/apartamentos/${id}/calendario`);
  await expect(pagina.getByRole('button', { name: 'Validar link', exact: true })).toBeVisible();
  return id;
}

async function validar(pagina: Page, destino: string): Promise<void> {
  await pagina.getByLabel('Link de exportación del calendario').fill(destino);
  await pagina.getByRole('button', { name: 'Validar link', exact: true }).click();
}

test.describe('APTO-12 — validación en vivo del feed', () => {
  test('estado 2: un link con formato inválido no dispara NINGUNA petición', async ({
    paginaAdmin,
  }) => {
    await abrirCalendario(paginaAdmin, 'formato');

    const antes = hitsTotales();

    await validar(paginaAdmin, 'https://evil.com/?x=airbnb.com/calendar/ical/1.ics');

    await expect(
      paginaAdmin.getByText(/Ese link no parece una exportación de calendario de Airbnb/),
    ).toBeVisible();

    // LA ASERCIÓN: el servidor de fixtures no registró nada. Sin el contador,
    // "no hubo red" no sería comprobable desde el navegador.
    expect(hitsTotales()).toBe(antes);

    // CONTROL: el contador SÍ se mueve cuando la validación de verdad ocurre.
    // Sin él, la línea de arriba pasaría igual con un servidor caído.
    await validar(paginaAdmin, url(RUTAS.feliz));
    await expect(paginaAdmin.getByText('El calendario responde correctamente.')).toBeVisible();
    expect(hitsTotales()).toBe(antes + 1);
  });

  test('estado 4: el conteo y el checkout, en Display 24/600 y sin off-by-one', async ({
    paginaAdmin,
  }) => {
    await abrirCalendario(paginaAdmin, 'feliz');
    await validar(paginaAdmin, url(RUTAS.feliz));

    await expect(paginaAdmin.getByText('El calendario responde correctamente.')).toBeVisible();

    const conteo = paginaAdmin.getByText('reservas encontradas').locator('..').locator('span').first();
    const fecha = paginaAdmin
      .getByText('próximo checkout detectado')
      .locator('..')
      .locator('span')
      .first();

    // Dos reservas, no tres eventos: el bloqueo del propietario no cuenta.
    await expect(conteo).toHaveText('2');

    // `DTEND` ES el día del checkout. Si alguien le restara un día, aquí saldría
    // la última noche, y por eso se afirman las dos cosas: la que debe estar y
    // la que no. Con una sola aserción el señuelo del off-by-one sobrevive.
    await expect(fecha).toHaveText(formatFechaBog(CHECKOUT));
    await expect(fecha).not.toHaveText(formatFechaBog(ULTIMA_NOCHE));

    // EL PESO TIPOGRÁFICO ES PARTE DEL REQUISITO. Enterrar el número en 14px
    // anula APTO-12: es la verificación humana de que el link es el correcto.
    for (const nodo of [conteo, fecha]) {
      const estilo = await nodo.evaluate((el) => {
        const s = getComputedStyle(el);
        return { size: s.fontSize, weight: s.fontWeight };
      });
      expect(estilo.size).toBe('24px');
      expect(estilo.weight).toBe('600');
    }

    await expect(
      paginaAdmin.getByRole('button', { name: 'Guardar y conectar calendario' }),
    ).toBeEnabled();
  });

  test('estado 5 y estado 6 no se pueden confundir', async ({ paginaAdmin }) => {
    const COPY_5 = 'El link responde, pero no trae ninguna reserva ni bloqueo futuro.';
    const COPY_6 = 'El link responde, pero no devuelve un calendario.';

    // ── ESTADO 5: calendario de verdad, sin nada por delante ──────────────────
    await abrirCalendario(paginaAdmin, 'vacio');
    await validar(paginaAdmin, url(RUTAS.vacio));

    await expect(paginaAdmin.getByText(COPY_5)).toBeVisible();
    await expect(paginaAdmin.getByText(COPY_6)).toHaveCount(0);
    await expect(
      paginaAdmin.getByText(/Verifica en Airbnb que el anuncio sea este antes de guardar/),
    ).toBeVisible();

    const guardarIgual = paginaAdmin.getByRole('button', { name: 'Guardar de todos modos' });
    await expect(guardarIgual).toBeVisible();

    // `outline`, no primario: no se celebra un resultado dudoso. Se compara
    // contra los TOKENS y no contra un literal, que es lo que sobrevive al
    // rebrand: un botón primario va relleno de `--primary` y este va de
    // `--background`. (Medido: `getComputedStyle` devuelve el valor tal cual lo
    // declara la capa de tokens, `oklch(...)`, no un `rgb()`.)
    const pintura = await guardarIgual.evaluate((el) => {
      // Los tokens se resuelven a través de una sonda y no con
      // `getPropertyValue`, y la razón está medida: el valor DECLARADO es
      // `oklch(100% 0 0)` y el COMPUTADO de `background-color` es `oklch(1 0 0)`.
      // Es el mismo color y dos cadenas distintas; compararlas directamente daba
      // un rojo que no significaba nada.
      const sonda = (token: string) => {
        const div = document.createElement('div');
        div.style.backgroundColor = `var(${token})`;
        document.body.appendChild(div);
        const v = getComputedStyle(div).backgroundColor;
        div.remove();
        return v;
      };

      return {
        boton: getComputedStyle(el).backgroundColor,
        primary: sonda('--primary'),
        background: sonda('--background'),
      };
    });

    expect(pintura.boton).toBe(pintura.background);
    expect(pintura.boton).not.toBe(pintura.primary);

    // ── ESTADO 6: 200 con HTML. El modo de falla peligroso ────────────────────
    await abrirCalendario(paginaAdmin, 'html');
    await validar(paginaAdmin, url(RUTAS.noEsIcal));

    await expect(paginaAdmin.getByText(COPY_6)).toBeVisible();
    await expect(paginaAdmin.getByText(COPY_5)).toHaveCount(0);
    await expect(paginaAdmin.getByText(/Vuelve al paso 4 de la guía/)).toBeVisible();
    await expect(paginaAdmin.getByRole('button', { name: 'Reintentar' })).toBeVisible();

    // Y no se ofrece guardar nada: un link que no devuelve calendario no validó.
    await expect(paginaAdmin.getByRole('button', { name: /^Guardar/ })).toHaveCount(0);
  });

  test('estado 5 también con eventos SOLO en el pasado, que no es lo mismo que cero eventos', async ({
    paginaAdmin,
  }) => {
    // Es la fixture que separa "no hay nada por delante" de "no hay eventos".
    // Con el corte por `totalEventos === 0`, este feed —que SÍ trae eventos—
    // caería en el estado 4 mostrando "0 reservas" y sin fecha de checkout, que
    // es exactamente la ambigüedad que los dos estados existen para separar.
    //
    // VERIFICADO CON SEÑUELO, y con un hallazgo: al cambiar el corte a
    // `totalEventos === 0` el TIPADO se cayó antes que este test, porque el
    // estado 4 declara `proximoCheckout: string` y no `string | null`. Es una
    // barrera mejor que un test —falla en `tsc`, no en CI a los 30 s— pero no
    // sustituye a este: con un `?? '2026-01-01'` el compilador se calla y es
    // esta aserción la que se pone en rojo. Se comprobó también así.
    await abrirCalendario(paginaAdmin, 'pasado');
    await validar(paginaAdmin, url(RUTAS.pasado));

    await expect(
      paginaAdmin.getByText('El link responde, pero no trae ninguna reserva ni bloqueo futuro.'),
    ).toBeVisible();
    await expect(paginaAdmin.getByText('El calendario responde correctamente.')).toHaveCount(0);
  });

  test('estado 7: cuatro copys distintos, uno por familia de status', async ({ paginaAdmin }) => {
    const COPY_404 = 'Airbnb no reconoce ese link. Lo más probable es que lo hayan regenerado.';
    const COPY_403 = 'Airbnb rechazó la petición.';
    const COPY_5XX = 'Airbnb está devolviendo error. Intenta de nuevo en unos minutos.';

    await abrirCalendario(paginaAdmin, 'estados-7');

    await validar(paginaAdmin, url(RUTAS.ausente));
    await expect(paginaAdmin.getByText(COPY_404)).toBeVisible();
    // Un solo mensaje genérico obligaría al admin a adivinar: se afirma también
    // que los OTROS copys no están.
    await expect(paginaAdmin.getByText(COPY_403)).toHaveCount(0);
    await expect(paginaAdmin.getByText(COPY_5XX)).toHaveCount(0);

    await validar(paginaAdmin, url(RUTAS.prohibido));
    await expect(paginaAdmin.getByText(COPY_403)).toBeVisible();
    await expect(paginaAdmin.getByText(COPY_404)).toHaveCount(0);

    await validar(paginaAdmin, url(RUTAS.roto));
    await expect(paginaAdmin.getByText(COPY_5XX)).toBeVisible();
    await expect(paginaAdmin.getByText(COPY_404)).toHaveCount(0);
  });

  test('un 302 se clasifica como inalcanzable y NO se sigue (segunda mitad anti-SSRF)', async ({
    paginaAdmin,
  }) => {
    await abrirCalendario(paginaAdmin, 'redireccion');

    const felizAntes = hitsDe(RUTAS.feliz);

    await validar(paginaAdmin, url(RUTAS.redirigido));

    await expect(paginaAdmin.getByText('No se pudo leer el calendario.')).toBeVisible();
    await expect(paginaAdmin.getByText('El calendario responde correctamente.')).toHaveCount(0);

    // CONTROL: la ruta de la redirección se pidió una vez…
    expect(hitsDe(RUTAS.redirigido)).toBeGreaterThan(0);
    // …y LA ASERCIÓN: el destino NO. Con `redirect: 'follow'` este número subiría
    // y la allowlist de host quedaría saltada.
    expect(hitsDe(RUTAS.feliz)).toBe(felizAntes);
  });

  test('al guardar, la URL queda enmascarada y no aparece entera en el DOM (T-02-74)', async ({
    paginaAdmin,
  }) => {
    const id = await abrirCalendario(paginaAdmin, 'guardar');
    const destino = url(RUTAS.feliz);

    await validar(paginaAdmin, destino);
    await expect(paginaAdmin.getByText('El calendario responde correctamente.')).toBeVisible();

    await paginaAdmin.getByRole('button', { name: 'Guardar y conectar calendario' }).click();
    await expect(paginaAdmin.getByText('Calendario conectado.')).toBeVisible();

    // CONTROL: la URL SÍ se guardó. Sin esto, el "no está en el DOM" de abajo
    // pasaría igual si el guardado no hubiera ocurrido nunca.
    const { data } = await servicio
      .from('property_secrets')
      .select('ical_url')
      .eq('property_id', id)
      .single();
    expect(data?.ical_url).toBe(destino);

    await paginaAdmin.reload();

    // ── ESTADO 4 AL REABRIR (UI-SPEC §10.4 regla 4) ──────────────────────────
    await expect(paginaAdmin.getByText('El calendario está conectado.')).toBeVisible();
    await expect(
      paginaAdmin.getByRole('button', { name: 'Validar de nuevo', exact: true }),
    ).toBeVisible();

    // ── LA ASERCIÓN: ni el secreto ni la URL entera están en el documento ─────
    const html = await paginaAdmin.content();
    expect(html).not.toContain(SECRETO);
    expect(html).not.toContain(destino);
    // Y lo que sí se ve es la forma enmascarada.
    await expect(paginaAdmin.getByText(/…\/calendar\/ical\/feliz\.ics\?s=•+/)).toBeVisible();

    // ── `Mostrar` la trae, y solo entonces ───────────────────────────────────
    await paginaAdmin.getByRole('button', { name: 'Mostrar' }).click();
    await expect(paginaAdmin.getByText(destino)).toBeVisible();

    await paginaAdmin.getByRole('button', { name: 'Ocultar' }).click();
    expect(await paginaAdmin.content()).not.toContain(SECRETO);

    // ── `Validar de nuevo` revalida el link guardado sin que baje al navegador ─
    const antes = hitsDe(RUTAS.feliz);
    await paginaAdmin.getByRole('button', { name: 'Validar de nuevo', exact: true }).click();
    await expect(paginaAdmin.getByText('El calendario responde correctamente.')).toBeVisible();
    expect(hitsDe(RUTAS.feliz)).toBe(antes + 1);
    expect(await paginaAdmin.content()).not.toContain(SECRETO);
  });
});
