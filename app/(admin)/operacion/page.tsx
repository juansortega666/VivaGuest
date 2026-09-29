import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import { leerConsumoDeStorage } from '@/lib/data/almacenamiento';
import { listarApartamentos } from '@/lib/data/apartamentos';
import {
  SIN_AVISOS_REGISTRADOS,
  leerEndpointDePushPropio,
  leerEstadoDeAvisosPorAseador,
} from '@/lib/data/avisos';
import { identificadorValido } from '@/lib/data/finanzas-detalle';
import {
  cargaPorAseador,
  filasDelDia,
  leerAseadoresActivos,
  leerGastosDelDia,
  leerOperacion,
  leerUltimoExitoDeSync,
  resumenDelDia,
  type FilaDeOperacion,
  type GastosDelDia,
} from '@/lib/data/operacion';
import { leerPanelDeAseo } from '@/lib/data/panel-aseo';
import { estadoDeAvisosDeAseador } from '@/lib/domain/avisos';
import { estadoDeAseo, type ClaveEstadoAseo } from '@/lib/domain/cleanings';
import { diaValido, formatFechaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { formatAbreviadoCOP, formatCOP } from '@/lib/domain/money';
import { estadoDeSincronizacion } from '@/lib/domain/salud-sync';
import { publicEnv } from '@/lib/env';

import { DialogoCrearAseo } from './_components/DialogoCrearAseo';
import { LeyendaDeAseos } from './_components/EstadoAseo';
import { FranjaCarga } from './_components/FranjaCarga';
import { InfoDelDia } from './_components/InfoDelDia';
import { ListaDelDia } from './_components/ListaDelDia';
import { MedidorDeAlmacenamiento } from './_components/MedidorDeAlmacenamiento';
import type { ContextoDeAcciones } from './_components/MenuAseo';
import { MetricaDelDia } from './_components/MetricaDelDia';
import { PanelAseo } from './_components/PanelAseo';
import { ResumenDelDia } from './_components/ResumenDelDia';
import { SelectorDeDia } from './_components/SelectorDeDia';
import { SenalDeCalendario } from './_components/SenalDeCalendario';
import { SincronizacionEnVivo } from './_components/SincronizacionEnVivo';
import { TiraAvisosAdmin } from './_components/TiraAvisosAdmin';

export const metadata: Metadata = {
  title: 'Operación · VivaGuest',
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA RUTA NO TIENE ARCHIVO DE CARGA DE SEGMENTO, Y ES DELIBERADO. MEDIDO EL
 * 2026-09-17 EN EL PLAN 08-02.
 *
 * Lo tuvo, con un esqueleto de geometria real que reproducia los dos carriles,
 * la franja de chips, las cabeceras de dia y las dos cards del lateral. Se borro
 * porque era la causa medida de que ABRIR UN PANEL LATERAL mandara la tabla del
 * dia al tope.
 *
 * `loading.tsx` es el fallback de Suspense DEL SEGMENTO, y tambien se aplica
 * cuando solo cambian los parametros de la consulta. Abrir `?aseo={id}` es
 * exactamente eso. La cabecera de `app/(admin)/finanzas/page.tsx` ya lo dejo
 * escrito con ocho corridas; esta medicion lo confirma sobre esta ruta y añade
 * el mecanismo.
 *
 * El A/B, tres corridas por rama, apartando el archivo del arbol, con un evento
 * de Realtime de por medio:
 *
 *     CON el archivo:  scrollY  277 / 0   / 0   / 0      3 de 3
 *     SIN el archivo:  scrollY  277 / 277 / 277 / 277    3 de 3
 *
 * (antes de abrir / con el panel abierto / tras el evento de Realtime / al
 * cerrar.)
 *
 * El mecanismo: el fallback SE ACTIVA aunque NO LLEGUE A PINTARSE (cero
 * apariciones en doce corridas, porque la respuesta del servidor vuelve en
 * ~70 ms). Al activarse, el contenido del segmento se desmonta un instante, el
 * documento pierde altura, el navegador recorta la posicion a cero, y cuando el
 * contenido vuelve la posicion ya se perdio. El estado de React del cliente SI
 * sobrevive, porque un fallback de Suspense no desmonta el arbol, lo oculta.
 *
 * El escenario de control cierra el caso: un enlace de cliente que NO abre
 * ningun panel pierde el scroll igual. **No es el panel**, y por eso
 * `components/ui/sheet.tsx` no se toca.
 *
 * **Lo que se pierde:** el esqueleto de la PRIMERA carga de esta ruta. Es un
 * coste real y acotado, identico al que se acepto en `/finanzas`, y es mucho
 * menor que un criterio del ROADMAP incumplido.
 *
 * **Lo que NO se toca:** los demas archivos de carga del arbol. Esta fase borra
 * exactamente dos, este y el de `/apartamentos`.
 *
 * **Y queda PROHIBIDO reintroducirlo** "para recuperar el esqueleto", ni ahora
 * ni despues, sin volver a correr la medicion de `08-02-MEDICION.md` §3.
 * ════════════════════════════════════════════════════════════════════════════
 */

/*
 * ── `aseosParaAlertas` Y `notificacionesParaAlertas` SE FUERON (plan 10-05) ──
 *
 * Vivían acá y ahora viven en `lib/data/campana.ts`, con el resto de la derivación
 * del panel de alertas. El motivo es de sitio y no de estilo: la campana vive en la
 * barra superior, o sea en el SHELL, y en App Router el shell es el layout. Una
 * página no puede rellenar una ranura de su layout.
 *
 * `notificacionesParaAlertas` además GANÓ algo en el camino: mete el día dentro del
 * destino de las notificaciones que la base escribió sin él. Ver su cabecera.
 */

/*
 * ── `resumenDeAtrasados()` SE FUE CON EL BLOQUE `Atrasados` (plan 10-05) ────
 *
 * Componia `3 aseos · el más viejo del 4 de septiembre` para la cabecera de ese
 * bloque, y el bloque murio con el eje relativo a hoy. Lo que respondia —cuan viejo
 * es lo mas viejo que sigue sin cerrar— lo responde ahora el selector de dia, que
 * deja ir a cualquier dia pasado, mas la alerta de hora limite vencida de la
 * campana, cuya rama NO se acota por fecha.
 */

/**
 * La cifra de la métrica de gastos: `4 · $ 180K`.
 *
 * Tres formas y las tres son estados distintos, no tres estilos:
 *
 *   - **Nulo** es "no se pudo leer". El guion, con `no se pudo leer` para el lector
 *     de pantalla. NO es cero: afirmar que no hubo gastos sin haberlos podido contar
 *     es la misma mentira que el medidor de almacenamiento evita con su `null`.
 *   - **Cero** es "no hubo gastos". Se pinta el cero SOLO, sin el `· $ 0`: la mitad
 *     de dinero de un conteo en cero es siempre cero, así que son cuatro caracteres
 *     que no dicen nada nuevo. Es la misma regla de data-ink que quita la leyenda de
 *     `+0 en otros días`.
 *   - **Con gastos**, el conteo y el total abreviado, que es la forma que el dueño
 *     pidió literal.
 */
function cifraDeGastos(gastos: GastosDelDia): string {
  if (gastos.conteo === null) return '—';
  if (gastos.conteo === 0) return '0';
  return `${gastos.conteo} · ${formatAbreviadoCOP(gastos.total)}`;
}

/**
 * El `title` de la métrica de gastos: la cifra EXACTA y la frase de la divergencia.
 *
 * Las dos mitades son obligatorias y por razones distintas:
 *
 *   1. **La cifra exacta**, porque la abreviatura redondea y `$ 180K` sobre cuatro
 *      gastos que suman `$ 180.400` parece un error de cuadre al abrir el detalle.
 *      Es la regla que este repo ya aplica a todo texto truncado.
 *   2. **La frase de la divergencia**, porque `/finanzas` agrupa los gastos por el
 *      día en que el aseo se CERRÓ y esta pantalla por el día en que estaba
 *      PROGRAMADO. Un aseo del 28 cerrado a las 00:20 pone su gasto el 29 allá y el
 *      28 acá. Las dos cifras pueden no coincidir, **eso no es un defecto**, y sin
 *      esta frase vuelve como reporte de bug.
 */
function tituloDeGastos(gastos: GastosDelDia, dia: string): string {
  const divergencia =
    'La sección Finanzas los agrupa por el día en que el aseo se cerró, así que las dos cifras pueden no coincidir.';

  if (gastos.conteo === null) {
    return `No se pudieron leer los gastos de este día. ${divergencia}`;
  }

  const cuantos = gastos.conteo === 1 ? '1 gasto reportado' : `${gastos.conteo} gastos reportados`;

  return `${formatCOP(gastos.total)} en ${cuantos} sobre los aseos programados el ${formatFechaLargaBog(dia)}. ${divergencia}`;
}

/** Una línea del desglose por estado de la columna derecha. */
interface LineaDeDesglose {
  clave: ClaveEstadoAseo;
  etiqueta: string;
  conteo: number;
}

/**
 * Cuenta las filas del día por estado visible, CONSERVANDO EL ORDEN DE APARICIÓN.
 *
 * Las etiquetas salen de `estadoDeAseo()`, la única derivación del repo, así que son
 * literalmente las mismas que pinta cada tarjeta. Un `switch` propio sobre `state`
 * sería el `if` duplicado que esa función existe para evitar.
 *
 * El orden es el de aparición en la lista del día y NUNCA por conteo: una lista que
 * se reordena sola cambia de sitio cada vez que alguien confirma un aseo.
 *
 * Solo emite los estados CON filas: seis líneas en cero serían seis líneas diciendo
 * que no hay nada que decir, que es la misma regla de data-ink de la leyenda
 * `+0 en otros días`.
 */
function desglosarPorEstado(filas: FilaDeOperacion[]): LineaDeDesglose[] {
  const porClave = new Map<ClaveEstadoAseo, LineaDeDesglose>();

  for (const fila of filas) {
    const { clave, etiqueta } = estadoDeAseo(fila);
    const linea = porClave.get(clave);
    if (linea) linea.conteo += 1;
    else porClave.set(clave, { clave, etiqueta, conteo: 1 });
  }

  return [...porClave.values()];
}

/**
 * La cabecera de la columna derecha y el título de la franja de carga.
 *
 * Los dos dicen DE QUÉ DÍA HABLAN, y los compone la página porque es la única que
 * sabe si el día efectivo es el de negocio de Bogotá. `Hoy` cuando lo es, y la fecha
 * larga cuando no: `Carga de hoy` mientras la pantalla está en el viernes es una
 * mentira pequeña y constante.
 *
 * `formatFechaLargaBog` y no `formatFechaBog`: esta última emite el día de la semana
 * (`vie, 4 de septiembre`) y detrás de "del" eso es agramatical.
 */
function copiaDelDia(dia: string, hoy: string): { cabecera: string; franja: string } {
  if (dia === hoy) return { cabecera: 'El día de hoy', franja: 'Carga de hoy' };

  const largo = formatFechaLargaBog(dia);
  return { cabecera: `El día del ${largo}`, franja: `Carga del ${largo}` };
}

/**
 * `/operacion` — la pantalla de la Fase 4 (04-UI-SPEC.md §6).
 *
 * Es la ruta UNICA del dashboard operativo (D-01): no hay `/dia`, ni
 * `/sin-confirmar`, ni `/alertas`. Tres rutas a la misma informacion serian tres
 * sitios donde mirar lo mismo, y el trabajo del admin es mirar UNA pantalla.
 *
 * RSC. El cliente se construye con el JWT del usuario, nunca con la fabrica
 * administrativa (T-04-06): `scripts/ci/check-service-role.sh` rompe el build si
 * aparece. El layout de `(admin)` ya declara `force-dynamic`, asi que esto no se
 * cachea jamas: son datos por usuario.
 *
 * ── LA GEOMETRIA ESTA MEDIDA, NO ESTIMADA (§6.1) ────────────────────────────
 * El `<main>` del layout aporta `max-w-admin` (1440px) y `px-xl` (24px), o sea
 * 1392px utiles. Sobre eso, la rejilla es `minmax(0, 1fr) var(--container-rail)`
 * con `gap-2xl` (32px):
 *
 *   a 1440px → carril ancho = 1392 − 360 − 32 = 1000px
 *   a 1280px → 1280 − 48 = 1232 utiles → carril ancho = 840px
 *
 * Las columnas fijas de la tabla de dia suman 532px (§7.1), asi que a 1280px
 * APARTAMENTO recibe 308px contra su minimo de 200: sobran 108px de holgura. El
 * minimo de 1280px viene de `02-UI-SPEC.md` §6.3; lo que aporta esta pantalla es
 * haberlo verificado con cuentas.
 *
 * `minmax(0, 1fr)` y no `1fr` a secas: el minimo implicito de una pista de
 * rejilla es `auto`, asi que una tabla ancha ensancharia la pista y empujaria el
 * carril lateral fuera del viewport en vez de hacer scroll dentro de su card.
 *
 * ── POR DEBAJO DE 1280px SE APILA, Y EL ORDEN NO ES CAPRICHOSO (§6.4) ───────
 * Primero el carril lateral, despues los dias. Lo que exige accion va antes que
 * lo que se consulta, que es el criterio entero de D-02. El `aside` va SEGUNDO
 * en el DOM (para que en escritorio ocupe la columna derecha) y sube con
 * `max-xl:order-first`.
 *
 * No se construye vista movil de `(admin)`.
 *
 * ── UNA SOLA IDA A `cleanings` PARA LAS TRES SUPERFICIES ───────────────────
 * `leerOperacion()` trae la ventana entera (hoy−7 … hoy+6, ampliada hacia atras
 * por D-08) con los dos embeds, y `agruparPorDia`, `bandejaSinConfirmar` y
 * `cargaPorAseador` son proyecciones PURAS sobre ese mismo conjunto. Asi la pantalla tiene UNA marca de tiempo que
 * mostrar y no tres, que es lo que D-14 pide. La lista de aseadores activos si es
 * un segundo viaje: vive en `profiles` y no hay forma de traerla en el mismo.
 *
 * ── Y POR QUE HAY UN TERCER VIAJE, AL CATALOGO ─────────────────────────────
 * `listarApartamentos()` alimenta DOS cosas que la consulta de aseos no puede
 * dar, y por eso no se duplica el embed de `leerOperacion`:
 *
 *   1. El RESPONSABLE FIJO de cada apartamento, que es la linea
 *      `Queda asignado a {nombre}` del Sheet de confirmacion (§10). No sale de
 *      `cleanings.aseador_id`: un aseo sin confirmar todavia no tiene aseador,
 *      porque es `confirm_cleaning` quien lo asigna al responsable. El dato vive
 *      en `properties.responsable_id`.
 *   2. Las unidades GESTIONADAS Y ACTIVAS del combobox de `Crear aseo` (§12.3).
 *      El catalogo trae las 39; la operacion solo las que tienen aseo en la
 *      ventana, que no es lo mismo.
 *
 * Son 39 filas y ~8 perfiles, en la misma sesion y en paralelo con las otras dos.
 *
 * ── Y ES TAMBIEN EL ANFITRION DEL PANEL DE ASEO (D8-8, 08-UI-SPEC §10) ─────
 *
 * `?aseo={uuid}` abre el detalle de un aseo encima del dia, sin salir de el, que
 * es el criterio 4 del ROADMAP.
 *
 * **Y LA VALIDACION DE ESE IDENTIFICADOR NO PUEDE COPIAR LA DE
 * `/finanzas/pagos` NI LA DE `/apartamentos`.** Los dos resuelven el parametro
 * contra lo que la pagina YA LEYO, y ahi funciona porque leen su conjunto
 * entero: `/apartamentos` trae las 39 filas. **Esta pantalla no.**
 * `leerOperacion()` lee una ventana de **hoy menos 7 a hoy mas 6 dias**, asi que
 * un aseo de hace tres semanas es valido, existe, se puede ver, y NO ESTA EN
 * `operacion.filas`. Validarlo contra esa lista haria que un enlace
 * perfectamente valido pegado en un chat abriera la pantalla sin panel y sin
 * decir por que, que choca de frente con el criterio 2.
 *
 * Por eso la existencia se valida **contra la funcion definer**, llamando a la
 * lectura del panel: cero filas significa que no existe o que no se puede ver, y
 * las dos cosas se tratan igual. Lo unico que cambia respecto al patron heredado
 * es CONTRA QUE se comprueba; el argumento del comentario de `pagos/page.tsx`
 * sigue valiendo literal: *"No es una frontera de seguridad, sino de
 * comportamiento"*. Los cuatro puntos de §11.4 se cumplen igual, incluido que el
 * parametro huerfano NO SE LIMPIA.
 */
export default async function OperacionPage({
  searchParams,
}: {
  /**
   * `?alertas=atendidas` es el toggle `Ver atendidas` del panel (§11.4), y
   * `?aseo={uuid}` abre el panel de aseo.
   *
   * El tipo es generico y no los dos nombres sueltos porque la pagina tiene que
   * poder SERIALIZAR sus parametros vivos para componer las dos direcciones: la
   * de abrir y la de cerrar. Con un tipo cerrado, el dia que esta pantalla
   * gobierne un tercer parametro, el enlace de apertura lo borraria en silencio.
   */
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Se usa `exigirAdmin()` y no `createClient()` a secas porque esta pagina
  // necesita el `id` del usuario: `notifications.recipient_id` es NOT NULL y no
  // existe "una notificacion para el rol", asi que el panel se lee por
  // destinatario. Que el layout ya haya autorizado no da acceso al `user` desde
  // aca, y el guard cuesta la misma llamada que un `getUser()` suelto.
  //
  // Solo se traga `NoAutorizado`, misma regla que el layout: un fallo de entorno
  // o de red tiene que propagarse y romper, no convertirse en un login.
  const contexto = await exigirAdmin().catch((error: unknown) => {
    if (error instanceof NoAutorizado) return null;
    throw error;
  });

  if (!contexto) redirect('/login');

  const { supabase, user } = contexto;

  /**
   * EL INSTANTE DE LA LECTURA, UNO SOLO PARA TODA LA PANTALLA (D-14).
   *
   * Se lee el reloj AQUI, una vez, y baja por parametro a todo lo que lo
   * necesita: la ventana de la consulta, el computo de las alertas, la ventana de
   * las atendidas y la marca de frescura de la cabecera. Llamar `Date.now()`
   * dentro de cada superficie daria cuatro respuestas distintas a la misma
   * pregunta —"¿de cuando son estos datos?"— y esa es exactamente la mentira
   * silenciosa contra la que existe D-14.
   */
  const ahoraMs = Date.now();

  const parametros = await searchParams;
  /**
   * PRIMERO LA FORMA, ANTES DE TOCAR LA BASE.
   *
   * El identificador llega de la direccion, o sea de fuera. Sin esta guarda una
   * cadena arbitraria llegaria a Postgres como argumento de tipo identificador y
   * volveria como `22P02`, un error de sintaxis que la pantalla no sabria
   * explicar. La funcion ya existe y se reutiliza: un regex nuevo seria una
   * cuarta definicion de la misma forma.
   *
   * `leerPanelDeAseo` la vuelve a aplicar por dentro, y esa repeticion no sobra:
   * corta el viaje antes de construir la promesa.
   */
  const crudoDelAseo = parametros.aseo;
  const aseoPedido = identificadorValido(
    typeof crudoDelAseo === 'string' ? crudoDelAseo : undefined,
  );

  /**
   * EL DÍA DEL SELECTOR, CON LA MISMA DISCIPLINA QUE `?aseo` (D-05-1).
   *
   * `diaValido()` es la guarda de forma, y existe por la razón literal de arriba
   * aplicada al otro tipo: sin ella una cadena arbitraria llega a Postgres como
   * argumento de tipo FECHA y vuelve como `22P02`. La función vive en
   * `lib/domain/dates.ts` porque ahí está la única implementación del calendario de
   * negocio del repo; un regex acá sería una quinta definición de la misma forma.
   *
   * Ausente o inválido cae a `hoyBog()`, que es el `operacion.hoy` de abajo. **Y EL
   * PARÁMETRO HUÉRFANO NO SE LIMPIA**, misma regla que `?aseo` de §11.4: limpiarlo
   * reescribiría un enlace que alguien pegó en un chat.
   */
  const crudoDelDia = parametros.dia;
  const diaPedido = diaValido(typeof crudoDelDia === 'string' ? crudoDelDia : undefined);

  /**
   * LA LECTURA DEL PANEL, Y SOLO CUANDO EL PARAMETRO ESTA PRESENTE.
   *
   * Se construye la promesa **sin esperarla** y entra al mismo `Promise.all` de
   * abajo, asi que cuesta CERO latencia extra: las ocho consultas que la pantalla
   * ya hacia la dominan. Sin parametro, ni siquiera se dispara.
   *
   * La MISMA promesa se usa para las dos cosas que hay que hacer con ella
   * —decidir si el panel se renderiza, y alimentar su cuerpo— porque volver a
   * llamarla dispararia las seis lecturas y las seis firmas dos veces.
   */
  const lecturaDelPanel = aseoPedido === null ? null : leerPanelDeAseo(supabase, aseoPedido);

  // En paralelo: son consultas independientes contra la misma sesion, y
  // encadenarlas con `await` seguidos sumaria todas las latencias por nada.
  const [
    operacion,
    aseadores,
    apartamentos,
    ultimoExito,
    avisos,
    endpointDelAdmin,
    aseoAbierto,
    consumo,
  ] = await Promise.all([
      // El día pedido no cambia el EJE de la ventana, solo la AMPLÍA cuando cae
      // fuera. Ver la cabecera de `leerOperacion`: mover el eje apagaría las
      // alertas de hoy al navegar a un día pasado (criterio 7 del ROADMAP).
      leerOperacion(supabase, ahoraMs, diaPedido),
      leerAseadoresActivos(supabase),
      listarApartamentos(supabase),
      // La lectura de las ALERTAS ya no está acá: se fue al layout con la campana
      // (D-05-9). Lo que sí se queda es `leerUltimoExitoDeSync`, porque la señal de
      // calendario de la cabecera de ESTA pantalla sale de la misma marca. Es una
      // lectura duplicada con la del layout, y es el precio de que la campana viva en
      // el shell: las dos la necesitan y no pueden compartirla.
      leerUltimoExitoDeSync(supabase),
      // D-03 (§11.2 y §11.3). Va en el mismo `Promise.all` y no encadenada: es
      // una consulta independiente sobre la misma sesión, y sumarle su latencia
      // a las otras cinco no compraría nada. Es UNA llamada para los ocho
      // aseadores, no una por aseador.
      leerEstadoDeAvisosPorAseador(supabase),
      // NOTIF-02, criterio 3 (§13): el endpoint del propio navegador del propio
      // admin, contra el que el hook de la franja compara su suscripcion viva.
      // Sin el, el hook repararia en silencio en cada carga de la pantalla.
      leerEndpointDePushPropio(supabase, user.id),
      // La novena, y solo existe cuando la direccion trae el parametro. Ver la
      // cabecera de la pagina para por que la existencia se decide acá y no
      // contra `operacion.filas`.
      lecturaDelPanel,
      // RET-07. La decima, y la UNICA con `.catch` propio.
      //
      // EL `.catch` VA PEGADO A ESTA PROMESA, NO ENVOLVIENDO EL `Promise.all`.
      // Si envolviera al conjunto, un fallo de esta lectura de nueve tumbaria
      // las otras nueve y la pantalla entera se caeria por el medidor de la
      // cabecera, que es exactamente lo que no puede pasar.
      //
      // Y el `null` NO ES CERO y no se pinta como cero: el medidor dice "no se
      // pudo medir" y `alertasComputadas()` no emite alerta. Afirmar que hay
      // espacio de sobra sin haberlo medido es la mentira que este requisito
      // existe para evitar.
      leerConsumoDeStorage(supabase).catch(() => null),
    ]);

  /**
   * EL DÍA EFECTIVO DE LA PANTALLA. Es el del selector, y `operacion.hoy` cuando la
   * dirección no lo trae o lo trae roto.
   *
   * Se resuelve DESPUÉS de la lectura y no antes, porque el fallback es el día de
   * negocio de Bogotá y ese lo calcula `leerOperacion()` con `hoyBog()`. Llamar
   * `hoyBog()` otra vez acá daría la misma respuesta el 99,99 % de las veces y una
   * distinta justo a medianoche de Bogotá, que es exactamente el tipo de
   * incoherencia que D-14 existe para evitar: la ventana de la consulta y el día
   * que la pantalla dice tienen que salir de la MISMA lectura del reloj.
   */
  const diaEfectivo = diaPedido ?? operacion.hoy;

  const filasDelDiaSeleccionado = filasDelDia(operacion.filas, diaEfectivo);

  /**
   * LOS GASTOS DEL DÍA, Y ES LA ÚNICA LECTURA QUE **NO** CABE EN EL `Promise.all`.
   *
   * No es un descuido de paralelismo: la consulta filtra por los identificadores de
   * los aseos DEL DÍA, así que no se puede construir hasta que la lectura de aseos
   * haya vuelto. Es un viaje encadenado de verdad, sobre una tabla con índice por
   * `cleaning_id` y decenas de filas.
   *
   * Se degrada sola y no se envuelve en `.catch`: la función ya devuelve nulos si la
   * consulta falla, por la misma razón literal que `marcarSinEvidencia`. Ver su
   * cabecera, y en particular la divergencia declarada con `/finanzas`.
   */
  const gastosDelDia = await leerGastosDelDia(
    supabase,
    filasDelDiaSeleccionado.map((f) => f.id),
  );

  /**
   * EL VISTAZO ENTERO, DE UNA PROYECCIÓN PURA Y NO DE CUATRO `filter` EN EL JSX.
   *
   * Recibe la VENTANA COMPLETA y no el día ya filtrado, porque la cifra de
   * desbordamiento de `Sin confirmar` (D-05-7) se calcula sobre la ventana menos el
   * día. Ver la cabecera de `resumenDelDia`.
   */
  const resumen = resumenDelDia(operacion.filas, diaEfectivo, operacion.hoy, gastosDelDia);

  /**
   * LA SALUD DE LA SINCRONIZACIÓN, DECIDIDA **UNA** VEZ EN ESTA PÁGINA.
   *
   * La misma marca (`ultimoExito`) y el mismo instante (`ahoraMs`) que recibe
   * `alertasComputadas()` para decidir si emite la alerta `calendario_caido`. Por eso
   * la señal de la cabecera y la alerta del panel NO PUEDEN contradecirse dentro del
   * mismo render: no son dos cálculos, es la misma función llamada con los mismos dos
   * argumentos. Un umbral escrito en el componente sería la segunda verdad.
   */
  const saludDeSync = estadoDeSincronizacion(ultimoExito, ahoraMs);

  /**
   * LA CARGA POR ASEADOR **DEL DIA SELECCIONADO**, y no de hoy (plan 10-05).
   *
   * `cargaPorAseador` ya recibia el dia por parametro, asi que lo unico que cambia es
   * el argumento. Y tiene que cambiar: con el selector de dia, una franja que siguiera
   * contando lo de hoy mientras la pantalla esta en el viernes seria un dato correcto
   * respondiendo a la pregunta equivocada.
   */
  const chips = cargaPorAseador(operacion.filas, diaEfectivo, aseadores);

  /**
   * EL DESGLOSE POR ESTADO DEL DIA, para la columna derecha.
   *
   * Sale de `estadoDeAseo()`, la UNICA derivacion del repo, asi que sus etiquetas son
   * literalmente las mismas que pinta cada tarjeta. Contar aca con un `switch` propio
   * sobre `state` seria el `if` duplicado que esa funcion existe para evitar.
   *
   * Conserva el ORDEN DE APARICION de los estados en la lista del dia, que es el de la
   * consulta: un orden por conteo se reordena solo y la linea que buscas cambia de
   * sitio cada vez que alguien confirma un aseo.
   */
  const desgloseDelDia = desglosarPorEstado(filasDelDiaSeleccionado);

  /**
   * CUANTOS ASEOS QUEDAN MAS ALLA DEL HORIZONTE DE LA VENTANA.
   *
   * Lo contaba `agruparPorDia`, que murio con el eje relativo a hoy. Se cuenta aca, y
   * la razon de que siga existiendo no cambia (T-05-54): lo que queda afuera NO SE
   * ESCONDE, se dice cuanto hay y donde verlo.
   *
   * Comparacion entre cadenas `'YYYY-MM-DD'`, nunca construyendo un `Date`.
   */
  const masAllaDelHorizonte = operacion.filas.filter(
    (f) => f.scheduled_date > operacion.horizonte,
  ).length;

  // La copia que dice DE QUE DIA hablan la columna derecha y la franja de carga.
  const { cabecera: cabeceraDelDia, franja: tituloDeLaFranja } = copiaDelDia(
    diaEfectivo,
    operacion.hoy,
  );

  // `property_id` → nombre del responsable fijo. `null` cuando no tiene, que es
  // la carencia que el Sheet levanta ANTES de que `confirm_cleaning` lance su
  // `P0001 sin_responsable`.
  const responsables = Object.fromEntries(
    apartamentos.map((a) => [a.id, a.responsableNombre]),
  );

  /**
   * ── QUIÉN SE QUEDÓ SIN CANAL (D-03, criterio 6) ──────────────────────────
   *
   * La derivación NO se hace acá: se llama a `estadoDeAvisosDeAseador()`, que es
   * la misma función que pinta la columna `AVISOS` de `/aseadores`. Un `if` sobre
   * `suscripciones_vivas === 0` escrito en esta página sería una segunda verdad
   * sobre el mismo dato, y la que se quedara atrás lo haría en silencio.
   *
   * El aseador que NO sale del agregado se resuelve como CERO suscripciones y no
   * como dato ausente: ese cero ES el estado `Sin avisos`, que es justo el que
   * esta pantalla existe para hacer visible.
   *
   * `Sin probar` NO entra en esta lista. La franja de carga marca solo a los
   * mudos (§11.2): dos niveles de advertencia en un chip de 32px lo vuelven
   * ilegible, y ese matiz vive en `/aseadores`.
   *
   * Sale como ARRAY de ids y no como `Set` porque cruza la frontera al cliente,
   * donde un `Set` no sobrevive a la serialización.
   */
  const aseadoresSinAvisos = aseadores
    .filter(
      (a) =>
        estadoDeAvisosDeAseador({
          is_active: a.is_active,
          ...(avisos.get(a.id) ?? SIN_AVISOS_REGISTRADOS),
        }).clave === 'sin_avisos',
    )
    .map((a) => a.id);

  /**
   * `property_id` → el responsable fijo de ese apartamento está mudo.
   *
   * El cruce se hace acá y no en el `Sheet` porque este es el único sitio con
   * los dos lados a la vez: `responsables` lleva el NOMBRE del responsable, no
   * su id, y `aseadoresSinAvisos` está indexado por id.
   */
  const mudos = new Set(aseadoresSinAvisos);
  const responsableSinAvisos = Object.fromEntries(
    apartamentos.map((a) => [a.id, a.responsable_id !== null && mudos.has(a.responsable_id)]),
  );

  // El combobox de `Crear aseo` no autoriza nada —`create_manual_cleaning`
  // comprueba gestion y actividad por dentro, y un Server Action es un endpoint
  // publico (T-04-04)—, asi que este filtro es UX: no ofrecer lo que la base va a
  // rechazar. Ya vienen ordenadas por nombre desde `listarApartamentos`.
  const apartamentosParaCrear = apartamentos
    .filter((a) => a.gestion_vivaguest && a.is_active)
    .map((a) => ({ id: a.id, nombre: a.nombre }));

  // Lo que el menu de cada tarjeta necesita y la fila no trae (plan 04-11). Baja por
  // `ListaDelDia` -> `TarjetaAseo` sin que ninguno de los dos lo use: el consumidor es
  // `MenuAseo`. Va como UN objeto y no como tres props sueltas
  // para que anadir un cuarto dato manana no vuelva a tocar los tres.
  //
  // Los tres datos ya estaban leidos: `aseadores` alimenta los chips de carga,
  // `responsables` alimenta la bandeja, y `hoy` es el dia de negocio que la
  // consulta uso para su ventana. No hay ningun viaje nuevo a la base.
  /**
   * ── LAS DOS DIRECCIONES SE COMPONEN AQUI, EN EL SERVIDOR ─────────────────
   *
   * Donde los parametros ya estan normalizados, y bajan como props. Cerrar con
   * una ruta constante **borraria el `?alertas=atendidas`**, y la regla 3 de §5.1
   * lo prohibe: abrir un panel no puede perder los parametros del anfitrion y
   * cerrarlo tiene que devolver la direccion con ellos intactos. Un admin que
   * estaba mirando las alertas atendidas y cierra un panel no entenderia por que
   * el filtro se le reseteo.
   *
   * La mitad de ABRIR no es teoria y esta medida: en `08-02-MEDICION.md` §4.3 un
   * `href="/operacion?aseo={id}"` con consulta literal borro el
   * `?alertas=atendidas` AL ABRIR, antes de que el cierre tuviera nada que
   * conservar. Por eso `parametrosVivos` baja hasta la fila (INSTRUCCION 5).
   */
  const vivos = new URLSearchParams();
  for (const [clave, valor] of Object.entries(parametros)) {
    // El unico que gobierna el panel se quita, y lo vuelve a poner quien lo
    // necesite. Todo lo demas viaja intacto.
    //
    // ── `?dia` ENTRA ACA POR CONSTRUCCION, Y ESTA COMPROBADO ────────────────
    // Este bucle copia TODO menos `aseo`, asi que el dia del selector viaja en
    // `vivos` sin que haya que nombrarlo, y de eso depende que abrir y cerrar el
    // detalle no se coma el dia. Va anotado y no supuesto: es la propiedad que
    // mide el caso E2E de que cerrar el detalle conserva el `?dia`, y el dia que
    // alguien cierre este bucle a una lista de claves conocidas, se rompe sin
    // ruido.
    if (clave === 'aseo') continue;
    if (typeof valor === 'string') vivos.set(clave, valor);
    else if (Array.isArray(valor)) for (const uno of valor) vivos.append(clave, uno);
  }

  const cola = vivos.toString();
  const rutaAlCerrar = cola === '' ? '/operacion' : `/operacion?${cola}`;

  const acciones: ContextoDeAcciones = {
    aseadores,
    responsables,
    responsableSinAvisos,
    aseadoresSinAvisos,
    hoy: operacion.hoy,
    // EL MISMO instante de la lectura que usan la ventana de la consulta y el
    // computo de las alertas (D-14). Lo consume `FilaAseo` para el `Hourglass` de
    // hora limite vencida: asi la senal de la fila y la alerta del panel salen
    // del mismo reloj y no pueden contradecirse dentro del mismo render.
    ahoraMs,
    // Los dos datos del panel de aseo, que `FilaAseo` consume y `MenuAseo` no.
    // Viajan en este objeto porque es exactamente para lo que se creo: para que
    // añadir un dato no vuelva a tocar los tres archivos por los que baja.
    parametrosVivos: cola,
    aseoAbiertoId: aseoAbierto?.cabecera.aseoId ?? null,
  };

  /*
   * ── LA DERIVACION DEL PANEL DE ALERTAS SE FUE DE ESTA PAGINA (D-05-9) ─────
   *
   * `alertasComputadas()`, `mezclarAlertas()` y `conteosPorTipo()` corrian aca. Ahora
   * corren en `leerCampana()`, que la llama `app/(admin)/layout.tsx`, porque la
   * campana vive en la barra superior y un layout no puede recibir datos de su
   * pagina.
   *
   * Y con ellas se fue el parametro `?alertas=atendidas`: un layout de App Router NO
   * recibe `searchParams`, asi que el toggle `Ver atendidas` paso a ser estado de
   * cliente. La razon completa esta en la cabecera de `lib/data/campana.ts`.
   *
   * **EL MEDIDOR DE ALMACENAMIENTO SE QUEDA** (RET-07), y su lectura tambien: el
   * numero de la cabecera de esta pantalla no depende de ningun filtro del panel, y
   * nunca dependio. Lo que se fue es la LISTA, no el NUMERO.
   */

  return (
    /*
      ── EL PRESUPUESTO DE ALTURA DE LA PANTALLA (plan 10-05) ──────────────────

      Columna flex con ALTURA CERRADA de `xl:` para arriba. Lo que sobra tras la
      cabecera y el vistazo se lo lleva la region de las dos columnas con
      `min-h-0 flex-1`, **sin aritmetica**: un `calc()` que restara la altura de la
      cabecera y del vistazo se rompe el dia que la copia de una metrica pase a dos
      lineas, y el sintoma seria la columna derecha desbordando por abajo.

      LA ALTURA CERRADA SI ES ARITMETICA, Y SALE ENTERA DE TOKENS. Los cuatro
      sustraendos son reales y cada uno tiene dueno:

        --alto-barra-pruebas  la barra de ambiente de pruebas de `app/layout.tsx`
        --spacing-barra       la barra superior del admin (56px)
        --spacing-xl          el `pt-xl` del `<main>` del layout
        --spacing-3xl         su `pb-3xl`

      ── Y LA PRIMERA NO ES OPCIONAL. ESTA MEDIDA Y 10-04 YA LA PAGO ──────────

      `app/layout.tsx` pinta la barra de ambiente de pruebas en TODO entorno cuyo
      `NEXT_PUBLIC_VIVAGUEST_ENTORNO` no sea `produccion`, **y la suite E2E corre
      justo ahi**. Una altura escrita sin ese sustraendo desborda 48px EXACTOS en la
      corrida de Playwright, y la asercion de "la pagina no scrollea" sale ROJA
      contra el codigo correcto. El fallback `0px` cubre produccion, donde la barra
      no se pinta y la variable no existe.

      `100svh` y no `100vh`: en un navegador con barra retractil `vh` cuenta el
      viewport grande y la ultima tarjeta queda debajo del cromo.

      Por debajo de `xl` NO hay altura cerrada: la pantalla se apila y scrollea el
      documento, que es lo que ya hacia.
    */
    <div className="flex flex-col gap-xl xl:h-[calc(100svh-var(--alto-barra-pruebas,0px)-var(--spacing-barra)-var(--spacing-xl)-var(--spacing-3xl))]">
      {/*
        Cabecera de pagina: titulo a la izquierda, acciones a la derecha.

        EL UNICO BOTON PRIMARIO DE ESTA PANTALLA NO ESTA AQUI: es
        `Confirmar N aseos` de la bandeja (§4.2). `Crear aseo` va en `outline`
        porque crear un aseo a mano es una accion rara y deliberada, y dos
        rellenos primarios compitiendo dejarian al ojo eligiendo entre ellos justo
        cuando hay quince cosas pendientes.
      */}
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Operación</h1>

        <div className="flex items-center gap-md">
          {/*
            RET-07. El numero se ve SIEMPRE, tambien en `Ver atendidas`: cuanto
            espacio queda no depende del filtro del panel. Va antes de la marca de
            sincronizacion porque las dos son estado del sistema y esta es la mas
            lenta de cambiar: la de al lado se mueve cada minuto.
          */}
          <MedidorDeAlmacenamiento consumo={consumo} />

          {/*
            La marca de ultima actualizacion (§13.1) y el canal de tiempo real que
            la alimenta. Recibe `leidoEnMs`, que es EL instante de la lectura de
            esta peticion: el mismo que usaron la ventana de la consulta y el
            computo de las alertas. Es la marca unica que pide D-14.
          */}
          <SincronizacionEnVivo leidoEnMs={operacion.leidoEnMs} />

          {/*
            ── `Crear aseo` SE FUE DE LA CABECERA A LA COLUMNA DERECHA (plan 10-05) ─

            Vivia aqui y ahora vive en `InfoDelDia`, con el resto de la informacion
            general del dia. La razon es que la cabecera paso a llevar el control que
            gobierna la pantalla entera —la senal de calendario y el selector de dia—
            y meter ahi ademas una accion de escritura le quita el foco a eso.

            **Y hay una consecuencia que hay que decir en voz alta**: con el detalle de
            un aseo abierto, la columna derecha lo muestra a el y este boton NO ESTA
            ALCANZABLE sin cerrar el detalle. Lo hereda la Task 5 de este plan, que es
            la que mete el detalle en esa columna, y ahi hay que decidirlo: o una copia
            en la cabecera, o el boton fuera del bloque que el detalle sustituye.
          */}

          {/*
            EL SELECTOR DE DIA VA AL FINAL DE LA FILA, Y EL ORDEN ES EL QUE EL
            DUENO PIDIO LITERAL (2026-09-28): la senal de estado del calendario
            INMEDIATAMENTE a su izquierda, que es la que va justo arriba de este
            bloque. **Ese orden del DOM es contrato y no estetica**, asi que va
            escrito aqui para que un reordenado posterior no lo pierda: hay una
            asercion E2E que compara las dos posiciones en el documento.

            Va ULTIMO y no primero porque es el control que gobierna la pantalla
            entera: el ojo lo busca en el extremo, y ponerlo entre el medidor de
            almacenamiento y la marca de sincronizacion lo dejaria pareciendo una
            tercera pieza de estado del sistema.
          */}
          <SenalDeCalendario estado={saludDeSync} />

          <SelectorDeDia
            dia={diaEfectivo}
            hoy={operacion.hoy}
            parametrosVivos={cola}
          />
        </div>
      </div>

      {/*
        ── EL VISTAZO DEL DIA SELECCIONADO (plan 10-05) ────────────────────────

        Las CUATRO metricas salen del dia del selector, sin excepcion: cambiar de dia
        cambia las cuatro. Su redaccion vive aqui y no en los componentes porque la
        copia es contrato de pantalla y el componente es geometria.
      */}
      <ResumenDelDia>
        <MetricaDelDia clave="activos" rotulo="Aseos activos" cifra={String(resumen.activos)} />

        {/*
          LA LEYENDA SOLO APARECE CON DESBORDAMIENTO (D-05-7). Es lo que conserva la
          promesa del criterio 1 al matar la bandeja lateral: hasta este plan, un sin
          confirmar de dentro de tres dias se veia HOY sin navegar, y perder eso seria
          una regresion contra "que ningun aseo se pierda", que es el core value del
          producto y no una preferencia de diseno.

          Un `+0 en otros dias` seria una linea de texto diciendo que no hay nada que
          decir, misma regla que ya aplica la cabecera de dia.
        */}
        <MetricaDelDia
          clave="sin-confirmar"
          rotulo="Sin confirmar"
          cifra={String(resumen.sinConfirmar)}
          leyenda={
            resumen.sinConfirmarEnOtrosDias > 0
              ? `+${resumen.sinConfirmarEnOtrosDias} en otros días`
              : undefined
          }
        />

        {/*
          ── `URGENTES` EN UN DIA PASADO NO ES CERO, ES EL GUION (D-05-3) ──────

          `is_urgent` solo se mantiene para `scheduled_date >= today_bog()`, asi que
          en un dia pasado el valor esta CONGELADO y pintar la cifra seria afirmar
          algo que la base ya no sostiene. Nulo y cero son cosas distintas y se
          pintan distinto, igual que `SinDato` de la fila de aseo.

          ── Y EL ROTULO Y LA COPIA DE LA TARJETA NO SON LA MISMA COSA ────────

          El rotulo visible es `URGENTES` (las versalitas las pone el CSS), y es la
          etiqueta de TIPO que el panel de alertas ya usa y que el admin ya aprendio.
          **El literal de la tarjeta de aseo sigue siendo `Entra huesped el mismo
          dia` y NO SE TOCA**, ni se "unifica" con este rotulo: son una etiqueta de
          categoria y una frase que explica un hecho, y cambiar la segunda por la
          primera dejaria al admin leyendo una palabra suelta donde antes tenia la
          razon. La frase viaja en el `title`, que es donde cabe.
        */}
        <MetricaDelDia
          clave="urgentes"
          rotulo="Urgentes"
          cifra={resumen.urgentes === null ? '—' : String(resumen.urgentes)}
          textoAccesible={resumen.urgentes === null ? 'no aplica' : undefined}
          title={
            resumen.urgentes === null
              ? 'No aplica: urgente significa que entra huésped el mismo día, y en un día que ya pasó no hay nada que apurar.'
              : 'Entra huésped el mismo día.'
          }
        />

        {/*
          ── LOS GASTOS, Y LA DIVERGENCIA CON `/finanzas` VA EN EL `title` ─────

          `expenses` solo tiene `created_at`, asi que no tiene dia de negocio. El
          proyecto ya decidio en tres migraciones que un gasto pertenece al dia en que
          el aseo se CERRO; la decision del dueno para esta pantalla es la contraria,
          el dia en que el aseo estaba PROGRAMADO, porque pidio que las cuatro
          metricas salgan de la fecha del selector sin excepcion.

          **Las dos cifras pueden no coincidir y eso NO es un defecto.** Sin la frase
          del `title`, esto vuelve como reporte de bug en un mes.

          Y la cifra EXACTA va tambien ahi, porque la abreviatura redondea: `$ 180K`
          sobre cuatro gastos que suman `$ 180.400` es correcto y parece un error de
          cuadre a quien abra el detalle.
        */}
        <MetricaDelDia
          clave="gastos"
          rotulo="Gastos del día"
          cifra={cifraDeGastos(resumen.gastos)}
          textoAccesible={resumen.gastos.conteo === null ? 'no se pudo leer' : undefined}
          title={tituloDeGastos(resumen.gastos, diaEfectivo)}
        />
      </ResumenDelDia>

      {/*
        §13.2: la tira de avisos va debajo de la cabecera de pagina y ENCIMA de la
        region de las dos columnas. No es sticky y no empuja ninguna columna: la
        region de abajo se lleva `flex-1`, asi que lo que esta tira ocupe sale de su
        presupuesto y ninguna de las dos listas desborda.

        Vivia dentro del carril ancho, que este plan borro; sube un nivel y se queda
        donde §13.2 la puso.
      */}
      <TiraAvisosAdmin
        clavePublica={publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        endpointRegistrado={endpointDelAdmin}
      />

      {/*
        ── LAS DOS COLUMNAS (D-05-2) ───────────────────────────────────────────

        30% la lista del dia, 70% el detalle. El reparto vive ENTERO en
        `@utility rejilla-operacion` y esta pagina NO escribe ni un porcentaje: es el
        mismo patron que 10-04 establecio con `rejilla-login`, y su aritmetica esta
        en el bloque de comentario de esa utilidad.

        `min-h-0` y `flex-1`: la region se lleva LO QUE SOBRE tras la cabecera y el
        vistazo, sin aritmetica. Un `calc()` que restara sus alturas se rompe el dia
        que la copia de una metrica pase a dos lineas, y el sintoma seria la columna
        derecha desbordando por abajo.

        El corte es `xl:` (1280) y no `lg:` (1024): a 1024 los utiles son 976, menos
        el hueco son 944, y el 30% da 283px, por debajo de los 360px que hacen falta
        para una tarjeta legible con estado, nombre y hora.

        APILADO, LA LISTA VA PRIMERO en el orden visual, que es el del DOM: lo que se
        opera va antes de lo que se consulta.
      */}
      <div
        data-slot="rejilla-dia"
        className="grid min-h-0 flex-1 grid-cols-1 gap-2xl xl:rejilla-operacion"
      >
        <ListaDelDia
          filas={filasDelDiaSeleccionado}
          acciones={acciones}
          responsables={responsables}
          responsableSinAvisos={responsableSinAvisos}
        />

        {/*
          LA COLUMNA DERECHA NUNCA ESTA VACIA. Sin nada seleccionado enseña la
          informacion general del dia; el detalle del aseo llega en la Task 5 de este
          plan y ocupa este mismo sitio.
        */}
        <InfoDelDia cabecera={cabeceraDelDia}>
          <FranjaCarga chips={chips} sinAvisos={aseadoresSinAvisos} titulo={tituloDeLaFranja} />

          {/*
            EL DESGLOSE DEL DIA: cuantos aseos hay en cada estado.

            Sale de `estadoDeAseo()`, la unica derivacion del repo, asi que sus
            etiquetas son las mismas que pinta cada tarjeta y no una segunda
            redaccion. Solo se listan los estados CON filas: seis lineas en cero
            serian seis lineas diciendo que no hay nada que decir.
          */}
          {desgloseDelDia.length > 0 && (
            <div className="flex flex-col gap-xs">
              <h3 className="text-micro font-semibold tracking-columna text-muted-foreground uppercase">
                Desglose
              </h3>
              <ul className="flex flex-col gap-xs">
                {desgloseDelDia.map(({ clave, etiqueta, conteo }) => (
                  <li key={clave} className="flex items-baseline gap-sm text-body">
                    <span className="tabular-nums text-foreground">{conteo}</span>
                    <span className="text-muted-foreground">{etiqueta}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            Lo que queda MAS ALLA DEL HORIZONTE se CUENTA, no se agrupa: no hay ninguna
            decision que tomar hoy sobre un aseo de dentro de dos semanas, pero saber
            que existe evita la pregunta "¿y no hay nada mas?" (T-05-54).

            VIVIA AL PIE DEL CARRIL ANCHO, que este plan borro. Se MUDA, no se pierde.
          */}
          {masAllaDelHorizonte > 0 && (
            <p className="text-micro text-muted-foreground">
              Hay {masAllaDelHorizonte}{' '}
              {masAllaDelHorizonte === 1 ? 'aseo programado' : 'aseos programados'} después del{' '}
              {formatFechaBog(operacion.horizonte)}.
            </p>
          )}

          {/* La leyenda va UNA SOLA VEZ (§5). */}
          <LeyendaDeAseos />

          {/* `Crear aseo` va en `outline`: el unico boton primario de la pantalla es
              `Confirmar N aseos`, en la cabecera de la lista del dia (§4.2). */}
          <div className="flex">
            <DialogoCrearAseo
              apartamentos={apartamentosParaCrear}
              hoy={operacion.hoy}
              dia={diaEfectivo}
            />
          </div>
        </InfoDelDia>
      </div>

      {/*
        ── EL PANEL DE ASEO (§10, criterio 4) ───────────────────────────────

        Solo se renderiza cuando la lectura devolvio fila. Cero filas significa
        que el aseo no existe o que no se puede ver, y las dos cosas se tratan
        igual: **sin 404, sin toast, sin panel vacio, sin redireccion**, y el
        parametro huerfano SE QUEDA en la direccion, porque limpiarlo reescribiria
        un enlace que alguien pego en un chat (§11.4).

        LA CLAVE VA AQUI Y EN NINGUN OTRO SITIO. Sobre el panel, para que abrir un
        segundo aseo no reutilice el arbol del primero: sin ella no vuelve a hacer
        su entrada, no recoloca el foco y se veria el nombre nuevo dentro del
        panel viejo.

        **NO sobre la barrera de suspension y NO sobre nada que envuelva a la
        tabla del dia** (INSTRUCCION 3 del VEREDICTO de 08-02). Ahi forzaria el
        remonte del subarbol y se llevaria por delante el estado de cliente de los
        bloques de dia, que hoy sobrevive y sobrevive medido.

        Va FUERA de la rejilla de los dos carriles: es un dialogo que la primitiva
        lleva a un portal, asi que su sitio en el arbol no es su sitio en la
        pantalla, y colgarlo de una pista de rejilla solo confundiria al que lea.
      */}
      {aseoAbierto !== null && lecturaDelPanel !== null && (
        <PanelAseo
          key={aseoAbierto.cabecera.aseoId}
          cabecera={aseoAbierto.cabecera}
          // LA MISMA promesa que ya se resolvio arriba para decidir si este panel
          // existe. No es una segunda lectura: una llamada nueva repetiria las
          // seis consultas y las seis firmas.
          //
          // Consecuencia honesta, y va escrita: como la promesa ya esta resuelta
          // cuando el panel se renderiza, **el esqueleto de su barrera de
          // suspension no llega a pintarse**. La barrera se queda igual, porque
          // es lo que mantiene la forma comun de los cuatro paneles, y porque la
          // alternativa —llamar a la definer una vez para validar y otra vez
          // dentro del panel— compraria un esqueleto que 08-02 §6.1 ya midio que
          // NO APARECE NUNCA (cero de doce corridas, porque la respuesta del
          // servidor vuelve en ~70 ms) a cambio de duplicar una consulta de
          // verdad. No vale la pena.
          panel={lecturaDelPanel}
          rutaAlCerrar={rutaAlCerrar}
          rutaDelApartamento={`/apartamentos?apartamento=${aseoAbierto.cabecera.apartamentoId}`}
        />
      )}
    </div>
  );
}
