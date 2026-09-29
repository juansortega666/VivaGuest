import type { Locator, Page } from '@playwright/test';

import { formatFechaBog, formatFechaCortaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import {
  BYTES_DEL_RECIBO,
  esperarUrlDeCliente,
  expect,
  fijarSaludDeSync,
  idPorEmail,
  limpiarAlertas,
  limpiarOperacion,
  pulsarHastaNavegar,
  sembrarAseos,
  type AseoASembrar,
  sembrarDanos,
  sembrarOperacion,
  test,
  type EscenarioDeOperacion,
  type Servicio,
} from './fixtures';
import { cargarEnvLocal, clienteDeServicio } from './global-setup';

/**
 * `/operacion` EN UN NAVEGADOR DE VERDAD — el cierre de la Fase 4.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTE ARCHIVO EXISTE, SI YA HAY 153 ASERCIONES pgTAP Y 145 DE
 * INTEGRACIÓN SOBRE LO MISMO.
 *
 * Porque los cinco criterios de éxito del ROADMAP están escritos sobre lo que el
 * admin VE Y HACE, no sobre lo que las funciones devuelven. Una RPC que confirma
 * un aseo perfectamente y una pantalla que nunca llega a llamarla dan una suite
 * verde y un producto roto. Lo que este archivo mide, y ninguna de las otras dos
 * capas puede medir, es la cadena completa: clic → Server Action → RPC →
 * `router.refresh()` → la fila repintada.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── LA SIEMBRA ES POR TEST Y NO POR ARCHIVO, Y ESO NO ES DERROCHE ───────────
 *
 * La bandeja `Sin confirmar` cuenta TODOS los aseos sin confirmar de la ventana,
 * vengan del apartamento que vengan. Un aseo que sobreviva de un test anterior
 * hace que `Confirmar 15 aseos` diga 16, y el fallo aparece en el test que no lo
 * causó. Por eso hay un `beforeEach` que deja la base sin un solo aseo de este
 * escenario y cada test siembra exactamente lo que va a afirmar.
 *
 * El `beforeAll` además EXIGE que `cleanings` esté vacía al arrancar. Sin esa
 * guarda, una corrida sobre una base con restos daría números que no cuadran y
 * el diagnóstico costaría una hora; con ella, el mensaje dice qué pasó.
 *
 * ── LOS TOASTS SE AFIRMAN LITERALES, Y SU COPY ES EL CONTRATO ───────────────
 *
 * El flujo del criterio 3 encadena cinco mutaciones sobre EL MISMO aseo, y cada
 * paso afirma el texto EXACTO del contrato de copy. Ninguno de los cinco puede
 * decir ni sugerir que se le avisó al aseador: nadie drena `notifications` hasta
 * la Fase 5, así que `Queda asignado a María` es cierto y `Se le notificó a
 * María` sería mentira (UI-SPEC §18.1). Los detalles de por qué no se espera al
 * desvanecido están en `esperarToast()`.
 */

/** El nombre accesible del menú de una fila, tal como lo compone `MenuAseo`. */
function menuDelAseo(p: Page, apartamento: string, fecha: string) {
  return p.getByRole('button', {
    name: `Acciones del aseo de ${apartamento} del ${formatFechaBog(fecha)}`,
  });
}

/*
 * ── `cabeceraDeBloque`, `abrirBloque` Y `rotuloDeFecha` SE FUERON (plan 10-05) ──
 *
 * Los tres servian a los acordeones `Atrasados / Hoy / Mañana / Siguientes`, que
 * murieron con el eje relativo a hoy. Ya no hay nada que expandir: la pantalla se
 * filtra por UN dia con el selector de la cabecera y la lista es una sola.
 *
 * Lo que los sustituye es `tarjetaDe()`, abajo. Y si un caso necesita mirar otro
 * dia, lo que hace es NAVEGAR a ese dia, no expandir nada.
 */

/**
 * La tarjeta de un aseo, por el nombre de su apartamento.
 *
 * Se acota a `[data-slot="tarjeta-aseo"]` y NO a `getByRole('row')`, que es lo que
 * usaban los casos viejos: ya no hay tabla. Y no se acota por texto suelto en la
 * pagina, que encontraria tambien el nombre pintado en la columna derecha.
 */
function tarjetaDe(p: Page, apartamento: string) {
  return p.locator('[data-slot="tarjeta-aseo"]').filter({ hasText: apartamento });
}

/**
 * Afirma un toast POR SU TEXTO EXACTO.
 *
 * ── POR QUÉ NO SE ESPERA A QUE DESAPAREZCA, QUE ES LO PRIMERO QUE UNO ESCRIBE ─
 * La librería de toasts PAUSA su temporizador mientras el puntero está encima o
 * la ventana no tiene el foco, y en un navegador dirigido por Playwright el
 * puntero se queda donde cayó el último clic. Medido: el toast de confirmación
 * seguía visible 20 s después. Esperar a que se vaya es flaky por construcción.
 *
 * No hace falta: los cinco toasts de la cadena del criterio 3 tienen textos
 * DISTINTOS, así que un `getByText(..., { exact: true })` no puede darse por
 * satisfecho con el del paso anterior. Si algún día dos pasos comparten copy,
 * hay que distinguirlos aquí, no volver a esperar al desvanecido.
 *
 * ── EL ROJO INTERMITENTE DE ESTA FUNCIÓN NO ES DE ESTA FUNCIÓN. MEDIDO ──────
 *
 * Esta espera se pone roja de vez en cuando (~32 %, 7 de 22 corridas del
 * 2026-09-18) con `element(s) not found`, y la lectura obvia es que la pila de
 * toasts se llenó y la librería dejó de renderizar. **Está medido que NO es
 * eso, y el arreglo que parece evidente no sirve.** Queda escrito para que
 * nadie vuelva a gastar la tarde:
 *
 *   1. NO HAY PILA QUE DRENAR, y es estructural. `paginaAdmin` es un fixture de
 *      ÁMBITO DE TEST (`e2e/fixtures.ts`): cada caso abre un `browser.newContext()`
 *      y una página nuevas, así que ningún toast del caso anterior sobrevive.
 *      Limpiar la pila en el `beforeEach` es literalmente un no-op.
 *   2. EN EL INSTANTE DEL ROJO EL DOM TIENE CERO TOASTS. Medido con volcado:
 *      `[data-sonner-toast]` en 0 y `[data-sonner-toaster]` en 0. No es que el
 *      toast se tape: es que no existe.
 *   3. Y NO ES QUE APAREZCA Y SE VAYA. Con un `MutationObserver` instalado sobre
 *      `document.body` ANTES del clic, el rojo registra CERO inserciones en los
 *      15 s enteros. El mismo observador, en una corrida verde, registra el alta
 *      a los 520 ms con el texto exacto. Y su array sobrevive al fallo, o sea
 *      que tampoco hubo recarga de página.
 *   4. LA CADENA DE PRODUCTO SÍ FUNCIONA: la RPC escribió (`state` en
 *      `cancelada`) y el diálogo se cerró. Lo único que se pierde es el aviso.
 *
 * O sea que el toast se publica y nunca llega a pintarse. Es un defecto DEL
 * PRODUCTO, no del instrumento: un admin que cancela un aseo se queda sin su
 * confirmación una de cada tres veces. El sospechoso es la forma que comparten
 * `DialogoCancelarAseo` y `DialogoReprogramar` (los dos que fallan, y los dos
 * los monta `MenuAseo`): `toast.success(...)` y acto seguido cerrar el diálogo,
 * que dispara `router.refresh()` en el mismo tick. Meter tres escrituras
 * síncronas entre las dos líneas hizo desaparecer el rojo en 8 de 8 corridas,
 * contra 2 de 8 en rojo con el árbol intacto.
 *
 * ── LO QUE ESTÁ PROHIBIDO HACER CON ESTO ───────────────────────────────────
 *
 * NO subir el timeout, NO quitarle el `exact: true`, NO cambiar la aserción por
 * una sobre la fila y NO marcar el caso con `test.fail()` (es intermitente: un
 * `test.fail()` se pondría rojo las dos de cada tres veces que hoy pasa). La
 * aserción mide lo que tiene que medir. Lo que hay que arreglar es el producto,
 * y está declarado con dueño en el SUMMARY de 09-02.
 */
async function esperarToast(p: Page, texto: string) {
  // El puntero se queda donde cayó el último clic, y la pila de toasts vive
  // abajo a la derecha: si el clic cae encima, la librería pausa el temporizador
  // y los toasts se AMONTONAN. Apartar el puntero antes de mirar deja que
  // expiren solos. (Lo que NO explica esto es el rojo intermitente: ver arriba.)
  await p.mouse.move(4, 4);

  const toast = p.locator('[data-sonner-toast]').getByText(texto, { exact: true });
  await expect(toast).toBeVisible({ timeout: 15_000 });
}

/**
 * El toast de una confirmacion, que desde la Fase 5 puede llevar coletilla.
 *
 * ── POR QUE ESTA FUNCION EXISTE, Y ES UN DEFECTO ENCONTRADO EN EL PLAN 06-10 ─
 *
 * Las dos aserciones que la usan estaban **rojas desde la Fase 5** y nadie lo
 * habia visto: `mensajeDeTandaCompleta()` gano el sufijo
 * `N quedaron con un aseador sin avisos.` y estas dos comparaban la cadena
 * EXACTA de la Fase 4.
 *
 * Y el sufijo aparece SIEMPRE en esta suite, por una razon que conviene dejar
 * escrita: los usuarios que siembra `global-setup.ts` nunca registran una
 * suscripcion de push, porque nadie les da permiso de notificaciones en un
 * navegador de pruebas. O sea que **toda** confirmacion de este archivo va a
 * parar a un aseador sin canal, que es exactamente el caso que el copy de la
 * Fase 5 existe para avisar.
 *
 * Se compara por PREFIJO y no se reescribe la cadena entera con el sufijo: lo
 * que estos dos tests miden es el flujo de confirmacion, no el estado de los
 * avisos. Fijar aqui el numero exacto de aseadores mudos ataria un test de
 * `/operacion` a un detalle de la siembra de push.
 */
async function esperarToastQueEmpiezaCon(p: Page, prefijo: string) {
  await p.mouse.move(4, 4);

  const toast = p
    .locator('[data-sonner-toast]')
    .getByText(new RegExp(`^${prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await expect(toast).toBeVisible({ timeout: 15_000 });
}

let servicio: Servicio;
let escenario: EscenarioDeOperacion;
let idAdmin = '';

/** Los aseadores activos del sistema entero, que es lo que la franja lista. */
let aseadorasActivas: string[] = [];

/** Las rutas del bucket que sembro la seccion 9, para borrarlas al final. */
const rutasDeFotoSembradas: string[] = [];

test.beforeAll(async () => {
  // El `globalSetup` cargó el entorno en SU proceso; este worker es otro.
  cargarEnvLocal();
  servicio = clienteDeServicio();

  const { count, error } = await servicio
    .from('cleanings')
    .select('id', { count: 'exact', head: true });
  if (error) throw new Error(`No se pudo contar los aseos: ${error.message}`);
  if ((count ?? 0) !== 0) {
    throw new Error(
      `La tabla cleanings arranca con ${count} filas y este spec cuenta filas en pantalla.\n` +
        'Corre `npm run db:reset` antes de la suite E2E: los conteos de la bandeja y de los\n' +
        'bloques de día son globales y cualquier resto de otra corrida los desplaza.',
    );
  }

  escenario = await sembrarOperacion(servicio);
  idAdmin = await idPorEmail(servicio, 'e2e.admin@vivaguest.test');

  // La franja de carga lista TODOS los aseadores activos, incluidos los de otros
  // specs. El número esperado se consulta, no se escribe a mano.
  const { data: perfiles, error: errorPerfiles } = await servicio
    .from('profiles')
    .select('full_name')
    .eq('role', 'aseador')
    .eq('is_active', true);
  if (errorPerfiles) throw new Error(errorPerfiles.message);
  aseadorasActivas = (perfiles ?? []).map((p) => p.full_name);
});

test.afterAll(async () => {
  if (escenario) await limpiarOperacion(servicio, escenario);
  if (idAdmin) await limpiarAlertas(servicio, idAdmin);

  // Los objetos del bucket NO caen con el aseo: `cleaning_photos` cascadea
  // desde `cleanings`, pero el almacenamiento es otro sistema y una foto
  // huerfana se queda facturando sin que ninguna fila apunte a ella. Es la
  // misma razon por la que el sembrador financiero sube y borra sus bytes.
  if (rutasDeFotoSembradas.length > 0) {
    await servicio.storage.from('evidencia').remove(rutasDeFotoSembradas);
    rutasDeFotoSembradas.length = 0;
  }
});

test.beforeEach(async () => {
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

  // El panel de alertas comparte carril con la bandeja. Dejarlo vacío mantiene la
  // geometría estable y evita que una alerta computada de un test anterior
  // aparezca en el siguiente.
  await limpiarAlertas(servicio, idAdmin);
});

// ───────────────────────────────────────────────────────────────────────────
// 1. EL ATERRIZAJE
// ───────────────────────────────────────────────────────────────────────────

test('el admin aterriza en /operacion, en el dia de HOY y con la lista del dia', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, fechas } = escenario;

  // Uno de hoy y uno de mañana: el de mañana es el CONTROL. Sin el, una pantalla
  // que renderizara la ventana entera pasaria esta asercion igual de bien.
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy },
    { propiedad: segunda.id, fecha: fechas.manana },
  ]);

  /**
   * ── REESCRITO EN EL PLAN 10-05, Y LA PROPIEDAD DE ENTRADA ES LA MISMA ─────
   *
   * Afirmaba `Hoy` expandido y `Mañana` y `Siguientes` colapsados, o sea la forma
   * de los tres acordeones relativos a hoy. Esos acordeones murieron con el eje
   * del dia: la pantalla se filtra por UN dia y la lista es una sola.
   *
   * Lo que se conserva intacto es la mitad que no era sobre acordeones: que
   * `/operacion` es LA RUTA DE ENTRADA del admin (plan 04-09), medida desde la
   * raiz y no yendo a `/operacion` directo. Y lo que la sustituye por el otro
   * lado: que el dia de entrada es HOY, con la lista de hoy y nada mas.
   */
  await paginaAdmin.goto('/');
  await paginaAdmin.waitForURL(/\/operacion$/);

  await expect(paginaAdmin.getByRole('heading', { name: 'Operación', level: 1 })).toBeVisible();

  // El dia de entrada es hoy: el selector lo dice.
  await expect(centroDelSelector(paginaAdmin)).toHaveText('Hoy');

  // Y la lista trae SOLO el aseo de hoy. El de mañana no esta renderizado: no es
  // que este colapsado, es que la pantalla mira otro dia.
  await expect(paginaAdmin.locator('[data-slot="tarjeta-aseo"]')).toHaveCount(1);
});

test('navegar de dia NO RECARGA la pagina', async ({ paginaAdmin }) => {
  const { gestionada, fechas } = escenario;
  await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  await paginaAdmin.goto('/operacion');

  /**
   * ── REESCRITO SOBRE EL SELECTOR, Y LA PROPIEDAD ES LA MISMA ──────────────
   *
   * Afirmaba que abrir un bloque de dia no recargaba la pagina, y existia porque
   * un bloque implementado con un enlace a `?dia=manana` habria pasado el assert
   * de `aria-expanded` igual de bien sin que nadie se enterara de que la pantalla
   * entera se volvia a pedir en cada clic.
   *
   * **Y ahora el selector de dia ES ese enlace**, asi que la pregunta pasa a ser la
   * de verdad: cambiar de dia tiene que ser una navegacion de CLIENTE del App
   * Router, no una recarga del documento. Una recarga costaria el arbol entero y
   * se llevaria por delante el estado de cliente de la lista (el toggle de
   * cancelados, la tanda a medias).
   *
   * La marca vive en `window` y NO sobrevive a una recarga. Es el unico
   * instrumento que distingue las dos cosas: las dos dejan la URL igual y las dos
   * pintan el dia nuevo.
   */
  await paginaAdmin.evaluate(() => {
    (window as unknown as Record<string, unknown>).__marcaDeOperacion = 'viva';
  });

  const siguiente = selectorDeDia(paginaAdmin).getByRole('link', { name: /día siguiente/ });
  await pulsarHastaNavegar(paginaAdmin, siguiente, /[?&]dia=/);

  await expect
    .poll(() =>
      paginaAdmin.evaluate(
        () => (window as unknown as Record<string, unknown>).__marcaDeOperacion,
      ),
    )
    .toBe('viva');
});

// ───────────────────────────────────────────────────────────────────────────
// 1.b EL EJE DEL DIA — el trazador del plan 10-05
//
// ── QUE MIDE ESTE BLOQUE ──────────────────────────────────────────────────
//
// Que el dia viaja DESDE LA DIRECCION hasta el rango de la consulta y sale por
// una cifra en pantalla. Antes de este plan el eje de `/operacion` era "relativo
// a hoy" y vivia en la capa de datos (`agruparPorDia`), asi que no habia nada que
// un navegador pudiera pedir.
//
// ── LA TRAMPA DE `07-14`, Y VA ESCRITA PORQUE TIRA LAS ASERCIONES ─────────
//
// `page.waitForURL` y `expect(page).toHaveURL` NO VEN el cambio de direccion de
// un control de parametro de esta clase, ni con veinte segundos de plazo: su
// sondeo corre DENTRO del documento y se traba con el commit de la transicion de
// React. Se sondea `page.url()` desde Node, y la asercion sobre la direccion se
// escribe DESPUES de la espera. El repo ya tiene `esperarUrlDeCliente` en
// `e2e/fixtures.ts` para exactamente esto: se usa, no se reinventa.
// ───────────────────────────────────────────────────────────────────────────

/** El selector de dia de la cabecera. */
function selectorDeDia(p: Page) {
  return p.locator('[data-slot="selector-dia"]');
}

/**
 * EL CONTROL DEL CENTRO DEL SELECTOR, POR POSICION Y NO POR NOMBRE.
 *
 * ── Y ESO NO ES PEREZA, ES UNA TRAMPA MEDIDA (2026-09-28) ─────────────────
 *
 * `getByRole('link', { name: 'Hoy' })` NO SIRVE para afirmar la ausencia. El
 * nombre accesible del control del centro cuando el dia efectivo no es hoy es
 * `11 sep · volver a hoy` (WCAG 2.2 SC 2.5.3 exige que CONTENGA su texto
 * visible), y el emparejamiento por nombre de Playwright es por SUBCADENA y sin
 * distinguir mayusculas. O sea que `name: 'Hoy'` casa con `volver a hoy` y un
 * `toHaveCount(0)` sale rojo contra el codigo correcto.
 *
 * Medido: `Expected: 0 / Received: 1`, con el selector en `11 sep`.
 *
 * Por posicion y afirmando el TEXTO VISIBLE, que es lo que el contrato redacto:
 * `Hoy` cuando el dia efectivo es el de negocio, y la fecha corta cuando no.
 */
function centroDelSelector(p: Page) {
  return selectorDeDia(p).getByRole('link').nth(1);
}

/** La CIFRA de una metrica del vistazo, por su clave estable y no por su copia. */
function cifraDeMetrica(p: Page, clave: string) {
  return p.locator(`[data-slot="metrica-dia"][data-metrica="${clave}"] [data-cifra="true"]`);
}

test('el selector de dia trae tres controles y el del centro dice Hoy', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/operacion');

  const selector = selectorDeDia(paginaAdmin);
  await expect(selector).toBeVisible();

  // Tres ENLACES y no tres botones: cambiar de dia cambia que filas lee el
  // servidor, asi que vive en la direccion (regla de `04-13`). Con botones y
  // `router.push` esto pasaria igual, y por eso la cuenta se hace sobre el rol de
  // enlace y no sobre un conteo de hijos.
  await expect(selector.getByRole('link')).toHaveCount(3);

  // Sin `?dia` en la direccion, el dia efectivo es el de negocio de Bogota.
  await expect(centroDelSelector(paginaAdmin)).toHaveText('Hoy');
});

test('la metrica de aseos activos dice el conteo del dia de hoy', async ({ paginaAdmin }) => {
  const { gestionada, segunda, externa, fechas } = escenario;

  // Dos gestionados de hoy y una unidad de gestion externa del mismo dia: la
  // externa NO cuenta como trabajo activo, por la misma razon por la que los chips
  // de carga la excluyen.
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy },
    { propiedad: segunda.id, fecha: fechas.hoy },
    { propiedad: externa.id, fecha: fechas.hoy },
  ]);

  await paginaAdmin.goto('/operacion');

  await expect(cifraDeMetrica(paginaAdmin, 'activos')).toHaveText('2');
});

test('pulsar el dia anterior cambia la direccion y la cifra pasa al conteo de ayer', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, fechas } = escenario;

  // Tres de hoy y uno de ayer: los dos conteos son DISTINTOS a proposito, porque
  // con el mismo numero la asercion pasaria sin que la pantalla hubiera cambiado
  // de dia.
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy },
    { propiedad: segunda.id, fecha: fechas.hoy },
    { propiedad: tercera.id, fecha: fechas.hoy },
    { propiedad: gestionada.id, fecha: fechas.ayer },
  ]);

  await paginaAdmin.goto('/operacion');
  await expect(cifraDeMetrica(paginaAdmin, 'activos')).toHaveText('3');

  const anterior = selectorDeDia(paginaAdmin).getByRole('link', { name: /día anterior/ });
  await pulsarHastaNavegar(paginaAdmin, anterior, /[?&]dia=/);

  // La asercion sobre la direccion se escribe DESPUES de la espera, nunca como la
  // espera: ver la cabecera de este bloque.
  expect(paginaAdmin.url()).toContain(`dia=${fechas.ayer}`);

  await expect(cifraDeMetrica(paginaAdmin, 'activos')).toHaveText('1');

  // Y el selector deja de decir `Hoy`: el rotulo del centro es la fecha corta
  // cuando el dia efectivo no es el de negocio.
  await expect(centroDelSelector(paginaAdmin)).toHaveText(formatFechaCortaBog(fechas.ayer));
});

test('navegar de dia CONSERVA los demas parametros de la direccion', async ({ paginaAdmin }) => {
  const { gestionada, fechas } = escenario;
  await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  /**
   * ── POR QUE UN PARAMETRO ARBITRARIO Y NO UNO REAL DE LA PANTALLA ──────────
   *
   * Porque lo que se defiende es el MECANISMO, no un parametro concreto: el bucle
   * de `vivos` de `page.tsx` copia TODO menos `aseo`, y con un parametro que la
   * pantalla no conoce esta asercion se pone roja el dia que alguien cierre ese
   * bucle a una lista de claves conocidas. Con `?alertas=atendidas` la asercion
   * moriria con el toggle en la Task 3 de este plan y la propiedad se quedaria sin
   * defender.
   *
   * Y la propiedad es la de la regla 3 de §5.1, medida en `08-02-MEDICION.md` §4.3
   * con el enlace del panel: un `href` con consulta literal borra los parametros
   * del anfitrion. El selector no puede comerselos.
   */
  await paginaAdmin.goto('/operacion?sonda=viva');

  const siguiente = selectorDeDia(paginaAdmin).getByRole('link', { name: /día siguiente/ });
  await pulsarHastaNavegar(paginaAdmin, siguiente, /[?&]dia=/);

  expect(paginaAdmin.url()).toContain(`dia=${fechas.manana}`);
  expect(paginaAdmin.url()).toContain('sonda=viva');
});

test('un ?dia invalido renderiza hoy Y el parametro sigue en la direccion', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, fechas } = escenario;

  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy },
    { propiedad: segunda.id, fecha: fechas.hoy },
  ]);

  // `2026-02-30` pasa cualquier regex de forma y NO EXISTE. Es el caso que separa
  // la guarda de forma de un regex suelto, y el que sin guarda llega a Postgres
  // como argumento de tipo fecha y vuelve como `22P02`.
  await paginaAdmin.goto('/operacion?dia=2026-02-30');

  await expect(cifraDeMetrica(paginaAdmin, 'activos')).toHaveText('2');
  await expect(centroDelSelector(paginaAdmin)).toHaveText('Hoy');

  // EL PARAMETRO HUERFANO NO SE LIMPIA (§11.4): limpiarlo reescribiria un enlace
  // que alguien pego en un chat. La pantalla cae a hoy y calla.
  expect(paginaAdmin.url()).toContain('dia=2026-02-30');
});

// ───────────────────────────────────────────────────────────────────────────
// 1.c EL VISTAZO DE CUATRO METRICAS Y LA SENAL DE CALENDARIO — plan 10-05
//
// ── QUE MIDE ESTE BLOQUE ──────────────────────────────────────────────────
//
// La regla que el dueno enuncio el 2026-09-28: las cuatro metricas salen del dia
// del selector SIN EXCEPCION. Y las dos cifras con trampa: los urgentes de un dia
// pasado, cuyo `is_urgent` esta congelado en la base, y los gastos, que vienen de
// otra tabla y por otro criterio de dia que `/finanzas`.
// ───────────────────────────────────────────────────────────────────────────

/** La METRICA entera (rotulo + cifra + leyenda), por su clave estable. */
function metrica(p: Page, clave: string) {
  return p.locator(`[data-slot="metrica-dia"][data-metrica="${clave}"]`);
}

/** Siembra un gasto sobre un aseo. No hay fixture compartido: es una fila y media. */
async function sembrarGasto(
  idAseo: string,
  propiedad: string,
  reportadoPor: string,
  monto: number,
  concepto: string,
): Promise<void> {
  const { error } = await servicio.from('expenses').insert({
    cleaning_id: idAseo,
    property_id: propiedad,
    concepto,
    monto,
    reported_by: reportadoPor,
  });
  if (error) throw new Error(`No se pudo sembrar el gasto: ${error.message}`);
}

test('LAS CUATRO metricas cambian al navegar de dia, no una', async ({ paginaAdmin }) => {
  const { gestionada, segunda, tercera, aseadoraA, fechas } = escenario;

  // HOY: tres activos, dos sin confirmar, uno urgente, un gasto.
  // AYER: uno activo, uno sin confirmar, urgentes NO APLICA, cero gastos.
  //
  // Los cuatro pares de cifras son distintos a proposito: con una sola metrica
  // cambiando, un bug que dejara las otras tres ancladas a hoy pasaria el test.
  const [deHoyUno] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, urgente: true },
    { propiedad: segunda.id, fecha: fechas.hoy },
    { propiedad: tercera.id, fecha: fechas.hoy, confirmado: true, aseador: aseadoraA.id },
    { propiedad: gestionada.id, fecha: fechas.ayer },
  ]);
  await sembrarGasto(deHoyUno, gestionada.id, aseadoraA.id, 180_000, 'Jabon y guantes');

  await paginaAdmin.goto('/operacion');

  await expect(cifraDeMetrica(paginaAdmin, 'activos')).toHaveText('3');
  await expect(cifraDeMetrica(paginaAdmin, 'sin-confirmar')).toHaveText('2');
  await expect(cifraDeMetrica(paginaAdmin, 'urgentes')).toHaveText('1');
  // `4 · $ 180K` es la forma que el dueno pidio: conteo y total abreviado. Con un
  // solo gasto, `1 · $ 180K`.
  await expect(cifraDeMetrica(paginaAdmin, 'gastos')).toHaveText(/^1 · \$.180K$/);

  // La leyenda del desbordamiento: el sin confirmar de AYER se ve desde HOY sin
  // navegar, que es lo que conserva la promesa del criterio 1 (D-05-7).
  await expect(metrica(paginaAdmin, 'sin-confirmar')).toContainText('+1 en otros días');

  const anterior = selectorDeDia(paginaAdmin).getByRole('link', { name: /día anterior/ });
  await pulsarHastaNavegar(paginaAdmin, anterior, /[?&]dia=/);

  await expect(cifraDeMetrica(paginaAdmin, 'activos')).toHaveText('1');
  await expect(cifraDeMetrica(paginaAdmin, 'sin-confirmar')).toHaveText('1');
  // El gasto vive en un aseo de HOY, asi que en ayer el conteo es cero y se pinta el
  // cero SOLO: la mitad de dinero de un conteo en cero es siempre cero.
  await expect(cifraDeMetrica(paginaAdmin, 'gastos')).toHaveText('0');
  // Y la cuarta: en un dia pasado NO es una cifra. Ver el caso siguiente.
  //
  // El patron y NO `toHaveText('—')`: el `textContent` del nodo incluye el texto
  // accesible, asi que la igualdad exacta recibe `"—no aplica"`. Medido.
  await expect(cifraDeMetrica(paginaAdmin, 'urgentes')).toHaveText(/^—/);
});

test('en un dia PASADO con un aseo urgente sembrado, urgentes NO dice una cifra', async ({
  paginaAdmin,
}) => {
  const { gestionada, fechas } = escenario;

  // D-05-3. `is_urgent` solo se mantiene para `scheduled_date >= today_bog()`, asi
  // que aca se siembra un valor CONGELADO: la fila dice urgente y el predicado del
  // SQL ya no lo mantendria. Pintarlo seria afirmar algo que la base no sostiene.
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.ayer, urgente: true },
  ]);

  await paginaAdmin.goto(`/operacion?dia=${fechas.ayer}`);

  const cifra = cifraDeMetrica(paginaAdmin, 'urgentes');
  await expect(cifra).toHaveText(/^—/);

  // La asercion fuerte, y la que el plan pide literal: NO dice una cifra. Ninguna,
  // no solo el `1` sembrado. Un `not.toHaveText('1')` pasaria con un `0` pintado, y
  // cero es justo la respuesta equivocada: cero dice "no hay ninguno" y aca la
  // verdad es "esta pregunta no tiene respuesta para este dia".
  expect(await cifra.textContent()).not.toMatch(/\d/);

  // Y el guion SOLO no dice nada en un lector de pantalla: el motivo va en texto
  // accesible, misma regla que `SinDato` de la fila de aseo.
  await expect(metrica(paginaAdmin, 'urgentes')).toContainText('no aplica');
});

test('el title de gastos lleva la cifra EXACTA y la frase de la divergencia con Finanzas', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  // 180.400 es el caso que hace visible el problema: abreviado es `$ 180K`, y quien
  // abra el detalle va a ver 180.400 y a leerlo como un error de cuadre.
  const [idAseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy },
  ]);
  await sembrarGasto(idAseo, gestionada.id, aseadoraA.id, 180_400, 'Jabon');

  await paginaAdmin.goto('/operacion');

  const titulo = await metrica(paginaAdmin, 'gastos').getAttribute('title');
  expect(titulo).not.toBeNull();

  // La cifra exacta, porque la abreviatura redondea.
  expect(titulo?.replace(/\s/g, ' ')).toContain('$ 180.400');
  // Y la frase de la divergencia: `/finanzas` agrupa por el dia en que el aseo se
  // CERRO y esta pantalla por el dia en que estaba PROGRAMADO. Las dos cifras pueden
  // no coincidir y eso NO es un defecto; sin esta frase vuelve como reporte de bug.
  expect(titulo).toContain('programados el');
  expect(titulo).toContain('se cerró');
  expect(titulo).toContain('pueden no coincidir');
});

test('un gasto de un aseo de AYER reportado HOY cuenta en AYER, no en hoy', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, aseadoraA, fechas } = escenario;

  /**
   * ── EL CASO QUE SEPARA LOS DOS CRITERIOS DE DIA (D-05-4 y la trampa 2) ─────
   *
   * `public.expenses` NO TIENE dia de negocio: sus columnas de tiempo son
   * `created_at` y nada mas. Asi que hay dos formas de agrupar y solo una es la que
   * el dueno pidio:
   *
   *   - por `created_at`  -> el gasto cae en HOY, porque se reporto hoy
   *   - por el `scheduled_date` del aseo -> cae en AYER, que es lo correcto aca
   *
   * El aseo se siembra en AYER y el gasto se inserta SIN `created_at` explicito, o
   * sea con el `now()` del default: es exactamente el caso real de la aseadora que
   * cierra un aseo de ayer y reporta el gasto esta manana.
   */
  const [deAyer] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.ayer },
    { propiedad: segunda.id, fecha: fechas.hoy },
  ]);
  await sembrarGasto(deAyer, gestionada.id, aseadoraA.id, 45_000, 'Detergente');

  // En AYER: el gasto esta.
  await paginaAdmin.goto(`/operacion?dia=${fechas.ayer}`);
  await expect(cifraDeMetrica(paginaAdmin, 'gastos')).toHaveText(/^1 · \$.45K$/);

  // En HOY: cero, aunque el gasto se haya CREADO hoy.
  await paginaAdmin.goto('/operacion');
  await expect(cifraDeMetrica(paginaAdmin, 'gastos')).toHaveText('0');
});

test('la senal de calendario PRECEDE al selector en el orden del DOM', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/operacion');

  // El dueno lo pidio literal el 2026-09-28: la senal inmediatamente a la IZQUIERDA
  // del selector. Se mide sobre el orden del DOCUMENTO y no sobre coordenadas: una
  // asercion de `boundingBox().x` pasaria igual con los dos en el orden inverso y
  // `flex-row-reverse` puesto, que es precisamente el bug que esto tiene que ver.
  //
  // Y devuelve una CADENA y no un booleano: asi el rojo dice en que orden estan de
  // verdad, en vez de `expected true, received false`. `Node` no existe en el
  // proceso de Node del runner, solo dentro del `evaluate`, asi que la constante va
  // por su valor numerico con su nombre al lado.
  const relacion = await paginaAdmin.evaluate(() => {
    const senal = document.querySelector('[data-slot="senal-calendario"]');
    const selector = document.querySelector('[data-slot="selector-dia"]');
    if (senal === null) return 'no hay senal de calendario';
    if (selector === null) return 'no hay selector de dia';
    if (selector.previousElementSibling === senal) return 'inmediatamente antes';
    // 4 es `Node.DOCUMENT_POSITION_FOLLOWING`.
    const sigue = (senal.compareDocumentPosition(selector) & 4) !== 0;
    return sigue ? 'antes, pero no pegada' : 'despues del selector';
  });

  expect(relacion).toBe('inmediatamente antes');
});

test('con la sincronizacion SANA la senal no lleva color de aviso', async ({ paginaAdmin }) => {
  const { gestionada, segunda, tercera, externa } = escenario;
  await fijarSaludDeSync(servicio, gestionada.id, 'sana', [
    segunda.id,
    tercera.id,
    externa.id,
  ]);

  await paginaAdmin.goto('/operacion');

  const senal = paginaAdmin.locator('[data-slot="senal-calendario"]');
  await expect(senal).toHaveAttribute('data-estado', 'sana');

  // El icono de la rama sana es el de calendario CORRECTO. Se afirma la SILUETA por
  // la clase que emite lucide y NO solo por el nombre accesible: ver la cabecera de
  // `siluetaDeLaSenal`.
  await expect(senal.getByRole('img', { name: 'Calendario sincronizando' })).toBeVisible();
  await expect(siluetaDeLaSenal(paginaAdmin)).toHaveClass(/lucide-calendar-check/);

  // Y el color NO es el de aviso: la senal no compite cuando todo va bien, que es la
  // mitad de lo que el dueno pidio.
  const colorSano = await senal.evaluate((el) => getComputedStyle(el).color);
  const colorDeAviso = await colorDelTokenDeAviso(paginaAdmin);
  expect(colorSano).not.toBe(colorDeAviso);
});

test('con la sincronizacion CAIDA cambia la silueta, el color Y aparece texto visible', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, externa } = escenario;
  await fijarSaludDeSync(servicio, gestionada.id, 'caida', [
    segunda.id,
    tercera.id,
    externa.id,
  ]);

  await paginaAdmin.goto('/operacion');

  const senal = paginaAdmin.locator('[data-slot="senal-calendario"]');
  await expect(senal).toHaveAttribute('data-estado', 'caida');

  // LAS TRES COSAS, y las tres se afirman: 04-UI-SPEC §5 prohibe el color como UNICO
  // canal, y un punto neutro contra un punto rojo se diferencian solo por el color.
  //
  // ── EL ORDEN DE LAS TRES NO ES NARRATIVO, ES PARA PODER MEDIR EL SENUELO ──
  //
  // El color va PRIMERO a proposito. El senuelo de "solo color" (dejar
  // `CalendarCheck` en las dos ramas) tiene que dejar medido, EN LA MISMA CORRIDA,
  // que el color sigue en verde y que lo que cae es la silueta. Con la silueta
  // primero, la corrida se detiene ahi y del color no queda medicion: solo el
  // razonamiento de que no deberia haber cambiado, que es justo lo que este plan no
  // acepta como evidencia.
  //
  //   1. EL COLOR, que sale de `--status-warn` y no de `--destructive`: ese esta
  //      reservado a acciones destructivas, y un tercer rojo pondria tres rojos en
  //      una pantalla (D-05-5).
  const colorCaido = await senal.evaluate((el) => getComputedStyle(el).color);
  expect(colorCaido).toBe(await colorDelTokenDeAviso(paginaAdmin));

  //   2. LA SILUETA. `CalendarX`, el mismo icono que la alerta `calendario_caido` ya
  //      usa, asi que el admin lo aprende una vez. Y se afirma por la clase del glifo
  //      y no por el nombre accesible: ver `siluetaDeLaSenal`.
  await expect(senal.getByRole('img', { name: 'Calendario caído' })).toBeVisible();
  await expect(siluetaDeLaSenal(paginaAdmin)).toHaveClass(/lucide-calendar-x/);
  await expect(siluetaDeLaSenal(paginaAdmin)).not.toHaveClass(/lucide-calendar-check/);

  //   3. EL TEXTO VISIBLE, que es el canal de mas ancho de banda que hay.
  await expect(senal).toContainText('Calendario caído');
});

test('NINGUNA metrica del vistazo lleva borde, fondo ni sombra', async ({ paginaAdmin }) => {
  const { gestionada, fechas } = escenario;
  await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  await paginaAdmin.goto('/operacion');

  // D-05-6 y el principio de DATA INK que el dueno enuncio: ni bordes, ni sombras,
  // ni decoracion que no comunique nada. Es la divergencia DECLARADA con
  // `TarjetaKPI` de `/finanzas`, que es una card con borde y fondo a proposito.
  //
  // Se mide sobre el ESTILO COMPUTADO y no sobre la lista de clases: una clase que no
  // este en el archivo puede llegar de un `@apply` o de un ancestro.
  const metricas = paginaAdmin.locator('[data-slot="metrica-dia"]');
  await expect(metricas).toHaveCount(4);

  const estilos = await metricas.evaluateAll((nodos) =>
    nodos.map((n) => {
      const s = getComputedStyle(n);
      return {
        anchoDeBorde: s.borderTopWidth,
        sombra: s.boxShadow,
        fondo: s.backgroundColor,
      };
    }),
  );

  for (const estilo of estilos) {
    expect(estilo.anchoDeBorde).toBe('0px');
    expect(estilo.sombra).toBe('none');
    // `rgba(0, 0, 0, 0)` es el transparente que emite el motor cuando no hay fondo.
    expect(estilo.fondo).toBe('rgba(0, 0, 0, 0)');
  }
});

/**
 * EL SVG DE LA SENAL DE CALENDARIO, PARA AFIRMAR SU **SILUETA**.
 *
 * ── POR QUE LA CLASE DE LUCIDE Y NO EL NOMBRE ACCESIBLE. MEDIDO ───────────
 *
 * El nombre accesible NO ES LA SILUETA. El senuelo 4 del plan (pintar la rama caida
 * solo con color, dejando `CalendarCheck` en las dos ramas y cambiando unicamente el
 * `aria-label`) **paso en VERDE** contra
 * `getByRole('img', { name: 'Calendario caido' })`: el rol y el nombre casaban igual
 * con el icono equivocado. Medido el 2026-09-28.
 *
 * `lucide-react` emite `class="lucide lucide-calendar-x …"`, y ese nombre ES la
 * identidad del glifo. Es un detalle de implementacion de la libreria y se usa a
 * sabiendas: es el unico gancho estable que distingue DOS DIBUJOS, que es lo que
 * 04-UI-SPEC §5 exige cuando prohibe el color como unico canal. La alternativa,
 * afirmar los `path` a mano, se rompe con cualquier retoque del glifo y no dice nada
 * al leerla.
 */
function siluetaDeLaSenal(p: Page) {
  return p.locator('[data-slot="senal-calendario"] svg');
}

/**
 * El valor RESUELTO de `--status-warn`, leido del documento y no escrito a mano.
 *
 * Un hex literal en el test seria una segunda copia del token: el dia que el contrato
 * de color mueva el valor, la asercion se pondria roja contra un codigo correcto. Se
 * resuelve pintando el token en un elemento de sonda y leyendo su color computado,
 * que es lo unico que devuelve la misma forma (`rgb(...)`) que `getComputedStyle`.
 */
async function colorDelTokenDeAviso(p: Page): Promise<string> {
  return p.evaluate(() => {
    const sonda = document.createElement('span');
    sonda.style.color = 'var(--status-warn)';
    document.body.append(sonda);
    const color = getComputedStyle(sonda).color;
    sonda.remove();
    return color;
  });
}

// ───────────────────────────────────────────────────────────────────────────
// 1.d LAS DOS COLUMNAS Y LA TARJETA — el rediseño del plan 10-05
//
// ── QUE MIDE ESTE BLOQUE ──────────────────────────────────────────────────
//
// La estructura que el dueño describio el 2026-09-28: dos columnas al 30 y al 70
// que scrollean POR DENTRO, una tarjeta por aseo con el sin confirmar como estado
// visual, y una columna derecha que nunca esta vacia.
//
// Todas las medidas se toman a 1280x720, que es el viewport por defecto de
// `devices['Desktop Chrome']` y el minimo soportado del proyecto (02-UI-SPEC §6.3).
// ───────────────────────────────────────────────────────────────────────────

test('a 1280 las dos columnas miden 360 y 840, con 32 de hueco', async ({ paginaAdmin }) => {
  const { gestionada, fechas } = escenario;
  await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  await paginaAdmin.goto('/operacion');

  // La aritmetica esta escrita entera en `@utility rejilla-operacion`: a 1280 los
  // utiles son 1232 (viewport menos los 24px de `px-xl` por lado), el 30% da 360 y
  // el 70% da 840. **Son las dos medidas de la pantalla vieja intercambiadas de
  // lado**: 360 era el carril lateral y 840 el ancho.
  const medidas = await paginaAdmin.evaluate(() => {
    const rejilla = document.querySelector('[data-slot="rejilla-dia"]');
    if (rejilla === null) return null;
    const hijos = [...rejilla.children].map((h) => Math.round(h.getBoundingClientRect().width));
    const cajas = [...rejilla.children].map((h) => h.getBoundingClientRect());
    return {
      hijos,
      hueco: cajas.length === 2 ? Math.round(cajas[1].left - cajas[0].right) : -1,
    };
  });

  expect(medidas).not.toBeNull();
  expect(medidas?.hijos).toEqual([360, 840]);
  expect(medidas?.hueco).toBe(32);
});

test('con TREINTA tarjetas en el dia la PAGINA no scrollea: scrollea la lista', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, cuarta, quinta, sexta, fechas } = escenario;
  const unidades = [gestionada, segunda, tercera, cuarta, quinta, sexta];

  /**
   * ── TREINTA EN UN DIA, Y HACEN FALTA LOS CANCELADOS PARA LLEGAR ──────────
   *
   * El indice unico parcial `cleanings_one_active_per_property_date` deja UN aseo
   * ACTIVO por apartamento y fecha, asi que con seis unidades el techo de activos
   * en un dia es seis. Su clausula `where` excluye los cancelados, asi que de
   * cancelados si caben varios por apartamento y fecha.
   *
   * Seis activos mas veinticuatro cancelados, con el toggle puesto, dan treinta
   * tarjetas en pantalla. **Y son tarjetas de verdad**: una cancelada mide y ocupa
   * exactamente lo mismo que una pendiente, que es lo unico que esta medicion
   * necesita. Treinta activos pedirian treinta apartamentos sembrados.
   */
  const filas: AseoASembrar[] = unidades.map((u) => ({ propiedad: u.id, fecha: fechas.hoy }));
  for (let i = 0; i < 4; i += 1) {
    for (const unidad of unidades) {
      filas.push({ propiedad: unidad.id, fecha: fechas.hoy, estado: 'cancelada' });
    }
  }
  await sembrarAseos(servicio, filas);

  await paginaAdmin.goto('/operacion');
  await paginaAdmin.getByRole('button', { name: 'Ver cancelados (24)' }).click();
  await expect(paginaAdmin.locator('[data-slot="tarjeta-aseo"]')).toHaveCount(30);

  const medidas = await paginaAdmin.evaluate(() => {
    const lista = document.querySelector('[data-slot="lista-dia"] ul');
    return {
      documentoScrollea: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      alturaDoc: document.documentElement.scrollHeight,
      clienteDoc: document.documentElement.clientHeight,
      listaScrollea: lista === null ? null : lista.scrollHeight > lista.clientHeight,
    };
  });

  // LA PAGINA NO SCROLLEA. Si esto sale rojo con un `scrollHeight` 48 mayor que el
  // `clientHeight`, la causa es la barra de ambiente de pruebas: mide 48px, se pinta
  // en todo entorno que no sea produccion —incluido este— y su resta tiene que estar
  // dentro del `calc()` de la altura del contenedor de pagina.
  expect(
    medidas.documentoScrollea,
    `el documento scrollea: ${medidas.alturaDoc} contra ${medidas.clienteDoc}`,
  ).toBe(false);

  // Y LA QUE SCROLLEA ES LA LISTA. Sin esta mitad, la de arriba pasaria tambien en
  // una pantalla que recortara las treinta tarjetas sin dar forma de verlas.
  expect(medidas.listaScrollea).toBe(true);
});

test('cada aseo es UNA tarjeta, y la del sin confirmar se distingue SIN abrir nada', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, aseadoraA, fechas } = escenario;

  await sembrarAseos(servicio, [
    // Sin confirmar: `confirmado_at` nulo y `pendiente`.
    { propiedad: gestionada.id, fecha: fechas.hoy },
    // Confirmada y asignada: pendiente a secas.
    { propiedad: segunda.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  await paginaAdmin.goto('/operacion');

  const tarjetas = paginaAdmin.locator('[data-slot="tarjeta-aseo"]');
  await expect(tarjetas).toHaveCount(2);

  /**
   * ── EL SIN CONFIRMAR ES UN ESTADO DE LA TARJETA, NO UNA SECCION ──────────
   *
   * Se mide sobre `data-estado`, que es la CLAVE DEL DOMINIO y no su traduccion:
   * una asercion sobre el texto `Sin confirmar` se rompe el dia que alguien
   * reescriba la copia, y ademas ese texto tambien lo pinta el rotulo de la metrica
   * del vistazo.
   */
  const sinConfirmar = tarjetaDe(paginaAdmin, gestionada.nombre);
  await expect(sinConfirmar.locator('[data-estado]')).toHaveAttribute(
    'data-estado',
    'sin_confirmar',
  );

  // Y LA DE AL LADO NO: es el control que hace que lo de arriba signifique algo.
  await expect(tarjetaDe(paginaAdmin, segunda.nombre).locator('[data-estado]')).toHaveAttribute(
    'data-estado',
    'pendiente',
  );

  // El icono del sin confirmar es el del dominio (`Inbox`), y esa silueta es lo que
  // lo distingue de un vistazo dentro de la misma lista.
  await expect(sinConfirmar.locator('svg').first()).toHaveClass(/lucide-inbox/);
});

test('la lista se ordena por HORA LIMITE, y el sin confirmar NO flota arriba', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, aseadoraA, fechas } = escenario;

  /**
   * ── ESTO INVIERTE A MEDIAS UN CONTRATO ESCRITO, Y POR ESO SE MIDE ────────
   *
   * `TablaDia` decia: los sin confirmar NO flotan arriba porque su superficie es
   * la bandeja del carril, y duplicarlos arriba del dia los listaria dos veces.
   * **Esa razon murio con la bandeja.**
   *
   * La que la sustituye es otra y hay que defenderla con una asercion, no con un
   * comentario: reordenar por estado hace que la MISMA tarjeta cambie de sitio
   * cuando alguien la confirma, debajo del cursor, en una lista que se refresca
   * sola por tiempo real.
   *
   * El sin confirmar se siembra en el MEDIO a proposito: primero y ultimo pasarian
   * por casualidad con varios ordenes distintos.
   */
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, horaLimite: '09:00', aseador: aseadoraA.id, confirmado: true },
    // El del medio, y el unico sin confirmar.
    { propiedad: segunda.id, fecha: fechas.hoy, horaLimite: '12:00' },
    { propiedad: tercera.id, fecha: fechas.hoy, horaLimite: '15:00', aseador: aseadoraA.id, confirmado: true },
  ]);

  await paginaAdmin.goto('/operacion');

  const horas = await paginaAdmin
    .locator('[data-slot="tarjeta-aseo"]')
    .evaluateAll((tarjetas) =>
      tarjetas.map((t) => (t.textContent ?? '').match(/\d{2}:\d{2}/)?.[0] ?? '??'),
    );

  expect(horas).toEqual(['09:00', '12:00', '15:00']);
});

test('una tarjeta con la hora limite VENCIDA no se tinta, ni cambia de peso, ni de alto', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, aseadoraA, fechas } = escenario;

  /**
   * ── LA PROHIBICION DE 05-UI-SPEC §12.5 NO CADUCA AL CAMBIAR DE FORMA ─────
   *
   * Decia: ninguna FILA atrasada se tinta, ni cambia de peso, ni de alto, porque lo
   * que la distinguia era el bloque `Atrasados`, un canal de mucho mas ancho de
   * banda que un tinte. El bloque murio; el canal que lo sustituye es el SELECTOR DE
   * DIA, que es mas ancho todavia: no es que la tarjeta se vea distinta, es que
   * estas mirando otro dia.
   *
   * Se siembran dos aseos del MISMO dia, los dos confirmados para que el borde de
   * estado del sin confirmar no participe, y con horas limite a los dos lados del
   * reloj. El primero esta VENCIDO —lo dice su `Hourglass`— y el segundo no.
   */
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, horaLimite: '00:00', aseador: aseadoraA.id, confirmado: true },
    { propiedad: segunda.id, fecha: fechas.hoy, horaLimite: '23:59', aseador: aseadoraA.id, confirmado: true },
  ]);

  await paginaAdmin.goto('/operacion');

  const vencida = tarjetaDe(paginaAdmin, gestionada.nombre);
  const alDia = tarjetaDe(paginaAdmin, segunda.nombre);

  // CONTROL: la vencida SI lo dice, y lo dice con la señal inline del dominio. Sin
  // esta mitad, las comparaciones de abajo pasarian sobre dos tarjetas que la
  // pantalla no distingue en absoluto y no probarian nada.
  await expect(vencida.getByRole('img', { name: 'Se venció la hora límite' })).toBeVisible();
  await expect(alDia.getByRole('img', { name: 'Se venció la hora límite' })).toHaveCount(0);

  // Y AHORA LAS TRES QUE LA PROHIBICION NOMBRA. Se mide el estilo COMPUTADO y no la
  // lista de clases: una clase que no este en el archivo puede llegar de un ancestro.
  const [estiloVencida, estiloAlDia] = await Promise.all(
    [vencida, alDia].map((t) =>
      t.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          fondo: s.backgroundColor,
          peso: s.fontWeight,
          alto: (el as HTMLElement).offsetHeight,
        };
      }),
    ),
  );

  expect(estiloVencida.fondo, 'NO SE TINTA').toBe(estiloAlDia.fondo);
  expect(estiloVencida.peso, 'NO CAMBIA DE PESO').toBe(estiloAlDia.peso);
  expect(estiloVencida.alto, 'NO CAMBIA DE ALTO').toBe(estiloAlDia.alto);
});

test('la franja de carga dice DE QUE DIA habla, y no siempre `Carga de hoy`', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.manana, aseador: aseadoraA.id, confirmado: true },
  ]);

  // En HOY dice lo de siempre, que es el literal que las tres unitarias de
  // `FranjaCarga.test.ts` afirman y que sigue siendo el default de la prop.
  await paginaAdmin.goto('/operacion');
  await expect(paginaAdmin.locator('[data-slot="info-dia"]')).toContainText('Carga de hoy');

  // Y en otro dia dice ESE dia. `Carga de hoy` mientras la pantalla esta en el
  // viernes es una mentira pequeña y constante: el dato es correcto y responde a la
  // pregunta equivocada.
  await paginaAdmin.goto(`/operacion?dia=${fechas.manana}`);
  const info = paginaAdmin.locator('[data-slot="info-dia"]');
  await expect(info).toContainText(`Carga del ${formatFechaLargaBog(fechas.manana)}`);
  await expect(info).not.toContainText('Carga de hoy');
});

test('NO existe ninguna seccion `Sin confirmar`: la bandeja murio', async ({ paginaAdmin }) => {
  const { gestionada, fechas } = escenario;
  await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  await paginaAdmin.goto('/operacion');

  // `BandejaSinConfirmar` renderizaba un `<h2>Sin confirmar</h2>`. Se mide sobre el
  // ROL de encabezado y no sobre el texto: `Sin confirmar` sigue existiendo en la
  // pantalla, como rotulo de la metrica del vistazo y como etiqueta del estado de la
  // tarjeta. Lo que no existe es la SECCION.
  await expect(paginaAdmin.getByRole('heading', { name: 'Sin confirmar' })).toHaveCount(0);

  // Y el estado si esta, en los dos sitios que lo sustituyen.
  await expect(paginaAdmin.locator('[data-metrica="sin-confirmar"]')).toHaveCount(1);
  await expect(paginaAdmin.locator('[data-estado="sin_confirmar"]')).toHaveCount(1);
});

test('sin seleccion, la columna derecha NO esta vacia', async ({ paginaAdmin }) => {
  const { gestionada, aseadoraA, fechas } = escenario;
  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  await paginaAdmin.goto('/operacion');

  // Lo pidio el dueño con esas palabras: **nunca una caja vacia**. Una columna del
  // 70% del ancho esperando a que alguien pulse algo ocupa el sitio mas grande de la
  // pantalla y no dice nada, asi que el admin aprende a no mirarla.
  const info = paginaAdmin.locator('[data-slot="info-dia"]');
  await expect(info).toBeVisible();

  // Las piezas que el contrato nombra.
  await expect(info.getByText('Carga de hoy')).toBeVisible();
  await expect(info.getByRole('heading', { name: 'Desglose' })).toBeVisible();

  /*
    ── `Crear aseo` YA NO SE AFIRMA AQUI, Y LA ASERCION NO SE PIERDE ─────────

    La Task 4 lo puso en este bloque y la Task 5 lo devolvio a la fila de
    cabecera, porque el detalle de un aseo SUSTITUYE a este bloque entero y el
    boton dejaba de ser inalcanzable con un aseo abierto. Lo que aqui se afirmaba
    (que el boton existe y se ve) lo afirma ahora el caso de abajo, y encima con
    el detalle abierto, que es la condicion en la que antes se perdia.
  */
  await expect(
    paginaAdmin.getByRole('button', { name: 'Crear aseo' }),
    'el boton sigue existiendo, ahora en la cabecera y no en esta columna',
  ).toBeVisible();
});

test('`Crear aseo` sigue alcanzable CON EL DETALLE ABIERTO', async ({ paginaAdmin }) => {
  const { gestionada, aseadoraA, fechas } = escenario;
  const [idAseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  /**
   * ════════════════════════════════════════════════════════════════════════
   * LA COMPUERTA DE LA DECISION QUE LA TASK 5 TUVO QUE TOMAR.
   *
   * La Task 4 bajo `Crear aseo` de la cabecera a `InfoDelDia`, y dejo escrita la
   * consecuencia: **el detalle de un aseo sustituye a `InfoDelDia` entero**, asi
   * que con un aseo abierto el boton dejaba de existir en la pantalla. Un admin
   * que esta mirando un aseo y quiere crear otro tendria que cerrar el que mira.
   *
   * La salida tomada fue devolver el boton a la fila de cabecera, que es el
   * unico bloque que ni el detalle ni la lista sustituyen nunca. La otra salida
   * (una copia dentro del detalle) se descarto: dos controles con el mismo
   * nombre accesible en la misma pantalla es lo que §13 prohibe.
   *
   * Este caso es lo que impide que alguien vuelva a bajarlo sin darse cuenta.
   * ════════════════════════════════════════════════════════════════════════
   */
  await paginaAdmin.goto(`/operacion?aseo=${idAseo}`);
  await expect(paginaAdmin.locator('[data-slot="detalle-aseo"]')).toBeVisible();

  // CONTROL: el bloque que el detalle sustituye NO esta. Sin esta mitad, el caso
  // pasaria tambien en una pantalla donde el detalle no hubiera abierto.
  await expect(
    paginaAdmin.locator('[data-slot="info-dia"]'),
    'CONTROL: con el detalle abierto, `InfoDelDia` no esta en la pantalla',
  ).toHaveCount(0);

  await expect(
    paginaAdmin.getByRole('button', { name: 'Crear aseo' }),
    '`Crear aseo` sigue alcanzable con el detalle abierto: vive en la cabecera, fuera del bloque que el detalle sustituye',
  ).toBeVisible();

  // Y sigue siendo UNO SOLO: una copia dentro del detalle dejaria dos controles
  // con el mismo nombre accesible, que es lo que la decision descarto.
  await expect(paginaAdmin.getByRole('button', { name: 'Crear aseo' })).toHaveCount(1);
});

test('a 1279 la pantalla se APILA y la lista del dia va primero', async ({ paginaAdmin }) => {
  const { gestionada, fechas } = escenario;
  await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  await paginaAdmin.setViewportSize({ width: 1279, height: 720 });
  await paginaAdmin.goto('/operacion');

  // El corte es `xl:` (1280) y no `lg:` (1024): a 1024 los utiles son 976, menos el
  // hueco son 944, y el 30% da 283px, por debajo de los 360 que hacen falta para una
  // tarjeta legible con estado, nombre y hora.
  const apilado = await paginaAdmin.evaluate(() => {
    const rejilla = document.querySelector('[data-slot="rejilla-dia"]');
    if (rejilla === null) return null;
    const cajas = [...rejilla.children].map((h) => h.getBoundingClientRect());
    return {
      // Apilado: las dos cajas arrancan en la MISMA x y a distinta y.
      mismaColumna: cajas.every((c) => Math.round(c.left) === Math.round(cajas[0].left)),
      listaPrimero:
        (rejilla.children[0] as HTMLElement).dataset.slot === 'lista-dia',
    };
  });

  expect(apilado?.mismaColumna).toBe(true);
  // LO QUE SE OPERA VA ANTES DE LO QUE SE CONSULTA. El orden visual apilado es el
  // del DOM, asi que se mide sobre el DOM.
  expect(apilado?.listaPrimero).toBe(true);
});

// ───────────────────────────────────────────────────────────────────────────
// 2. EL FLUJO COMPLETO DEL CRITERIO 3, ENCADENADO SOBRE EL MISMO ASEO
// ───────────────────────────────────────────────────────────────────────────

test('crear, confirmar, reasignar, reprogramar y cerrar, el mismo aseo de punta a punta', async ({
  paginaAdmin,
}) => {
  // Cinco mutaciones encadenadas, cada una con su diálogo, su Server Action y su
  // `router.refresh()`. No cabe en el timeout por defecto de 30 s y no es un
  // síntoma de nada: es lo que dura el criterio 3 completo en un navegador real.
  test.setTimeout(120_000);

  const { gestionada, aseadoraB, fechas } = escenario;

  await paginaAdmin.goto('/operacion');

  // ── (a) CREAR un repaso ──────────────────────────────────────────────────
  await paginaAdmin.getByRole('button', { name: 'Crear aseo' }).click();
  const dialogoCrear = paginaAdmin.getByRole('dialog');

  await dialogoCrear.getByLabel('Apartamento').click();
  await paginaAdmin.getByPlaceholder('Busca un apartamento').fill(gestionada.nombre);
  await paginaAdmin.getByRole('option', { name: gestionada.nombre, exact: true }).click();

  await dialogoCrear.getByLabel('Fecha').fill(fechas.hoy);

  await dialogoCrear.getByLabel('Tipo').click();
  await paginaAdmin.getByRole('option', { name: 'Repaso', exact: true }).click();

  await dialogoCrear.getByRole('button', { name: 'Crear aseo' }).click();
  await esperarToast(paginaAdmin, 'Aseo creado. Está en la bandeja Sin confirmar.');

  // ── (b) CONFIRMAR desde la bandeja ───────────────────────────────────────
  // La tanda es de uno, así que el primario dice `Confirmar y cerrar` y el toast
  // de cierre es el de tanda completa.
  await paginaAdmin.getByRole('button', { name: 'Confirmar 1 aseo' }).click();

  const sheet = paginaAdmin.getByRole('dialog');
  await expect(sheet.getByText('1 de 1', { exact: true })).toBeVisible();
  // La línea de D-18/§10 que dice a quién queda asignado. `aseadoraA` es la
  // responsable fija del apartamento: confirmar asigna al responsable, no elige.
  await expect(sheet.getByText(`Queda asignado a ${escenario.aseadoraA.nombre}`)).toBeVisible();

  await sheet.getByLabel('Número de huéspedes').fill('3');
  await sheet.getByRole('button', { name: 'Confirmar y cerrar' }).click();
  await esperarToastQueEmpiezaCon(paginaAdmin, 'Listo: 1 aseo confirmado.');

  // ── (c) REASIGNAR ────────────────────────────────────────────────────────
  await menuDelAseo(paginaAdmin, gestionada.nombre, fechas.hoy).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Reasignar', exact: true }).click();

  const dialogoReasignar = paginaAdmin.getByRole('dialog');
  // D-18 va escrito en el diálogo y siempre visible: reasignar es puntual y NO
  // toca el catálogo. Es la mitad de producto de lo que la RPC garantiza.
  await expect(
    dialogoReasignar.getByText('No cambia el responsable ni el suplente del apartamento.'),
  ).toBeVisible();

  await dialogoReasignar.getByLabel('Aseador').click();
  await paginaAdmin.getByRole('option', { name: aseadoraB.nombre, exact: true }).click();
  await dialogoReasignar.getByRole('button', { name: 'Reasignar' }).click();
  // Mismo caso que los dos de arriba: desde la Fase 5 este mensaje lleva
  // ` No tiene los avisos activos: avísale tú.` cuando la persona no tiene
  // canal, y en esta suite NINGUNA lo tiene. Ver `esperarToastQueEmpiezaCon`.
  await esperarToastQueEmpiezaCon(paginaAdmin, `El aseo quedó asignado a ${aseadoraB.nombre}.`);

  // ── (d) REPROGRAMAR a hoy+2 ──────────────────────────────────────────────
  await menuDelAseo(paginaAdmin, gestionada.nombre, fechas.hoy).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Reprogramar', exact: true }).click();

  const dialogoReprogramar = paginaAdmin.getByRole('dialog');
  await dialogoReprogramar.getByLabel('Fecha nueva').fill(fechas.pasado);
  await dialogoReprogramar.getByRole('button', { name: 'Reprogramar' }).click();
  await esperarToast(paginaAdmin, `El aseo quedó para el ${formatFechaBog(fechas.pasado)}.`);

  // ── (e) CERRAR MANUALMENTE, ya en el DIA NUEVO ──────────────────────────
  //
  // ── REESCRITO EN EL PLAN 10-05, Y EL PASO SE SIMPLIFICO ──────────────────
  //
  // Antes habia que abrir DOS bloques: `Siguientes` y, dentro, el dia. El segundo
  // era una consecuencia real del diseño viejo que el caso tenia escrita: ese dia
  // nacia colapsado porque al MONTAR la pantalla tenia cero filas, y el
  // `router.refresh()` de la reprogramacion traia la fila sin volver a montar el
  // bloque.
  //
  // Con el eje del dia, reprogramar saca el aseo del dia que esta en pantalla y
  // hay que IR a su dia nuevo. Es mas trabajo para el admin que expandir un bloque
  // —una navegacion contra un clic— y a cambio la pantalla no tiene tres listas
  // apiladas. Es la decision del rediseño, vista desde el unico sitio donde
  // cuesta.
  //
  // Y ANTES DE IR, EL CONTROL: el aseo ya NO esta en el dia de hoy. Sin el, la
  // asercion de abajo pasaria sobre una pantalla que renderizara la ventana
  // entera.
  await expect(tarjetaDe(paginaAdmin, gestionada.nombre)).toHaveCount(0);

  await paginaAdmin.goto(`/operacion?dia=${fechas.pasado}`);
  await expect(tarjetaDe(paginaAdmin, gestionada.nombre)).toHaveCount(1);

  await menuDelAseo(paginaAdmin, gestionada.nombre, fechas.pasado).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Cerrar manualmente', exact: true }).click();

  const dialogoCerrar = paginaAdmin.getByRole('alertdialog');
  await expect(
    dialogoCerrar.getByText('Queda como terminado, sin checklist y sin fotos.'),
  ).toBeVisible();
  await dialogoCerrar.getByRole('button', { name: 'Cerrar aseo' }).click();
  await esperarToast(paginaAdmin, 'El aseo quedó cerrado.');

  // ── LA ASERCIÓN QUE CIERRA LOS CINCO PASOS ───────────────────────────────
  // Los toasts dicen lo que la pantalla cree; esto dice lo que quedó escrito. Un
  // diálogo que muestre el mensaje correcto y no llame a la RPC pasa los cinco
  // toasts y se cae aquí.
  const { data: aseo, error } = await servicio
    .from('cleanings')
    .select('state, aseador_id, scheduled_date, num_huespedes, tipo, confirmado_at, finished_at')
    .eq('property_id', gestionada.id)
    .single();
  if (error || !aseo) throw new Error(`No se pudo releer el aseo: ${error?.message}`);

  expect(aseo.state).toBe('completada');
  expect(aseo.aseador_id).toBe(aseadoraB.id);
  expect(aseo.scheduled_date).toBe(fechas.pasado);
  expect(aseo.num_huespedes).toBe(3);
  expect(aseo.tipo).toBe('repaso');
  expect(aseo.confirmado_at).not.toBeNull();
  expect(aseo.finished_at).not.toBeNull();
});

// ───────────────────────────────────────────────────────────────────────────
// 3. CANCELAR, Y EL BOTÓN DE DESCARTE QUE NO PUEDE LLAMARSE `Cancelar`
// ───────────────────────────────────────────────────────────────────────────

test('cancelar un aseo, y el descarte del diálogo dice Volver y nunca Cancelar', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  const [idAseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  await paginaAdmin.goto('/operacion');

  await menuDelAseo(paginaAdmin, gestionada.nombre, fechas.hoy).click();
  await paginaAdmin.getByRole('menuitem', { name: 'Cancelar aseo', exact: true }).click();

  const dialogo = paginaAdmin.getByRole('alertdialog');
  await expect(
    dialogo.getByRole('heading', { name: `Cancelar el aseo de ${gestionada.nombre}` }),
  ).toBeVisible();

  // ── EL PUNTO DEL TEST (UI-SPEC §12.5) ────────────────────────────────────
  // En un diálogo que se llama "Cancelar el aseo", un botón `Cancelar` es
  // ambiguo hasta la parálisis: no se sabe si cancela el aseo o cierra el
  // diálogo. `exact: true` en las dos mitades y no es estilo: `Cancelar aseo`
  // CONTIENE `Cancelar`, así que sin él la aserción negativa se cumpliría con el
  // botón primario y no probaría nada.
  await expect(dialogo.getByRole('button', { name: 'Volver', exact: true })).toBeVisible();
  await expect(dialogo.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0);

  await dialogo.getByRole('button', { name: 'Cancelar aseo', exact: true }).click();
  await esperarToast(paginaAdmin, 'El aseo quedó cancelado.');

  const { data: aseo, error } = await servicio
    .from('cleanings')
    .select('state, cancel_reason')
    .eq('id', idAseo)
    .single();
  if (error || !aseo) throw new Error(`No se pudo releer el aseo: ${error?.message}`);

  expect(aseo.state).toBe('cancelada');
  // El slug lo escribe la RPC y es literal: `cancel_cleaning` no acepta motivo
  // por parámetro (señuelo 7 de la bitácora de la fase).
  expect(aseo.cancel_reason).toBe('cancelado_por_admin');

  // Y la fila NO desaparece del día: se pliega detrás del toggle de cancelados.
  await expect(paginaAdmin.getByRole('button', { name: 'Ver cancelados (1)' })).toBeVisible();
});

// ───────────────────────────────────────────────────────────────────────────
// 4. ASEO-07 LEGIBLE: EL ERROR VA BAJO EL CAMPO DE FECHA, NUNCA EN UN TOAST
// ───────────────────────────────────────────────────────────────────────────

test('crear sobre una fecha ya ocupada da el error BAJO el campo de fecha, sin códigos de Postgres', async ({
  paginaAdmin,
}) => {
  const { segunda, fechas } = escenario;

  await sembrarAseos(servicio, [{ propiedad: segunda.id, fecha: fechas.manana }]);

  await paginaAdmin.goto('/operacion');
  await paginaAdmin.getByRole('button', { name: 'Crear aseo' }).click();

  const dialogo = paginaAdmin.getByRole('dialog');
  await dialogo.getByLabel('Apartamento').click();
  await paginaAdmin.getByPlaceholder('Busca un apartamento').fill(segunda.nombre);
  await paginaAdmin.getByRole('option', { name: segunda.nombre, exact: true }).click();
  await dialogo.getByLabel('Fecha').fill(fechas.manana);
  await dialogo.getByRole('button', { name: 'Crear aseo' }).click();

  const mensaje =
    `Ya hay un aseo activo para ${segunda.nombre} el ${formatFechaBog(fechas.manana)}. ` +
    'Reprograma el que existe o cancélalo antes de crear otro.';

  // (a) El texto está, con el NOMBRE del apartamento y la FECHA dentro.
  const error = dialogo.getByText(mensaje, { exact: true });
  await expect(error).toBeVisible();

  // (b) Y está ATADO al campo de fecha por `aria-describedby`, no suelto en el
  //     diálogo. Es lo que hace que un lector de pantalla lo lea al llegar al
  //     input, y lo que distingue "el error de este campo" de "un párrafo rojo".
  const campoFecha = dialogo.getByLabel('Fecha');
  await expect(campoFecha).toHaveAttribute('aria-invalid', 'true');
  const idError = await campoFecha.getAttribute('aria-describedby');
  expect(idError).toBeTruthy();
  await expect(paginaAdmin.locator(`#${idError}`)).toHaveText(mensaje);

  // (c) NO en un toast (D-19). El diálogo sigue abierto y con lo tecleado, así
  //     que el admin corrige el día sin volver a elegir apartamento y tipo.
  await expect(paginaAdmin.locator('[data-sonner-toast]')).toHaveCount(0);
  await expect(dialogo).toBeVisible();

  // (d) Y el texto no filtra vocabulario de máquina (T-04-12).
  const texto = (await error.textContent()) ?? '';
  expect(texto).not.toContain('23505');
  expect(texto.toLowerCase()).not.toContain('constraint');
});

// ───────────────────────────────────────────────────────────────────────────
// 5. EL SHEET ENCADENADO: SEIS, CONFIRMAR TRES Y CERRAR A MITAD
// ───────────────────────────────────────────────────────────────────────────

test('confirmar tres de seis y cerrar a mitad NO pierde lo confirmado', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, cuarta, quinta, sexta, fechas } = escenario;

  /**
   * ── LA TANDA BAJO DE QUINCE A SEIS, Y NO ES UN AFLOJAMIENTO (D-05-8) ─────
   *
   * Antes eran quince: tres apartamentos por cinco dias. La tanda confirmaba los
   * sin confirmar de la VENTANA ENTERA, asi que lo escaso era el APARTAMENTO —el
   * indice unico parcial deja UN aseo activo por apartamento y fecha— y el dia daba
   * holgura.
   *
   * La tanda paso a ser POR DIA, porque el dueño pidio que todo salga de la fecha
   * del selector sin excepcion. **El indice unico sigue ahi**, asi que quince sin
   * confirmar EN UN SOLO DIA exigirian quince apartamentos sembrados.
   *
   * Seis es lo MINIMO que permite confirmar tres y cerrar A MITAD, que es la
   * propiedad que este caso defiende y que no se toca. **Lo escaso paso a ser el
   * apartamento y no el dia.**
   *
   * Y lo que hay que dejar escrito porque se pierde: la calibracion del `Sheet`
   * para quince es una AFIRMACION DE DISEÑO (§10) y NO un requisito de este test.
   * Que corra con seis no dice nada sobre si quince siguen cabiendo; eso lo dice el
   * contrato, y volver a medirlo pediria quince apartamentos, no quince dias.
   */
  await sembrarAseos(
    servicio,
    [gestionada, segunda, tercera, cuarta, quinta, sexta].map((unidad) => ({
      propiedad: unidad.id,
      fecha: fechas.hoy,
    })),
  );

  await paginaAdmin.goto('/operacion');

  const cta = paginaAdmin.getByRole('button', { name: 'Confirmar 6 aseos' });
  await expect(cta).toBeVisible();
  await cta.click();

  const sheet = paginaAdmin.getByRole('dialog');

  /**
   * EL ANCHO DEL `Sheet`, MEDIDO. 480px es D-09, y esta aserción existe porque
   * el panel llegó a medir OCHO PÍXELES en el build de producción y ninguna otra
   * capa de prueba podía verlo: el DOM era correcto, el árbol de accesibilidad
   * era correcto, y las quince filas de la tanda estaban ahí. Lo único falso era
   * la geometría. Ver el resumen del plan 04-14 y la cabecera de `lib/utils.ts`.
   */
  const caja = await sheet.boundingBox();
  if (!caja) throw new Error('El Sheet no tiene caja: no se pudo medir.');
  expect(caja.width).toBe(480);

  for (let i = 1; i <= 3; i += 1) {
    await expect(sheet.getByText(`${i} de 6`, { exact: true })).toBeVisible();

    const campo = sheet.getByLabel('Número de huéspedes');
    // §16.3: al encadenar, el foco vuelve al campo de huéspedes y no se queda en
    // el botón que se acaba de pulsar. Es la mitad de la fricción de quince
    // seguidas que sí se puede medir.
    await expect(campo).toBeFocused();
    await campo.fill(String(i));
    await sheet.getByRole('button', { name: 'Confirmar y seguir' }).click();
  }

  // Cerrar A MITAD, en el cuarto. El `Cerrar` que se pulsa es el DEL PIE, y por
  // eso se busca dentro del `<form>`: la primitiva `Sheet` monta además su propia
  // aspa de cierre, cuyo nombre accesible es también `Cerrar` (el `sr-only` que
  // el plan 02 tradujo del CLI). Sin acotar, Playwright falla por strict mode, y
  // acotar con `.first()` dejaría el test a merced del orden del DOM.
  await expect(sheet.getByText('4 de 6', { exact: true })).toBeVisible();
  await sheet.locator('form').getByRole('button', { name: 'Cerrar', exact: true }).click();

  await esperarToastQueEmpiezaCon(
    paginaAdmin,
    'Confirmaste 3 de 6. Los demás siguen en la bandeja.',
  );

  // La lista del dia queda con tres por confirmar.
  await expect(paginaAdmin.getByRole('button', { name: 'Confirmar 3 aseos' })).toBeVisible();

  // ── D-10 EN LA BASE, QUE ES DONDE IMPORTA ────────────────────────────────
  // Lo confirmado NO se pierde jamás: cada aseo se escribió en su propia llamada.
  // Un `Sheet` que acumulara la tanda en memoria y la escribiera al final pasa
  // todos los asserts de pantalla de arriba y se cae aquí.
  const { data: confirmados, error } = await servicio
    .from('cleanings')
    .select('id, num_huespedes, aseador_id')
    .in('property_id', [gestionada, segunda, tercera, cuarta, quinta, sexta].map((u) => u.id))
    .not('confirmado_at', 'is', null);
  if (error) throw new Error(error.message);

  expect(confirmados).toHaveLength(3);
  // Y confirmar ASIGNA EN FIRME (criterio 1): ninguno quedó sin dueño.
  for (const fila of confirmados ?? []) {
    expect(fila.aseador_id).toBe(escenario.aseadoraA.id);
  }
  expect((confirmados ?? []).map((f) => f.num_huespedes).sort()).toEqual([1, 2, 3]);
});

