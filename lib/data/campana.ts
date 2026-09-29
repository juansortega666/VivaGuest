import type { SupabaseClient } from '@supabase/supabase-js';

import { leerConsumoDeStorage } from '@/lib/data/almacenamiento';
import {
  leerAlertasAtendidas,
  leerAlertasDelAdmin,
  leerOperacion,
  leerUltimoExitoDeSync,
  type AlertaDelAdmin,
  type FilaDeOperacion,
} from '@/lib/data/operacion';
import type { Database } from '@/lib/database.types';
import {
  alertasComputadas,
  destinoConDia,
  mezclarAlertas,
  type Alerta,
  type AseoParaAlertas,
  type NotificacionParaAlertas,
} from '@/lib/domain/alertas';

/**
 * LA LECTURA DE LA CAMPANA DE ALERTAS DEL SHELL DEL ADMIN (D-05-9, plan 10-05).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TRES COSAS VAN ESCRITAS ACÁ, Y SON LAS QUE HACEN LEGIBLE LA DECISIÓN.
 *
 * ── 1. POR QUÉ ESTA LECTURA VIVE EN EL LAYOUT Y NO EN UNA PÁGINA ──────────
 *
 * La campana vive en la barra superior, o sea en el SHELL, y en App Router el shell
 * es el layout. **No hay forma de que una página rellene una ranura de su layout**:
 * el layout se renderiza por encima y no recibe nada de lo que la página leyó. Así
 * que la lectura tiene que vivir donde vive la superficie.
 *
 * ── 2. POR QUÉ EL TOGGLE `Ver atendidas` DEJA DE VIVIR EN LA DIRECCIÓN ────
 *
 * **Un layout de App Router NO recibe `searchParams`.** La regla que la Fase 4 dejó
 * escrita en `04-13` dice que lo que cambia QUÉ FILAS lee el servidor vive en la
 * URL, y este toggle lo cambia; pero su premisa era que **el control vive en una
 * página que recibe los parámetros**. El control se mudó al shell; la premisa se
 * cayó. Así que esta función trae LAS DOS LISTAS y el toggle filtra en el cliente.
 *
 * La inversión es legítima por eso y no por comodidad. Y no es gratis: se van
 * `PARAM_ATENDIDAS`, `HREF_SIN_ATENDER` y `HREF_ATENDIDAS`, y un enlace guardado con
 * `?alertas=atendidas` deja de filtrar nada.
 *
 * ── 3. EL COSTE, EN CONSULTAS Y NO EN ADJETIVOS ──────────────────────────
 *
 * El layout del admin pasa a hacer **SEIS consultas más por página**, sobre
 * `notifications` (dos: sin atender y atendidas de siete días), `cleanings` (la
 * ventana de catorce días para las computadas, más su RPC de evidencia),
 * `calendar_feeds`, `properties` y el RPC de consumo de Storage. Con un admin,
 * 34 unidades gestionadas y decenas de notificaciones, es irrelevante en tiempo y
 * conviene saberlo antes de que alguien lo mida y lo reporte como regresión.
 *
 * **Y en `/operacion` la ventana de aseos se lee DOS VECES**, una acá y otra en la
 * página, porque las dos la necesitan y no pueden compartirla. Es el precio directo
 * de que la campana viva en el shell.
 *
 * ── LA CONSECUENCIA SOBRE D-14, QUE HAY QUE DECIR EN VOZ ALTA ─────────────
 *
 * D-14 pide UNA marca de frescura visible por pantalla. La que se ve sigue siendo la
 * de la lectura de la PÁGINA (`SincronizacionEnVivo`), y **la campana no reclama
 * ninguna**: su `leidoEnMs` solo alimenta los tiempos relativos de sus propias filas.
 * O sea que hay dos lecturas en instantes distintos con una sola marca a la vista, y
 * pueden diferir en los milisegundos que tarde el layout en resolverse. Es el
 * compromiso, y va escrito para que no se lea como un olvido.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * NADA DE CLIENTE DE SERVICIO (T-04-06) y nada de caché: son datos por usuario, y una
 * entrada compartida se le sirve a otro. Misma regla que el resto de `lib/data/`.
 */

