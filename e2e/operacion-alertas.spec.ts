import type { Locator, Page } from '@playwright/test';

import { UMBRAL_SYNC_CAIDA_MS } from '@/lib/domain/salud-sync';

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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL PANEL SE MUDO A UNA CAMPANA DE LA BARRA SUPERIOR (D-05-9, plan 10-05).
 *
 * Los seis casos de este archivo estan REESCRITOS contra esa superficie, y NINGUNO
 * se borro: cada propiedad que afirmaban sigue afirmada, en particular el contador
 * que dice el TOTAL, que es el criterio 4 del ROADMAP de la Fase 4.
 *
 * Lo que cambia mecanicamente en todos: **hay que ABRIR la campana antes de medir
 * nada**, porque el contenido del popover se monta al abrir y no antes (decision de
 * coste, ver `CampanaDeAlertas`). Medido: con la campana cerrada,
 * `[data-slot="popover-content"]` da CERO elementos.
 *
 * Y lo que cambia de fondo en UNO: el toggle `Ver atendidas` ya no vive en la
 * direccion. Su caso afirma ahora que la lista cambia SIN que la direccion se mueva.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** La campana de la barra superior. */
function campana(p: Page): Locator {
  return p.locator('[data-slot="campana-alertas"]');
}

/**
 * Abre la campana y espera a que el panel este montado.
 *
 * Se espera al PANEL y no al popover: el popover aparece con su animacion de entrada
 * y hay un instante en que existe con altura cero. Esperar al `region` del panel
 * significa que el arbol de dentro ya esta, que es lo que cualquier asercion de abajo
 * va a medir.
 */
async function abrirCampana(p: Page): Promise<void> {
  await campana(p).click();
  await expect(panel(p)).toBeVisible();
}

/**
 * El panel, por su encabezado. Nunca por clase: las clases son presentación.
 *
 * El nombre cambia a `Atendidas` con el toggle puesto, de ahi el patron con las dos
 * alternativas: un `/^Alertas/` suelto dejaria de encontrarlo justo en el caso que
 * mide el toggle.
 */
function panel(p: Page): Locator {
  return p.getByRole('region', { name: /^(Alertas|Atendidas)/ });
}

/**
 * EL CONTADOR DEL PANEL, POR SU ATRIBUTO Y NO POR SU TEXTO.
 *
 * Un `getByText('30', { exact: true })` afirma PRESENCIA, asi que su rojo es
 * `element(s) not found` y no dice que numero se pinto de verdad. Medido con el
 * señuelo de "el contador dice lo visible": el rojo no imprimia el `7`.
 *
 * Con el localizador por atributo, `toHaveText` imprime
 * `Expected: "30" / Received: "7"`, que es el mensaje que hace diagnosticable el
 * criterio 4 del ROADMAP de la Fase 4.
 */
function contadorDelPanel(p: Page): Locator {
  return panel(p).locator('[data-slot="contador-alertas"]');
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
      // Las tres de relleno de la tanda por dia (D-05-8). Van en la limpieza y no
      // solo en la siembra: un aseo que sobreviva de un caso anterior desplaza los
      // conteos del siguiente, y el rojo aparece en el caso que no lo causo.
      escenario.cuarta.id,
      escenario.quinta.id,
      escenario.sexta.id,
      escenario.externa.id,
    ]);
  if (error) throw new Error(`No se pudo limpiar entre tests: ${error.message}`);
});

/**
 * La hora límite que se siembra para la alerta de vencimiento.
 *
 * Son las 00:00 y no las 00:01, y la diferencia es de reloj: el vencimiento es
 * el instante que ordena esa alerta, y con 00:01 hay sesenta segundos al día,
 * justo después de medianoche, en los que todavía no ha vencido, la alerta no
 * existe y el panel enseña SEIS filas. A las 00:00 el vencimiento es el primer
 * instante del día de negocio, así que ya pasó a cualquier hora a la que alguien
 * corra la suite.
 */