/** `sumarDias` local, para no arrastrar el import solo por el bucle de arriba. */
function diaSumado(fecha: string, dias: number): string {
  const [ano, mes, dia] = fecha.split('-').map(Number);
  const instante = new Date(Date.UTC(ano, mes - 1, dia));
  instante.setUTCDate(instante.getUTCDate() + dias);
  return instante.toISOString().slice(0, 10);
}

// ───────────────────────────────────────────────────────────────────────────
// 6. LA FILA INERTE DE GESTIÓN EXTERNA (DASH-07, D-20)
// ───────────────────────────────────────────────────────────────────────────

test('una unidad de gestión externa aparece en el día, con su contacto, y SIN menú de acciones', async ({
  paginaAdmin,
}) => {
  const { gestionada, externa, aseadoraA, fechas } = escenario;

  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
    { propiedad: externa.id, fecha: fechas.hoy },
  ]);

  await paginaAdmin.goto('/operacion');

  // ── REESCRITO EN EL PLAN 10-05: DE FILA DE TABLA A TARJETA ──────────────
  //
  // Las CUATRO propiedades que este caso defiende son las mismas y no se aflojo
  // ninguna: la unidad externa esta, lleva su contacto, no tiene menu, y sus dos
  // huecos dicen `no aplica`. Lo unico que cambia es el localizador, porque ya no
  // hay `<table>` y `getByRole('row')` no encuentra nada.
  //
  // Lo que SI se fue es la asercion de la fecha en la cabecera del bloque: esa
  // cabecera murio con los acordeones. **La fecha del dia no se perdio**, la dice
  // el selector, y su caso propio la mide en el bloque 1.b.
  const filaInerte = tarjetaDe(paginaAdmin, externa.nombre);

  // (a) Está, y con su contacto externo: es el "a cargo de quién" que pide
  //     DASH-07. Sacarla a otra vista rompería el panorama del día.
  await expect(filaInerte.getByText(externa.contacto, { exact: true })).toBeVisible();
  await expect(filaInerte.getByText('Gestión externa', { exact: true })).toBeVisible();

  // (b) Y NO tiene menú de acciones. Ni deshabilitado ni atenuado: ausente.
  await expect(filaInerte.getByRole('button', { name: /^Acciones del aseo/ })).toHaveCount(0);

  // (c) CONTROL, y sin él la aserción de arriba pasaría sobre una pantalla que no
  //     renderiza menús en ninguna fila. La fila gestionada del MISMO día sí lo
  //     tiene.
  const filaNormal = tarjetaDe(paginaAdmin, gestionada.nombre);
  await expect(filaNormal.getByRole('button', { name: /^Acciones del aseo/ })).toHaveCount(1);

  // (d) Los dos huecos de la fila inerte se anuncian como `no aplica` y no como
  //     `sin definir`: la base los PROHÍBE por `cl_unmanaged_is_inert`, no es que
  //     falte llenarlos (§7.4).
  await expect(filaInerte.getByText('no aplica').first()).toBeAttached();
  await expect(filaInerte.getByText('sin definir')).toHaveCount(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 7. LA CARGA POR ASEADOR (DASH-03)
// ───────────────────────────────────────────────────────────────────────────

test('la franja lista a todos los aseadores activos con sus ceros, Sin asignar al final, y ningún chip es clicable', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, aseadoraA, aseadoraB, fechas } = escenario;

  await sembrarAseos(servicio, [
    // Dos para Ana, cero para Bea, y uno sin nadie.
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
    { propiedad: segunda.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
    { propiedad: tercera.id, fecha: fechas.hoy },
  ]);

  await paginaAdmin.goto('/operacion');

  // El `<ul>` de los chips es hermano del encabezado de la franja. Se localiza
  // por esa relación y no por una clase: las clases son de presentación y cambian
  // sin avisar; la estructura es el contrato.
  const chips = paginaAdmin
    .getByRole('heading', { name: 'Carga de hoy' })
    .locator('xpath=following-sibling::ul')
    .getByRole('listitem');

  // (a) TODOS los aseadores activos del sistema, no solo los que tienen trabajo.
  //     "Quién está libre" es la mitad de la decisión del suplente.
  for (const nombre of aseadorasActivas) {
    await expect(chips.filter({ hasText: nombre })).toHaveCount(1);
  }

  // (b) Los ceros VAN. Bea no tiene nada hoy y aun así tiene chip.
  await expect(chips.filter({ hasText: aseadoraB.nombre })).toHaveText(`${aseadoraB.nombre}0`);
  await expect(chips.filter({ hasText: aseadoraA.nombre })).toHaveText(`${aseadoraA.nombre}2`);

  // (c) `Sin asignar` va SIEMPRE último, sin importar su conteo. Con dos aseos
  //     para Ana y uno sin nadie, un orden por conteo lo pondría en medio.
  await expect(chips.last()).toHaveText('Sin asignar1');

  // (d) Y ningún chip es un control. Son `<li>`, no `<button>`: la diferencia
  //     tiene que estar en el DOM y no solo en la ausencia de un manejador. No se
  //     construye filtro por aseador en esta fase.
  await expect(chips.getByRole('button')).toHaveCount(0);
  await expect(chips.getByRole('link')).toHaveCount(0);
});