/** Lo que la campana necesita para pintarse, ya mezclado y ordenado. */
export interface AlertasDeLaCampana {
  /** Las SIN ATENDER de este admin, mezcladas con las computadas. */
  sinAtender: Alerta[];
  /**
   * Las ATENDIDAS de los últimos siete días.
   *
   * **SIN NINGUNA COMPUTADA, y es una decisión escrita y no un olvido:** urgente,
   * hora límite vencida, calendario caído y almacenamiento lleno no tienen `read_at`,
   * así que no se pueden atender y no pueden estar en esta lista. Se mezcla con `[]`
   * de forma explícita para que la ausencia se lea como decisión.
   */
  atendidas: Alerta[];
  /** El instante de ESTA lectura. Ver la nota sobre D-14 en la cabecera. */
  leidoEnMs: number;
}

/**
 * Las filas de `cleanings` recortadas a lo que `alertasComputadas()` necesita.
 *
 * MUDADA DESDE `app/(admin)/operacion/page.tsx` SIN CAMBIOS. Es un mapeo, no una
 * consulta: los ocho campos ya vienen en `FilaDeOperacion` y los dos del embed
 * también.
 *
 * `apartamentoHoraLimite` viaja aunque el dominio NO la use para calcular el
 * vencimiento: ese se calcula con `cleanings.hora_limite`, que es el snapshot que el
 * trigger puso al crear el aseo, porque APTO-05 permite pactar una hora distinta para
 * un aseo puntual. Va declarada para que la diferencia entre las dos horas quede a la
 * vista y nadie cambie la fuente por descuido.
 */
function aseosParaAlertas(filas: FilaDeOperacion[]): AseoParaAlertas[] {
  return filas.map((f) => ({
    id: f.id,
    property_id: f.property_id,
    is_managed: f.is_managed,
    state: f.state,
    scheduled_date: f.scheduled_date,
    hora_limite: f.hora_limite,
    is_urgent: f.is_urgent,
    created_at: f.created_at,
    apartamento: f.property?.nombre ?? '',
    apartamentoHoraLimite: f.property?.hora_limite ?? f.hora_limite,
  }));
}

/**
 * Las filas de `notifications` con el nombre del apartamento resuelto Y **EL DÍA
 * METIDO EN EL DESTINO**.
 *
 * ── EL DÍA SE RESUELVE AL PRESENTAR, Y LA BASE NO SE TOCA ────────────────
 *
 * Las tres direcciones que la migración 19 escribe (`dano_reportado`,
 * `gasto_reportado`, `faltantes_reportados`) son `/operacion#aseo-{id}`, **sin día**.
 * Con la pantalla por día, un ancla sin día aterriza en el día de HOY y no encuentra
 * la fila de un aseo de otro día: el clic se ve, se puede pulsar y no lleva a ninguna
 * parte.
 *
 * **Las tres se dejan como están** (prohibición del plan): cambiarlas costaría una
 * migración para arreglar un enlace, y las filas ya escritas seguirían sin día de
 * todas formas. El día se resuelve acá, desde la ventana de aseos que la campana ya
 * trae, y **cuando el aseo no está en la ventana el destino se deja tal cual**: la
 * degradación de un ancla que no encuentra su fila es exactamente la que ya existía
 * para un bloque de día colapsado.
 *
 * `null` y no un `Apartamento desconocido` inventado cuando la notificación no cuelga
 * de ninguno: quien decide cómo se ve un slot vacío es el componente.
 */
function notificacionesParaAlertas(
  filas: AlertaDelAdmin[],
  nombres: Record<string, string>,
  diasPorAseo: Map<string, string>,
): NotificacionParaAlertas[] {
  return filas.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: destinoConDia(n.url, n.cleaning_id === null ? null : diasPorAseo.get(n.cleaning_id)),
    cleaning_id: n.cleaning_id,
    property_id: n.property_id,
    created_at: n.created_at,
    apartamento: n.property_id === null ? null : (nombres[n.property_id] ?? null),
  }));
}