const HORA_LIMITE_SEMBRADA = '00:00';

/**
 * Deja los SIETE tipos en el panel a la vez y devuelve el orden cronológico
 * esperado, de más reciente a más antiguo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL ORDEN ESPERADO SE DERIVA DE LOS INSTANTES SEMBRADOS, Y NO SE ESCRIBE A
 * MANO. ES UN ROJO MEDIDO, NO UNA PRECAUCIÓN.
 *
 * Hasta el 2026-09-18 esta función devolvía una lista literal que daba por
 * sentado que `HORA LÍMITE VENCIDA` es siempre la más antigua de las siete. Eso
 * es falso durante la primera hora del día: `CALENDARIO CAÍDO` se fecha en la
 * última sincronización buena MÁS el umbral, o sea `ahora − 4 h + 3 h`, y antes
 * de la 01:01 ese instante cae en el día anterior, así que las dos se
 * intercambian. Medido por 08-11 a las 00:21: cuatro corridas de cuatro en rojo.
 *
 * Y el orden que la pantalla pintaba era el CRONOLÓGICAMENTE CORRECTO. El
 * producto ordena bien; lo que estaba mal era la expectativa, que codificaba una
 * suposición sobre la hora a la que se corre la suite.
 *
 * Por eso el orden sale ahora de los instantes que este mismo caso siembra. Los
 * dos que el caso no fija con un número propio se LEEN DE LA BASE, que es de
 * donde el producto los va a leer:
 *
 *   | Alerta                | Instante que la ordena        | De dónde sale aquí          |
 *   |-----------------------|-------------------------------|-----------------------------|
 *   | URGENTE               | `cleanings.created_at`        | releído por id              |
 *   | NO PUEDO / DAÑO /     | `notifications.created_at`    | lo fija el caso, en minutos |
 *   | FALTANTES / EXTENSIÓN |                               |                             |
 *   | CALENDARIO CAÍDO      | `max(last_success_at)+umbral` | releído de `calendar_feeds` |
 *   | HORA LÍMITE VENCIDA   | el vencimiento del aseo       | `hoy` + `HORA_LIMITE_...`   |
 *
 * NO se llama a `alertasComputadas()` ni a `venceEnMs()` para construir la
 * expectativa: eso la volvería tautológica, porque compararía el producto
 * consigo mismo. El instante de la hora límite se compone aquí con el desfase
 * fijo de Colombia (UTC−5, sin DST, que es un constraint del proyecto) sobre el
 * día que devuelve `today_bog()`.
 * ════════════════════════════════════════════════════════════════════════════
 */