// ───────────────────────────────────────────────────────────────────────────
// 8. EL CLIC DE UNA ALERTA EXPANDE EL DÍA COLAPSADO (§11.3)
// ───────────────────────────────────────────────────────────────────────────

test('pulsar una alerta de un aseo de MAÑANA lleva al día de ESE aseo y a su fila', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  /**
   * ── ESTE CASO CAMBIO DE MECANISMO Y CONSERVA SU PROPIEDAD (plan 10-05) ────
   *
   * Afirmaba: la alerta de un aseo de MAÑANA expande el bloque `Mañana`, porque su
   * destino era `/operacion#aseo-{id}` y ese bloque nacia colapsado; sin la
   * expansion el clic no llevaba a ninguna parte y tampoco avisaba.
   *
   * Los bloques relativos a hoy ya no existen y la pantalla se filtra por un dia. Lo
   * que garantiza el aterrizaje ahora es **el dia metido en el destino**:
   * `/operacion?dia={scheduled_date}#aseo-{id}`. La propiedad defendida es la misma y
   * es MAS fuerte, porque no depende de que un bloque exista ni de que este abierto.
   *
   * Y el clic se da DENTRO DE LA CAMPANA, que es donde viven las alertas desde este
   * plan.
   */
  const [idAseo] = await sembrarAseos(servicio, [
    {
      propiedad: gestionada.id,
      fecha: fechas.manana,
      aseador: aseadoraA.id,
      confirmado: true,
      urgente: true,
    },
  ]);

  // La sincronización SANA, para que la alerta global de calendario caído no meta
  // una segunda fila en el panel y la de urgente sea inequívoca.
  await fijarSaludDeSync(servicio, gestionada.id, 'sana', [escenario.segunda.id, escenario.tercera.id]);

  await paginaAdmin.goto('/operacion');

  // ── SIN CONTROL DE PARTIDA, Y HAY QUE DECIR POR QUE ────────────────────────
  //
  // Lo natural seria afirmar primero que la fila del aseo de mañana NO ESTA con la
  // pantalla en HOY, para que el `toBeInViewport()` de abajo signifique algo. **Hoy no
  // se puede**, y esta medido: `Expected: 0 / Received: 1`. La Task 3 de 10-05 mete el
  // dia en el destino pero **todavia no ha rediseñado la pantalla**, asi que los tres
  // acordeones relativos a hoy siguen ahi y el bloque `Mañana`, aunque nazca colapsado,
  // renderiza sus filas en el DOM con su ancla.
  //
  // La Task 4 se lleva los acordeones, y ahi este control SI se puede escribir: con la
  // pantalla filtrada por dia, la fila de otro dia no se renderiza.

  await paginaAdmin.locator('[data-slot="campana-alertas"]').click();
  await paginaAdmin.getByRole('link', { name: /^URGENTE: / }).click();

  // El destino lleva el dia del aseo, no el de hoy.
  await esperarUrlDeCliente(paginaAdmin, new RegExp(`dia=${fechas.manana}`));
  expect(paginaAdmin.url()).toContain(`dia=${fechas.manana}`);
  expect(paginaAdmin.url()).toContain(`#aseo-${idAseo}`);

  // Y la fila queda EN EL VIEWPORT, que es la propiedad del caso viejo intacta.
  await expect(paginaAdmin.locator(`#aseo-${idAseo}`)).toBeInViewport();
});

