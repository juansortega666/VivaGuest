import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { leerCostoPorAseadora } from '@/lib/data/finanzas';
import {
  identificadorValido,
  leerAhoraMismo,
  leerAseadoraDeLaFicha,
  type AhoraMismo,
} from '@/lib/data/finanzas-detalle';
import { leerPeriodoPendienteDeCierre } from '@/lib/data/pagos';
import { costoPorAseadora } from '@/lib/domain/finanzas';

/**
 * LA LECTURA DEL PANEL DE ASEADORA (08-UI-SPEC §9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * «EL PERIODO ABIERTO» NO ES EL RANGO DEL FILTRO DE LA PANTALLA.
 *
 * D8-4 y §9.2 llaman `EN EL PERIODO ABIERTO` al grupo 4, y en este producto eso
 * significa **el periodo de pago que todavia no se ha cerrado**, que es el que
 * devuelve `leerPeriodoPendienteDeCierre()`. No es el rango que el admin tenga
 * puesto arriba en `/finanzas`.
 *
 * La razon es la etiqueta: con el filtro en `dia`, usar el rango de la pantalla
 * haria que `Lleva ganado` dijera lo ganado en UN DIA, que no es lo que la
 * etiqueta promete. `Lleva ganado` solo se puede leer contra un periodo que
 * todavia esta corriendo, y el unico que lo esta es el de pago sin cerrar.
 *
 * ── DE DONDE SALEN LOS TRES NUMEROS DEL GRUPO 4 ─────────────────────────
 *
 * Con el rango del periodo abierto, `leerCostoPorAseadora()` devuelve el pago,
 * los gastos y el numero de aseos de cada persona. Son exactamente los tres de
 * §9.2, y son los MISMOS que ya pinta la fila del bloque 3 del Resumen: si se
 * calcularan aqui por otra via, el panel y la fila de debajo podrian decir dos
 * cifras distintas sobre la misma persona en la misma pantalla.
 *
 * **Sin periodo abierto no se hace esa lectura** y el grupo pinta su vacio, que
 * es el caso normal del dia siguiente a un cierre.
 *
 * ── LA TABLA DE PERIODOS NO SE CONSULTA DIRECTAMENTE ────────────────────
 *
 * Tiene revocado todo para el rol autenticado desde la migracion 23, asi que la
 * funcion `security definer` que ya existe es la unica ruta. Un `from(...)`
 * sobre esa tabla aqui no devolveria menos datos: devolveria cero filas y el
 * panel diria que no hay periodo abierto cuando si lo hay.
 *
 * ── EL PRESUPUESTO, CONTADO ─────────────────────────────────────────────
 *
 * `/finanzas` sin panel hace 2 consultas. Con el panel abierto son **7**, y solo
 * **2 latencias mas** que sin el:
 *
 *   latencia 1 · las 2 de la pantalla + la de la aseadora, todas en el mismo
 *                `Promise.all` del anfitrion
 *   latencia 2 · el aseo en curso, las asignaciones y el periodo abierto, las
 *                tres en paralelo
 *   latencia 3 · el costo de esa persona en el rango del periodo abierto
 *
 * La tercera es la unica encadenada y no se puede evitar: el rango que necesita
 * sale de la lectura anterior.
 *
 * ── LO QUE ESTE MODULO NO DEVUELVE, NI VA A DEVOLVER ────────────────────
 *
 * Nada que situe a una persona en el espacio, ningun par de cifras que la
 * ubique, ninguna marca de ultima conexion y ningun indicador de presencia.
 * §9.2 lo excluye, las funciones de la base que se consumen no declaran ninguna
 * columna de la que se pueda derivar, y la asercion 76 de la suite pgTAP lo
 * afirma sobre el `returns table`. **Lo que no existe no se puede renderizar por
 * accidente.** Este archivo, como su componente, tiene un grep encima que vigila
 * ese vocabulario incluso en los comentarios (§14.6), por eso aqui se describe
 * el patron y no se escribe ningun token de esa lista.
 *
 * ── PROYECCION ENUMERADA, Y EL CLIENTE POR PARAMETRO ────────────────────
 *
 * Las mismas dos reglas del resto de la capa: nada de comodines en el `select`
 * (la migracion 24 dejo grants por columna, y un comodin falla entero con
 * `42501` en vez de traer de mas), y el cliente llega por argumento para que la
 * misma funcion sirva a un RSC con el JWT del admin y a un test de integracion.
 * ════════════════════════════════════════════════════════════════════════════
 */

type Cliente = SupabaseClient<Database>;

/** Un apartamento dentro de las asignaciones de una persona. Solo el nombre. */
export type ApartamentoAsignado = {
  id: string;
  nombre: string;
};

