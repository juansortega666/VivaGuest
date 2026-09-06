import type { Locator, Page } from '@playwright/test';

import {
  expect,
  fijarSaludDeSync,
  idPorEmail,
  limpiarAlertas,
  limpiarOperacion,
  sembrarAlertas,
  sembrarAseos,
  sembrarOperacion,
  test,
  type AlertaASembrar,
  type EscenarioDeOperacion,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * EL PANEL DE ALERTAS EN UN NAVEGADOR REAL (DASH-04, DASH-05, criterio 4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CUATRO DE LOS SIETE TIPOS NO LOS ESCRIBE NINGUNA MIGRACIÓN HOY, Y SE SIEMBRAN
 * A MANO. NO SON UN CASO QUE OCURRA SOLO.
 *
 * Medido con grep exhaustivo sobre `supabase/migrations/*.sql` (plan 04-13):
 *
 *   - `extension_sospechosa`, `no_puedo`      → llegan con la PWA (Fase 6)
 *   - `dano_reportado`, `faltantes_reportados`→ llegan con los reportes de campo
 *   - `hora_limite_vencida`                   → NINGUNA migración lo escribe; es
 *                                               obligatoriamente computado
 *
 * Los tres que sí ocurren solos hoy son `urgente` y `hora_limite_vencida`
 * (computados al leer, sobre `cleanings`) y `calendario_caido` (computado sobre
 * `max(last_success_at)`). Este archivo siembra los cuatro persistidos con la
 * clave de servicio para poder tener los SIETE a la vez, que es lo único que
 * permite comprobar la ausencia de jerarquía.
 *
 * Un verde aquí NO significa que los siete tipos se produzcan en operación
 * normal. Significa que si se producen, el panel los trata igual.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA PRUEBA DE ESCALA DE GRISES, Y QUÉ PARTE DE ELLA ES AUTOMATIZABLE ─────
 *
 * El contrato (UI-SPEC §16.2) pide una captura del panel en escala de grises en
 * la que los siete tipos SIGAN siendo distinguibles. Lo que una máquina puede
 * afirmar de eso es lo que este archivo afirma: que las siete etiquetas de texto
 * están presentes y son DISTINTAS entre sí, y que los siete iconos comparten
 * exactamente el mismo color computado y el mismo tamaño. Si alguien codificara
 * el tipo por color, dos tipos se volverían indistinguibles en grises Y la
 * aserción de color uniforme se pondría roja: es el mismo fallo visto desde el
 * lado medible.
 *
 * Lo que NO es automatizable —si al recorrer el panel el ojo va antes a uno de
 * los siete— queda como verificación humana, y la captura se guarda como
 * artefacto justamente para eso.
 */

/** Los siete tipos del contrato, con su etiqueta EXACTA del mapa de dominio. */
const SIETE_TIPOS = [
  'URGENTE',
  'EXTENSIÓN MAL CREADA',
  'NO PUEDO',
  'DAÑO',
  'FALTANTES',
  'CALENDARIO CAÍDO',
  'HORA LÍMITE VENCIDA',
] as const;

/** El panel, por su encabezado. Nunca por clase: las clases son presentación. */
function panel(p: Page): Locator {
  return p.getByRole('region', { name: /^Alertas/ });
}

/** Las filas del panel. Es una `<ul>`, así que son `listitem`. */
function filasDelPanel(p: Page): Locator {
  return panel(p).getByRole('listitem');
}

let servicio: Servicio;
let escenario: EscenarioDeOperacion;
let idAdmin = '';

test.beforeAll(async () => {
  cargarEnvLocal();
  servicio = clienteDeServicio();

  const { count, error } = await servicio
    .from('cleanings')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`No se pudo contar los aseos: ${error.message}`);
  if ((count ?? 0) !== 0) {
    throw new Error(
      `La tabla cleanings arranca con ${count} filas y este spec cuenta alertas computadas.\n` +
        'Corre `npm run db:reset` antes de la suite E2E.',
    );
  }

  escenario = await sembrarOperacion(servicio);
  idAdmin = await idPorEmail(servicio, 'e2e.admin@vivaguest.test');
});

test.afterAll(async () => {
  if (idAdmin) await limpiarAlertas(servicio, idAdmin);
  if (escenario) await limpiarOperacion(servicio, escenario);
});

test.beforeEach(async () => {
  await limpiarAlertas(servicio, idAdmin);
  const { error } = await servicio
    .from('cleanings')
    .delete()
    .in('property_id', [
      escenario.gestionada.id,
      escenario.segunda.id,
      escenario.tercera.id,
      escenario.externa.id,
    ]);
  if (error) throw new Error(`No se pudo limpiar entre tests: ${error.message}`);
});

/**
 * Deja los SIETE tipos en el panel a la vez y devuelve el orden cronológico
 * esperado, de más reciente a más antiguo.
 *
 * Los instantes se reparten a mano y no se dejan al azar: el orden del panel es
 * el criterio 4 y hay que poder afirmarlo contra una secuencia conocida.
 */
async function sembrarLosSieteTipos(): Promise<string[]> {
  const { gestionada, segunda, tercera, aseadoraA, fechas } = escenario;
  const ahora = Date.now();
  const min = 60_000;

  // ── Los tres COMPUTADOS ──────────────────────────────────────────────────
  // `urgente`: aseo vivo, gestionado, con `is_urgent` y fecha de hoy en adelante.
  // Su instante de orden es `created_at`, o sea AHORA.
  await sembrarAseos(servicio, [
    {
      propiedad: gestionada.id,
      fecha: fechas.manana,
      aseador: aseadoraA.id,
      confirmado: true,
      urgente: true,
    },
    // `hora_limite_vencida`: aseo de HOY con la hora límite ya pasada. Su
    // instante de orden es el vencimiento, o sea las 00:01 de hoy: el más
    // antiguo de los siete, y por eso va último en el orden esperado.
    {
      propiedad: segunda.id,
      fecha: fechas.hoy,
      aseador: aseadoraA.id,
      confirmado: true,
      horaLimite: '00:01',
    },
  ]);

  // `calendario_caido`: se computa sobre `max(last_success_at)` de los feeds
  // ACTIVOS. Se fija explícitamente en CAÍDA en vez de dejarlo al estado por
  // defecto de una base recién reseteada: un test que se apoya en "no hay feeds"
  // pasa por accidente y se cae el día que alguien conecte uno.
  await fijarSaludDeSync(servicio, tercera.id, 'caida', [gestionada.id, segunda.id]);

  // ── Los cuatro PERSISTIDOS, que hoy nadie produce ────────────────────────
  const persistidas: AlertaASembrar[] = [
    {
      tipo: 'no_puedo',
      titulo: 'La aseadora no puede hacer este aseo.',
      cuerpo: 'La aseadora no puede hacer este aseo. Hay que reasignarlo.',
      propiedad: gestionada.id,
      creadaEnMs: ahora - 2 * min,
    },
    {
      tipo: 'dano_reportado',
      titulo: 'Reportaron un daño.',
      cuerpo: 'Reportaron un daño en el apartamento.',
      propiedad: gestionada.id,
      creadaEnMs: ahora - 4 * min,
    },
    {
      tipo: 'faltantes_reportados',
      titulo: 'Faltan cosas en el apartamento.',
      cuerpo: 'Faltan cosas en el apartamento.',
      propiedad: segunda.id,
      creadaEnMs: ahora - 6 * min,
    },
    {
      tipo: 'extension_sospechosa',
      titulo: 'La reserva se extendió y el aseo puede estar mal creado.',
      cuerpo: 'La reserva se extendió y el aseo puede estar mal creado.',
      propiedad: tercera.id,
      creadaEnMs: ahora - 8 * min,
    },
  ];
  await sembrarAlertas(servicio, idAdmin, persistidas);

  // El orden cronológico descendente esperado. `urgente` va primero porque su
  // `created_at` es de hace segundos; `calendario_caido` cae entre medias
  // (última sincronización buena + 3 h de umbral, o sea hace una hora); y
  // `hora_limite_vencida` va último, con el vencimiento de las 00:01 de hoy.
  return [
    'URGENTE',
    'NO PUEDO',
    'DAÑO',
    'FALTANTES',
    'EXTENSIÓN MAL CREADA',
    'CALENDARIO CAÍDO',
    'HORA LÍMITE VENCIDA',
  ];
}

// ───────────────────────────────────────────────────────────────────────────
// 1. LA PRUEBA DE ESCALA DE GRISES
// ───────────────────────────────────────────────────────────────────────────

test('los siete tipos —cuatro de ellos sembrados a mano porque ninguna migración los produce— comparten color, tamaño y tratamiento', async ({
  paginaAdmin,
}) => {
  await sembrarLosSieteTipos();
  await paginaAdmin.goto('/operacion');

  // (a) LOS SIETE ESTÁN, Y SU ETIQUETA ES TEXTO. Si el tipo se distinguiera solo
  //     por el icono, ninguna de las siete encontraría nada.
  for (const etiqueta of SIETE_TIPOS) {
    await expect(panel(paginaAdmin).getByText(etiqueta, { exact: true })).toHaveCount(1);
  }

  // (b) LAS SIETE ETIQUETAS SON DISTINTAS ENTRE SÍ. Un mapa que devolviera la
  //     misma cadena para dos tipos pasaría (a) y se caería aquí.
  expect(new Set(SIETE_TIPOS).size).toBe(SIETE_TIPOS.length);

  /*
   * (c) LA ASERCIÓN CENTRAL: los siete iconos tienen EL MISMO color computado y
   *     EL MISMO tamaño. Es la forma medible de "en escala de grises los siete
   *     siguen siendo distinguibles": si el color codificara el tipo, dos de
   *     ellos se volverían idénticos en grises, y esta comprobación se pone roja
   *     ANTES, sin necesidad de mirar la captura.
   *
   *     Se mide el SVG de cada fila, que es el primer hijo del contenedor.
   */
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(7);

  const iconos = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => {
      // El PRIMER `svg` de la fila es el icono del tipo. El segundo, cuando
      // existe, es el `Check` del botón de atender, que no participa de esta
      // comparación: no rotula el tipo.
      const svg = el.querySelector('svg');
      if (svg === null) return 'sin-icono';
      const cs = getComputedStyle(svg);
      return `${cs.color}|${cs.width}|${cs.height}|${cs.fontWeight}`;
    }),
  );

  expect(iconos.length).toBe(7);
  expect(new Set(iconos).size).toBe(1);

  /*
   * (d) Y NINGUNA FILA SE DESTACA POR TAMAÑO: las siete miden lo mismo de alto.
   *     `--spacing-fila-alerta` son 64px y no es una comodidad de layout: que la
   *     fila mida siempre lo mismo es parte del criterio 4.
   */
  // Se mide el BLOQUE INTERIOR y no el `<li>`: la fila lleva `border-b` salvo la
  // última (`last:border-b-0`), así que el `<li>` de abajo mide un píxel menos
  // que los otros seis por una separación, no por una jerarquía. Lo que el
  // criterio 4 exige que sea idéntico es el alto de la fila, `--spacing-fila-alerta`.
  const altos = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => el.firstElementChild?.getBoundingClientRect().height ?? -1),
  );
  expect(altos).toHaveLength(7);
  expect(new Set(altos)).toEqual(new Set([64]));

  /*
   * (e) LA CAPTURA EN ESCALA DE GRISES, que queda como artefacto para la
   *     verificación humana de la Task 3. El filtro se aplica al documento
   *     entero y NO al elemento: `filter` sobre el nodo crea un contexto de
   *     apilamiento nuevo y puede reencuadrar lo que se fotografía.
   */
  await paginaAdmin.addStyleTag({ content: 'html { filter: grayscale(1); }' });
  await panel(paginaAdmin).screenshot({
    path: 'test-results/panel-alertas-escala-de-grises.png',
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. EL CONTADOR DICE EL TOTAL, NO LO RENDERIZADO
// ───────────────────────────────────────────────────────────────────────────

test('con treinta alertas la cabecera dice 30 aunque en pantalla quepan siete', async ({
  paginaAdmin,
}) => {
  const ahora = Date.now();

  // Treinta persistidas y CERO computadas: la salud del sync se fija en SANA y
  // no se siembra ningún aseo, así que el 30 es exactamente lo sembrado. Sin
  // fijar la salud, la base recién reseteada no tiene feeds, `calendario_caido`
  // se dispara sola y el contador diría 31.
  await fijarSaludDeSync(servicio, escenario.gestionada.id, 'sana', [
    escenario.segunda.id,
    escenario.tercera.id,
  ]);

  const treinta: AlertaASembrar[] = Array.from({ length: 30 }, (_, i) => ({
    tipo: (['no_puedo', 'dano_reportado', 'faltantes_reportados', 'extension_sospechosa'] as const)[
      i % 4
    ],
    titulo: `Alerta sembrada ${i + 1}`,
    cuerpo: `Cuerpo de la alerta sembrada ${i + 1}`,
    propiedad: escenario.gestionada.id,
    creadaEnMs: ahora - i * 60_000,
  }));
  await sembrarAlertas(servicio, idAdmin, treinta);

  await paginaAdmin.goto('/operacion');

  // (a) EL CONTADOR DICE 30. Es la única forma de que el scroll interno no sea un
  //     escondite: puesto sobre las filas renderizadas diría 7 u 8.
  await expect(panel(paginaAdmin).getByText('30', { exact: true })).toBeVisible();

  // (b) Y LAS TREINTA ESTÁN EN EL DOM. No se pagina, no se virtualiza y no hay
  //     "ver más": de treinta en adelante, igual.
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(30);

  // (c) CONTROL DE QUE EL PANEL DE VERDAD RECORTA: con el carril a altura cerrada
  //     no caben las treinta en pantalla. Sin esta mitad, (a) pasaría también en
  //     una pantalla donde se vieran las treinta y el contador no probaría nada.
  const enPantalla = await filasDelPanel(paginaAdmin).evaluateAll((elementos) => {
    const alto = window.innerHeight;
    return elementos.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= alto;
    }).length;
  });
  expect(enPantalla).toBeLessThan(30);
  expect(enPantalla).toBeGreaterThan(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 3. EL ORDEN ES CRONOLÓGICO, NO POR TIPO
// ───────────────────────────────────────────────────────────────────────────

test('las primeras cinco filas salen en orden cronológico y no agrupadas por tipo', async ({
  paginaAdmin,
}) => {
  const esperado = await sembrarLosSieteTipos();
  await paginaAdmin.goto('/operacion');

  await expect(filasDelPanel(paginaAdmin)).toHaveCount(esperado.length);

  const etiquetas = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => el.querySelector('span')?.textContent?.trim() ?? ''),
  );

  // La secuencia COMPLETA, no solo las cinco primeras: con siete tipos y siete
  // filas, afirmar las siete cuesta lo mismo y ordenar por tipo rompe la lista
  // entera, no solo su cabeza.
  expect(etiquetas).toEqual(esperado);
});

// ───────────────────────────────────────────────────────────────────────────
// 4. ATENDER SACA LA ALERTA, Y `Ver atendidas` LA DEVUELVE — SIN TOCAR EL TEXTO
// ───────────────────────────────────────────────────────────────────────────

test('marcar una alerta como atendida la saca del panel y el toggle la muestra con Devolver al panel', async ({
  paginaAdmin,
}) => {
  await fijarSaludDeSync(servicio, escenario.gestionada.id, 'sana', [
    escenario.segunda.id,
    escenario.tercera.id,
  ]);

  const TITULO = 'La aseadora no puede hacer este aseo.';
  await sembrarAlertas(servicio, idAdmin, [
    {
      tipo: 'no_puedo',
      titulo: TITULO,
      cuerpo: 'La aseadora no puede hacer este aseo. Hay que reasignarlo.',
      propiedad: escenario.gestionada.id,
      creadaEnMs: Date.now(),
    },
  ]);

  await paginaAdmin.goto('/operacion');
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(1);

  await paginaAdmin.getByRole('button', { name: `Marcar como atendida: ${TITULO}` }).click();

  // Sale del panel, y el panel NO desaparece: se queda con su estado vacío, que
  // es lo que mantiene la geometría del carril estable (§11.5).
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(0);
  await expect(panel(paginaAdmin).getByText('Sin alertas.')).toBeVisible();

  // El toggle vive en la URL porque cambia QUÉ FILAS lee el servidor.
  await paginaAdmin.getByRole('button', { name: 'Filtrar alertas por tipo' }).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Ver atendidas', exact: true }).click();

  const atendida = paginaAdmin.getByRole('listitem').filter({ hasText: TITULO });
  await expect(atendida).toHaveCount(1);
  await expect(
    paginaAdmin.getByRole('button', { name: `Devolver al panel: ${TITULO}` }),
  ).toBeVisible();

  // ── LA MITAD DE UI DE LA DISCIPLINA DE ESCRIBIR UNA SOLA COLUMNA ─────────
  // `marcarAlertaAtendida` escribe ÚNICAMENTE `read_at`. Que el título siga
  // siendo el mismo carácter por carácter es lo que se ve de eso desde la
  // pantalla; que no haya tocado `body`, `url` ni `payload` lo afirma la suite
  // de integración contra Postgres.
  await expect(atendida.getByText(TITULO, { exact: true })).toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────
// 5. LAS COMPUTADAS NO TIENEN BOTÓN, PERO MIDEN LO MISMO
// ───────────────────────────────────────────────────────────────────────────

test('las alertas computadas no ofrecen atender y aun así su fila mide lo mismo que las demás', async ({
  paginaAdmin,
}) => {
  await sembrarLosSieteTipos();
  await paginaAdmin.goto('/operacion');

  await expect(filasDelPanel(paginaAdmin)).toHaveCount(7);

  // Cuatro persistidas → cuatro botones de atender. Tres computadas (urgente,
  // hora límite vencida y calendario caído) → ninguno: sería un botón que miente,
  // porque la alerta reaparecería en la siguiente lectura.
  await expect(panel(paginaAdmin).getByRole('button', { name: /^Marcar como atendida/ })).toHaveCount(
    4,
  );

  // Y la diferencia de affordance NO se ve: la ranura del botón está reservada
  // en las siete, así que las siete miden lo mismo. Si el texto de una computada
  // se estirara sobre la ranura vacía, el punto de truncado bailaría de fila en
  // fila y ESO sí sería una diferencia visual entre tipos.
  // Se mide el BLOQUE INTERIOR y no el `<li>`: la fila lleva `border-b` salvo la
  // última (`last:border-b-0`), así que el `<li>` de abajo mide un píxel menos
  // que los otros seis por una separación, no por una jerarquía. Lo que el
  // criterio 4 exige que sea idéntico es el alto de la fila, `--spacing-fila-alerta`.
  const altos = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => el.firstElementChild?.getBoundingClientRect().height ?? -1),
  );
  expect(altos).toHaveLength(7);
  expect(new Set(altos)).toEqual(new Set([64]));
});

// ───────────────────────────────────────────────────────────────────────────
// 6. EL FILTRO
// ───────────────────────────────────────────────────────────────────────────

test('el filtro arranca en Todas, lista los tipos en orden fijo con su conteo, y el vacío ofrece Quitar filtro', async ({
  paginaAdmin,
}) => {
  await sembrarLosSieteTipos();
  await paginaAdmin.goto('/operacion');

  await paginaAdmin.getByRole('button', { name: 'Filtrar alertas por tipo' }).click();

  // (a) Arranca en `Todas`, con el total. Un panel que nace filtrado es un panel
  //     que esconde por defecto (D-07).
  await expect(paginaAdmin.getByRole('menuitem', { name: 'Todas (7)', exact: true })).toBeVisible();

  // (b) El orden de la lista es el FIJO de `ORDEN_DE_TIPOS`, con los ceros
  //     incluidos, y NUNCA por conteo: una lista que se reordena sola según los
  //     conteos cambia de sitio debajo del cursor cada vez que entra una alerta.
  const items = await paginaAdmin
    .getByRole('menuitem')
    .evaluateAll((elementos) => elementos.map((el) => el.textContent?.trim() ?? ''));

  expect(items.slice(1, 13)).toEqual([
    'URGENTE (1)',
    'EXTENSIÓN MAL CREADA (1)',
    'NO PUEDO (1)',
    'DAÑO (1)',
    'FALTANTES (1)',
    'CALENDARIO CAÍDO (1)',
    'HORA LÍMITE VENCIDA (1)',
    'ASEO CANCELADO (0)',
    'ASIGNACIÓN (0)',
    'ASEO TERMINADO (0)',
    'GASTO (0)',
    'RETENCIÓN (0)',
  ]);

  // (c) Filtrar por un tipo con cero filas da el estado vacío del filtro, que NO
  //     es el estado vacío del panel: dice cuántas hay detrás y ofrece la salida.
  await paginaAdmin.getByRole('menuitem', { name: 'ASEO CANCELADO (0)', exact: true }).click();

  await expect(panel(paginaAdmin).getByText('Ninguna alerta de este tipo.')).toBeVisible();
  await expect(panel(paginaAdmin).getByText('Quita el filtro para ver las 7 que hay.')).toBeVisible();

  await paginaAdmin.getByRole('button', { name: 'Quitar filtro' }).click();
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(7);
});