// ───────────────────────────────────────────────────────────────────────────
// 9. EL PANEL DE ASEO: EL CRITERIO 4, EN SUS TRES PIEZAS
// ───────────────────────────────────────────────────────────────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CRITERIO 4 DEL ROADMAP, QUE ES EL ÚNICO QUE NO SE PUEDE AFIRMAR DESDE
 * `/apartamentos`: *"desde Operación, tocar un aseo muestra en qué va:
 * checklist, evidencia y los gastos o daños reportados, sin salir del día"*.
 *
 * ── ESTA CABECERA SE REESCRIBIÓ ENTERA EN EL PLAN 10-05, PORQUE SU HALLAZGO
 *    CAMBIÓ DE SIGNO ──────────────────────────────────────────────────────
 *
 * **Lo que decía hasta hoy:** `SheetContent` se portalea a `document.body`, así
 * que el panel NO vive dentro del contenedor de página, y por eso
 * `getByRole('dialog')` lo acotaba limpiamente. Ese era el mundo del `Sheet`.
 *
 * **Lo que pasa desde el plan 10-05:** el detalle dejó de ser un diálogo y es un
 * nodo INLINE de la columna derecha. O sea que **el portal ya no existe, el rol
 * de diálogo ya no está disponible como ámbito, y el problema que 08-11 midió
 * vuelve entero.** Lo que lo sustituye es un localizador propio:
 * `[data-slot="detalle-aseo"]`, envuelto en `detalleDelAseo()`.
 *
 * ── Y EL HALLAZGO DE 08-11 SIGUE SIENDO EL MISMO, ASÍ QUE SE VOLVIÓ A MEDIR ─
 *
 * 08-11 dejó una salida impresa: con el ámbito equivocado, **dos aserciones de
 * seguridad pasaron en VERDE con la palabra prohibida presente**. Acotar a la
 * pantalla entera tampoco vale, y ahora menos: la lista del día de la izquierda
 * pinta el MISMO nombre de apartamento que el detalle, así que un localizador
 * sin acotar resuelve a dos elementos y revienta en `strict mode violation`, o
 * peor, pasa por accidente.
 *
 * Por eso hay un caso dedicado al final de esta sección (*"CONTROL DE ALCANCE
 * (08-11)"*) que siembra la palabra prohibida FUERA del detalle y comprueba **en
 * los dos sentidos** que el acotado tiene dientes: acotado al detalle sigue en
 * verde, sin acotar se pone rojo. Sin ese control, las aserciones negativas de
 * esta sección son verdaderas por accidente.
 *
 * ── LA COMPUERTA CONTRA QUE ALGUIEN DEVUELVA EL `Sheet` ─────────────────
 *
 * Cada caso que abre el detalle afirma además que el conteo de elementos con rol
 * de diálogo en la pantalla es CERO. El detalle inline no es modal a propósito
 * (no atrapa el foco, no cierra con la tecla de escape, no tapa la lista), y esa
 * decisión hay que poder defenderla de una regresión silenciosa.
 *
 * ── LAS PIEZAS SE AFIRMAN POR SEPARADO, Y CON NÚMEROS ───────────────────
 *
 * Una aserción sobre la FORMA del progreso (`algo/algo`) pasaría con la cuenta
 * mal hecha, que es justo el defecto que importa. Por eso el escenario siembra
 * doce tareas con siete marcadas y la aserción compara contra esos dos números.
 * Lo mismo con la tira: el conteo de casillas y la casilla de `+{N}`.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * El detalle del aseo, por su `data-slot` propio.
 *
 * **Es el ámbito de TODO lo que se lea del detalle, sin excepción.** Ver la
 * cabecera de arriba y el caso de control de alcance del final de la sección.
 */
function detalleDelAseo(p: Page): Locator {
  return p.locator('[data-slot="detalle-aseo"]');
}

/**
 * La compuerta contra que alguien devuelva el `Sheet`: con el detalle abierto,
 * en la pantalla no puede haber NI UN elemento con rol de diálogo.
 *
 * Va como ayudante y no copiada cinco veces para que el día que el detalle
 * vuelva a ser modal caigan los cinco casos a la vez y con el mismo mensaje.
 */
async function sinNingunDialogo(p: Page): Promise<void> {
  await expect(
    p.getByRole('dialog'),
    'el detalle del aseo es INLINE desde el plan 10-05: cero diálogos en la pantalla',
  ).toHaveCount(0);
}

/** Las tareas que se le siembran al aseo del panel, y cuántas quedan hechas. */
const CHECKLIST_TOTAL = 12;
const CHECKLIST_HECHAS = 7;

/**
 * Cuántas fotos tiene el aseo del panel. **Más de seis a propósito**: §10.3
 * pinta seis casillas como mucho, y con más de seis la sexta pasa a ser la de
 * conteo. Con seis o menos esa rama no se ejerce nunca.
 */
const FOTOS_SEMBRADAS = 7;

/** Cuántas miniaturas quedan cuando hay casilla de conteo (`MINIATURAS_VISIBLES - 1`). */
const MINIATURAS_CON_CONTEO = 5;

/**
 * LAS TRES CIFRAS DEL ASEO, DISTINTAS DE LAS DEL APARTAMENTO A PROPÓSITO.
 *
 * Es FIN-01 desde la interfaz: `detalle_de_aseo` devuelve el SNAPSHOT que el
 * trigger copió al crear el aseo, nunca el valor vivo del apartamento. Con las
 * dos cifras iguales, una implementación que uniera `properties` por su alias
 * pasaría la aserción sin haber probado nada. `crearUnidadGestionada()` siembra
 * 120.000 y 45.000; estas no se parecen a esas ni de lejos.
 *
 * El margen va escrito y no calculado: la resta la hace la definer, y
 * recalcularla aquí sería afirmar la misma operación contra sí misma.
 *
 * Y los tres valores son poco probables por accidente, por la misma razón que
 * `CIFRAS_FINANCIERAS`: la sección 11 los busca DENTRO del cuerpo de las
 * respuestas de red, y con un 120.000 ese rastreo daría positivos por azar.
 */
const CIFRAS_DEL_ASEO = { tarifa: 183_947, pago: 52_731, margen: 131_216 } as const;

/** Los cuatro tipos de cuarto del checklist sembrado: 4 cuartos × 3 tareas = 12. */
const TIPOS_DE_CUARTO = ['habitacion', 'bano', 'cocina', 'sala_comedor'] as const;

interface CuartoSembrado {
  id: string;
  etiqueta: string;
  roomTypeId: string;
}

/**
 * Le da cuartos al apartamento del escenario, una sola vez por corrida.
 *
 * `sembrarOperacion()` no siembra ninguno, y sin cuartos no hay checklist que
 * materializar: `cleaning_checklist_items.property_room_id` es NOT NULL con FK.
 * Se crean aquí y no en el sembrador compartido porque son la siembra de ESTA
 * sección, y de ese sembrador dependen catorce casos de tres specs.
 *
 * Caen solos: `property_rooms` cascadea desde `properties`, y `limpiarOperacion`
 * borra el apartamento al final.
 */
async function asegurarCuartos(propiedad: string): Promise<CuartoSembrado[]> {
  const { data: existentes, error } = await servicio
    .from('property_rooms')
    .select('id, etiqueta, room_type_id')
    .eq('property_id', propiedad)
    .order('sort_order');
  if (error) throw new Error(`No se pudieron leer los cuartos: ${error.message}`);

  if ((existentes ?? []).length > 0) {
    return (existentes ?? []).map((c) => ({
      id: c.id,
      etiqueta: c.etiqueta,
      roomTypeId: c.room_type_id,
    }));
  }

  const { data: tipos, error: errorTipos } = await servicio
    .from('room_types')
    .select('id, slug, nombre')
    .in('slug', [...TIPOS_DE_CUARTO]);
  if (errorTipos) throw new Error(`No se pudieron leer los tipos de cuarto: ${errorTipos.message}`);
  if ((tipos ?? []).length !== TIPOS_DE_CUARTO.length) {
    throw new Error(
      `La semilla trae ${(tipos ?? []).length} de los ${TIPOS_DE_CUARTO.length} tipos de cuarto ` +
        'que esta sección necesita. Corre `npm run db:reset`.',
    );
  }

  // El orden es el de la constante y no el que devuelva PostgREST: el total del
  // checklist depende de cuántas tareas tenga cada tipo, y un orden movedizo
  // haría que el `7/12` dependiera del planificador de consultas.
  const ordenados = [...TIPOS_DE_CUARTO].map((slug, i) => {
    const tipo = (tipos ?? []).find((t) => t.slug === slug);
    if (!tipo) throw new Error(`Falta el tipo de cuarto ${slug}`);
    return { ...tipo, etiqueta: `${tipo.nombre} ${i + 1}` };
  });

  const { data: creados, error: errorCrear } = await servicio
    .from('property_rooms')
    .insert(
      ordenados.map((tipo, i) => ({
        property_id: propiedad,
        room_type_id: tipo.id,
        etiqueta: tipo.etiqueta,
        sort_order: i * 10,
      })),
    )
    .select('id, etiqueta, room_type_id');
  if (errorCrear || !creados) {
    throw new Error(`No se pudieron sembrar los cuartos: ${errorCrear?.message}`);
  }

  return ordenados.map((tipo) => {
    const fila = creados.find((c) => c.etiqueta === tipo.etiqueta);
    if (!fila) throw new Error(`No volvió el cuarto ${tipo.etiqueta}`);
    return { id: fila.id, etiqueta: fila.etiqueta, roomTypeId: fila.room_type_id };
  });
}

/** Lo que el checklist sembrado deja, y que las aserciones necesitan saber. */
interface ChecklistSembrado {
  total: number;
  /** La tarea de la que cuelgan las fotos de la tira. */
  primeraTarea: string;
  /** El cuarto de esa tarea: es el título que §10.3 le pone al diálogo de la foto. */
  cuartoDeLaPrimera: string;
}

/**
 * Materializa el checklist de un aseo con `hechas` tareas marcadas.
 *
 * Se escribe a mano y no confirmando el aseo desde la pantalla porque lo que
 * este caso mide es el PANEL, no `confirm_cleaning`: esa cadena la ejerce entera
 * el caso del criterio 3, y pasar por ella aquí ataría el `7/12` a cuántas
 * tareas traiga la biblioteca global el día que alguien la edite. Si la
 * biblioteca cambia, el guarda de abajo lo dice con nombre y apellido en vez de
 * dejar un rojo de aritmética.
 */
async function sembrarChecklist(
  aseo: string,
  cuartos: CuartoSembrado[],
  hechas: number,
): Promise<ChecklistSembrado> {
  const { data: tareas, error } = await servicio
    .from('checklist_tasks')
    .select('id, room_type_id, descripcion, requiere_foto, slot')
    .order('slot');
  if (error) throw new Error(`No se pudieron leer las tareas: ${error.message}`);

  const filas = cuartos.flatMap((cuarto, i) =>
    (tareas ?? [])
      .filter((t) => t.room_type_id === cuarto.roomTypeId)
      .map((t, j) => ({
        cleaning_id: aseo,
        property_room_id: cuarto.id,
        checklist_task_id: t.id,
        room_label: cuarto.etiqueta,
        task_label: t.descripcion,
        requiere_foto: t.requiere_foto,
        sort_order: i * 100 + j,
        done_at: null as string | null,
      })),
  );

  if (filas.length !== CHECKLIST_TOTAL) {
    throw new Error(
      `El checklist sembrado tiene ${filas.length} tareas y las aserciones dicen ${CHECKLIST_TOTAL}. ` +
        'Cambió la biblioteca global de tareas: ajusta la constante y los mensajes.',
    );
  }

  // La marca es el ÚNICO dato que `progresoTotal()` mira, así que no hace falta
  // inventar nada más para que el progreso dé siete de doce.
  const ahora = new Date().toISOString();
  for (let i = 0; i < hechas; i += 1) filas[i].done_at = ahora;

  const { data: insertadas, error: errorInsertar } = await servicio
    .from('cleaning_checklist_items')
    .insert(filas)
    .select('id, sort_order, room_label');
  if (errorInsertar || !insertadas) {
    throw new Error(`No se pudo sembrar el checklist: ${errorInsertar?.message}`);
  }

  // El orden se impone aquí y no en la consulta: PostgREST no promete devolver
  // las filas de un insert múltiple en el orden en que se mandaron, y de cuál
  // sea la primera depende el título del diálogo de la foto.
  const porOrden = [...insertadas].sort((a, b) => a.sort_order - b.sort_order);
  return {
    total: filas.length,
    primeraTarea: porOrden[0].id,
    cuartoDeLaPrimera: porOrden[0].room_label,
  };
}

/**
 * Siembra las fotos de la tira: la primera con bytes de verdad y el resto sin
 * objeto en el bucket.
 *
 * ── LAS DOS MITADES SON EL CASO, NO UN ATAJO DE SIEMBRA ─────────────────
 *
 * La primera existe en el almacenamiento, así que se firma y se pinta como
 * miniatura de verdad, con su botón y su nombre accesible. Las otras seis NO
 * tienen objeto: `createSignedUrl` falla y la lectura devuelve `firma_fallida`,
 * que es exactamente lo que va a producir la purga a treinta días de la Fase 9.
 * §10.3 dice que esa foto **ocupa su sitio** con la casilla de ausencia en vez
 * de desaparecer de la tira, porque hacerla desaparecer haría creer que hubo
 * menos evidencia de la que hubo.
 *
 * Los instantes van explícitos y crecientes: la tira ordena por `created_at` y
 * sin ellos las siete filas compartirían el milisegundo del insert, el desempate
 * caería en el identificador aleatorio, y cuál de las siete es la miniatura de
 * verdad cambiaría entre corridas.
 */
async function sembrarFotosDeLaTira(
  aseo: string,
  tarea: string,
  subidaPor: string,
  sufijo: string,
): Promise<void> {
  const base = Date.now() - 60 * 60 * 1000;

  for (let i = 0; i < FOTOS_SEMBRADAS; i += 1) {
    // La ruta la impone un CHECK de la migración 10:
    // `starts_with(storage_path, cleaning_id || '/' || kind || '/')`.
    const ruta = `${aseo}/checklist/foto-${sufijo}-${i}.jpg`;

    const { error } = await servicio.from('cleaning_photos').insert({
      cleaning_id: aseo,
      kind: 'checklist',
      checklist_item_id: tarea,
      storage_path: ruta,
      mime_type: 'image/jpeg',
      bytes: BYTES_DEL_RECIBO.length,
      uploaded_by: subidaPor,
      created_at: new Date(base + i * 1000).toISOString(),
    });
    if (error) throw new Error(`No se pudo sembrar la foto ${i}: ${error.message}`);

    if (i === 0) {
      const subida = await servicio.storage
        .from('evidencia')
        .upload(ruta, BYTES_DEL_RECIBO, { contentType: 'image/jpeg', upsert: true });
      if (subida.error) {
        throw new Error(`No se pudieron subir los bytes de la foto: ${subida.error.message}`);
      }
      rutasDeFotoSembradas.push(ruta);
    }
  }
}

/**
 * Pisa el snapshot de dinero del aseo.
 *
 * `tg_cleanings_snapshot()` reimpone las dos cifras en un UPDATE **solo si el
 * aseo está en un estado terminal** (`completada` o `cancelada`), que es la
 * congelación de FIN-01. Sobre un aseo `en_curso` el UPDATE se respeta, y por
 * eso el escenario del panel es un aseo en curso y no uno terminado.
 */
async function fijarElDineroDelAseo(aseo: string): Promise<void> {
  const { error } = await servicio
    .from('cleanings')
    .update({ tarifa_huesped: CIFRAS_DEL_ASEO.tarifa, pago_aseador: CIFRAS_DEL_ASEO.pago })
    .eq('id', aseo);
  if (error) throw new Error(`No se pudo fijar el dinero del aseo: ${error.message}`);
}

/**
 * El valor de una fila del panel, a partir de la etiqueta de su término.
 *
 * `FilaDeDato` pinta `<dt>` y `<dd>` como hermanos dentro de un envoltorio, así
 * que el valor es el primer `<dd>` que sigue al término. Buscar el texto suelto
 * no serviría: `sin definir` sale en dos filas del mismo panel.
 */
function valorDeLaFila(detalle: Locator, etiqueta: string): Locator {
  return detalle
    .locator('dt', { hasText: new RegExp(`^${etiqueta}$`) })
    .locator('xpath=following-sibling::dd[1]');
}

test('CRITERIO 4: el panel dice en qué va el aseo, con el progreso, la evidencia, los reportes y el dinero DEL ASEO', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas, sufijo } = escenario;

  // Un aseo EN CURSO: es el estado para el que el panel existe. Uno terminado
  // congelaría el snapshot de dinero y no dejaría sembrar cifras distintas a las
  // del apartamento; uno pendiente no tiene checklist que contar.
  const [idAseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, estado: 'en_curso' },
  ]);

  const cuartos = await asegurarCuartos(gestionada.id);
  const { total, primeraTarea, cuartoDeLaPrimera } = await sembrarChecklist(
    idAseo,
    cuartos,
    CHECKLIST_HECHAS,
  );
  await sembrarFotosDeLaTira(idAseo, primeraTarea, aseadoraA.id, sufijo);
  await fijarElDineroDelAseo(idAseo);

  const concepto = `Jabón y guantes ${sufijo}`;
  const montoDelGasto = 27_419;
  const { error: errorGasto } = await servicio.from('expenses').insert({
    cleaning_id: idAseo,
    property_id: gestionada.id,
    concepto,
    monto: montoDelGasto,
    reported_by: aseadoraA.id,
  });
  if (errorGasto) throw new Error(`No se pudo sembrar el gasto: ${errorGasto.message}`);

  const descripcionDelDano = `Se rompió la persiana ${sufijo}`;
  await sembrarDanos(servicio, [
    {
      aseo: idAseo,
      propiedad: gestionada.id,
      descripcion: descripcionDelDano,
      reportadoPor: aseadoraA.id,
      creadoEnMs: Date.now() - 30 * 60 * 1000,
    },
  ]);

  // La cifra VIVA del apartamento se lee de la base y no se escribe a mano: si
  // el sembrador cambiara sus 120.000, una constante escrita aquí dejaría de ser
  // la contraparte de nada y la aserción de FIN-01 pasaría por vacuidad.
  const { data: apartamento, error: errorApto } = await servicio
    .from('properties')
    .select('tarifa_huesped')
    .eq('id', gestionada.id)
    .single();
  if (errorApto || apartamento?.tarifa_huesped == null) {
    throw new Error(`No se pudo releer la tarifa del apartamento: ${errorApto?.message}`);
  }
  expect(
    apartamento.tarifa_huesped,
    'el escenario EXIGE que la tarifa del apartamento sea distinta de la del aseo',
  ).not.toBe(CIFRAS_DEL_ASEO.tarifa);

  await paginaAdmin.goto('/operacion');

  await pulsarHastaNavegar(
    paginaAdmin,
    paginaAdmin.getByRole('link', { name: `Ver el aseo de ${gestionada.nombre}` }),
    /\?aseo=[0-9a-f-]{36}$/,
  );
  expect(paginaAdmin.url(), 'el enlace de la fila abre el panel del aseo que dice').toContain(
    `aseo=${idAseo}`,
  );

  const detalle = detalleDelAseo(paginaAdmin);
  await expect(detalle).toBeVisible();
  await sinNingunDialogo(paginaAdmin);
  await expect(
    detalle.getByRole('link', { name: gestionada.nombre }),
    'el título del detalle es el nombre del apartamento, y es el único enlace que sale de la sección (§10.2)',
  ).toBeVisible();

  // ── PIEZA 1 DE 4: EL PROGRESO, CON LOS DOS NÚMEROS ──────────────────────
  // La forma sola no basta: `algo/algo` pasaría con la cuenta mal hecha, que es
  // justo el defecto contra el que T-08-22 puso la regla de no contar el
  // checklist en el componente.
  const progreso = (await valorDeLaFila(detalle, 'Checklist').textContent()) ?? '';
  expect(
    progreso,
    `CRITERIO 4 · el progreso del checklist dice ${CHECKLIST_HECHAS}/${total}, los números sembrados`,
  ).toContain(`${CHECKLIST_HECHAS}/${total}`);
  expect(
    progreso,
    'CRITERIO 4 · y lo dice también en texto, porque la barra oblicua se lee mal (§13.2)',
  ).toContain(`Checklist, ${CHECKLIST_HECHAS} de ${total} tareas`);

  // ── PIEZA 2 DE 4: LA TIRA DE EVIDENCIA, CON SU CONTEO ───────────────────
  // El `<ul>` de la tira es la única lista del panel: los cuatro grupos son
  // listas de definición, que no exponen el rol `list`.
  const tira = detalle.getByRole('list');
  await expect(
    tira.getByRole('listitem'),
    'CRITERIO 4 · la tira pinta seis casillas: cinco fotos y la de conteo (§10.3)',
  ).toHaveCount(MINIATURAS_CON_CONTEO + 1);

  await expect(
    detalle.getByRole('button', { name: `Ver la foto de ${cuartoDeLaPrimera}` }),
    'CRITERIO 4 · la foto que SÍ existe se pinta como miniatura, con su nombre accesible',
  ).toHaveCount(1);

  await expect(
    detalle.getByLabel('Foto no disponible'),
    'CRITERIO 4 · una foto sin objeto en el bucket ocupa su sitio en vez de desaparecer de la tira',
  ).toHaveCount(MINIATURAS_CON_CONTEO - 1);

  await expect(
    detalle.getByLabel(`${FOTOS_SEMBRADAS - MINIATURAS_CON_CONTEO} fotos más`),
    'CRITERIO 4 · la casilla de conteo dice cuántas no se ven',
  ).toBeVisible();

  // ── PIEZA 3 DE 4: LOS REPORTES, CON SU PREFIJO Y SU CIFRA ───────────────
  await expect(
    detalle.getByText(`Gasto · ${concepto}`, { exact: true }),
    'CRITERIO 4 · el gasto va con su prefijo (§10.2)',
  ).toBeVisible();
  await expect(
    detalle.getByText(formatCOP(montoDelGasto), { exact: true }),
    'CRITERIO 4 · y con su monto',
  ).toBeVisible();
  await expect(
    detalle.getByText(`Daño · ${descripcionDelDano}`, { exact: true }),
    'CRITERIO 4 · el daño va con el suyo, que es el otro canal de la distinción',
  ).toBeVisible();

  // La línea es obligación del contrato de la Fase 7 (07-UI-SPEC §6.4, D7-2) y
  // solo aparece cuando hay al menos un daño: sin daños no hay nada que aclarar.
  // Aquí es donde más falta hace, porque el pago al aseador va justo debajo.
  await expect(
    detalle.getByText('Los daños no se descuentan del pago.', { exact: true }),
    'CRITERIO 4 · con un daño reportado, la línea de D7-2 está, literal de §15.2',
  ).toBeVisible();

  // ── PIEZA 4 DE 4: EL DINERO SALE DEL ASEO, NUNCA DEL APARTAMENTO ────────
  // Es FIN-01 desde la interfaz. La aserción 105 del bloque P de pgTAP lo afirma
  // desde la base; las dos juntas cierran el camino entero.
  await expect(
    valorDeLaFila(detalle, 'Tarifa al huésped'),
    'FIN-01 · la tarifa del panel es la del ASEO, no la viva del apartamento',
  ).toHaveText(formatCOP(CIFRAS_DEL_ASEO.tarifa));
  await expect(valorDeLaFila(detalle, 'Pago al aseador'), 'FIN-01 · y el pago también').toHaveText(
    formatCOP(CIFRAS_DEL_ASEO.pago),
  );
  await expect(
    valorDeLaFila(detalle, 'Margen'),
    'FIN-01 · el margen llega restado por la definer, no recalculado por la pantalla',
  ).toHaveText(formatCOP(CIFRAS_DEL_ASEO.margen));

  const contenido = (await detalle.textContent()) ?? '';
  expect(
    contenido,
    'FIN-01 · la tarifa viva del apartamento NO aparece en el panel: manda el snapshot del aseo',
  ).not.toContain(formatCOP(apartamento.tarifa_huesped));
});