/**
 * El grupo 4, ya resuelto.
 *
 * `null` cuando no hay ningun periodo de pago sin cerrar. Es una ausencia de
 * PERIODO, no de cifras: por eso no se devuelve un objeto en ceros, que el panel
 * pintaria como «lleva ganado $ 0» sobre un periodo que no existe.
 */
export type PeriodoAbierto = {
  desde: string;
  hasta: string;
  /** Pago mas gastos reembolsados. Es lo que D7-2 define como lo que cuesta. */
  ganado: number;
  aseos: number;
  gastos: number;
};

/** Los cinco datos de D8-4, y ni uno mas. */
export type PanelDeAseadora = {
  id: string;
  nombre: string;
  /** El segundo dato de la cabecera: `Activa` o `Desactivada`. */
  estaActiva: boolean;
  /** El grupo 1, con sus tres estados ya resueltos por la lectura de la Fase 7. */
  ahora: AhoraMismo;
  /** Grupo 2, en orden alfabetico. Vacio significa que el grupo no se pinta. */
  responsableDe: ApartamentoAsignado[];
  /** Grupo 3, igual. */
  suplenteEn: ApartamentoAsignado[];
  /** Grupo 4, o `null` si no hay ningun periodo de pago sin cerrar. */
  periodoAbierto: PeriodoAbierto | null;
};

/**
 * Todo lo que pinta el panel de una persona, o `null` si no hay panel que pintar.
 *
 * ── LA ASEADORA VA PRIMERA Y VA SOLA, Y ESA ES LA DECISION DE FORMA ─────
 *
 * `leerAseadoraDeLaFicha()` filtra por el papel de aseador y devuelve nulo tanto
 * si el identificador no es de nadie como si la RLS no lo deja ver. Los dos
 * casos dan lo mismo a proposito. Si devuelve nulo, **las otras cuatro lecturas
 * sobran** y no se hacen: un panel que no se va a renderizar no tiene por que
 * costar cuatro viajes a la base.
 *
 * ── Y POR QUE LA EXISTENCIA NO SE VALIDA CONTRA LA LISTA DEL RESUMEN ────
 *
 * Porque `/finanzas` lee el costo por aseadora **del rango filtrado**, o sea
 * solo las personas con aseos o gastos en ese rango. Con el filtro en `dia`, una
 * aseadora que no trabajo ese dia no aparece en esa lista aunque exista
 * perfectamente. Copiar el patron de `/apartamentos` (resolver contra lo que la
 * pagina ya leyo) haria que un enlace valido pegado en un chat abriera la
 * pantalla sin panel. La ventana recortada no puede decidir la existencia; es la
 * misma trampa que documenta `app/(admin)/operacion/page.tsx`.
 *
 * `ahora` nulo tambien cierra el panel: la funcion de la base devuelve siempre
 * una fila si el perfil existe, asi que cero filas solo puede significar que ese
 * identificador no es de ningun perfil.
 */
export async function leerPanelDeAseadora(
  supabase: Cliente,
  aseadoraId: string,
): Promise<PanelDeAseadora | null> {
  const aseadora = await leerAseadoraDeLaFicha(supabase, aseadoraId);
  if (!aseadora) return null;

  const [ahora, asignaciones, periodo] = await Promise.all([
    leerAhoraMismo(supabase, aseadoraId),
    leerAsignacionesDeAseadora(supabase, aseadoraId),
    leerPeriodoPendienteDeCierre(supabase),
  ]);

  if (!ahora) return null;

  return {
    id: aseadora.id,
    nombre: aseadora.nombre,
    estaActiva: ahora.estaActiva,
    ahora,
    responsableDe: asignaciones.responsableDe,
    suplenteEn: asignaciones.suplenteEn,
    periodoAbierto:
      periodo === null
        ? null
        : await leerGanadoDelPeriodo(supabase, aseadoraId, periodo),
  };
}

