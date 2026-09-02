/**
 * Concordancia de número para el vocabulario fijo de UI-SPEC §15.
 *
 * Vive en `lib/domain/` y no dentro de un componente porque lo usan DOS
 * pantallas: la celda de conteo de la lista de aseadores (§11.1) y la lista de
 * consecuencias del diálogo de baja (§11.3). Con una copia en cada componente,
 * arreglar el "1 apartamentos" en una sola de las dos es lo que pasa.
 *
 * El término es `apartamento`, no `propiedad`, `listing` ni `inmueble`: el
 * vocabulario fijo del contrato de copywriting no admite sinónimos.
 */
export function apartamentos(n: number): string {
  return n === 1 ? '1 apartamento' : `${n} apartamentos`;
}