/**
 * `property_id` → nombre, con su propia consulta mínima.
 *
 * ── POR QUÉ UNA CONSULTA PROPIA Y NO `listarApartamentos()` NI UN EMBED ──
 *
 * `listarApartamentos()` trae las tarifas, las asignaciones y los cuartos: es la
 * lectura del catálogo de `/apartamentos` y sería tres veces más de lo que hace falta
 * para poner un nombre en una fila de alerta.
 *
 * Y NO se le pide un embed a `leerAlertasDelAdmin()`, aunque sería un viaje menos: su
 * `select` calza columna a columna con `notifications_inbox_idx`, que es PARCIAL, y
 * su docstring explica que el join no se pide a propósito **porque el catálogo ya
 * está leído en esa página**. En el layout esa premisa no existe, así que en vez de
 * romper la consulta del índice se paga esta, que son 39 filas de dos columnas.
 */
async function leerNombresDeApartamento(
  supabase: SupabaseClient<Database>,
): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('properties').select('id, nombre');

  // Se degrada y no lanza: sin nombres las alertas se pintan con su slot de
  // apartamento vacío, que es un dato de menos. Tumbar el SHELL ENTERO del admin
  // —las cuatro secciones— porque no se pudo resolver un nombre para una fila de la
  // campana sería cambiar un dato que falta por una jornada sin herramienta. Es la
  // misma regla que `marcarSinEvidencia` y `leerGastosDelDia`.
  if (error || !data) return {};

  return Object.fromEntries(data.map((p) => [p.id, p.nombre]));
}

/**
 * Todo lo que la campana necesita, en una llamada.
 *
 * @param userId El destinatario. `notifications.recipient_id` es NOT NULL y no existe
 *   "una notificación para el rol": cada alerta se inserta una vez por admin activo.
 * @param ahoraMs El instante de la lectura, leído UNA vez por el layout.
 */
export async function leerCampana(
  supabase: SupabaseClient<Database>,
  userId: string,
  ahoraMs: number,
): Promise<AlertasDeLaCampana> {
  // En paralelo: son consultas independientes contra la misma sesión, y encadenarlas
  // con `await` seguidos sumaría todas las latencias por nada.
  const [sinAtenderCrudas, atendidasCrudas, operacion, ultimoExito, nombres, consumo] =
    await Promise.all([
      leerAlertasDelAdmin(supabase, userId),
      leerAlertasAtendidas(supabase, userId, ahoraMs),
      leerOperacion(supabase, ahoraMs),
      leerUltimoExitoDeSync(supabase),
      leerNombresDeApartamento(supabase),
      // RET-07. El `.catch` va PEGADO a esta promesa y no envolviendo el
      // `Promise.all`: si envolviera al conjunto, un fallo de esta lectura tumbaría
      // las otras cinco y el shell entero del admin se caería por el consumo de
      // Storage. Y el `null` NO ES CERO: `alertasComputadas()` no emite alerta cuando
      // no se pudo medir, porque afirmar que hay espacio de sobra sin haberlo medido
      // es la mentira que este requisito existe para evitar.
      leerConsumoDeStorage(supabase).catch(() => null),
    ]);

  /**
   * `cleaning_id` → su día de negocio, para meter el día en el destino de las
   * notificaciones que la base escribió sin él. Ver `notificacionesParaAlertas`.
   */
  const diasPorAseo = new Map(operacion.filas.map((f) => [f.id, f.scheduled_date]));

  const computadas = alertasComputadas({
    aseos: aseosParaAlertas(operacion.filas),
    maxUltimoExito: ultimoExito,
    ahoraMs,
    hoy: operacion.hoy,
    consumo,
  });

  return {
    sinAtender: mezclarAlertas(
      notificacionesParaAlertas(sinAtenderCrudas, nombres, diasPorAseo),
      computadas,
    ),
    // El `[]` es explícito y no un descuido: las computadas no tienen `read_at`, así
    // que no se pueden atender y no pueden estar en la lista de atendidas. Ver el
    // campo del tipo.
    atendidas: mezclarAlertas(
      notificacionesParaAlertas(atendidasCrudas, nombres, diasPorAseo),
      [],
    ),
    leidoEnMs: ahoraMs,
  };
}