test('CRITERIO 4: un aseo sin confirmar enseña el checklist como ausente, no como cero de doce', async ({
  paginaAdmin,
}) => {
  const { gestionada, fechas } = escenario;

  // SIN confirmar, que es todo el caso. Las tareas del checklist se materializan
  // al CONFIRMAR (`confirm_cleaning`, migración 04), no al crear el aseo, así que
  // la lectura devuelve cero filas y el progreso da cero de cero. Un `0/12` sería
  // otra cosa completamente distinta: un aseo confirmado, con su checklist
  // puesto, que nadie ha empezado. Ese sí se pinta, con su cero.
  const [idAseo] = await sembrarAseos(servicio, [{ propiedad: gestionada.id, fecha: fechas.hoy }]);

  await paginaAdmin.goto(`/operacion?aseo=${idAseo}`);

  const detalle = detalleDelAseo(paginaAdmin);
  await expect(detalle).toBeVisible();
  await sinNingunDialogo(paginaAdmin);

  const leido = (await valorDeLaFila(detalle, 'Checklist').textContent()) ?? '';

  // El glifo NUNCA va solo: lleva su texto de solo lectura (§13.2). Y la forma
  // es `sin definir` y no `no aplica`: en una gestionada el checklist SÍ va a
  // existir, lo que pasa es que todavía no se ha definido.
  expect(
    leido.trim(),
    'CRITERIO 4 · el checklist de un aseo sin confirmar se dice como ausencia, con su texto',
  ).toBe('—sin definir');

  expect(
    leido,
    'CRITERIO 4 · y NO como un cero de doce, que sería un aseo confirmado sin empezar',
  ).not.toMatch(/\d+\s*\/\s*\d+/);
});

