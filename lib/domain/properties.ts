import type { Tables } from '@/lib/database.types';

/**
 * UNICA derivacion de estado de apartamento del repo (UI-SPEC §5).
 *
 * Duplicar este `if` en un componente es exactamente como la UI se desincroniza de los
 * CHECK de la base (`props_active_requires_rates`, `props_active_requires_owner`,
 * `props_assignees_only_when_managed` de la migracion 03). Si hay que cambiar la regla,
 * se cambia aqui y en el CHECK, en el mismo commit.
 *
 * Este modulo es puro: no importa React, ni lucide, ni nada de `app/`. Devuelve clave y
 * etiqueta; el icono y el color los decide el componente de presentacion (plan 02-11).
 */

/** Las cuatro claves posibles. `inactiva` es un estado real, no un `incompleta` mal medido. */
export type ClaveEstadoApartamento = 'activa' | 'incompleta' | 'inactiva' | 'informativa';

/** Discriminante tipado que consume la UI. Sin color ni icono: eso es presentacion. */
export type EstadoApartamento = {
  clave: ClaveEstadoApartamento;
  etiqueta: string;
};

/**
 * Lo minimo que hace falta para derivar el estado. Es un `Pick`, no la fila entera, para
 * poder llamarla con el estado en vivo del formulario y no solo con lo que devuelve
 * PostgREST.
 */
export type EntradaEstadoApartamento = Pick<
  Tables<'properties'>,
  'gestion_vivaguest' | 'is_active' | 'tarifa_huesped' | 'pago_aseador' | 'responsable_id'
>;

/** Etiquetas exactas de UI-SPEC §5. Se muestran tal cual, junto al icono. */
const ETIQUETAS: Record<ClaveEstadoApartamento, string> = {
  activa: 'Activa',
  incompleta: 'Incompleta',
  inactiva: 'Inactiva',
  informativa: 'Informativa',
};

/**
 * Deriva el estado de un apartamento.
 *
 * EL ORDEN DE EVALUACION ES PARTE DE LA REGLA y es el de la tabla de UI-SPEC §5:
 * 1. `informativa` primero, porque corta antes que todo lo demas. Una unidad de gestion
 *    externa esta inerte por CHECK (`cl_unmanaged_is_inert`): no tiene tarifas ni
 *    responsable, asi que evaluarla despues la clasificaria como `incompleta`, que para
 *    una unidad externa es un estado que no existe.
 * 2. `activa`.
 * 3. `incompleta`: gestionada, apagada y con algun campo obligatorio en null.
 * 4. `inactiva`: el resto, o sea gestionada, apagada y completa. Es una pausa
 *    deliberada del admin, no un dato que falte.
 *
 * `null` es ausencia; `0` es un valor. Por eso se compara con `== null` y no por
 * falsedad: un `pago_aseador = 0` es una configuracion, no un campo sin llenar.
 */
export function estadoDeApartamento(p: EntradaEstadoApartamento): EstadoApartamento {
  const clave = derivarClave(p);
  return { clave, etiqueta: ETIQUETAS[clave] };
}

function derivarClave(p: EntradaEstadoApartamento): ClaveEstadoApartamento {
  if (!p.gestion_vivaguest) return 'informativa';
  if (p.is_active) return 'activa';

  const incompleto =
    p.tarifa_huesped == null || p.pago_aseador == null || p.responsable_id == null;

  return incompleto ? 'incompleta' : 'inactiva';
}

/**
 * Normaliza texto para el buscador del catalogo (APTO-11, UI-SPEC §7.2): descompone en
 * NFD, quita los diacriticos y baja a minusculas. Escribir `bogota` tiene que encontrar
 * `Bogotá 1`, o el buscador no sirve para este catalogo.
 *
 * Los dos pasos son necesarios: `toLowerCase()` solo no iguala `Á` con `a`, y quitar
 * diacriticos sin NFD previo no hace nada, porque `á` precompuesta es un solo code point.
 *
 * Coste: `normalize` + una clase de caracteres sobre 39 filas en cliente. La regex no
 * tiene alternancia anidada, asi que no hay backtracking catastrofico (T-02-08).
 */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/**
 * Lo minimo que necesita el filtrado de la tabla (UI-SPEC §7.2). Extiende la
 * entrada del estado porque `Ver solo pendientes` se decide con la MISMA
 * derivacion: si el filtro reimplementara "gestionada y apagada", la tabla
 * podria ocultar una fila cuyo icono dice otra cosa.
 */
export type EntradaFiltroApartamento = EntradaEstadoApartamento & {
  nombre: string;
  cluster: string;
  /** Nombre del aseador responsable, o `null` si no hay o la RLS no lo deja ver. */
  responsableNombre: string | null;
  /** Lo que la columna RESPONSABLE pinta en una unidad informativa. */
  contacto_externo: string | null;
};

