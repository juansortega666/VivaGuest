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
  correrSync,
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
 * TODA aserción de este archivo lleva mensaje propio, y la bitácora de señuelos
 * del SUMMARY anota el mensaje literal que salió en rojo, no «el caso falló».
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
    { desde: 1, hasta: 2, uid: `rec-reserva-${unidad.sufijo}@airbnb.com`, codigo: 'HMYXB825YD' },
    // Y un bloqueo del propietario, que NO debe generar nada. Va en el mismo
    // cuerpo a propósito: si estuviera en otro caso, la aserción de «un solo
    // aseo» pasaría por no haber visto nunca un bloqueo.
    { desde: 20, hasta: 25, uid: `rec-bloqueo-${unidad.sufijo}@airbnb.com` },
  ]);

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
