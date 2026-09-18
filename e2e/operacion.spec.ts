import type { Locator, Page } from '@playwright/test';

import { formatFechaBog, formatFechaLargaBog } from '@/lib/domain/dates';
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

/** La cabecera colapsable de un bloque de día, por su rótulo relativo. */
function cabeceraDeBloque(p: Page, rotulo: string) {
  return p.getByRole('button', { name: new RegExp(`^${rotulo}`) });
}

/**
 * Abre un bloque de día si estaba cerrado, y lo deja como está si ya estaba
 * abierto. Un `.click()` a secas sobre un bloque ya abierto lo CIERRA, y el
 * fallo aparece después, buscando una fila que sí existe.
 */
async function abrirBloque(p: Page, rotulo: string) {
  const cabecera = cabeceraDeBloque(p, rotulo);
  if ((await cabecera.getAttribute('aria-expanded')) === 'false') await cabecera.click();
  await expect(cabecera).toHaveAttribute('aria-expanded', 'true');
}

/**
 * El rótulo de un día SIN rótulo relativo: la fecha larga capitalizada, que es
 * lo que `etiquetaDeCabecera()` compone para los cinco días de `Siguientes`.
 */
function rotuloDeFecha(fecha: string): string {
  const larga = formatFechaBog(fecha);
  return larga.charAt(0).toUpperCase() + larga.slice(1);
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
 */
async function esperarToast(p: Page, texto: string) {
  // El puntero se queda donde cayó el último clic, y la pila de toasts vive
  // abajo a la derecha: si el clic cae encima, la librería pausa el temporizador
  // y los toasts se AMONTONAN. Con más de tres apilados deja de renderizar los
  // nuevos, y el síntoma es "el toast del paso 4 no aparece" tres pasos después
  // de la causa. Apartar el puntero antes de mirar deja que expiren solos.
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

test('el admin aterriza en /operacion, con Hoy abierto y los otros dos cerrados', async ({
  paginaAdmin,
}) => {
  // Desde la raíz, no desde `/operacion` directo: lo que se mide es que
  // `/operacion` es la RUTA DE ENTRADA del admin (plan 04-09), no que la página
  // exista. Con `/apartamentos` de landing esto se cae.
  await paginaAdmin.goto('/');
  await paginaAdmin.waitForURL(/\/operacion$/);

  await expect(paginaAdmin.getByRole('heading', { name: 'Operación', level: 1 })).toBeVisible();

  await expect(cabeceraDeBloque(paginaAdmin, 'Hoy')).toHaveAttribute('aria-expanded', 'true');
  await expect(cabeceraDeBloque(paginaAdmin, 'Mañana')).toHaveAttribute('aria-expanded', 'false');
  await expect(cabeceraDeBloque(paginaAdmin, 'Siguientes')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

test('abrir un bloque de día no recarga la página', async ({ paginaAdmin }) => {
  await paginaAdmin.goto('/operacion');

  // La marca vive en `window` y NO sobrevive a una navegación. Sin ella, un
  // bloque implementado con un enlace a `?dia=manana` pasaría el assert de
  // `aria-expanded` igual de bien y nadie se enteraría de que la pantalla entera
  // se vuelve a pedir cada vez que se abre un día.
  await paginaAdmin.evaluate(() => {
    (window as unknown as Record<string, unknown>).__marcaDeOperacion = 'viva';
  });

  await cabeceraDeBloque(paginaAdmin, 'Mañana').click();
  await expect(cabeceraDeBloque(paginaAdmin, 'Mañana')).toHaveAttribute('aria-expanded', 'true');

  await expect
    .poll(() =>
      paginaAdmin.evaluate(
        () => (window as unknown as Record<string, unknown>).__marcaDeOperacion,
      ),
    )
    .toBe('viva');
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

  // ── (e) CERRAR MANUALMENTE, ya dentro de `Siguientes` ────────────────────
  // El aseo se fue del bloque `Hoy`. Hay que abrir DOS bloques, y el segundo es
  // una consecuencia real del diseño que conviene tener escrita: `Siguientes`
  // nace colapsado, y el día de dentro nace colapsado TAMBIÉN, porque cuando la
  // pantalla se montó ese día tenía cero filas (`expandidoInicial` se evalúa una
  // sola vez, al montar). El `router.refresh()` de la reprogramación trae la fila
  // nueva pero no vuelve a montar el bloque, así que su estado de colapso se
  // conserva. No es un fallo: es lo que hace que la pantalla no se reorganice
  // sola debajo del cursor cada vez que entra un cambio por Realtime.
  await abrirBloque(paginaAdmin, 'Siguientes');
  await abrirBloque(paginaAdmin, rotuloDeFecha(fechas.pasado));

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
// 5. EL SHEET ENCADENADO: QUINCE, CONFIRMAR TRES Y CERRAR A MITAD
// ───────────────────────────────────────────────────────────────────────────

test('confirmar tres de quince y cerrar a mitad NO pierde lo confirmado', async ({
  paginaAdmin,
}) => {
  const { gestionada, segunda, tercera, fechas } = escenario;

  // Quince sin confirmar, que es la tanda que una corrida del sync mete de golpe
  // y para la que el `Sheet` está calibrado (§10). Hacen falta TRES apartamentos:
  // el índice único parcial deja un aseo activo por apartamento y fecha, y la
  // ventana son siete días.
  const filas = [];
  for (let dia = 0; dia < 5; dia += 1) {
    const fecha = diaSumado(fechas.hoy, dia);
    filas.push({ propiedad: gestionada.id, fecha });
    filas.push({ propiedad: segunda.id, fecha });
    filas.push({ propiedad: tercera.id, fecha });
  }
  await sembrarAseos(servicio, filas);

  await paginaAdmin.goto('/operacion');

  const cta = paginaAdmin.getByRole('button', { name: 'Confirmar 15 aseos' });
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
    await expect(sheet.getByText(`${i} de 15`, { exact: true })).toBeVisible();

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
  await expect(sheet.getByText('4 de 15', { exact: true })).toBeVisible();
  await sheet.locator('form').getByRole('button', { name: 'Cerrar', exact: true }).click();

  await esperarToastQueEmpiezaCon(
    paginaAdmin,
    'Confirmaste 3 de 15. Los demás siguen en la bandeja.',
  );

  // La bandeja queda con doce.
  await expect(paginaAdmin.getByRole('button', { name: 'Confirmar 12 aseos' })).toBeVisible();

  // ── D-10 EN LA BASE, QUE ES DONDE IMPORTA ────────────────────────────────
  // Lo confirmado NO se pierde jamás: cada aseo se escribió en su propia llamada.
  // Un `Sheet` que acumulara la tanda en memoria y la escribiera al final pasa
  // todos los asserts de pantalla de arriba y se cae aquí.
  const { data: confirmados, error } = await servicio
    .from('cleanings')
    .select('id, num_huespedes, aseador_id')
    .in('property_id', [gestionada.id, segunda.id, tercera.id])
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

  // La FECHA del día la lleva la cabecera del bloque, que es donde el contrato la
  // pone: la fila no repite la fecha en cada línea.
  await expect(
    cabeceraDeBloque(paginaAdmin, 'Hoy').filter({ hasText: formatFechaBog(fechas.hoy) }),
  ).toBeVisible();

  const filaInerte = paginaAdmin.getByRole('row').filter({ hasText: externa.nombre });

  // (a) Está, y con su contacto externo: es el "a cargo de quién" que pide
  //     DASH-07. Sacarla a otra vista rompería el panorama del día.
  await expect(filaInerte.getByText(externa.contacto, { exact: true })).toBeVisible();
  await expect(filaInerte.getByText('Gestión externa', { exact: true })).toBeVisible();

  // (b) Y NO tiene menú de acciones. Ni deshabilitado ni atenuado: ausente.
  await expect(filaInerte.getByRole('button', { name: /^Acciones del aseo/ })).toHaveCount(0);

  // (c) CONTROL, y sin él la aserción de arriba pasaría sobre una pantalla que no
  //     renderiza menús en ninguna fila. La fila gestionada del MISMO día sí lo
  //     tiene.
  const filaNormal = paginaAdmin.getByRole('row').filter({ hasText: gestionada.nombre });
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

test('pulsar una alerta de un aseo de mañana ABRE el bloque Mañana y lleva a su fila', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  // Un aseo URGENTE de mañana produce la alerta computada `urgente`, cuyo destino
  // es `/operacion#aseo-{id}`. `Mañana` nace colapsado, así que sin la expansión
  // el clic no lleva a ninguna parte y tampoco avisa.
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

  await expect(cabeceraDeBloque(paginaAdmin, 'Mañana')).toHaveAttribute('aria-expanded', 'false');

  await paginaAdmin.getByRole('link', { name: /^URGENTE: / }).click();

  await expect(cabeceraDeBloque(paginaAdmin, 'Mañana')).toHaveAttribute('aria-expanded', 'true');
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
 * ── TODO LO QUE SE LEA DEL PANEL SE ACOTA AL DIÁLOGO, SIN EXCEPCIÓN ───────
 *
 * `SheetContent` se portalea a `document.body`, así que el panel NO vive dentro
 * del contenedor de página. El plan 08-11 lo midió con un señuelo puesto a mano:
 * con `locator('main')`, dos aserciones de seguridad **pasaron en verde con la
 * palabra prohibida dentro del panel**. Ampliarlas a la pantalla entera tampoco
 * vale: vuelven a ser verdaderas por accidente, mirando la tabla de detrás, que
 * pinta el mismo nombre de apartamento. Se lee con `getByRole('dialog')`.
 *
 * Y la otra mitad, para cuando haga falta: leer la PÁGINA DE DETRÁS con el panel
 * abierto no se puede hacer por rol, porque Base UI la marca como oculta al
 * árbol de accesibilidad. Para eso se lee del DOM.
 *
 * ── LAS PIEZAS SE AFIRMAN POR SEPARADO, Y CON NÚMEROS ───────────────────
 *
 * Una aserción sobre la FORMA del progreso (`algo/algo`) pasaría con la cuenta
 * mal hecha, que es justo el defecto que importa. Por eso el escenario siembra
 * doce tareas con siete marcadas y la aserción compara contra esos dos números.
 * Lo mismo con la tira: el conteo de casillas y la casilla de `+{N}`.
 * ════════════════════════════════════════════════════════════════════════════
 */

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
function valorDeLaFila(panel: Locator, etiqueta: string): Locator {
  return panel
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

  const panel = paginaAdmin.getByRole('dialog');
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole('link', { name: gestionada.nombre }),
    'el título del panel es el nombre del apartamento, y es el único enlace que sale de la sección (§10.2)',
  ).toBeVisible();

  // ── PIEZA 1 DE 4: EL PROGRESO, CON LOS DOS NÚMEROS ──────────────────────
  // La forma sola no basta: `algo/algo` pasaría con la cuenta mal hecha, que es
  // justo el defecto contra el que T-08-22 puso la regla de no contar el
  // checklist en el componente.
  const progreso = (await valorDeLaFila(panel, 'Checklist').textContent()) ?? '';
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
  const tira = panel.getByRole('list');
  await expect(
    tira.getByRole('listitem'),
    'CRITERIO 4 · la tira pinta seis casillas: cinco fotos y la de conteo (§10.3)',
  ).toHaveCount(MINIATURAS_CON_CONTEO + 1);

  await expect(
    panel.getByRole('button', { name: `Ver la foto de ${cuartoDeLaPrimera}` }),
    'CRITERIO 4 · la foto que SÍ existe se pinta como miniatura, con su nombre accesible',
  ).toHaveCount(1);

  await expect(
    panel.getByLabel('Foto no disponible'),
    'CRITERIO 4 · una foto sin objeto en el bucket ocupa su sitio en vez de desaparecer de la tira',
  ).toHaveCount(MINIATURAS_CON_CONTEO - 1);

  await expect(
    panel.getByLabel(`${FOTOS_SEMBRADAS - MINIATURAS_CON_CONTEO} fotos más`),
    'CRITERIO 4 · la casilla de conteo dice cuántas no se ven',
  ).toBeVisible();

  // ── PIEZA 3 DE 4: LOS REPORTES, CON SU PREFIJO Y SU CIFRA ───────────────
  await expect(
    panel.getByText(`Gasto · ${concepto}`, { exact: true }),
    'CRITERIO 4 · el gasto va con su prefijo (§10.2)',
  ).toBeVisible();
  await expect(
    panel.getByText(formatCOP(montoDelGasto), { exact: true }),
    'CRITERIO 4 · y con su monto',
  ).toBeVisible();
  await expect(
    panel.getByText(`Daño · ${descripcionDelDano}`, { exact: true }),
    'CRITERIO 4 · el daño va con el suyo, que es el otro canal de la distinción',
  ).toBeVisible();

  // La línea es obligación del contrato de la Fase 7 (07-UI-SPEC §6.4, D7-2) y
  // solo aparece cuando hay al menos un daño: sin daños no hay nada que aclarar.
  // Aquí es donde más falta hace, porque el pago al aseador va justo debajo.
  await expect(
    panel.getByText('Los daños no se descuentan del pago.', { exact: true }),
    'CRITERIO 4 · con un daño reportado, la línea de D7-2 está, literal de §15.2',
  ).toBeVisible();

  // ── PIEZA 4 DE 4: EL DINERO SALE DEL ASEO, NUNCA DEL APARTAMENTO ────────
  // Es FIN-01 desde la interfaz. La aserción 105 del bloque P de pgTAP lo afirma
  // desde la base; las dos juntas cierran el camino entero.
  await expect(
    valorDeLaFila(panel, 'Tarifa al huésped'),
    'FIN-01 · la tarifa del panel es la del ASEO, no la viva del apartamento',
  ).toHaveText(formatCOP(CIFRAS_DEL_ASEO.tarifa));
  await expect(valorDeLaFila(panel, 'Pago al aseador'), 'FIN-01 · y el pago también').toHaveText(
    formatCOP(CIFRAS_DEL_ASEO.pago),
  );
  await expect(
    valorDeLaFila(panel, 'Margen'),
    'FIN-01 · el margen llega restado por la definer, no recalculado por la pantalla',
  ).toHaveText(formatCOP(CIFRAS_DEL_ASEO.margen));

  const contenido = (await panel.textContent()) ?? '';
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

  const panel = paginaAdmin.getByRole('dialog');
  await expect(panel).toBeVisible();

  const leido = (await valorDeLaFila(panel, 'Checklist').textContent()) ?? '';

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

  const fila = paginaAdmin.getByRole('row').filter({ hasText: externa.nombre });
  await expect(fila).toHaveCount(1);

  // ── MITAD 1: TOCAR LA FILA NO ABRE NADA ─────────────────────────────────
  // Un aseo inerte no tiene tarifa, ni pago, ni margen, ni aseador, ni checklist,
  // ni evidencia: su panel sería un panel de ausencias. §5.3 punto 6 deja esta
  // fila exactamente como estaba, y eso incluye que NO gane área de clic. Se
  // pulsa una celda que no es el nombre, que es lo que hace un admin que cree que
  // la fila entera reacciona.
  await fila.getByText(externa.contacto, { exact: true }).click();
  await expect(paginaAdmin.getByRole('dialog'), 'la fila inerte no abre ningún panel').toHaveCount(
    0,
  );
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

  const panel = paginaAdmin.getByRole('dialog');
  await expect(
    panel,
    'CRITERIO 2 · un enlace válido a un aseo fuera de la ventana abre su panel',
  ).toBeVisible();

  // Y enseña ESE aseo, no otro. Sin esta mitad, un panel que abriera con el
  // primer aseo que encontrara pasaría la aserción de arriba sin despeinarse.
  await expect(
    panel.getByRole('link', { name: gestionada.nombre }),
    'CRITERIO 2 · y el panel es el del apartamento que la dirección dice',
  ).toBeVisible();
  await expect(
    panel.getByText(formatFechaLargaBog(fechaVieja)),
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
  await expect(paginaAdmin.getByRole('dialog')).toBeVisible();

  await paginaAdmin.goBack();

  // ── LAS DOS MITADES, Y LA SEGUNDA ES LA QUE IMPORTA ─────────────────────
  // Sin ella, una implementación que abriera el panel con REEMPLAZO pasaría la
  // primera sin despeinarse: el diálogo desaparecería porque el botón atrás
  // sacó de la sección entera. Es el `about:blank` que midió el plan 08-11 en el
  // quinto panel.
  await expect(
    paginaAdmin.getByRole('dialog'),
    'CRITERIO 3 · el botón atrás cierra el panel',
  ).toHaveCount(0);
  await expect(
    paginaAdmin,
    'CRITERIO 3 · y la dirección sigue en Operación, no salió de la sección',
  ).toHaveURL(/\/operacion$/);
});

test('CRITERIO 3: cerrar el panel de aseo conserva el filtro de alertas', async ({
  paginaAdmin,
}) => {
  const { gestionada, aseadoraA, fechas } = escenario;

  await sembrarAseos(servicio, [
    { propiedad: gestionada.id, fecha: fechas.hoy, aseador: aseadoraA.id, confirmado: true },
  ]);

  // ── ESTO ES EL PITFALL 2 CONVERTIDO EN ASERCIÓN ─────────────────────────
  // La aserción de ancla que el plan 08-11 conservó en finanzas protege el
  // ABRIR; esta protege el CERRAR, que es la otra mitad y hoy no la cubre nadie.
  // Una ruta de cierre constante (`/operacion` a secas) borraría el filtro, y el
  // admin que estaba mirando las alertas atendidas y cierra un panel no
  // entendería por qué la pantalla cambió debajo.
  await paginaAdmin.goto('/operacion?alertas=atendidas');

  await pulsarHastaNavegar(
    paginaAdmin,
    paginaAdmin.getByRole('link', { name: `Ver el aseo de ${gestionada.nombre}` }),
    /\?alertas=atendidas&aseo=[0-9a-f-]{36}$/,
  );
  expect(
    paginaAdmin.url(),
    'el enlace de apertura se compone desde los parámetros vivos, así que el filtro viaja',
  ).toContain('alertas=atendidas');

  const panel = paginaAdmin.getByRole('dialog');
  await expect(panel).toBeVisible();

  // El aspa de la primitiva, que es el único control de cierre: este panel no
  // tiene pie, así que no hay dos botones llamados `Cerrar` como en el `Sheet`
  // de confirmación.
  await panel.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await esperarUrlDeCliente(paginaAdmin, /\/operacion\?alertas=atendidas$/);

  await expect(
    paginaAdmin.getByRole('dialog'),
    'CRITERIO 3 · el control de cierre cierra el panel',
  ).toHaveCount(0);
  expect(
    paginaAdmin.url(),
    'CRITERIO 3 · y devuelve la dirección con el filtro de alertas INTACTO',
  ).toMatch(/\/operacion\?alertas=atendidas$/);
});
