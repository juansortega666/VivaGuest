import type { Locator, Page } from '@playwright/test';

import {
  expect,
  idPorEmail,
  limpiarAlertas,
  limpiarOperacion,
  sembrarAlertas,
  sembrarOperacion,
  test,
  type EscenarioDeOperacion,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * RET-07 EN UN NAVEGADOR REAL: EL MEDIDOR Y LA ALERTA DE ALMACENAMIENTO.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * LOS DOS CASOS SON LAS DOS MITADES DEL REQUISITO, Y NINGUNO DEPENDE DEL OTRO.
 *
 *   1. *ve el consumo*          → el medidor de la cabecera, con el cupo por
 *                                 defecto y sin alerta en el panel.
 *   2. *recibe alerta al 70%*   → se suben dos objetos de 1 MB y se baja el cupo
 *                                 a 2 MB con un `update` sobre `app_settings`.
 *
 * EL CASO 2 EJERCE, DE PASO, EL CAMINO QUE EL DUEÑO VA A USAR EL DÍA QUE PAGUE
 * PRO: el cupo se mueve con un `update` de una fila, sin migración y sin
 * despliegue. Si eso no funcionara, el quick entero no cumpliría su razón de
 * ser.
 *
 * ── NO HAY CASO DE ASEADORA AQUÍ, Y ES DELIBERADO ──────────────────────────
 *
 * La prohibición dura —«ninguna sesión de aseadora lee el consumo de Storage»—
 * se afirma en pgTAP IMPERSONANDO (`12_almacenamiento.test.sql`, aserción 5),
 * que es donde es falsable. Un E2E de aseadora contra `/operacion` mediría el
 * guard de ruta, que ya tiene su propio spec en `ruteo.spec.ts`, y pasaría por
 * construcción sin probar nada de este quick.
 *
 * ── EL TEARDOWN NO ES OPCIONAL ────────────────────────────────────────────
 *
 * Un spec que deja `storage_quota_mb` en 2 pone en rojo a todos los que corran
 * después: cualquier pantalla del admin traería una alerta de almacenamiento que
 * nadie sembró. Se devuelve a 1024 y se borran los dos objetos.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** El cupo del free tier, en MB. Es el valor que siembra `010_app_settings.sql`. */
const CUPO_POR_DEFECTO = 1024;

/** Carpeta propia dentro del bucket, para no pisar evidencia de otros specs. */
const CARPETA = 'e2e-almacenamiento';
const OBJETOS = [`${CARPETA}/uno.webp`, `${CARPETA}/dos.webp`];

/**
 * El bucket `evidencia` solo acepta `image/jpeg`, `image/png` e `image/webp`
 * (migración 10, `allowed_mime_types`). Un `application/octet-stream` lo rechaza
 * con «mime type ... is not supported», así que el relleno viaja declarado como
 * webp. Lo que se mide es el TAMAÑO, y el contenido del archivo no participa.
 */
const TIPO_ACEPTADO = 'image/webp';

/** El medidor de la cabecera, por su nombre accesible. Nunca por clase. */
function medidor(p: Page): Locator {
  return p.getByRole('region', { name: 'Consumo de almacenamiento' });
}

/**
 * El panel de alertas, por su encabezado. Mismo localizador que
 * `operacion-alertas.spec.ts`.
 *
 * ── EL PANEL SE MUDO A LA CAMPANA DE LA BARRA SUPERIOR (plan 10-05) ───────
 *
 * Vivia en un carril de `/operacion` y ahora vive en el shell, dentro de un
 * popover que **se monta al abrir y no antes**. Asi que cada caso de este archivo
 * que mire el panel tiene que ABRIR la campana primero, con `abrirCampana()`.
 *
 * Lo que este archivo mide no cambio ni una coma: que `almacenamiento_lleno`
 * produce UNA fila, que el contador sube en uno, y que su icono no jerarquiza.
 */
function panel(p: Page): Locator {
  return p.getByRole('region', { name: /^Alertas/ });
}

/** Las filas del panel. Es una `<ul>`, así que son `listitem`. */
function filasDelPanel(p: Page): Locator {
  return panel(p).getByRole('listitem');
}

/** Abre la campana de la barra superior y espera a que el panel este montado. */
async function abrirCampana(p: Page): Promise<void> {
  await p.locator('[data-slot="campana-alertas"]').click();
  await expect(panel(p)).toBeVisible();
}

/** El porcentaje que el medidor está diciendo, leído del propio texto. */
async function porcentajeDelMedidor(p: Page): Promise<number> {
  const texto = (await medidor(p).textContent()) ?? '';
  const encontrado = /\((\d+)%\)/.exec(texto);
  if (encontrado === null) {
    throw new Error(`El medidor no dice ningún porcentaje. Decía: ${texto}`);
  }
  return Number(encontrado[1]);
}

async function fijarCupo(servicio: Servicio, mb: number): Promise<void> {
  const { error } = await servicio
    .from('app_settings')
    .update({ value: mb })
    .eq('key', 'storage_quota_mb');
  if (error) throw new Error(`No se pudo fijar el cupo: ${error.message}`);
}

let servicio: Servicio;
let escenario: EscenarioDeOperacion;
let idAdmin = '';

test.beforeAll(async () => {
  cargarEnvLocal();
  servicio = clienteDeServicio();

  escenario = await sembrarOperacion(servicio);
  idAdmin = await idPorEmail(servicio, 'e2e.admin@vivaguest.test');
});

test.afterAll(async () => {
  // El orden importa poco, pero las tres tienen que correr aunque una falle:
  // dejar el cupo en 2 MB contaminaría toda la suite.
  await fijarCupo(servicio, CUPO_POR_DEFECTO);
  await servicio.storage.from('evidencia').remove(OBJETOS);
  if (idAdmin) await limpiarAlertas(servicio, idAdmin);
  if (escenario) await limpiarOperacion(servicio, escenario);
});

test.beforeEach(async () => {
  // Cada caso arranca del mismo sitio: cupo por defecto y sin los objetos del
  // otro caso. Es lo que hace que el orden de ejecución no importe.
  await fijarCupo(servicio, CUPO_POR_DEFECTO);
  await servicio.storage.from('evidencia').remove(OBJETOS);
  await limpiarAlertas(servicio, idAdmin);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. LA MITAD DE «VE»: el número está, y no grita
// ───────────────────────────────────────────────────────────────────────────

test('el admin ve el consumo de Storage en la cabecera, y por debajo del umbral no hay alerta', async ({
  paginaAdmin,
}) => {
  await paginaAdmin.goto('/operacion');

  // (a) EL MEDIDOR ESTÁ, Y DICE LAS DOS CIFRAS Y EL PORCENTAJE. Si dijera solo
  //     un porcentaje, el admin no sabría contra qué cupo está midiendo.
  await expect(medidor(paginaAdmin)).toBeVisible();
  await expect(medidor(paginaAdmin)).toContainText('Almacenamiento ·');
  await expect(medidor(paginaAdmin)).toContainText('de 1 GB');

  // (b) Y NO DICE "no se pudo medir": eso sería un fallo de la lectura, no un
  //     Storage vacío, y son cosas distintas.
  await expect(medidor(paginaAdmin)).not.toContainText('no se pudo medir');

  const pct = await porcentajeDelMedidor(paginaAdmin);
  expect(pct).toBeLessThan(70);

  // (c) SIN FILA EN EL PANEL. Un número de contexto no es una llamada a la
  //     acción: una alerta visible al 12% entrena al admin a saltársela con la
  //     vista, y el día que diga 85% no la va a ver.
  //
  //     Hay que ABRIR la campana para mirar: desde el plan 10-05 el panel vive en un
  //     popover que se monta al abrir. Sin abrirlo, esta aserción negativa pasaría
  //     trivialmente y no probaría nada.
  await abrirCampana(paginaAdmin);
  await expect(panel(paginaAdmin).getByText('ALMACENAMIENTO', { exact: true })).toHaveCount(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. LA MITAD DE «RECIBE ALERTA»: el cupo se baja con un update y la alerta sale
// ───────────────────────────────────────────────────────────────────────────

test('al cruzar el umbral aparece UNA fila ALMACENAMIENTO, el contador sube en uno y su icono no jerarquiza', async ({
  paginaAdmin,
}) => {
  // Una alerta persistida cualquiera, para que el panel tenga OTRA fila contra
  // la que comparar el icono. Sin ella, la comprobación de homogeneidad no
  // tendría con qué compararse.
  await sembrarAlertas(servicio, idAdmin, [
    {
      tipo: 'dano_reportado',
      titulo: 'Reportaron un daño.',
      cuerpo: 'Reportaron un daño en el apartamento.',
      propiedad: escenario.gestionada.id,
      creadaEnMs: Date.now() - 60_000,
    },
  ]);

  // ── La línea base, con el cupo todavía por defecto ────────────────────────
  await paginaAdmin.goto('/operacion');
  await abrirCampana(paginaAdmin);
  const filasAntes = await filasDelPanel(paginaAdmin).count();
  expect(filasAntes).toBeGreaterThan(0);
  await expect(panel(paginaAdmin).getByText('ALMACENAMIENTO', { exact: true })).toHaveCount(0);

  // ── Dos objetos de 1 MiB y el cupo a 2 MB ────────────────────────────────
  for (const ruta of OBJETOS) {
    const { error } = await servicio.storage
      .from('evidencia')
      .upload(ruta, Buffer.alloc(1024 * 1024), { contentType: TIPO_ACEPTADO });
    if (error) throw new Error(`No se pudo subir ${ruta}: ${error.message}`);
  }

  // ESTE `update` ES LA DECISIÓN D-1 EJERCIDA: el cupo se mueve sin migración,
  // sin recompilar y sin desplegar. Es el camino del día que se pague Pro, a la
  // inversa.
  await fijarCupo(servicio, 2);

  await paginaAdmin.goto('/operacion');

  // (a) EL MEDIDOR CAMBIA DE COLOR Y DICE UN PORCENTAJE DE ALERTA. Se mide ANTES de
  //     abrir la campana, que es donde el medidor vive: en la cabecera de la pagina,
  //     no en el panel. El popover abierto lo taparia.
  const pct = await porcentajeDelMedidor(paginaAdmin);
  expect(pct).toBeGreaterThanOrEqual(70);
  await expect(medidor(paginaAdmin)).toContainText('de 2 MB');

  await abrirCampana(paginaAdmin);

  // (b) UNA FILA, Y SOLO UNA. La alerta es del sistema entero, no de ningún
  //     apartamento, así que no puede haber dos.
  await expect(panel(paginaAdmin).getByText('ALMACENAMIENTO', { exact: true })).toHaveCount(1);

  // (c) EL CONTADOR SUBIÓ EXACTAMENTE EN UNO.
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(filasAntes + 1);
  await expect(
    panel(paginaAdmin).getByText(String(filasAntes + 1), { exact: true }),
  ).toBeVisible();

  /*
   * (d) EL ICONO DE LA FILA NUEVA TIENE EL MISMO COLOR COMPUTADO Y EL MISMO
   *     TAMAÑO QUE LOS DEMÁS. Es la comprobación de que la entrada nueva NO
   *     jerarquiza, y es el mismo aserto que `operacion-alertas.spec.ts` hace
   *     para los siete tipos. Si alguien le pusiera color propio a
   *     `almacenamiento_lleno` "porque es importante", esto se pone rojo.
   */
  const iconos = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => {
      const svg = el.querySelector('svg');
      if (svg === null) return 'sin-icono';
      const cs = getComputedStyle(svg);
      return `${cs.color}|${cs.width}|${cs.height}`;
    }),
  );
  expect(iconos.length).toBe(filasAntes + 1);
  expect(new Set(iconos).size).toBe(1);

  /*
   * (e) Y LAS DOS SUPERFICIES DICEN LO MISMO: el medidor de la cabecera queda
   *     EXACTAMENTE del mismo color que el icono de la fila del panel. Salen de
   *     la misma lectura, así que no pueden contradecirse dentro de un render, y
   *     esta línea lo comprueba en píxeles y no de palabra.
   */
  const colorDelMedidor = await medidor(paginaAdmin).evaluate((el) => getComputedStyle(el).color);
  expect(iconos[0].startsWith(`${colorDelMedidor}|`)).toBe(true);
});
