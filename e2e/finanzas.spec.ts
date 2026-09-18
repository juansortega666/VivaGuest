import type { Locator, Page } from '@playwright/test';

import { formatFechaCortaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import {
  CIFRAS_FINANCIERAS,
  expect,
  limpiarFinanzas,
  pulsarHastaNavegar,
  sembrarFinanzas,
  test,
  type EscenarioFinanciero,
  type PeriodoDePago,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTE ARCHIVO NACE EN ROJO, Y ESO ES EL PLAN.
 *
 * Las cuatro pantallas que ejerce —`/finanzas`, `/finanzas/aseos`, la ficha de
 * una aseadora y `/finanzas/pagos`— NO EXISTEN cuando este archivo se escribe.
 * Las construyen los planes 07-10, 07-11 y 07-12. Hasta entonces, todo lo de
 * aquí falla con 404 y es correcto que falle.
 *
 * **A partir del 07-12, un rojo en este archivo es una regresión.**
 *
 * El copy que se afirma NO es una sugerencia: sale literal de
 * `.planning/phases/07-financiero/07-UI-SPEC.md` §15.2, que el dueño aprobó. Si
 * una pantalla dice otra cosa, la pantalla está mal, no la aserción.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LO QUE LA FASE 8 LE CAMBIO A ESTE ARCHIVO ────────────────────────────────
 *
 * **La ficha de aseadora ya no es una ruta.** `/finanzas/aseadoras/[id]` se
 * borró y su contenido vive ahora en un panel sobre `/finanzas`, abierto con
 * `?aseadora={uuid}` (08-UI-SPEC §0.1 conflicto B y §9). Las otras tres
 * pantallas siguen siendo páginas y no cambiaron.
 *
 * **Y con eso llegó una trampa que vale para todo el que edite este archivo:**
 * el contenido de un panel se portalea a `document.body`, así que **toda
 * aserción acotada por `main`, por el `<table>` de la página o por cualquier
 * contenedor de layout deja de ver el panel y pasa en verde sin comprobar
 * nada**. Medido con un señuelo dentro del panel: con `locator('main')` las dos
 * aserciones de no rastreo pasaron en VERDE con la palabra prohibida puesta.
 * Lo que se lee del panel se acota con `getByRole('dialog')`, sin excepción.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE, TENIENDO pgTAP E INTEGRACIÓN SOBRE LO MISMO ──
 *
 * La lección del 2026-09-12, que es por lo que este plan se escribió: 112 tests
 * E2E en verde convivían con dos fallos que impedían que llegara un solo aviso al
 * teléfono de nadie. Los dos aparecieron probando en un iPhone real. Una función
 * que calcula el margen perfectamente y una pantalla que nunca la llama dan una
 * suite verde y un producto roto.
 *
 * Y hay una aserción que no puede vivir en ninguna otra capa: **que la pantalla
 * de operación no cambió.** D7-1 es una decisión sobre dónde NO va el dinero, y
 * una decisión de ese tipo solo se verifica mirando la pantalla que tenía que
 * quedarse quieta. Ninguna migración ni ningún test de dominio la puede mirar.
 *
 * ── CÓMO SE LOCALIZA AQUÍ, Y NO ES ESTILO ───────────────────────────────────
 *
 * **Ni un solo localizador por clase de CSS.** El contrato de diseño fija el
 * COPY y los roles accesibles (§13.1, §13.2); no fija los nombres de clase, que
 * son detalle de implementación de Tailwind y cambian sin que cambie el producto.
 * Un test anclado a `.text-display` se cae el día que alguien renombra un token y
 * el fallo no significa nada.
 *
 * ── LA CONDICIÓN DE ENTORNO QUE INVALIDA LA CORRIDA ENTERA ──────────────────
 *
 * `PLAYWRIGHT_PORT` en un puerto libre. `reuseExistingServer` está en `true`
 * fuera de CI: si en el 3000 hay un `next start` de otro checkout, Playwright lo
 * reutiliza sin avisar y la suite mide otra aplicación. Con las rutas de esta
 * fase el síntoma es venenoso: **una aserción negativa —"el aseador no ve la
 * tarifa"— pasa trivialmente contra una pantalla que ni existe.** Verde falso
 * sobre la garantía más importante de la fase.
 *
 *     PLAYWRIGHT_PORT=3200 npm run test:e2e e2e/finanzas.spec.ts
 *
 * Y la base recién reseteada: `npm run db:reset` antes.
 */

// ───────────────────────────────────────────────────────────────────────────
// AYUDAS DE LECTURA
// ───────────────────────────────────────────────────────────────────────────

/**
 * El entero de pesos que hay dentro de un texto formateado: `"$ 152.909"` da
 * `152909`.
 *
 * Se quita TODO lo que no sea dígito, incluido el punto de miles y el espacio
 * duro que mete `Intl`. Comparar la cadena formateada sería más estricto pero
 * también más frágil: el espacio entre `$` y el número es U+00A0, invisible en el
 * diff, y una aserción que falla por un carácter que nadie ve cuesta una hora.
 */
function pesos(texto: string): number {
  const signo = texto.trim().startsWith('-') ? -1 : 1;
  const digitos = texto.replace(/[^\d]/g, '');
  if (digitos === '') throw new Error(`No hay ninguna cifra en «${texto}»`);
  return signo * Number(digitos);
}

/**
 * El valor de un KPI, a partir de su etiqueta.
 *
 * ── POR QUÉ SE SUBE POR EL ÁRBOL EN VEZ DE PEDIR UN ROL ─────────────────────
 * `07-UI-SPEC.md` §6.3 fija la ETIQUETA y el VALOR de cada card, y §13.1 fija la
 * accesibilidad de las TABLAS, pero no le asigna ningún rol accesible a la card
 * del KPI. Exigir uno aquí sería inventarme contrato: la spec quedaría pidiendo
 * algo que el plan 07-10 no tiene por qué haber leído, y el rojo resultante no
 * diría nada sobre el producto.
 *
 * Así que se hace lo que hace una persona mirando la pantalla: se busca la
 * etiqueta y se lee la cifra que está con ella. Se sube por el árbol hasta el
 * primer antecesor que contenga una cifra de pesos y se devuelve esa cifra.
 * Funciona con cualquier marcado razonable y no depende de una sola clase.
 */
async function valorKPI(p: Page, etiqueta: string): Promise<number> {
  const texto = await p
    .getByText(etiqueta, { exact: true })
    .evaluate((el) => {
      let nodo: Element | null = el;
      for (let salto = 0; nodo && salto < 6; salto += 1) {
        const contenido = (nodo.textContent ?? '').replace(/ /g, ' ');
        const cifra = /-?\$\s?[\d.]+/.exec(contenido);
        if (cifra) return cifra[0];
        nodo = nodo.parentElement;
      }
      return '';
    });

  if (texto === '') {
    throw new Error(`No se encontró ninguna cifra junto al KPI «${etiqueta}»`);
  }
  return pesos(texto);
}

/** Los encabezados de columna de una tabla, en orden y en texto plano. */
async function encabezados(tabla: Locator): Promise<string[]> {
  const crudos = await tabla.getByRole('columnheader').allTextContents();
  return crudos.map((t) => t.trim()).filter((t) => t !== '');
}

/**
 * Afirma que un rótulo de periodo lleva SUS DOS FECHAS REALES y no solo el mes.
 *
 * Es D7-5 y §11.3. Un recibo que dice "enero" y cubre del 1 al 30 sin decirlo es
 * una discusión esperando a ocurrir: el periodo va de cierre a cierre, no del 1
 * al 31, y la persona que cobra tiene derecho a saber qué días le pagaron.
 *
 * NO se reconstruye la cadena exacta: el formateador
 * (`etiquetaDePeriodo`, plan 07-06) todavía no existe y duplicarlo aquí sería
 * escribir por segunda vez la lógica que la aserción dice verificar. Se afirma lo
 * que el contrato promete: la preposición, los dos números de día y el mes.
 */
function rotuloConLasDosFechas(rotulo: string, periodo: PeriodoDePago): void {
  const diaDesde = Number(periodo.desde.slice(8));
  const diaHasta = Number(periodo.hasta.slice(8));
  const mesHasta = formatFechaLargaBog(periodo.hasta).split(' de ')[1];

  expect(rotulo, 'el rótulo de un periodo de pago empieza por «Del»').toMatch(/\bDel\b/i);
  expect(rotulo, `el rótulo tiene el día de inicio (${diaDesde})`).toMatch(
    new RegExp(`(^|\\D)${diaDesde}(\\D|$)`),
  );
  expect(rotulo, `el rótulo tiene el día de cierre (${diaHasta})`).toMatch(
    new RegExp(`(^|\\D)${diaHasta}(\\D|$)`),
  );
  expect(rotulo, `el rótulo nombra el mes del cierre (${mesHasta})`).toContain(mesHasta);
}

/** La línea de las dos fechas de un aseo dentro de un desglose (D7-8, §15.2). */
function lineaDeLasDosFechas(programado: string, hecho: string): string {
  return `Programado ${formatFechaCortaBog(programado)} · Hecho ${formatFechaCortaBog(hecho)}`;
}

// ───────────────────────────────────────────────────────────────────────────

let servicio: Servicio;

test.describe('Finanzas, con dos periodos cerrados y uno en curso', () => {
  let esc: EscenarioFinanciero;

  /** El día con EXACTAMENTE un aseo gestionado. Es el ancla de las cuentas exactas. */
  let diaLimpio: string;

  test.beforeAll(async () => {
    cargarEnvLocal();
    servicio = clienteDeServicio();
    esc = await sembrarFinanzas(servicio);
    diaLimpio = esc.aseoAlineado.fecha;
  });

  test.afterAll(async () => {
    if (esc) await limpiarFinanzas(servicio, esc);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 1. D7-1, LAS DOS MITADES
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * D7-1 dice DÓNDE VA el dinero y, con la misma fuerza, dónde NO va. Las dos
   * mitades van en el mismo caso a propósito: separar tiene dos lados, y un test
   * que solo mire el link nuevo pasaría igual el día que alguien "aproveche" y
   * meta una columna de margen en la tabla del día.
   */
  test('la barra superior gana un cuarto link, va último, y la pantalla de operación NO cambió', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/operacion');

    // ── MITAD A: el link nuevo, y va ÚLTIMO (§5.1) ─────────────────────────
    // El orden actual es de frecuencia de uso y la operación del día manda: el
    // dinero se consulta, no se coordina.
    const barra = paginaAdmin.getByRole('navigation').first();
    const etiquetas = await barra.getByRole('link').allTextContents();
    const secciones = etiquetas.map((t) => t.trim()).filter((t) => t !== 'VivaGuest');

    expect(secciones).toEqual(['Operación', 'Apartamentos', 'Aseadores', 'Finanzas']);

    // ── MITAD B: la tabla del día NO tiene ni una columna de dinero ────────
    // Se mira TODA la tabla, no solo sus encabezados: una celda con una cifra de
    // pesos dentro de una columna que se llame de otra forma rompe D7-1 igual.
    //
    // ── EL BLOQUE DEL DÍA HAY QUE ABRIRLO, Y MEDIRLO CUESTA UNA HORA ───────
    // `BloqueDia` es colapsable. Cerrado, su contenido está en el DOM pero
    // `hidden`, así que queda FUERA del árbol de accesibilidad y
    // `getByRole('table')` devuelve CERO. El síntoma es una lista de encabezados
    // vacía, que se lee como "la tabla perdió sus columnas" y no como "la tabla
    // está cerrada". Mismo patrón que `abrirBloque()` de `operacion.spec.ts`.
    const cabeceraDeHoy = paginaAdmin.getByRole('button', { name: /^Hoy/ });
    if ((await cabeceraDeHoy.getAttribute('aria-expanded')) === 'false') {
      await cabeceraDeHoy.click();
    }
    await expect(cabeceraDeHoy).toHaveAttribute('aria-expanded', 'true');

    const tablaDelDia = paginaAdmin.getByRole('table').first();
    // `count()` no espera. Sin este `toBeVisible()`, una lectura antes de la
    // hidratación devuelve cero filas y el fallo apunta al sitio equivocado.
    await expect(tablaDelDia).toBeVisible();

    // `Acciones` es el encabezado de la columna del menú: va en un `sr-only`,
    // que el árbol de accesibilidad SÍ expone. Se afirma la lista completa a
    // propósito: una columna nueva de dinero rompería esta igualdad, que es
    // exactamente lo que D7-1 pide vigilar.
    expect(await encabezados(tablaDelDia)).toEqual([
      'Estado',
      'Apartamento',
      'Hora límite',
      'A cargo',
      'Huéspedes',
      'Acciones',
    ]);

    const contenidoDelDia = (await tablaDelDia.textContent()) ?? '';
    expect(
      contenidoDelDia,
      'la tabla de /operacion no muestra ni una cifra de pesos: el dinero vive en Finanzas (D7-1)',
    ).not.toMatch(/\$\s?\d/);

    // ── Y al entrar, el link queda marcado como página actual ──────────────
    await barra.getByRole('link', { name: 'Finanzas' }).click();
    await paginaAdmin.waitForURL(/\/finanzas$/);
    await expect(barra.getByRole('link', { name: 'Finanzas' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(paginaAdmin.getByRole('heading', { name: 'Finanzas', level: 1 })).toBeVisible();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 2. LOS CUATRO KPIs, Y LA CUENTA
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * El orden es fijo y es una LECTURA DE SUMA Y RESTA: ingreso, costo, costo,
   * resultado (§6.3). Por eso se afirma el orden de izquierda a derecha y no solo
   * la presencia de las cuatro etiquetas.
   *
   * Y se afirma LA CUENTA, no que haya un número. Un tablero donde la ganancia es
   * un número plausible que no sale de los otros tres es peor que uno sin
   * ganancia: el dueño toma decisiones sobre él.
   */
  test('los cuatro KPIs tienen su etiqueta exacta, su orden fijo, y la ganancia es la resta de los otros tres', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto(`/finanzas?rango=dia&ancla=${diaLimpio}`);

    const ETIQUETAS = ['COBRADO', 'PAGADO A ASEADORES', 'GASTOS REEMBOLSADOS', 'GANANCIA'];

    // ── LAS CUATRO TIENEN QUE ESTAR VISIBLES ANTES DE MEDIRLAS ────────────
    // `evaluate()` espera a que el elemento esté ADJUNTO, no a que esté pintado,
    // y un nodo que React acaba de reemplazar al hidratar sigue resolviendo:
    // devuelve un rectángulo de ceros y las cuatro posiciones salen en x = 0.
    // El síntoma es «GANANCIA no va a la derecha de GASTOS REEMBOLSADOS», que se
    // lee como un defecto de maquetación y no como una medición prematura.
    // Medido el 2026-09-13: las cuatro se pintan en x = 41, 353, 665 y 977.
    for (const etiqueta of ETIQUETAS) {
      await expect(paginaAdmin.getByText(etiqueta, { exact: true })).toBeVisible();
    }

    // El orden se mide por la posición en el documento, que es lo que el ojo lee.
    const posiciones = await Promise.all(
      ETIQUETAS.map(async (etiqueta) =>
        paginaAdmin.getByText(etiqueta, { exact: true }).evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top };
        }),
      ),
    );
    for (let i = 1; i < posiciones.length; i += 1) {
      expect(
        posiciones[i].x,
        `«${ETIQUETAS[i]}» va a la derecha de «${ETIQUETAS[i - 1]}» (§6.3, orden fijo)`,
      ).toBeGreaterThan(posiciones[i - 1].x);
    }

    // Solo el cuarto lleva caption, porque es el único derivado.
    await expect(paginaAdmin.getByText('Cobrado menos pagos y gastos')).toBeVisible();

    const cobrado = await valorKPI(paginaAdmin, 'COBRADO');
    const pagado = await valorKPI(paginaAdmin, 'PAGADO A ASEADORES');
    const gastos = await valorKPI(paginaAdmin, 'GASTOS REEMBOLSADOS');
    const ganancia = await valorKPI(paginaAdmin, 'GANANCIA');

    // El día limpio tiene UN solo aseo gestionado, el del apartamento B.
    expect(cobrado).toBe(CIFRAS_FINANCIERAS.tarifaB);
    expect(pagado).toBe(CIFRAS_FINANCIERAS.pagoB);
    expect(gastos).toBe(0);
    expect(ganancia).toBe(cobrado - pagado - gastos);
    expect(ganancia).toBe(CIFRAS_FINANCIERAS.margenB);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 3. EL FILTRO MANDA SOBRE TODA LA PANTALLA
  // ═════════════════════════════════════════════════════════════════════════

  test('cambiar el rango recalcula los KPIs y los conteos, y el periodo sobrevive a un refresco', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto(`/finanzas?rango=mes&ancla=${diaLimpio}`);

    const rango = paginaAdmin.getByRole('group', { name: 'Rango del periodo' });
    await expect(rango.getByRole('button', { name: 'Mes' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const cobradoDelMes = await valorKPI(paginaAdmin, 'COBRADO');
    const aseosDelMes = await filaDeConteo(paginaAdmin, 'Aseos hechos');

    // ── EL RANGO Y EL ANCLA VIAJAN EN LA URL (§6.2) ────────────────────────
    // No es cosmética: es lo que hace el filtro enlazable y lo que permite que un
    // refresco no devuelva al usuario a hoy.
    //
    // El clic va por `pulsarHastaNavegar` y no a secas: el segmentado es un
    // componente de cliente y su navegación es una transición de React. Las dos
    // trampas medidas están escritas en el comentario de esa función. Las
    // aserciones sobre la URL se siguen haciendo, aquí abajo, y sobre las dos
    // mitades del contrato.
    await pulsarHastaNavegar(
      paginaAdmin,
      rango.getByRole('button', { name: 'Día' }),
      /rango=dia/,
    );
    await expect(paginaAdmin).toHaveURL(/rango=dia/);
    await expect(paginaAdmin).toHaveURL(new RegExp(`ancla=${diaLimpio}`));
    await expect(rango.getByRole('button', { name: 'Día' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    const cobradoDelDia = await valorKPI(paginaAdmin, 'COBRADO');
    const aseosDelDia = await filaDeConteo(paginaAdmin, 'Aseos hechos');

    expect(cobradoDelDia, 'el día es un subconjunto del mes').toBeLessThan(cobradoDelMes);
    expect(aseosDelDia).toBeLessThan(aseosDelMes);
    expect(aseosDelDia).toBe(1);

    // Y el refresco conserva el periodo, que es la mitad práctica del contrato.
    await paginaAdmin.reload();
    await expect(rango.getByRole('button', { name: 'Día' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(await valorKPI(paginaAdmin, 'COBRADO')).toBe(cobradoDelDia);
  });

  test('el chevron de siguiente se apaga cuando el periodo ya contiene hoy, y `Hoy` solo aparece cuando te fuiste', async ({
    paginaAdmin,
  }) => {
    // Sin parámetros: rango mes, ancla hoy (§6.2).
    await paginaAdmin.goto('/finanzas');

    // No hay futuro que mirar, y un botón que no hace nada es peor que uno apagado.
    await expect(paginaAdmin.getByRole('button', { name: 'Periodo siguiente' })).toBeDisabled();
    await expect(paginaAdmin.getByRole('button', { name: 'Periodo anterior' })).toBeEnabled();
    await expect(paginaAdmin.getByRole('button', { name: 'Hoy' })).toHaveCount(0);

    // Las tres aserciones de arriba se resuelven contra el HTML del servidor y
    // pasan ANTES de que React hidrate; el clic, no. Misma razón que en la
    // prueba anterior.
    await pulsarHastaNavegar(
      paginaAdmin,
      paginaAdmin.getByRole('button', { name: 'Periodo anterior' }),
      /ancla=/,
    );

    // Aparecer y desaparecer es información: si está, es que te fuiste de hoy.
    await expect(paginaAdmin.getByRole('button', { name: 'Hoy' })).toBeVisible();
    await expect(paginaAdmin.getByRole('button', { name: 'Periodo siguiente' })).toBeEnabled();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 4. LAS TRES FILAS DEL BLOQUE 2 NAVEGAN, Y NO CAMBIAN EL PERIODO
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Entrar al detalle no puede cambiar el periodo: sería un cambio de contexto
   * invisible, y el admin acabaría leyendo el mes cuando pidió la semana.
   */
  test('las tres filas del bloque 2 llevan al detalle con su filtro, y el periodo no cambia al entrar', async ({
    paginaAdmin,
  }) => {
    const DESTINOS: [string, string][] = [
      ['Aseos hechos', 'todos'],
      ['Con gastos', 'con-gastos'],
      ['Con daños', 'con-danos'],
    ];

    for (const [etiqueta, filtro] of DESTINOS) {
      await paginaAdmin.goto(`/finanzas?rango=dia&ancla=${diaLimpio}`);
      await expect(paginaAdmin.getByText('Aseos del periodo')).toBeVisible();

      await enlaceDeConteo(paginaAdmin, etiqueta).click();

      await paginaAdmin.waitForURL(/\/finanzas\/aseos/);
      await expect(paginaAdmin).toHaveURL(new RegExp(`filtro=${filtro}`));
      // El ancla VIAJA. Es §6.2, y es lo que se rompe solo.
      await expect(paginaAdmin).toHaveURL(new RegExp(`ancla=${diaLimpio}`));
      await expect(paginaAdmin).toHaveURL(/rango=dia/);

      await expect(paginaAdmin.getByRole('link', { name: 'Volver al resumen' })).toBeVisible();
    }
  });

  /**
   * Una fila con cifra 0 sigue navegable y no se oculta. Ir a una lista vacía con
   * su estado vacío explicado es mejor que preguntarse por qué desapareció una
   * fila que ayer estaba.
   */
  test('una fila con cifra cero sigue siendo navegable', async ({ paginaAdmin }) => {
    await paginaAdmin.goto(`/finanzas?rango=dia&ancla=${diaLimpio}`);

    // El día limpio tiene un aseo sin gastos: el conteo de `Con gastos` es 0.
    expect(await filaDeConteo(paginaAdmin, 'Con gastos')).toBe(0);

    const enlace = enlaceDeConteo(paginaAdmin, 'Con gastos');
    await expect(enlace).toBeVisible();
    await enlace.click();

    await paginaAdmin.waitForURL(/filtro=con-gastos/);
    await expect(
      paginaAdmin.getByText('Ningún aseo coincide con estos filtros.'),
    ).toBeVisible();
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 5. EL DETALLE ASEO POR ASEO (FIN-02)
  // ═════════════════════════════════════════════════════════════════════════

  test('el detalle tiene las siete columnas exactas y el margen de cada fila es el cobrado menos el pagado', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto(`/finanzas/aseos?rango=dia&ancla=${diaLimpio}&filtro=todos`);

    const tabla = paginaAdmin.getByRole('table');
    await expect(tabla).toBeVisible();
    expect(await encabezados(tabla)).toEqual([
      'APARTAMENTO',
      'PROGRAMADO',
      'HECHO',
      'A CARGO',
      'COBRADO',
      'PAGADO',
      'MARGEN',
    ]);

    const fila = tabla.getByRole('row').filter({ hasText: esc.aptoB.nombre });
    await expect(fila).toHaveCount(1);

    const celdas = await fila.getByRole('cell').allTextContents();
    const cobrado = pesos(celdas[4]);
    const pagado = pesos(celdas[5]);
    const margen = pesos(celdas[6]);

    expect(cobrado).toBe(CIFRAS_FINANCIERAS.tarifaB);
    expect(pagado).toBe(CIFRAS_FINANCIERAS.pagoB);
    expect(margen, 'el margen es el cobrado menos el pagado, fila por fila').toBe(cobrado - pagado);

    // Las dos fechas de la fila, que aquí coinciden.
    expect(celdas[1].trim()).toBe(formatFechaCortaBog(diaLimpio));
    expect(celdas[2].trim()).toBe(formatFechaCortaBog(diaLimpio));
    expect(celdas[3]).toContain(esc.aseadoraUna.nombre);
  });

  /**
   * LA CONCILIACIÓN. El pie de la tabla y los KPIs del Resumen miran el MISMO
   * periodo y tienen que decir lo mismo, al peso.
   *
   * Es la aserción que atrapa la clase de fallo más cara de esta pantalla: dos
   * consultas distintas —una agregada y otra por filas— que divergen en un caso
   * de borde (un aseo cancelado, uno de gestión externa, uno que cruza el
   * periodo) y dejan al dueño con dos cifras y ninguna forma de saber cuál vale.
   */
  test('la fila de totales del detalle cuadra exactamente con los KPIs del Resumen del mismo periodo', async ({
    paginaAdmin,
  }) => {
    const periodo = `rango=mes&ancla=${diaLimpio}`;

    await paginaAdmin.goto(`/finanzas?${periodo}`);
    const cobradoKPI = await valorKPI(paginaAdmin, 'COBRADO');
    const pagadoKPI = await valorKPI(paginaAdmin, 'PAGADO A ASEADORES');
    const aseosKPI = await filaDeConteo(paginaAdmin, 'Aseos hechos');

    await paginaAdmin.goto(`/finanzas/aseos?${periodo}&filtro=todos`);

    // §13.1: la fila de totales va en `<tfoot>` con `<th scope="row">` en la
    // primera celda. Se localiza por el texto `{N} aseos`, que es su copy (§15.2).
    const pie = paginaAdmin.getByRole('row').filter({ hasText: /^\s*\d+ aseos/ });
    await expect(pie).toHaveCount(1);

    const celdas = await pie.locator('th, td').allTextContents();
    const conteo = Number(/(\d+)\s+aseos/.exec(celdas[0])?.[1]);

    expect(conteo, 'el conteo del pie es el mismo que el del bloque 2').toBe(aseosKPI);
    expect(pesos(celdas[4]), 'el cobrado del pie es el KPI de cobrado').toBe(cobradoKPI);
    expect(pesos(celdas[5]), 'el pagado del pie es el KPI de pagado').toBe(pagadoKPI);
    expect(pesos(celdas[6]), 'el margen del pie es la resta de los dos').toBe(
      cobradoKPI - pagadoKPI,
    );
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 6. FIN-05 EN LA PANTALLA
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Las unidades de gestión externa no son negocio propio: no entran en los
   * totales, ni en el detalle, ni en ningún conteo (DEFINICION §1).
   *
   * Y la mitad que se olvida: **tampoco están en el combobox.** No están
   * filtradas de la lista, es que no existen para esta pantalla. Un combobox que
   * las ofrece promete un filtro que siempre devuelve vacío.
   */
  test('el apartamento de gestión externa no aparece en la tabla, ni en el combobox, ni en los totales', async ({
    paginaAdmin,
  }) => {
    const periodo = `rango=mes&ancla=${esc.aseoCruzado.hecho}`;
    await paginaAdmin.goto(`/finanzas/aseos?${periodo}&filtro=todos`);

    const tabla = paginaAdmin.getByRole('table');
    await expect(tabla).toBeVisible();
    await expect(
      tabla.getByText(esc.externa.nombre),
      'la unidad informativa no es una fila del detalle (FIN-05)',
    ).toHaveCount(0);

    // El combobox de apartamento, que §7.2 define como Popover + Command.
    await paginaAdmin.getByRole('combobox', { name: /apartamento/i }).click();
    await paginaAdmin.getByRole('combobox').last().fill(esc.externa.nombre);
    await expect(
      paginaAdmin.getByRole('option', { name: esc.externa.nombre }),
      'la unidad informativa no existe para esta pantalla, ni siquiera como opción',
    ).toHaveCount(0);
    await paginaAdmin.keyboard.press('Escape');

    // Y no está contada: el pie cuenta solo las filas que sí se ven.
    const pie = paginaAdmin.getByRole('row').filter({ hasText: /^\s*\d+ aseos/ });
    const primeraCelda = (await pie.locator('th, td').allTextContents())[0];
    const conteo = Number(/(\d+)\s+aseos/.exec(primeraCelda)?.[1]);
    const filas = await tabla.getByRole('row').count();

    // `filas` incluye la de encabezados y la del pie.
    expect(conteo).toBe(filas - 2);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 7. LA FICHA DE UNA ASEADORA
  // ═════════════════════════════════════════════════════════════════════════

  test('el panel tiene sus cuatro grupos, dice exactamente uno de los tres estados, y no hay ni una palabra de ubicación', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto(`/finanzas?rango=dia&ancla=${diaLimpio}`);

    // La espera es `esperarUrlDeCliente()` (INSTRUCCION 7 del plan 08-02): la
    // espera de URL de Playwright inyecta su sondeo dentro del documento y se
    // traba con el commit de la transición de React. Y antes de pulsar hay que
    // esperar a que React haya hidratado el ancla, porque si no el `<a>` navega
    // duro. `pulsarHastaNavegar` hace las dos cosas.
    await pulsarHastaNavegar(
      paginaAdmin,
      paginaAdmin.getByRole('link').filter({ hasText: esc.aseadoraUna.nombre }).first(),
      /aseadora=[0-9a-f-]{36}/,
    );

    // La espera no es la aserción: la aserción sobre la URL se escribe después.
    expect(paginaAdmin.url()).toMatch(/aseadora=[0-9a-f-]{36}/);

    // El periodo viaja también aquí.
    await expect(paginaAdmin).toHaveURL(new RegExp(`ancla=${diaLimpio}`));

    // ════════════════════════════════════════════════════════════════════════
    // TODO LO QUE SIGUE SE ACOTA AL DIALOGO, Y NO ES UN DETALLE DE ESTILO.
    //
    // `SheetContent` se portalea a `document.body`: el panel NO vive dentro del
    // contenedor principal de la página. Medido con un señuelo puesto a mano
    // dentro del panel, las dos aserciones de no rastreo de más abajo, acotadas
    // como estaban por `main`, **pasaron en verde con la palabra prohibida
    // dentro del panel**. Ampliarlas a toda la página tampoco vale: volverían a
    // ser verdaderas por accidente, mirando el resto de la pantalla.
    //
    // Y al revés: leer la PAGINA DE DETRAS con el panel abierto no se puede
    // hacer por rol, porque Base UI la marca como oculta al árbol de
    // accesibilidad; para eso se lee del DOM.
    // ════════════════════════════════════════════════════════════════════════
    const panel = paginaAdmin.getByRole('dialog');
    await expect(panel).toBeVisible();

    // Los cuatro grupos de §9.1, en su orden de lectura: primero lo que está
    // pasando. Los dos de apartamentos llevan su conteo en el encabezado, que es
    // el dato que el admin busca primero.
    for (const encabezado of [/^AHORA MISMO$/, /^RESPONSABLE DE \(\d+\)$/, /^EN EL PERIODO ABIERTO$/]) {
      await expect(panel.getByText(encabezado)).toBeVisible();
    }

    // El cuarto grupo, `SUPLENTE EN`, tiene DOS reglas y las dos se ejercen. Con
    // esta aseadora el conteo es cero, y §9.3 dice que entonces el grupo entero
    // NO se renderiza: un encabezado con cero son 46px para decir una ausencia
    // que nadie fue a buscar.
    await expect(panel.getByText(/^SUPLENTE EN/)).toHaveCount(0);

    // Y la otra mitad, sin la cual la de arriba pasaría con un grupo que no
    // existe nunca: la aseadora que SI es suplente lo ve, y su panel se abre por
    // DIRECCION DIRECTA, que es la otra cosa que el panel promete.
    await paginaAdmin.goto(
      `/finanzas?rango=dia&ancla=${diaLimpio}&aseadora=${esc.aseadoraDos.id}`,
    );
    await expect(panel.getByText(/^SUPLENTE EN \(\d+\)$/)).toBeVisible();

    await paginaAdmin.goto(
      `/finanzas?rango=dia&ancla=${diaLimpio}&aseadora=${esc.aseadoraUna.id}`,
    );

    // ── CUATRO ASERCIONES DE LA FICHA MUEREN ACA, Y NINGUNA EN SILENCIO ────
    //
    // 1. `lo que cuesta en el periodo`, la etiqueta de la cabecera. La cabecera
    //    del panel es nombre + estado (§9.2): ya no hay ninguna cifra grande
    //    junto a la persona, así que la etiqueta que la desambiguaba no tiene
    //    nada que desambiguar. Lo que dice la cifra lo dice ahora su propio
    //    rótulo, `Lleva ganado`, dentro del grupo 4.
    // 2. `Todos sus periodos cerrados` y 3. los rótulos `Del …` del bloque de
    //    pagos mes a mes. El bloque se cae entero (§0.1 conflicto B). **La
    //    cobertura que se pierde es de fondo:** era la única aserción del repo
    //    que comprobaba que ese bloque IGNORA el filtro de periodo de arriba y
    //    que lo dice en pantalla. Lo que queda vivo por otra ruta es que
    //    `/finanzas/pagos` no tiene filtro de periodo, y eso sí tiene su caso.
    //
    // Las tres son alcanzables por otras rutas, que es el argumento con el que
    // el dueño las sacó: `/finanzas/aseos?aseador={id}`, el mismo con
    // `&filtro=con-gastos`, y `/finanzas/pagos`.

    // ── AHORA MISMO: uno de los tres estados ──────────────────────────────
    // El `toBe(1)` es MAS estricto acotado al panel que como estaba: con el
    // panel encima de la lista, un estado que también se pintara en la página de
    // detrás contaría dos veces.
    const ahoraMismo = await panel
      .getByText(
        /Está en .+ desde las \d{2}:\d{2}\.|No tiene ningún aseo en curso\.|Esta cuenta está desactivada\./,
      )
      .count();
    expect(ahoraMismo, 'el grupo dice exactamente uno de los tres estados (§8.4)').toBe(1);

    // 4. LA LINEA QUE FECHA EL DATO MUERE, Y ESTA ES LA PERDIDA REAL.
    //    `Al momento de abrir esta página.` fijaba D-14: un dato operativo que
    //    parece vivo y no lo está es peor que uno fechado. §17.8 la prohíbe por
    //    nombre en un panel, con argumento: en algo que se abre y se cierra en
    //    diez segundos, fecharlo ocupa una línea para decir lo que el gesto ya
    //    dice. La decisión es correcta Y LA COBERTURA SE PIERDE SIN SUSTITUTO:
    //    desde acá, ninguna prueba afirma que el admin sepa de cuándo es este
    //    dato. Queda como deuda declarada, no como aserción reemplazada. La
    //    condición de reapertura la pone el propio §17.8: si el admin empieza a
    //    dejar el panel abierto, se reabre.

    // No hay GPS y no lo va a haber. Una interfaz que insinúa rastreo crea una
    // expectativa que nadie va a poder cumplir.
    const contenido = (await panel.textContent()) ?? '';
    expect(contenido, 'ninguna palabra de rastreo en el panel (§8.4)').not.toMatch(
      /ubicaci[oó]n|coordenad|GPS|en l[ií]nea|última vez activa/i,
    );
    await expect(panel.getByRole('img', { name: /mapa/i })).toHaveCount(0);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 8. PAGOS (FIN-03, FIN-04)
  // ═════════════════════════════════════════════════════════════════════════

  test('cada periodo cerrado se rotula con sus dos fechas reales, solo el más reciente viene abierto, y las partidas van en columnas separadas', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/finanzas/pagos');

    const cabeceras = paginaAdmin.getByRole('button', { name: /^Del\s/ });
    await expect(cabeceras).toHaveCount(2);

    // Del más reciente al más antiguo, y SOLO el primero abierto.
    await expect(cabeceras.nth(0)).toHaveAttribute('aria-expanded', 'true');
    await expect(cabeceras.nth(1)).toHaveAttribute('aria-expanded', 'false');

    rotuloConLasDosFechas((await cabeceras.nth(0).textContent()) ?? '', esc.reciente);
    rotuloConLasDosFechas((await cabeceras.nth(1).textContent()) ?? '', esc.viejo);

    // Las seis columnas con encabezado. La séptima es la de la acción y §9.1 la
    // deja sin rótulo, así que se afirma sobre las seis primeras: si un día lleva
    // un `sr-only`, esta aserción no se cae por una razón que no es la suya.
    const tabla = paginaAdmin.getByRole('table').first();
    await expect(tabla).toBeVisible();
    expect((await encabezados(tabla)).slice(0, 6)).toEqual([
      'ASEADOR',
      'ASEOS',
      'POR ASEOS',
      'GASTOS',
      'TOTAL',
      'PAGADO',
    ]);

    // ── D7-2 EN LA TABLA: DOS PARTIDAS, DOS COLUMNAS ──────────────────────
    // El snapshot guarda aseos y gastos por separado justamente para esto. Con un
    // total plano, el desglose no sobrevive al borrado y nadie puede reconstruir
    // de qué se compuso un pago.
    const fila = tabla.getByRole('row').filter({ hasText: esc.aseadoraUna.nombre });
    const celdas = await fila.getByRole('cell').allTextContents();

    const porAseos = pesos(celdas[2]);
    const gastos = pesos(celdas[3]);
    const total = pesos(celdas[4]);

    expect(gastos).toBe(CIFRAS_FINANCIERAS.gasto);
    expect(total, 'el total son sus aseos MÁS sus gastos, sin descuentos').toBe(porAseos + gastos);

    // Las dos columnas de estado, en el mismo bloque: una pendiente y una pagada.
    //
    // ── CORREGIDO EN EL 07-12: EL LOCALIZADOR ANTERIOR ERA INSATISFACIBLE ────
    // Decía `tabla.getByRole('row').locator('td').nth(5)`. Encadenar sobre un
    // locator de VARIAS filas APLANA todas las celdas de todas ellas en una sola
    // lista en orden de documento, así que `.nth(5)` devuelve UNA celda —la
    // sexta de la primera fila— y `allTextContents()` un arreglo de UN elemento.
    // Con un solo texto, las dos aserciones de abajo no pueden ser ciertas a la
    // vez: es un rojo que ninguna pantalla podía apagar, no un defecto del
    // producto. La intención está escrita en el comentario de arriba y se
    // conserva entera: la celda `PAGADO` DE CADA FILA, que es la sexta columna
    // de §9.1. `nth-child` es posición estructural, no clase de CSS: no rompe la
    // regla de localización de la cabecera de este archivo.
    const estados = await tabla.locator('tbody td:nth-child(6)').allTextContents();
    expect(estados.some((t) => /Pendiente/.test(t))).toBe(true);
    expect(estados.some((t) => /Pagado el/.test(t))).toBe(true);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 9. EL DESGLOSE (D7-2, D7-8)
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * **LAS DOS FECHAS, SIEMPRE.** Es D7-8 y es la razón de ser de este caso: si la
   * línea apareciera solo en los casos raros, dejaría de ser información y pasaría
   * a ser una señal de alarma. Por eso se afirma sobre el aseo que CRUZA el
   * periodo y sobre el que NO lo cruza, en el mismo desglose.
   *
   * Y la frontera aplicada al admin: este panel no muestra ninguna cifra de
   * huésped ni ningún margen. No porque el aseador lo vaya a ver —no lo ve—, sino
   * porque el desglose del admin y el del aseador tienen que ser **el mismo
   * documento**: si el admin ve una columna de más, cuando alguien reclame van a
   * estar comparando dos papeles distintos.
   */
  test('el desglose muestra las dos fechas de cada aseo, también cuando coinciden, y no lleva ninguna cifra de huésped', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/finanzas/pagos');

    await paginaAdmin
      .getByRole('table')
      .first()
      .getByRole('link', { name: esc.aseadoraUna.nombre })
      .click();

    const panel = paginaAdmin.getByRole('dialog').filter({ hasText: esc.aseadoraUna.nombre });
    await expect(panel).toBeVisible();

    // Las dos secciones y el total (§15.2).
    await expect(panel.getByText('POR ASEOS', { exact: true })).toBeVisible();
    await expect(panel.getByText('GASTOS REEMBOLSADOS', { exact: true })).toBeVisible();
    await expect(panel.getByText('TOTAL', { exact: true })).toBeVisible();

    rotuloConLasDosFechas((await panel.textContent()) ?? '', esc.reciente);

    // ── EL ASEO QUE CRUZA EL PERIODO ──────────────────────────────────────
    await expect(
      panel.getByText(
        lineaDeLasDosFechas(esc.aseoCruzado.programado, esc.aseoCruzado.hecho),
      ),
    ).toBeVisible();

    // ── Y EL QUE NO LO CRUZA: LA LÍNEA SALE IGUAL, SIN ABREVIAR ───────────
    // Es la mitad que se cae sola si alguien "optimiza" el render.
    await expect(
      panel.getByText(lineaDeLasDosFechas(esc.aseoAlineado.fecha, esc.aseoAlineado.fecha)),
      'la línea de las dos fechas no se abrevia cuando coinciden (D7-8)',
    ).toBeVisible();

    // Desde un gasto se abre su recibo.
    await expect(panel.getByText(esc.gasto.concepto)).toBeVisible();
    await panel.getByRole('button', { name: 'Ver recibo' }).first().click();
    const recibo = paginaAdmin.getByRole('dialog').filter({ hasText: esc.gasto.concepto });
    await expect(recibo.getByRole('img')).toBeVisible();
    await recibo.getByRole('button', { name: 'Cerrar' }).click();

    // ── LA FRONTERA, APLICADA AL PANEL DEL ADMIN ──────────────────────────
    const contenido = ((await panel.textContent()) ?? '').replace(/[. \s]/g, '');
    for (const prohibida of [
      CIFRAS_FINANCIERAS.tarifaA,
      CIFRAS_FINANCIERAS.tarifaB,
      CIFRAS_FINANCIERAS.margenA,
      CIFRAS_FINANCIERAS.margenB,
    ]) {
      expect(
        contenido,
        `el desglose no muestra ${prohibida}: es el MISMO documento que ve el aseador (§9.3)`,
      ).not.toContain(String(prohibida));
    }
    expect(contenido).not.toMatch(/[Mm]argen/);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // 10. MARCAR PAGADO (D7-4). VA AL FINAL: MUTA EL ESCENARIO.
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Es la última pantalla antes de una transferencia real, así que el nombre y el
   * monto van LITERALES en el cuerpo del diálogo. Un "¿confirmas?" genérico
   * delante de una transferencia es cómo se paga dos veces.
   *
   * Va al final del archivo a propósito: deja el pago marcado, y un test posterior
   * que esperara verlo pendiente fallaría por culpa de este.
   */
  test('marcar pagado confirma con el nombre y el monto literales, deja constancia, y no se ofrece dos veces', async ({
    paginaAdmin,
  }) => {
    await paginaAdmin.goto('/finanzas/pagos');

    const tabla = paginaAdmin.getByRole('table').first();
    const fila = tabla.getByRole('row').filter({ hasText: esc.aseadoraUna.nombre });

    // ── ESTA ESPERA LA AÑADIÓ EL 07-12, Y NO ES CEREMONIA ──────────────────
    // `allTextContents()` NO espera: lee el DOM que haya en ese instante. Y
    // `goto` vuelve con el evento `load`, que en el App Router llega con el
    // ESQUELETO de `loading.tsx` pintado y el contenido todavía en camino. Sin
    // esta aserción, la línea de abajo leía un arreglo vacío cada vez que el
    // servidor tardaba un poco más, y el caso moría con `undefined.trim()`: un
    // rojo que no decía nada del producto. Los otros casos de este archivo no lo
    // sufren porque empiezan con un `expect` que sí espera.
    await expect(fila).toBeVisible();

    const total = pesos((await fila.getByRole('cell').allTextContents())[4]);

    const boton = fila.getByRole('button', { name: 'Marcar pagado' });
    // El ancho se conserva en vuelo (`min-w-boton-marcar`, §9.2): se mide antes
    // para poder compararlo después sin depender de ninguna clase.
    const anchoEnReposo = (await boton.boundingBox())?.width ?? 0;
    await boton.click();

    const dialogo = paginaAdmin.getByRole('alertdialog');
    await expect(
      dialogo.getByText(`¿Ya le pagaste a ${esc.aseadoraUna.nombre}?`),
    ).toBeVisible();
    await expect(dialogo.getByText(formatCOP(total))).toBeVisible();
    await expect(dialogo.getByText('Esto no se puede deshacer desde acá.')).toBeVisible();
    // Cero acciones destructivas en toda la fase (§15.3).
    await expect(dialogo.getByRole('button', { name: 'Cancelar' })).toBeVisible();

    await dialogo.getByRole('button', { name: 'Sí, ya le pagué' }).click();

    // El aviso de éxito. Se aparta el puntero primero: la librería de toasts pausa
    // su temporizador mientras el cursor está encima y los toasts se amontonan.
    await paginaAdmin.mouse.move(4, 4);
    await expect(
      paginaAdmin
        .locator('[data-sonner-toast]')
        .getByText(`Registrado. ${esc.aseadoraUna.nombre}, ${formatCOP(total)}.`),
    ).toBeVisible({ timeout: 15_000 });

    // La fila pasa a pagado CON FECHA, y el botón deja de ofrecerse: es lo que
    // evita pagar dos veces desde dos pestañas (el bloqueo duro vive en la base).
    await expect(fila.getByText(/^Pagado el /)).toBeVisible({ timeout: 15_000 });
    await expect(fila.getByRole('button', { name: 'Marcar pagado' })).toHaveCount(0);

    expect(anchoEnReposo, 'el botón tenía un ancho mínimo en reposo').toBeGreaterThan(140);
  });

  // ═════════════════════════════════════════════════════════════════════════
  // T-07-09. EL ÁRBOL DEL ADMIN NO ES ALCANZABLE DESDE UNA SESIÓN DE ASEADORA
  // ═════════════════════════════════════════════════════════════════════════

  test('una sesión de aseadora no alcanza ninguna ruta de finanzas', async ({ paginaAseador }) => {
    for (const ruta of ['/finanzas', '/finanzas/aseos', '/finanzas/pagos']) {
      await paginaAseador.goto(ruta);
      await expect(paginaAseador, `${ruta} rebota a la raíz del aseador`).toHaveURL(
        /\/mis-aseos$/,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. EL VACÍO DE PAGOS
//
// Va en su propio bloque, DESPUÉS del anterior y sin sembrar nada: el escenario
// financiero deja dos periodos cerrados, y con ellos en la base este vacío no
// puede ocurrir. Su `afterAll` ya limpió.
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Pagos, sin ningún periodo cerrado', () => {
  test.beforeAll(() => {
    cargarEnvLocal();
    servicio = clienteDeServicio();
  });

  /**
   * **Es el vacío más importante de la fase**, y por eso tiene caso propio.
   *
   * Sin él, el admin mira una pantalla en blanco esperando algo que no sabe que
   * va a llegar solo. El cuerpo explica EL MECANISMO —cuándo ocurre el cierre—,
   * que es lo que convierte una ausencia en una espera con fecha.
   */
  test('el vacío explica cuándo ocurre el cierre, con su copy exacto', async ({ paginaAdmin }) => {
    await paginaAdmin.goto('/finanzas/pagos');

    await expect(
      paginaAdmin.getByText('Todavía no se ha cerrado ningún periodo.'),
    ).toBeVisible();
    await expect(
      paginaAdmin.getByText(
        'El primer cierre ocurre el último día hábil del mes. Ahí aparece cuánto se le debe a cada persona.',
      ),
    ).toBeVisible();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AYUDAS QUE DEPENDEN DEL COPY DEL BLOQUE 2
//
// Viven al final porque son detalle de localización, no de intención. El nombre
// accesible de cada fila lo fija `07-UI-SPEC.md` §6.4: `Aseos hechos, 48. Ver el
// detalle.`
// ───────────────────────────────────────────────────────────────────────────

/** El enlace de una de las tres filas navegables del bloque 2. */
function enlaceDeConteo(p: Page, etiqueta: string): Locator {
  return p.getByRole('link', {
    name: new RegExp(`^${etiqueta}, \\d+\\. Ver el detalle\\.$`),
  });
}

/** La cifra de una de las tres filas del bloque 2, leída de su nombre accesible. */
async function filaDeConteo(p: Page, etiqueta: string): Promise<number> {
  const nombre = await enlaceDeConteo(p, etiqueta).getAttribute('aria-label');
  const cifra = /,\s*(\d+)\./.exec(nombre ?? '');
  if (!cifra) throw new Error(`La fila «${etiqueta}» no expone su cifra en el nombre accesible`);
  return Number(cifra[1]);
}