test('CRITERIO 4: la fila de gestión externa no abre panel, y su nombre sigue llevando a la ficha', async ({
  paginaAdmin,
}) => {
  const { externa, fechas } = escenario;

  await sembrarAseos(servicio, [{ propiedad: externa.id, fecha: fechas.hoy }]);

  await paginaAdmin.goto('/operacion');

  // REESCRITO EN EL PLAN 10-05: de fila de tabla a tarjeta. Las dos mitades que
  // este caso defiende —que tocarla no abre nada y que su nombre sigue llevando a
  // la ficha— son las mismas y no se afloja ninguna.
  const fila = tarjetaDe(paginaAdmin, externa.nombre);
  await expect(fila).toHaveCount(1);

  // ── MITAD 1: TOCAR LA FILA NO ABRE NADA ─────────────────────────────────
  // Un aseo inerte no tiene tarifa, ni pago, ni margen, ni aseador, ni checklist,
  // ni evidencia: su panel sería un panel de ausencias. §5.3 punto 6 deja esta
  // fila exactamente como estaba, y eso incluye que NO gane área de clic. Se
  // pulsa una celda que no es el nombre, que es lo que hace un admin que cree que
  // la fila entera reacciona.
  await fila.getByText(externa.contacto, { exact: true }).click();
  // REACOTADO EN EL PLAN 10-05: el detalle dejó de ser un diálogo, así que la
  // ausencia se mide sobre el localizador propio del detalle. Las dos aserciones
  // van juntas y ninguna sobra: la primera dice que el detalle no se abrió, la
  // segunda que tampoco se abrió nada modal por otra vía.
  await expect(
    detalleDelAseo(paginaAdmin),
    'la tarjeta inerte no abre ningún detalle',
  ).toHaveCount(0);
  await sinNingunDialogo(paginaAdmin);
  await expect(paginaAdmin, 'y no le mete ningún parámetro a la dirección').toHaveURL(
    /\/operacion$/,
  );

  // ── MITAD 2: EL NOMBRE SIGUE LLEVANDO A LA FICHA ────────────────────────
  // Y sin etiqueta accesible que lo aclare, al revés que en una fila gestionada:
  // aquí el destino SÍ es lo que el texto dice, y una etiqueta redundante solo
  // taparía el nombre real.
  const enlace = fila.getByRole('link', { name: externa.nombre });
  await expect(enlace).toHaveAttribute('href', `/apartamentos?apartamento=${externa.id}`);

  await pulsarHastaNavegar(paginaAdmin, enlace, /\/apartamentos\?apartamento=[0-9a-f-]{36}$/);
  expect(paginaAdmin.url(), 'el nombre lleva a la ficha de SU apartamento').toContain(
    `apartamento=${externa.id}`,
  );
});

