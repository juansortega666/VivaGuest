#!/usr/bin/env node
/**
 * SIEMBRA DE DEMOSTRACION PARA `/mis-pagos`, PENSADA PARA PROBARLA EN UN
 * TELEFONO DE VERDAD (plan 07-13, tarea 3).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARCHIVO EXISTE Y NO SE REUSA `e2e/fixtures.ts`.
 *
 * La siembra de la suite E2E deja exactamente este escenario, pero lo BORRA en
 * su `afterAll`: cuando la corrida termina no queda nada que mirar en un
 * telefono. Ademas se apoya en los tres usuarios que crea `e2e/global-setup.ts`,
 * que solo existen mientras corre Playwright.
 *
 * Este script siembra contra los usuarios de la semilla de desarrollo
 * (`supabase/seeds/070_perfiles_dev.sql`), que si sobreviven al reinicio, y NO
 * borra nada. Se corre a mano, una vez, antes de instalar la aplicacion en el
 * telefono.
 *
 * ── NO SE USA EN NINGUNA SUITE Y NO DEBE USARSE ──────────────────────────────
 *
 * No es una fixture. Un test que dependa de esto dependeria de que alguien haya
 * corrido un script a mano, que es la clase de verde que no significa nada.
 *
 * ── COMO SE CORRE ───────────────────────────────────────────────────────────
 *
 *   npm run db:reset
 *   node scripts/dev/sembrar-mis-pagos.mjs
 *
 * Es idempotente por reinicio de base, no por ejecucion: correrlo dos veces
 * seguidas sin reiniciar choca contra el indice unico de un aseo activo por
 * apartamento y fecha. Reinicia la base entre corridas.
 *
 * ── Y EL SEGUNDO MODO, PARA EL PUNTO 9 DEL RECORRIDO ────────────────────────
 *
 *   node scripts/dev/sembrar-mis-pagos.mjs --purgar-recibo
 *
 * Borra del bucket los BYTES del recibo y deja su fila y su gasto intactos, que
 * es exactamente el estado en que queda un recibo que la purga por antiguedad ya
 * se llevo. Sirve para comprobar en el telefono que ahi aparece la explicacion y
 * no una imagen rota.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const ASEADORA = 'maria@vivaguest.test';
const SUPLENTE = 'luz@vivaguest.test';
const ADMIN = 'admin@vivaguest.test';
const CLAVE = 'VivaGuest2026!';

/**
 * Cifras que NO son redondas, por la misma razon que las de la suite: para
 * poder buscarlas dentro de una carga util sin que aparezcan por accidente.
 *
 * La tarifa al huesped esta aqui SOLO para poder comprobar a mano que NO sale
 * en el telefono. Si la ves en la pantalla del aseador, eso es el defecto.
 */
const TARIFA_A = 137731;
const PAGO_A = 41117;
const TARIFA_B = 152909;
const PAGO_B = 48211;
const GASTO = 33517;

/** Un JPEG de 1x1 decodificable. El bucket solo admite jpeg, png y webp. */
const BYTES_DEL_RECIBO = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
    'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIy' +
    'MjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIA' +
    'AhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQA' +
    'AAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3' +
    'ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWm' +
    'p6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEB' +
    'AAA/AP/Z',
  'base64',
);

process.loadEnvFile(new URL('../../.env.local', import.meta.url).pathname);

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CLAVE_PUBLICA = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CLAVE_SECRETA = process.env.SUPABASE_SECRET_KEY;

if (!URL_SUPABASE || !CLAVE_PUBLICA || !CLAVE_SECRETA) {
  throw new Error('Faltan variables en .env.local. Corre `npx supabase status` y rellenalas.');
}

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };
const servicio = createClient(URL_SUPABASE, CLAVE_SECRETA, sinSesion);

/** Suma dias a un dia de negocio `'YYYY-MM-DD'`, sin construir instantes locales. */
function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Un instante de Bogota a partir de un dia de negocio y una hora del reloj. */
function instante(dia, hora) {
  return `${dia}T${hora}:00-05:00`;
}

function reventar(mensaje, error) {
  throw new Error(`${mensaje}: ${error?.message ?? 'sin detalle'}`);
}

/**
 * EL DIA DE NEGOCIO Y LOS PERIODOS SE LOS PREGUNTA A LA BASE, no se calculan
 * aqui: el calendario de cierre es D7-5 y vive en Postgres. Un gemelo en este
 * script podria discrepar, y entonces la siembra cerraria un periodo que no es.
 */
async function diaDeNegocio() {
  const { data, error } = await servicio.rpc('today_bog');
  if (error) reventar('No se pudo leer el dia de negocio', error);
  return data;
}

async function periodoDeCierre(dia) {
  const { data, error } = await servicio.rpc('periodo_de_cierre', { p_dia: dia });
  if (error) reventar(`No se pudo resolver el periodo de ${dia}`, error);
  const fila = (data ?? [])[0];
  if (!fila) reventar(`periodo_de_cierre(${dia}) no devolvio ninguna fila`, null);
  return { desde: fila.periodo_desde, hasta: fila.periodo_hasta };
}

