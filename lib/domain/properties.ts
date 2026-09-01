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