test('abrir el detalle NO manda la lista del dia al tope, y no le borra el toggle', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, cuarta, quinta, sexta, fechas } = escenario;
  const unidades = [gestionada, segunda, tercera, cuarta, quinta, sexta];

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ESTE CASO ES LA MITAD DEL CRITERIO 1 DEL ROADMAP DE LA FASE 8, Y NO
   * EXISTIA: el plan 10-05 lo escribe porque la Task 5 mete el detalle DENTRO
   * de la rejilla, que es donde una clave mal puesta hace dano.
   *
   * ── LAS DOS CAUSAS DISTINTAS DEL MISMO SINTOMA, Y LAS DOS SE MIDEN ──────
   *
   *   1. **La clave por identificador puesta sobre el contenedor de la
   *      rejilla** en vez de sobre el detalle. Forzaria el remonte del
   *      subarbol entero: la lista se reconstruye, y con ella se van el
   *      recorrido Y el toggle de cancelados (INSTRUCCION 3 del VEREDICTO de
   *      08-02).
   *   2. **El `scroll={false}` quitado del enlace de la tarjeta.** El enrutador
   *      recolocaria el recorrido tras navegar, y como el documento no scrollea
   *      a `xl`, el unico contenedor con recorrido que hay es la lista.
   *
   * Por eso el caso afirma LAS DOS COSAS: el recorrido y el conteo de tarjetas.
   * Una sola de las dos dejaria una de las dos causas sin compuerta.
   * ════════════════════════════════════════════════════════════════════════
   */
  const filas: AseoASembrar[] = unidades.map((u) => ({ propiedad: u.id, fecha: fechas.hoy }));
  for (let i = 0; i < 4; i += 1) {
    for (const unidad of unidades) {
      filas.push({ propiedad: unidad.id, fecha: fechas.hoy, estado: 'cancelada' });
    }
  }
  await sembrarAseos(servicio, filas);

  await paginaAdmin.goto('/operacion');
  await paginaAdmin.getByRole('button', { name: 'Ver cancelados (24)' }).click();
  await expect(paginaAdmin.locator('[data-slot="tarjeta-aseo"]')).toHaveCount(30);

  const lista = paginaAdmin.locator('[data-slot="lista-dia"] ul');

  // El recorrido lo produce el propio Playwright al llevar el ultimo enlace a la
  // vista, que es exactamente lo que hace un admin: baja hasta el aseo que
  // busca. No se fija a mano un `scrollTop` porque un valor inventado puede caer
  // fuera del recorrido real y la medida quedaria en cero sin avisar.
  const enlaces = paginaAdmin.getByRole('link', { name: /^Ver el aseo de / });
  const ultimo = enlaces.last();
  await ultimo.scrollIntoViewIfNeeded();

  const antes = await lista.evaluate((n) => n.scrollTop);
  expect(
    antes,
    'CONTROL: la lista tiene de verdad recorrido que perder. Sin esto, la asercion de abajo pasaria con cero igual a cero',
  ).toBeGreaterThan(0);

  await pulsarHastaNavegar(paginaAdmin, ultimo, /\?aseo=[0-9a-f-]{36}$/);
  await expect(detalleDelAseo(paginaAdmin)).toBeVisible();

  expect(
    await lista.evaluate((n) => n.scrollTop),
    'abrir el detalle NO devuelve la lista al tope: el admin pierde el sitio donde estaba',
  ).toBe(antes);

  await expect(
    paginaAdmin.locator('[data-slot="tarjeta-aseo"]'),
    'y el toggle de cancelados, que es estado de CLIENTE de la lista, sobrevive a abrir el detalle',
  ).toHaveCount(30);
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CONTROL DE ALCANCE DE 08-11, VUELTO A CORRER PORQUE EL PORTAL DESAPARECIO.
 *
 * 08-11 dejo una salida impresa con tres lineas: con el ambito equivocado
 * (`locator('main')`) una asercion de seguridad **pasaba en VERDE con la palabra
 * prohibida dentro del panel**, y con el ambito bueno (`getByRole('dialog')`) se
 * ponia roja. Aquel verde falso no lo causo nadie: **el test se debilito solo**
 * cuando 08-08 convirtio la ficha en panel portaleado.
 *
 * **La Task 5 de 10-05 repite la misma clase de mudanza**, en el sentido
 * contrario: el detalle deja de estar portaleado y pasa a vivir DENTRO del
 * contenedor de pagina, al lado de la lista del dia. O sea que el ambito vuelve
 * a estar en juego, y con un agravante: ya no hay rol de dialogo que usar.
 *
 * Este caso mide el acotado EN LOS DOS SENTIDOS, con la palabra prohibida
 * sembrada a mano FUERA del detalle:
 *
 *   SENTIDO 1 · acotada a `[data-slot="detalle-aseo"]` → sigue en VERDE.
 *   SENTIDO 2 · sin acotar (la pantalla entera)        → la palabra ESTA ahi,
 *               o sea que la misma asercion negativa seria FALSA.
 *
 * El sentido 2 se escribe como una afirmacion POSITIVA de que la palabra esta en
 * el cuerpo del documento, y no como un `expect(...).toThrow()`: afirmar la
 * presencia es la prueba de que la version no acotada de la asercion se pondria
 * roja, y se lee sin trucos.
 *
 * **Sin este caso, las aserciones negativas de esta seccion son verdaderas por
 * accidente**, que es literalmente lo que 08-11 midio que pasaba.
 * ════════════════════════════════════════════════════════════════════════════
 */
test('CONTROL DE ALCANCE (08-11): la palabra prohibida FUERA del detalle no engana a la asercion acotada, y SI a la no acotada', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  const [idAseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, estado: 'en_curso' },
  ]);
  await fijarElDineroDelAseo(idAseo);

  // LA PALABRA PROHIBIDA ES LA TARIFA VIVA DEL APARTAMENTO, que es exactamente
  // la que la asercion de FIN-01 del primer caso de esta seccion exige que NO
  // aparezca dentro del detalle: el detalle pinta el SNAPSHOT del aseo.
  const { data: apartamento, error } = await servicio
    .from('properties')
    .select('tarifa_huesped')
    .eq('id', gestionada.id)
    .single();
  if (error || apartamento?.tarifa_huesped == null) {
    throw new Error(`No se pudo releer la tarifa del apartamento: ${error?.message}`);
  }
  const prohibida = formatCOP(apartamento.tarifa_huesped);

  await paginaAdmin.goto(`/operacion?aseo=${idAseo}`);
  const detalle = detalleDelAseo(paginaAdmin);
  await expect(detalle).toBeVisible();
  await sinNingunDialogo(paginaAdmin);

  // ── CONTROL DE PARTIDA: sin señuelo, la palabra no esta en NINGUN sitio ──
  // Sin esto, el SENTIDO 1 pasaria por no haber señuelo, que es el mismo error
  // que 08-11 tuvo que descartar con su tercera linea de salida.
  expect(
    ((await paginaAdmin.locator('body').textContent()) ?? '').includes(prohibida),
    'CONTROL DE PARTIDA: antes del señuelo la palabra prohibida no esta en la pantalla',
  ).toBe(false);

  // ── EL SEÑUELO, PUESTO A MANO FUERA DEL DETALLE ─────────────────────────
  // Dentro de la lista del dia, que es la vecina del detalle en la rejilla y el
  // sitio donde un ambito demasiado ancho la encontraria.
  await paginaAdmin.evaluate((texto) => {
    const lista = document.querySelector('[data-slot="lista-dia"]');
    if (lista === null) throw new Error('no hay lista del dia donde sembrar el señuelo');
    const nodo = document.createElement('span');
    nodo.dataset.senuelo = '08-11';
    nodo.textContent = texto;
    lista.appendChild(nodo);
  }, prohibida);

  // El señuelo cayo DONDE tenia que caer, y no dentro del detalle.
  expect(
    ((await paginaAdmin.locator('[data-slot="lista-dia"]').textContent()) ?? '').includes(
      prohibida,
    ),
    'CONTROL DEL SEÑUELO: la palabra prohibida SI esta en la lista del dia',
  ).toBe(true);

  // ── SENTIDO 1: ACOTADA AL DETALLE, SIGUE EN VERDE ───────────────────────
  expect(
    ((await detalle.textContent()) ?? '').includes(prohibida),
    'SENTIDO 1 · acotada a [data-slot="detalle-aseo"], la asercion de FIN-01 sigue siendo cierta con el señuelo puesto',
  ).toBe(false);

  // ── SENTIDO 2: SIN ACOTAR, LA MISMA ASERCION SERIA FALSA ────────────────
  expect(
    ((await paginaAdmin.locator('body').textContent()) ?? '').includes(prohibida),
    'SENTIDO 2 · sobre la pantalla entera la palabra prohibida SI aparece, o sea que la version no acotada de la asercion se pondria ROJA. Ese es el verde falso que 08-11 midio',
  ).toBe(true);

  /*
    ── Y LA TERCERA MITAD, QUE ES DE FORMA Y NO DE TEXTO ────────────────────

    El nombre del apartamento se pinta en la tarjeta Y en el titulo del detalle,
    asi que sin acotar un localizador por ese nombre resuelve a dos elementos. Es
    el `strict mode violation` que delata un ambito no aplicado.

    ── PERO **NO** POR ROL Y NOMBRE, Y ESO SE MIDIO AQUI (2026-09-29) ───────

    La primera version de esta mitad afirmaba dos ENLACES y salio roja:

        Expected: 2
        Received: 1
        Locator: getByRole('link', { name: 'E2E Op Gestionada 3076917e', exact: true })

    La causa no es un defecto: **el enlace de la tarjeta lleva
    `aria-label="Ver el aseo de {nombre}"`**, asi que su nombre accesible NO es
    el nombre del apartamento y un localizador por rol y nombre no lo alcanza. El
    unico enlace que se llama como el apartamento es el titulo del detalle.

    O sea que la colision de ambito de esta pantalla viaja por el TEXTO y no por
    el nombre accesible, y asi es como hay que medirla. Queda escrito porque la
    version por rol se lee mas natural y el siguiente la va a volver a escribir.
  */
  const porTexto = paginaAdmin.getByText(gestionada.nombre, { exact: true });
  const enElDetalle = detalle.getByText(gestionada.nombre, { exact: true });

  const fuera = (await porTexto.count()) - (await enElDetalle.count());
  expect(
    fuera,
    'sin acotar, el nombre del apartamento tambien se lee FUERA del detalle: es la colision de ambito, medida',
  ).toBeGreaterThan(0);
  await expect(
    enElDetalle,
    'acotado al detalle, el nombre del apartamento resuelve a UNO',
  ).toHaveCount(1);
});