async function idPorEmail(email) {
  const { data, error } = await servicio.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) reventar('No se pudo listar usuarios', error);
  const usuario = data.users.find((u) => u.email === email);
  if (!usuario) {
    reventar(
      `No existe ${email}. Corre \`npm run db:reset\`: lo crea supabase/seeds/070_perfiles_dev.sql`,
      null,
    );
  }
  return usuario.id;
}

async function crearApartamento(nombre, cluster, responsable, suplente, tarifa, pago) {
  const { data, error } = await servicio
    .from('properties')
    .insert({
      nombre,
      cluster,
      gestion_vivaguest: true,
      hora_limite: '10:15',
      tarifa_huesped: tarifa,
      pago_aseador: pago,
      responsable_id: responsable,
      suplente_id: suplente,
      is_active: true,
    })
    .select('id, nombre')
    .single();
  if (error) reventar(`No se pudo crear ${nombre}`, error);
  return data;
}

/**
 * Un aseo YA COMPLETADO, con sus tres instantes explicitos.
 *
 * Los instantes NO son relativos al reloj: la pertenencia de un aseo a un
 * periodo de pago se decide por su hora de ejecucion convertida a dia de
 * Bogota, asi que un aseo de hace mes y medio tiene que tener su fin DENTRO de
 * ese periodo. Con instantes relativos, todo caeria en el periodo en curso y el
 * cierre saldria vacio.
 */
async function crearAseoCompletado(propiedad, programado, hecho, aseadora) {
  const { data, error } = await servicio
    .from('cleanings')
    .insert({
      property_id: propiedad,
      origin: 'ical',
      scheduled_date: programado,
      state: 'completada',
      aseador_id: aseadora,
      num_huespedes: 2,
      confirmado_at: instante(hecho, '07:00'),
      started_at: instante(hecho, '09:00'),
      finished_at: instante(hecho, '11:30'),
    })
    .select('id')
    .single();
  if (error) reventar(`No se pudo crear el aseo del ${programado}`, error);
  return data.id;
}

/**
 * Deja el recibo EXACTAMENTE como lo deja la purga por antiguedad: sin bytes en
 * el bucket, con su fila y su gasto intactos.
 *
 * Se borra el objeto y NO la fila, y esa es toda la gracia: el gasto y su monto
 * siguen registrados —el aseador cobra igual— y lo unico que se perdio es la
 * imagen. La pantalla tiene que decir eso, no ensenar un cuadro roto.
 */
async function purgarRecibo() {
  const { data, error } = await servicio
    .from('cleaning_photos')
    .select('storage_path')
    .like('storage_path', '%/gasto/recibo-demo.jpg');
  if (error) reventar('No se pudo buscar la foto del recibo', error);

  const rutas = (data ?? []).map((f) => f.storage_path);
  if (rutas.length === 0) {
    reventar('No hay ningun recibo de demostracion. Corre el script sin bandera primero', null);
  }

  const { error: errorBorrado } = await servicio.storage.from('evidencia').remove(rutas);
  if (errorBorrado) reventar('No se pudieron borrar los bytes del recibo', errorBorrado);

  console.log('');
  console.log(`  Bytes borrados de ${rutas.length} recibo(s). La fila y el gasto siguen ahi.`);
  console.log('  En el telefono, ese gasto tiene que explicar la ausencia, no romper la imagen.');
  console.log('');
}