/**
 * En que apartamentos es responsable y en cuales suplente, en UNA consulta.
 *
 * ── UNA SOLA IDA, Y EL ORDEN LO HACE POSTGRES ───────────────────────────
 *
 * Las dos listas salen de las mismas filas de `properties`, asi que separarlas
 * en dos consultas serian dos viajes por el mismo conjunto. El filtro es la
 * disyuncion de las dos columnas de asignacion y el reparto se hace en memoria
 * sobre un maximo de 39 filas.
 *
 * El orden alfabetico lo pone la base con la colacion de la columna: §9.3 lo
 * exige y la razon no es estetica. Cualquier otro orden (por carga, por cluster)
 * se lee como una clasificacion de personas, que es la trampa que el contrato de
 * la Fase 7 ya documento para este mismo equipo.
 *
 * Se traen los inactivos tambien: un apartamento desactivado del que alguien
 * sigue siendo responsable es un dato del que responde esa persona, y filtrarlo
 * aqui le quitaria al conteo del encabezado la mitad de su sentido.
 *
 * ── LA FORMA SE VUELVE A COMPROBAR AQUI, Y NO ES UNA COPIA OCIOSA ───────
 *
 * Es la unica lectura del modulo donde el identificador entra en una EXPRESION
 * DE FILTRO y no como argumento de una funcion: la disyuncion se manda a
 * PostgREST como texto. Un identificador con una coma o un parentesis dentro
 * reescribiria el filtro, que es una clase de defecto distinta a la que cubre el
 * guarda del anfitrion. Con la forma comprobada, lo unico que puede viajar ahi
 * son 36 caracteres hexadecimales y guiones.
 */
async function leerAsignacionesDeAseadora(
  supabase: Cliente,
  aseadoraId: string,
): Promise<{ responsableDe: ApartamentoAsignado[]; suplenteEn: ApartamentoAsignado[] }> {
  const seguro = identificadorValido(aseadoraId);
  if (seguro === null) return { responsableDe: [], suplenteEn: [] };

  const { data, error } = await supabase
    .from('properties')
    .select('id, nombre, responsable_id, suplente_id')
    .or(`responsable_id.eq.${seguro},suplente_id.eq.${seguro}`)
    .order('nombre', { ascending: true });

  if (error) throw new Error(error.message);

  const responsableDe: ApartamentoAsignado[] = [];
  const suplenteEn: ApartamentoAsignado[] = [];

  for (const fila of data ?? []) {
    const apartamento: ApartamentoAsignado = { id: fila.id, nombre: fila.nombre };
    // Las dos listas NO son excluyentes en el tipo, pero si en la practica: un
    // CHECK de la base impide que la misma persona sea responsable y suplente
    // del mismo apartamento. Se reparte con dos ifs y no con un if/else para que,
    // si ese CHECK cayera algun dia, el nombre saliera en los dos grupos en vez
    // de desaparecer del segundo sin que nada lo dijera.
    if (fila.responsable_id === aseadoraId) responsableDe.push(apartamento);
    if (fila.suplente_id === aseadoraId) suplenteEn.push(apartamento);
  }

  return { responsableDe, suplenteEn };
}

/**
 * Lo que lleva ganado esa persona dentro del periodo de pago abierto.
 *
 * ── LA LECTURA Y LA CUENTA SON LAS DEL BLOQUE 3, LITERALES ──────────────
 *
 * `leerCostoPorAseadora()` devuelve a todas las personas con actividad en el
 * rango, y `costoPorAseadora()` del dominio es quien define que «lo que cuesta»
 * es el pago mas los gastos. Se llaman las dos y se recorta la fila de esta
 * persona. Sumar aqui los dos campos a mano seria una segunda definicion de la
 * misma cuenta, y el dia que una de las dos cambie el panel y la fila de debajo
 * dirian cifras distintas sobre la misma persona en la misma pantalla.
 *
 * Y hay una segunda razon, que es la trampa que documenta
 * `lib/data/finanzas-detalle.ts`: el dominio **cuela los enteros antes de
 * sumarlos**. Dos cifras que llegaran como texto se concatenarian con el
 * operador de suma y el resultado seguiria siendo perfectamente formateable.
 *
 * Con ~8 personas, recortar en memoria cuesta una comparacion por fila. La
 * proporcion que esa funcion tambien calcula no se usa aqui: el panel no pinta
 * ninguna barra, porque comparar personas es justo lo que un panel de UNA
 * persona no hace.
 *
 * **Sin fila no se devuelve un objeto en ceros**: esa persona no tiene ningun
 * aseo en el periodo abierto, que es exactamente el vacio de §15.2
 * (`Todavía no lleva ningún aseo en este periodo.`), y un `$ 0` con `0 aseos`
 * debajo dice lo mismo ocupando dos lineas y pareciendo una cifra.
 */
async function leerGanadoDelPeriodo(
  supabase: Cliente,
  aseadoraId: string,
  periodo: { desde: string; hasta: string },
): Promise<PeriodoAbierto | null> {
  const crudas = await leerCostoPorAseadora(supabase, periodo);
  const suya = costoPorAseadora(crudas).find((fila) => fila.aseadoraId === aseadoraId);

  if (suya === undefined) return null;

  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    ganado: suya.costo,
    aseos: suya.aseos,
    gastos: suya.gastos,
  };
}