// ───────────────────────────────────────────────────────────────────────────
// 10. LOS CRITERIOS 2 Y 3 SOBRE EL PANEL DE ASEO
// ───────────────────────────────────────────────────────────────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * EL CASO DEL ASEO FUERA DE LA VENTANA ES EL MÁS IMPORTANTE DE ESTA SECCIÓN, Y
 * ES EL ÚNICO ANFITRIÓN DE LA FASE DONDE SE PUEDE ESCRIBIR.
 *
 * `/operacion` no lee su conjunto entero: `leerOperacion()` lee una ventana de
 * **hoy menos 7 a hoy más 6 días** (`VENTANA_ATRAS_DIAS` y `HORIZONTE_DIAS`, en
 * `lib/data/operacion.ts`). **Un aseo de hace tres semanas es válido, existe, se
 * puede ver, y NO está en esa lista.**
 *
 * `/apartamentos` y `/finanzas/pagos` resuelven su parámetro contra lo que la
 * página ya leyó, y allá funciona porque leen las 39 filas. Copiar ese atajo acá
 * haría que un enlace perfectamente válido pegado en un chat **abriera la
 * pantalla sin panel y sin decir por qué**, que es exactamente el caso que más
 * se parece a un enlace viejo, y choca de frente con el criterio 2.
 *
 * Por eso la página valida contra la función definer. Si alguien cambia esa
 * validación a "contra lo que la pantalla ya leyó", este caso se pone rojo, que
 * es justo lo que tiene que pasar.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Cuántos días atrás se siembra el aseo viejo. Muy fuera de los siete de la ventana. */
const DIAS_FUERA_DE_LA_VENTANA = 21;

test('CRITERIO 2: un enlace a un aseo FUERA de la ventana de hoy−7 a hoy+6 abre su panel igual', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  const fechaVieja = diaSumado(fechas.hoy, -DIAS_FUERA_DE_LA_VENTANA);
  const [idAseo] = await sembrarAseos(servicio, [
    {
      propiedad: gestionada.id,
      fecha: fechaVieja,
      aseador: aseadoraA.id,
      estado: 'completada',
    },
  ]);

  // ── EL CONTROL, SIN EL CUAL EL CASO NO PROBARÍA NADA ────────────────────
  // Si el aseo estuviera en la lista, el panel abriría con el atajo barato y
  // este caso pasaría en verde sin haber ejercido lo que existe para ejercer.
  await paginaAdmin.goto('/operacion');
  await expect(
    paginaAdmin.getByRole('link', { name: `Ver el aseo de ${gestionada.nombre}` }),
    'CONTROL: el aseo de hace tres semanas NO está en la lista que la pantalla lee',
  ).toHaveCount(0);

  // Y ahora el enlace pegado en un chat, entrando POR DIRECCIÓN DIRECTA.
  await paginaAdmin.goto(`/operacion?aseo=${idAseo}`);

  const detalle = detalleDelAseo(paginaAdmin);
  await expect(
    detalle,
    'CRITERIO 2 · un enlace válido a un aseo fuera de la ventana abre su detalle',
  ).toBeVisible();
  await sinNingunDialogo(paginaAdmin);

  // Y enseña ESE aseo, no otro. Sin esta mitad, un panel que abriera con el
  // primer aseo que encontrara pasaría la aserción de arriba sin despeinarse.
  await expect(
    detalle.getByRole('link', { name: gestionada.nombre }),
    'CRITERIO 2 · y el panel es el del apartamento que la dirección dice',
  ).toBeVisible();
  await expect(
    detalle.getByText(formatFechaLargaBog(fechaVieja)),
    'CRITERIO 2 · y el de la fecha que la dirección dice, que es la de hace tres semanas',
  ).toBeVisible();

  // El parámetro se queda intacto: limpiarlo reescribiría el enlace que alguien
  // pegó en un chat (§11.4).
  await expect(paginaAdmin).toHaveURL(new RegExp(`aseo=${idAseo}$`));
});

test('CRITERIO 3: el botón atrás cierra el panel de aseo y la dirección sigue en Operación', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  await paginaAdmin.goto('/operacion');
  await pulsarHastaNavegar(
    paginaAdmin,
    paginaAdmin.getByRole('link', { name: `Ver el aseo de ${gestionada.nombre}` }),
    /\?aseo=[0-9a-f-]{36}$/,
  );
  await expect(detalleDelAseo(paginaAdmin)).toBeVisible();
  await sinNingunDialogo(paginaAdmin);

  await paginaAdmin.goBack();

  // ── LAS DOS MITADES, Y LA SEGUNDA ES LA QUE IMPORTA ─────────────────────
  // Sin ella, una implementación que abriera el panel con REEMPLAZO pasaría la
  // primera sin despeinarse: el diálogo desaparecería porque el botón atrás
  // sacó de la sección entera. Es el `about:blank` que midió el plan 08-11 en el
  // quinto panel.
  await expect(
    detalleDelAseo(paginaAdmin),
    'CRITERIO 3 · el botón atrás cierra el detalle',
  ).toHaveCount(0);
  await expect(
    paginaAdmin,
    'CRITERIO 3 · y la dirección sigue en Operación, no salió de la sección',
  ).toHaveURL(/\/operacion$/);
});

test('CRITERIO 3: cerrar el panel de aseo conserva el DIA seleccionado', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  /**
   * ── ESTE CASO SE RESEMBRO SOBRE `?dia` (D-05-9), Y LA PROPIEDAD ES LA MISMA ─
   *
   * Afirmaba sobre `?alertas=atendidas`, que era el otro parametro que esta pantalla
   * gobernaba. Ese parametro **ya no existe**: al mudarse el panel de alertas a la
   * campana del shell, el toggle `Ver atendidas` paso a ser estado de cliente, porque
   * un layout de App Router no recibe `searchParams`.
   *
   * El parametro que ahora tiene que sobrevivir a abrir y cerrar el detalle es `?dia`,
   * y la propiedad defendida es **exactamente la misma**: el panel no se come los
   * parametros de su anfitrion. Una ruta de cierre constante (`/operacion` a secas)
   * borraria el dia, y el admin que estaba mirando el viernes y cierra un panel no
   * entenderia por que la pantalla se le fue a hoy.
   *
   * Es el PITFALL 2 convertido en asercion: la de ancla que 08-11 conservo en finanzas
   * protege el ABRIR; esta protege el CERRAR, que es la otra mitad.
   *
   * ── Y EL DIA ES **HOY**, AUNQUE PAREZCA EL CASO DEBIL. MEDIDO ─────────────
   *
   * Con `?dia=mañana` este caso muere en `El control nunca llego a tener su manejador
   * de clic`: mientras los tres acordeones sigan existiendo, `Mañana` nace COLAPSADO y
   * el enlace de su fila no se hidrata. Se quita en la Task 4.
   *
   * Y no debilita la asercion, porque **lo que se mide es la DIRECCION y no las filas**:
   * el parametro va escrito explicitamente en el `goto`, asi que una ruta de cierre
   * constante deja la direccion en `/operacion` a secas y el `toMatch` del final cae
   * igual de rojo con hoy que con mañana.
   */
  await paginaAdmin.goto(`/operacion?dia=${fechas.hoy}`);

  await pulsarHastaNavegar(
    paginaAdmin,
    paginaAdmin.getByRole('link', { name: `Ver el aseo de ${gestionada.nombre}` }),
    new RegExp(`\\?dia=${fechas.hoy}&aseo=[0-9a-f-]{36}$`),
  );
  expect(
    paginaAdmin.url(),
    'el enlace de apertura se compone desde los parámetros vivos, así que el día viaja',
  ).toContain(`dia=${fechas.hoy}`);

  const detalle = detalleDelAseo(paginaAdmin);
  await expect(detalle).toBeVisible();
  await sinNingunDialogo(paginaAdmin);

  // ── EL CONTROL DE CIERRE ES UN **ENLACE** DESDE EL PLAN 10-05 ──────────
  // Era el aspa de la primitiva `Sheet`, o sea un botón con un manejador. Ahora
  // cerrar es NAVEGAR a la dirección del anfitrión sin el parámetro del aseo, y
  // eso es un enlace: se puede abrir en otra pestaña y el enrutador hace el
  // reemplazo. El nombre accesible NO cambió, que es lo que importa del caso.
  await detalle.getByRole('link', { name: 'Cerrar', exact: true }).click();
  await esperarUrlDeCliente(paginaAdmin, new RegExp(`/operacion\\?dia=${fechas.hoy}$`));

  await expect(
    detalleDelAseo(paginaAdmin),
    'CRITERIO 3 · el control de cierre cierra el detalle',
  ).toHaveCount(0);
  expect(
    paginaAdmin.url(),
    'CRITERIO 3 · y devuelve la dirección con el día seleccionado INTACTO',
  ).toMatch(new RegExp(`/operacion\\?dia=${fechas.hoy}$`));
});

// ───────────────────────────────────────────────────────────────────────────
// 11. CRITERIO 5: NINGUNA CIFRA DEL PANEL LLEGA A UNA SESIÓN DE ASEADORA
// ───────────────────────────────────────────────────────────────────────────

/**
 * ════════════════════════════════════════════════════════════════════════════
 * LA TRAMPA QUE LA FASE 7 PAGÓ, Y QUE AQUÍ NO SE PUEDE REPETIR.
 *
 * El control de método del spec del aseador **no podía dispararse nunca**:
 * buscaba las cifras permitidas solo en el formato crudo, y con el árbol del
 * aseador renderizado entero en el servidor el entero crudo NO VIAJA (lo que
 * cruza es `41.117`, jamás `41117`). O sea que la prueba de la fuga habría
 * pasado en verde **incluso con la fuga abierta**, porque lo que fallaba era el
 * instrumento y no el producto. Está medido en la cabecera de `PERMITIDAS`, en
 * `e2e/mis-pagos.spec.ts`.
 *
 * De ahí salen las dos reglas de esta sección:
 *
 *   1. **Se busca en los DOS formatos**, el crudo y el formateado con separador
 *      de miles. Una pantalla que no pinte la cifra pero la mande en la carga de
 *      hidratación rompe la frontera igual: el dato ya está en el teléfono.
 *   2. **Hay un control de método que se dispara de verdad**: la MISMA búsqueda,
 *      sobre las MISMAS superficies, con una sesión de admin, tiene que
 *      ENCONTRAR las cifras. Sin él, un interceptor que no capturó nada —porque
 *      cambió el tipo de contenido, porque el oyente se enganchó tarde— haría
 *      pasar la mitad negativa sin haber mirado absolutamente nada.
 *
 * ── LO QUE ESTE CASO NO DUPLICA, Y ES DELIBERADO ────────────────────────
 *
 * El bloque P de `supabase/tests/11_financiero.test.sql` ya afirma que una
 * aseadora que llama a `detalle_de_aseo` recibe permiso denegado, y lo afirma
 * DENTRO de Postgres, con roles reales. Este caso no repite eso: afirma la otra
 * capa, la de que ninguna cifra llega al navegador de esa sesión. Atar las dos
 * capas al mismo literal no compraría ninguna garantía.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Las tres cifras del grupo `DINERO` del panel, en las dos formas en que pueden
 * viajar: el entero crudo de una carga de datos y el formateado con separador de
 * miles por si alguien lo pinta en algún sitio.
 *
 * Van las TRES y no solo la tarifa y el margen. En `mis-pagos.spec.ts` el pago
 * es una cifra permitida porque ahí es el dinero PROPIO de quien mira; acá la
 * sesión es la de otra persona y sobre el aseo de un tercero, así que las tres
 * son ajenas.
 */
const CIFRAS_PROHIBIDAS_EN_EL_TELEFONO: string[] = [
  CIFRAS_DEL_ASEO.tarifa,
  CIFRAS_DEL_ASEO.pago,
  CIFRAS_DEL_ASEO.margen,
].flatMap((n) => [String(n), n.toLocaleString('es-CO')]);

interface CargaUtil {
  url: string;
  cuerpo: string;
}

/**
 * Engancha un oyente que guarda el CUERPO de cada respuesta de este origen.
 *
 * Se miran el HTML del render del servidor, la carga que el enrutador pide al
 * navegar sin recargar, y cualquier JSON. Ahí es donde puede ir una cifra.
 *
 * Se descarta `/_next/static/`: son los bundles y las fuentes, con hashes de
 * build de dieciséis dígitos hexadecimales que producen coincidencias por puro
 * azar. Un bundle no lleva datos de un aseo concreto, así que excluirlos no abre
 * ningún hueco.
 *
 * `response.text()` puede rechazar cuando el navegador ya descartó el cuerpo (un
 * redirect, un 304). Se traga el error a propósito: una respuesta sin cuerpo no
 * puede filtrar nada. Es el mismo interceptor de `e2e/mis-pagos.spec.ts`, y va
 * copiado y no importado porque cada spec de este repo es autosuficiente.
 */
function interceptarCargaUtil(p: Page): CargaUtil[] {
  const cargas: CargaUtil[] = [];

  p.on('response', (respuesta) => {
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
  });

  return cargas;
}

/** Cuáles de las cifras prohibidas aparecen en alguna de las cargas capturadas. */
function cifrasEncontradas(cargas: CargaUtil[]): string[] {
  return CIFRAS_PROHIBIDAS_EN_EL_TELEFONO.filter((cifra) =>
    cargas.some(({ cuerpo }) => cuerpo.includes(cifra)),
  );
}

test('CRITERIO 5: ninguna cifra del panel de aseo llega al navegador de una aseadora, buscada en los dos formatos', async ({
  paginaAdmin,
  paginaAseador,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  const [idAseo] = await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, estado: 'en_curso' },
  ]);
  await fijarElDineroDelAseo(idAseo);

  // ── EL CONTROL DEL MÉTODO, Y ES LA MITAD QUE LA FASE 7 NO TENÍA ─────────
  // La misma búsqueda, sobre la misma dirección y sobre la misma clase de
  // respuestas, con una sesión que SÍ puede ver el panel. Si esto no encuentra
  // nada, la mitad negativa de abajo no prueba que no haya fuga: prueba que no
  // se miró.
  const cargasDelAdmin = interceptarCargaUtil(paginaAdmin);
  await paginaAdmin.goto(`/operacion?aseo=${idAseo}`);
  await expect(detalleDelAseo(paginaAdmin)).toBeVisible();
  await sinNingunDialogo(paginaAdmin);
  await paginaAdmin.waitForLoadState('networkidle');
  await expect.poll(() => cargasDelAdmin.length, { timeout: 5_000 }).toBeGreaterThan(0);

  expect(
    cifrasEncontradas(cargasDelAdmin),
    'CONTROL DEL MÉTODO: con la sesión de admin, esta misma búsqueda SÍ encuentra las cifras del panel. ' +
      'Sin esto, la ausencia de abajo no significaría nada.',
  ).not.toHaveLength(0);

  // ── Y AHORA LA SESIÓN DE ASEADORA, SOBRE LA MISMA DIRECCIÓN ─────────────
  const cargasDeLaAseadora = interceptarCargaUtil(paginaAseador);
  await paginaAseador.goto(`/operacion?aseo=${idAseo}`);

  // El rebote del layout de admin. Lo cubre en parte el ruteo; va acá porque es
  // la precondición de lo que de verdad se mide, no porque sea el punto.
  //
  // El patrón admite cola, y no es laxitud: **el rebote ARRASTRA el parámetro**
  // y deja `/mis-aseos?aseo={uuid}`. Medido. Es inocuo, porque la ruta del
  // aseador no lee ese parámetro, y no se "arregla" desde acá: exigir
  // `/mis-aseos` a secas convertiría este caso en una aserción sobre cómo
  // redirige el middleware, que es otra cosa y tiene su propio spec.
  await expect(paginaAseador, 'la dirección del panel rebota a la raíz del aseador').toHaveURL(
    /\/mis-aseos(\?|$)/,
  );
  await paginaAseador.waitForLoadState('networkidle');
  await expect.poll(() => cargasDeLaAseadora.length, { timeout: 5_000 }).toBeGreaterThan(0);

  for (const { url, cuerpo } of cargasDeLaAseadora) {
    for (const prohibida of CIFRAS_PROHIBIDAS_EN_EL_TELEFONO) {
      expect(
        cuerpo.includes(prohibida),
        `FUGA: la cifra ${prohibida} del panel de aseo viajó al navegador de la aseadora en ${url}. ` +
          'Una pantalla que no la pinta no arregla esto: el dato ya está en el teléfono.',
      ).toBe(false);
    }
  }

  // Y la mitad del DOM, que sigue haciendo falta: una cifra puede entrar
  // calculada en el cliente a partir de dos que sí viajaron. Se quitan puntos y
  // espacios de los dos lados para que el formateo no sirva de escondite.
  const pintado = ((await paginaAseador.locator('body').textContent()) ?? '').replace(
    /[.\s ]/g,
    '',
  );
  for (const prohibida of CIFRAS_PROHIBIDAS_EN_EL_TELEFONO) {
    expect(
      pintado,
      `FUGA: la cifra ${prohibida} está pintada en la pantalla de la aseadora`,
    ).not.toContain(prohibida.replace(/[.\s ]/g, ''));
  }
});