async function main() {
  if (process.argv.includes('--purgar-recibo')) {
    await purgarRecibo();
    return;
  }

  const hoy = await diaDeNegocio();

  const aseadora = await idPorEmail(ASEADORA);
  const suplente = await idPorEmail(SUPLENTE);

  // Los tres periodos se encadenan hacia atras: el dia anterior al comienzo de
  // un periodo es, por definicion, el dia de cierre del anterior.
  const enCurso = await periodoDeCierre(hoy);
  const reciente = await periodoDeCierre(sumarDias(enCurso.desde, -1));
  const viejo = await periodoDeCierre(sumarDias(reciente.desde, -1));

  const cluster = 'Demo pagos';
  const aptoA = await crearApartamento('Demo Chapinero 502', cluster, aseadora, suplente, TARIFA_A, PAGO_A);
  const aptoB = await crearApartamento('Demo Poblado 1103', cluster, aseadora, suplente, TARIFA_B, PAGO_B);

  // Dias distintos por apartamento: solo cabe un aseo activo por apartamento y
  // fecha, y una colision aqui se leeria como un fallo del script.
  const diaViejo = viejo.desde;
  const cruzadoProgramado = viejo.hasta;           // ultimo dia del periodo viejo
  const cruzadoHecho = sumarDias(reciente.desde, 1); // ya dentro del reciente
  const alineado = sumarDias(reciente.desde, 2);

  await crearAseoCompletado(aptoA.id, diaViejo, diaViejo, aseadora);

  // EL ASEO QUE HACE VISIBLE D7-8: programado en un periodo, hecho en el
  // siguiente. Es el que se paga en el periodo del 2 y no en el del 28, y la
  // unica razon por la que la linea de las dos fechas existe.
  const cruzado = await crearAseoCompletado(aptoA.id, cruzadoProgramado, cruzadoHecho, aseadora);

  // Su contraparte: las dos fechas coinciden. La linea tiene que salir IGUAL.
  await crearAseoCompletado(aptoB.id, alineado, alineado, aseadora);

  // El periodo EN CURSO, con un aseo completado. Es lo que el telefono NO puede
  // mostrar (D7-4.3): un acumulado que todavia puede bajar.
  await crearAseoCompletado(aptoA.id, hoy, hoy, aseadora);

  // ── EL GASTO Y SU RECIBO ───────────────────────────────────────────────────
  const { data: gasto, error: errorGasto } = await servicio
    .from('expenses')
    .insert({
      cleaning_id: cruzado,
      property_id: aptoA.id,
      concepto: 'Jabón, guantes y trapos',
      monto: GASTO,
      reported_by: aseadora,
      created_at: instante(cruzadoHecho, '11:00'),
    })
    .select('id')
    .single();
  if (errorGasto) reventar('No se pudo crear el gasto', errorGasto);

  // La ruta la impone un CHECK: `cleaning_id || '/' || kind || '/'`.
  const ruta = `${cruzado}/gasto/recibo-demo.jpg`;

  const { error: errorFoto } = await servicio.from('cleaning_photos').insert({
    cleaning_id: cruzado,
    kind: 'gasto',
    expense_id: gasto.id,
    storage_path: ruta,
    mime_type: 'image/jpeg',
    bytes: BYTES_DEL_RECIBO.length,
    uploaded_by: aseadora,
  });
  if (errorFoto) reventar('No se pudo crear la fila de la foto', errorFoto);

  // LOS BYTES DE VERDAD, QUE LA FILA SOLA NO BASTA: sin objeto en el bucket, la
  // firma falla y la pantalla pinta su estado de ausencia. Que es justo lo que
  // el punto 9 del recorrido quiere ver POR SEPARADO, con un recibo purgado.
  const subida = await servicio.storage
    .from('evidencia')
    .upload(ruta, BYTES_DEL_RECIBO, { contentType: 'image/jpeg', upsert: true });
  if (subida.error) reventar('No se pudieron subir los bytes del recibo', subida.error);

  // ── EL CIERRE, POR EL CAMINO REAL ──────────────────────────────────────────
  // Con sesion de admin y no con la clave de servicio: `cerrar_periodo` tiene
  // guarda de admin, que resuelve la identidad de la sesion contra los perfiles,
  // y la clave de servicio no tiene identidad. Insertar el pago a mano sembraria
  // un periodo cerrado que la funcion nunca produjo.
  const admin = createClient(URL_SUPABASE, CLAVE_PUBLICA, sinSesion);
  const { error: errorLogin } = await admin.auth.signInWithPassword({
    email: ADMIN,
    password: CLAVE,
  });
  if (errorLogin) reventar(`No se pudo abrir sesion de ${ADMIN}`, errorLogin);

  for (const periodo of [viejo, reciente]) {
    const { error } = await admin.rpc('cerrar_periodo', {
      p_desde: periodo.desde,
      p_hasta: periodo.hasta,
    });
    if (error) reventar(`No se pudo cerrar ${periodo.desde}…${periodo.hasta}`, error);
  }

  // El viejo PAGADO y el reciente PENDIENTE: asi el telefono tiene una tarjeta
  // de cada clase, que es lo que el punto 4 del recorrido mira.
  const { data: pagoViejo, error: errorPago } = await servicio
    .from('cleaner_payouts')
    .select('id')
    .eq('periodo_desde', viejo.desde)
    .eq('aseador_id', aseadora)
    .single();
  if (errorPago) reventar('No hay pago del periodo viejo', errorPago);

  const { error: errorMarca } = await admin.rpc('marcar_pago_pagado', { p_payout: pagoViejo.id });
  if (errorMarca) reventar('No se pudo marcar el pago del periodo viejo', errorMarca);

  // `local` y no el defecto: sin argumento se revocan TODOS los refresh tokens
  // del admin, incluida cualquier sesion abierta en un navegador o un telefono.
  await admin.auth.signOut({ scope: 'local' });

  console.log('');
  console.log('  Siembra lista.');
  console.log('');
  console.log(`  Entra como   ${ASEADORA}  /  ${CLAVE}`);
  console.log('  y abre       /mis-aseos  ->  Mis pagos');
  console.log('');
  console.log(`  Periodo pagado      ${viejo.desde} … ${viejo.hasta}`);
  console.log(`  Periodo pendiente   ${reciente.desde} … ${reciente.hasta}`);
  console.log(`  Periodo EN CURSO    ${enCurso.desde} … ${enCurso.hasta}   <- NO debe aparecer`);
  console.log('');
  console.log(`  ${aptoB.nombre} tiene las dos fechas iguales; ${aptoA.nombre} las tiene distintas.`);
  console.log(`  Cifras que NO pueden verse en el telefono: ${TARIFA_A} y ${TARIFA_B}.`);
  console.log('');
}

await main();