async function sembrarLosSieteTipos(): Promise<string[]> {
  const { gestionada, segunda, tercera, aseadoraA, fechas } = escenario;
  const ahora = Date.now();
  const min = 60_000;

  // ── Los tres COMPUTADOS ──────────────────────────────────────────────────
  // `urgente`: aseo vivo, gestionado, con `is_urgent` y fecha de hoy en adelante.
  // Su instante de orden es `created_at`, que lo pone la base al insertar.
  const [idUrgente] = await sembrarAseos(servicio, [
    {
      propiedad: gestionada.id,
      fecha: fechas.manana,
      aseador: aseadoraA.id,
      confirmado: true,
      urgente: true,
    },
    // `hora_limite_vencida`: aseo de HOY con la hora límite ya pasada. Su
    // instante de orden es el vencimiento.
    {
      propiedad: segunda.id,
      fecha: fechas.hoy,
      aseador: aseadoraA.id,
      confirmado: true,
      horaLimite: HORA_LIMITE_SEMBRADA,
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

  // ── Los dos instantes que NO los fija este caso con un número propio ──────

  // El de `urgente` es el `created_at` que puso la base al insertar el aseo. Se
  // relee en vez de darlo por `ahora`: `ahora` es el reloj de este proceso y el
  // que ordena es el de Postgres.
  const { data: filaUrgente, error: errorUrgente } = await servicio
    .from('cleanings')
    .select('created_at')
    .eq('id', idUrgente)
    .single();
  if (errorUrgente || !filaUrgente) {
    throw new Error(`No se pudo releer el aseo urgente: ${errorUrgente?.message}`);
  }

  // El de `calendario_caido` es `max(last_success_at)` sobre los feeds ACTIVOS
  // más el umbral, que es exactamente lo que hace `leerUltimoExitoDeSync()`. La
  // marca la escribe `fijarSaludDeSync()` con SU reloj, así que se lee y no se
  // recalcula: recalcularla sería volver a suponer.
  const { data: feed, error: errorFeed } = await servicio
    .from('calendar_feeds')
    .select('last_success_at')
    .eq('is_active', true)
    .order('last_success_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (errorFeed) throw new Error(`No se pudo releer la salud del sync: ${errorFeed.message}`);
  if (!feed?.last_success_at) {
    throw new Error('Ningún feed activo tiene `last_success_at`: la caída no se puede fechar.');
  }

  // El de `hora_limite_vencida` es el vencimiento: el día de negocio que devuelve
  // `today_bog()` a la hora sembrada, en Bogotá. El desfase va literal porque
  // Colombia es UTC−5 fijo y sin DST, que es un constraint del proyecto; componer
  // el instante con `new Date(fecha)` lo leería como medianoche UTC y lo correría
  // al día anterior, que es el bug que `dates.ts` existe para no repetir.
  const venceHoraLimiteMs = Date.parse(`${fechas.hoy}T${HORA_LIMITE_SEMBRADA}:00-05:00`);

  const instantes: Array<{ etiqueta: string; ms: number }> = [
    { etiqueta: 'URGENTE', ms: Date.parse(filaUrgente.created_at) },
    { etiqueta: 'NO PUEDO', ms: ahora - 2 * min },
    { etiqueta: 'DAÑO', ms: ahora - 4 * min },
    { etiqueta: 'FALTANTES', ms: ahora - 6 * min },
    { etiqueta: 'EXTENSIÓN MAL CREADA', ms: ahora - 8 * min },
    {
      etiqueta: 'CALENDARIO CAÍDO',
      ms: Date.parse(feed.last_success_at) + UMBRAL_SYNC_CAIDA_MS,
    },
    { etiqueta: 'HORA LÍMITE VENCIDA', ms: venceHoraLimiteMs },
  ];

  // Los siete instantes tienen que ser DISTINTOS, o el orden dejaría de estar
  // determinado por el dato y pasaría a depender del desempate. Con minutos de
  // por medio no puede pasar, y si algún día pasa hay que enterarse acá y no en
  // una comparación que falla una vez cada tanto.
  if (new Set(instantes.map((i) => i.ms)).size !== instantes.length) {
    throw new Error(
      `Dos de las siete alertas comparten instante y el orden deja de ser derivable: ` +
        JSON.stringify(instantes),
    );
  }

  return [...instantes].sort((a, b) => b.ms - a.ms).map((i) => i.etiqueta);
}

// ───────────────────────────────────────────────────────────────────────────
// 0. LA CAMPANA ESTA EN LAS CUATRO SECCIONES, Y HAY EXACTAMENTE UNA — plan 10-05
// ───────────────────────────────────────────────────────────────────────────

test('hay UNA campana en la barra superior, y esta en las cuatro secciones del admin', async ({
  paginaAdmin,
}) => {
  await fijarSaludDeSync(servicio, escenario.gestionada.id, 'sana', [
    escenario.segunda.id,
    escenario.tercera.id,
    escenario.externa.id,
  ]);

  await sembrarAlertas(servicio, idAdmin, [
    {
      tipo: 'no_puedo',
      titulo: 'La aseadora no puede hacer este aseo.',
      cuerpo: 'Hay que reasignarlo.',
      propiedad: escenario.gestionada.id,
      creadaEnMs: Date.now(),
    },
  ]);

  /**
   * ── QUE MIDE ESTE CASO, Y ES LO QUE EL REDISENO COMPRO ────────────────────
   *
   * El panel de alertas vivia en un carril de `/operacion` y por lo tanto NO EXISTIA
   * en las otras tres secciones: el admin tenia que volver a la pantalla de operacion
   * para ver si algo habia pasado. Al mudarse al shell, esta en las cuatro.
   *
   * Y **EXACTAMENTE UNA**: la campana la renderiza `layout.tsx` a traves de `TopNav`,
   * asi que una segunda copia solo puede llegar de que alguien la anada tambien en una
   * pagina. Dos campanas con dos lecturas distintas del mismo dato es la clase de
   * incoherencia que no se reporta y todo el mundo nota.
   */
  for (const ruta of ['/operacion', '/apartamentos', '/aseadores', '/finanzas']) {
    await paginaAdmin.goto(ruta);

    await expect(campana(paginaAdmin), `no hay una sola campana en ${ruta}`).toHaveCount(1);
    await expect(campana(paginaAdmin)).toHaveAccessibleName('Alertas, 1 sin atender');
  }

  // Y se abre desde una seccion que NO es la de operacion, que es el punto entero.
  await abrirCampana(paginaAdmin);
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(1);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. LA PRUEBA DE ESCALA DE GRISES
// ───────────────────────────────────────────────────────────────────────────

test('los siete tipos —cuatro de ellos sembrados a mano porque ninguna migración los produce— comparten color, tamaño y tratamiento', async ({
  paginaAdmin,
}) => {
  await sembrarLosSieteTipos();
  await paginaAdmin.goto('/operacion');
  await abrirCampana(paginaAdmin);

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
  //
  // ── `offsetHeight` Y NO `getBoundingClientRect()`. MEDIDO EL 2026-09-28 ────
  //
  // El popover de la campana entra con `data-open:zoom-in-95`, o sea una animación de
  // ESCALA. `getBoundingClientRect()` devuelve la caja TRANSFORMADA, así que medir a
  // mitad de la animación da `62.0835…` en vez de 64 y el caso sale ROJO contra el
  // código correcto. Es intermitente por construcción: el mismo assert pasaba en el
  // primer caso de este archivo y caía en el quinto, por puro orden de reloj.
  //
  // `offsetHeight` es el alto de LAYOUT y la transformación no lo toca, que además es
  // exactamente lo que el criterio 4 exige que sea idéntico.
  const altos = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? -1),
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

  // (a.0) Y ANTES DE ABRIR NADA: **LA CAMPANA MISMA DICE 30**. Es la mitad nueva de
  //       este caso y la que el rediseno hizo posible: el conteo esta visible sin
  //       abrir la superficie, en las cuatro secciones del admin. Va sobre el nombre
  //       accesible y no sobre el texto del badge, porque un numero suelto al lado de
  //       un icono no se lee en voz alta como nada.
  await expect(campana(paginaAdmin)).toHaveAccessibleName('Alertas, 30 sin atender');

  await abrirCampana(paginaAdmin);

  // (a) EL CONTADOR DICE 30. Es la única forma de que el scroll interno no sea un
  //     escondite: puesto sobre las filas renderizadas diría 7 u 8.
  await expect(contadorDelPanel(paginaAdmin)).toHaveText('30');

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
  await abrirCampana(paginaAdmin);

  await expect(filasDelPanel(paginaAdmin)).toHaveCount(esperado.length);

  const etiquetas = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => el.querySelector('span')?.textContent?.trim() ?? ''),
  );

  // La secuencia COMPLETA, no solo las cinco primeras: con siete tipos y siete
  // filas, afirmar las siete cuesta lo mismo y ordenar por tipo rompe la lista
  // entera, no solo su cabeza.
  //
  // ── LOS TRES AFLOJAMIENTOS PROHIBIDOS, POR SU NOMBRE ─────────────────────
  // Este caso existe para afirmar que el orden es CRONOLÓGICO y no por tipo, así
  // que cualquiera de estas tres «soluciones» a un rojo lo destruye y deja el
  // caso verde para siempre sin medir nada:
  //
  //   1. COMPARAR CONJUNTOS (`new Set(etiquetas)` contra `new Set(esperado)`, o
  //      `toEqual(expect.arrayContaining(...))`): un panel que agrupe por tipo
  //      pasaría, porque las siete siguen estando.
  //   2. COMPARAR UN SUBCONJUNTO (solo las tres primeras, o «las siete están»):
  //      lo mismo, con menos filas.
  //   3. ORDENAR CUALQUIERA DE LAS DOS LISTAS POR TIPO antes de comparar: es
  //      pedirle al test que acepte justo lo que el criterio 4 prohíbe.
  //
  // Si esto se pone rojo, la pregunta es qué instante cambió, no cómo ablandar
  // la comparación. `esperado` sale de los instantes sembrados (ver la cabecera
  // de `sembrarLosSieteTipos`), así que un rojo aquí significa que la pantalla
  // ordena por otra cosa que no es el instante del hecho.
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
  await abrirCampana(paginaAdmin);
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(1);

  const urlAntes = paginaAdmin.url();

  await paginaAdmin.getByRole('button', { name: `Marcar como atendida: ${TITULO}` }).click();

  // Sale del panel, y el panel NO desaparece: se queda con su estado vacío, que
  // es lo que mantiene la geometría estable (§11.5).
  await expect(filasDelPanel(paginaAdmin)).toHaveCount(0);
  await expect(panel(paginaAdmin).getByText('Sin alertas.')).toBeVisible();

  // ── EL TOGGLE YA NO VIVE EN LA DIRECCION (D-05-9) ─────────────────────────
  //
  // Vivia en `?alertas=atendidas` porque cambia QUE FILAS lee el servidor, que es la
  // regla de `04-13`. Ya no puede: la campana vive en el layout y un layout de App
  // Router NO recibe `searchParams`. Las dos listas llegan leidas y el toggle elige
  // entre ellas en el cliente.
  await paginaAdmin.getByRole('button', { name: 'Filtrar alertas por tipo' }).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Ver atendidas', exact: true }).click();

  // Y LA DIRECCION NO SE MUEVE. Es la propiedad que el caso defiende ahora, y es la
  // misma de antes vista del otro lado: el panel no se come ni reescribe los
  // parametros de su anfitrion.
  expect(paginaAdmin.url()).toBe(urlAntes);

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
  await abrirCampana(paginaAdmin);

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
  //
  // ── `offsetHeight` Y NO `getBoundingClientRect()`. MEDIDO EL 2026-09-28 ────
  //
  // El popover de la campana entra con `data-open:zoom-in-95`, o sea una animación de
  // ESCALA. `getBoundingClientRect()` devuelve la caja TRANSFORMADA, así que medir a
  // mitad de la animación da `62.0835…` en vez de 64 y el caso sale ROJO contra el
  // código correcto. Es intermitente por construcción: el mismo assert pasaba en el
  // primer caso de este archivo y caía en el quinto, por puro orden de reloj.
  //
  // `offsetHeight` es el alto de LAYOUT y la transformación no lo toca, que además es
  // exactamente lo que el criterio 4 exige que sea idéntico.
  const altos = await filasDelPanel(paginaAdmin).evaluateAll((elementos) =>
    elementos.map((el) => (el.firstElementChild as HTMLElement | null)?.offsetHeight ?? -1),
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
  await abrirCampana(paginaAdmin);

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
