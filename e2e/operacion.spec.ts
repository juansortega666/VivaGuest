import type { Page } from '@playwright/test';

import { formatFechaBog } from '@/lib/domain/dates';

import {
  expect,
  fijarSaludDeSync,
  idPorEmail,
  limpiarAlertas,
  limpiarOperacion,
  sembrarAseos,
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

let servicio: Servicio;
let escenario: EscenarioDeOperacion;
let idAdmin = '';

/** Los aseadores activos del sistema entero, que es lo que la franja lista. */
let aseadorasActivas: string[] = [];

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
  await esperarToast(paginaAdmin, 'Listo: 1 aseo confirmado.');

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
  await esperarToast(paginaAdmin, `El aseo quedó asignado a ${aseadoraB.nombre}.`);

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

  await esperarToast(paginaAdmin, 'Confirmaste 3 de 15. Los demás siguen en la bandeja.');

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