/** Los tres controles de la toolbar, tal como los ve el filtrado. */
export interface CriteriosDeFiltro {
  /** Texto libre del buscador. Vacio o solo espacios significa "sin filtro". */
  busqueda: string;
  /** Cluster exacto, o `null` para todos. */
  cluster: string | null;
  /** El filtro del banner de montaje: deja `Incompleta` + `Inactiva`. */
  soloPendientes: boolean;
}

/**
 * Filtra el catalogo EN CLIENTE, sobre las filas ya cargadas (UI-SPEC §7.2).
 *
 * Son 39 filas: un round-trip al servidor por tecla es peor UX y mas carga.
 *
 * ── POR QUE ES UNA FUNCION PURA EN `lib/domain/` Y NO UN `useMemo` DENTRO DEL
 *    COMPONENTE ────────────────────────────────────────────────────────────────
 * Porque asi tiene tests. Dentro del componente, la unica forma de comprobar que
 * `bogota` encuentra `Bogotá 1` seria levantar el navegador entero, y las tres
 * trampas de esta funcion (la conjuncion de los tres criterios, la comparacion
 * sin tildes y que `soloPendientes` use la derivacion unica) son de logica pura.
 *
 * ── LOS TRES CRITERIOS SE COMBINAN CON **Y**, NO CON **O** ────────────────────
 * Buscar `bogota` con el cluster `Cartagena` seleccionado tiene que dar cero, no
 * las 25 de Bogota. Un `||` aqui hace que el `Select` de cluster parezca roto.
 *
 * El texto se compara con `normalizar()` en los campos que la tabla pinta como
 * texto buscable: nombre, cluster, nombre del responsable y —solo para las
 * informativas, que es donde la columna RESPONSABLE lo muestra— el contacto
 * externo. Buscar algo que esta a la vista en pantalla y no encontrarlo es un
 * buscador roto.
 */
export function filtrarApartamentos<T extends EntradaFiltroApartamento>(
  filas: readonly T[],
  criterios: CriteriosDeFiltro,
): T[] {
  // Se normaliza UNA vez, fuera del bucle. Dentro serian 39 normalizaciones del
  // mismo texto por pulsacion.
  const termino = normalizar(criterios.busqueda.trim());

  return filas.filter((fila) => {
    if (criterios.cluster !== null && fila.cluster.trim() !== criterios.cluster) {
      return false;
    }

    if (criterios.soloPendientes) {
      const { clave } = estadoDeApartamento(fila);
      // `informativa` NO es un pendiente: no se monta y no cuenta en el banner.
      // `activa` ya esta lista. Queda exactamente lo que falta por terminar.
      if (clave !== 'incompleta' && clave !== 'inactiva') return false;
    }

    if (termino.length === 0) return true;

    return camposBuscables(fila).some((campo) => normalizar(campo).includes(termino));
  });
}

/** Los campos que el buscador mira, en el orden en que la tabla los pinta. */
function camposBuscables(fila: EntradaFiltroApartamento): string[] {
  const campos = [fila.nombre, fila.cluster];
  if (fila.responsableNombre) campos.push(fila.responsableNombre);
  // Solo cuenta donde la tabla lo ENSEÑA: en una gestionada la columna muestra al
  // responsable, y encontrar una fila por un contacto externo invisible seria un
  // resultado que el admin no puede explicar mirando la pantalla.
  if (!fila.gestion_vivaguest && fila.contacto_externo) campos.push(fila.contacto_externo);
  return campos;
}

/** Los conteos del pie de tabla (§7.2) y del banner de montaje (§9.1). */
export interface ResumenDelCatalogo {
  /** Todas las unidades del catalogo. */
  total: number;
  /** Las que se montan dentro del sistema. Es el DENOMINADOR del banner. */
  gestionadas: number;
  /** Las de gestion externa. Nunca se montan. */
  informativas: number;
  /** Gestionadas y activas: el numerador del banner. */
  listas: number;
  /** Gestionadas que todavia no estan activas. */
  pendientes: number;
}

/**
 * Cuenta el catalogo para el pie de tabla y el banner de montaje.
 *
 * EL DENOMINADOR DEL BANNER SE DERIVA, NO SE ESCRIBE. Hoy son 34 gestionadas de
 * 39 unidades, pero el dia que el admin marque una como gestion externa desde el
 * formulario, un `34` escrito a mano dejaria el banner mintiendo hasta que
 * alguien lo notara. Y `39` como denominador seria mentira desde el primer dia:
 * las informativas no se montan.
 *
 * Se cuenta sobre la lista COMPLETA y no sobre la filtrada: un banner de progreso
 * que cambia de denominador al teclear en el buscador no mide el montaje, mide el
 * filtro.
 */
export function resumenDelCatalogo(
  filas: readonly EntradaEstadoApartamento[],
): ResumenDelCatalogo {
  let gestionadas = 0;
  let listas = 0;

  for (const fila of filas) {
    const { clave } = estadoDeApartamento(fila);
    if (clave === 'informativa') continue;
    gestionadas += 1;
    if (clave === 'activa') listas += 1;
  }

  return {
    total: filas.length,
    gestionadas,
    informativas: filas.length - gestionadas,
    listas,
    pendientes: gestionadas - listas,
  };
}
