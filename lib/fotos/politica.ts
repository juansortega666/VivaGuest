/**
 * La política de compresión: cuánto se baja, hasta dónde y cuándo parar.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * MÓDULO PURO, Y ESTÁ SEPARADO DEL CABLEADO A PROPÓSITO.
 *
 * `lib/fotos/comprimir.ts` necesita `canvas`, `Image` y `FileReader`, así que no
 * se puede instrumentar con Vitest, que corre en Node. Si la política viviera
 * ahí dentro, no habría forma de probar la decisión que de verdad importa:
 * **cuántas veces se reintenta y con qué calidad**.
 *
 * Es el mismo patrón que `lib/push/sw-handlers.ts` de la Fase 5: la lógica que
 * no se puede instrumentar sale del archivo que no se puede instrumentar.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Lado largo máximo, en píxeles. CHECK-04.
 *
 * No es una preferencia estética: es el presupuesto de Storage del free tier,
 * calculado en `PROJECT.md` sobre ~6 fotos por aseo.
 */
export const LADO_LARGO_PX = 1280;

/** Objetivo de peso, en kilobytes. CHECK-04. */
export const OBJETIVO_KB = 200;

/** El objetivo en bytes, que es la unidad en la que se mide un `Blob`. */
export const OBJETIVO_BYTES = OBJETIVO_KB * 1024;

/**
 * Las calidades que se prueban, en orden.
 *
 * ── POR QUÉ UNA LISTA Y NO UNA BÚSQUEDA BINARIA ─────────────────────────────
 *
 * Cada intento es una recodificación completa de la imagen, o sea entre 100 y
 * 300 ms en un teléfono de gama media. Una búsqueda binaria haría entre 5 y 7
 * intentos para afinar un valor que a nadie le importa: la diferencia entre
 * calidad 0.72 y 0.75 no se ve, y sí se siente el segundo y medio de espera.
 *
 * Cuatro escalones cubren el rango útil. El primero ya acierta en la mayoría de
 * fotos de 12 megapíxeles reescaladas a 1280.
 */
export const CALIDADES = [0.8, 0.65, 0.5, 0.4] as const;

/** Cuántos intentos hay como máximo. Es la longitud de la lista, no un número suelto. */
export const MAX_INTENTOS = CALIDADES.length;

/** La calidad del intento `n` (empezando en 0). `null` si ya no quedan. */
export function calidadDelIntento(intento: number): number | null {
  return CALIDADES[intento] ?? null;
}

/** Ya está por debajo del objetivo. */
export function cumpleObjetivo(bytes: number): boolean {
  return bytes <= OBJETIVO_BYTES;
}

/**
 * Hay que seguir intentando.
 *
 * Falso cuando ya cumple, y falso también cuando se agotaron los intentos: en
 * ese caso **se devuelve la mejor que se consiguió** y el llamador decide. No
 * se lanza, y la razón es de producto: una aseadora de pie frente a un baño no
 * puede quedarse sin poder subir su evidencia porque una foto concreta se
 * resistió a bajar de 200 kB. Un archivo un poco más grande es un problema de
 * cuota; una evidencia que no se puede subir es un aseo sin prueba.
 */
export function debeReintentar(bytes: number, intento: number): boolean {
  if (cumpleObjetivo(bytes)) return false;
  return intento + 1 < MAX_INTENTOS;
}

/**
 * El tamaño de destino, conservando la proporción y **sin agrandar nunca**.
 *
 * Comprimir no es escalar hacia arriba: una foto de 800 px de lado largo se
 * queda en 800. Agrandarla pesaría más y no añadiría ni un detalle.
 */
export function dimensionesDestino(
  ancho: number,
  alto: number,
  ladoLargo: number = LADO_LARGO_PX,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto);
  if (mayor <= ladoLargo) return { ancho, alto };
  const factor = ladoLargo / mayor;
  return {
    ancho: Math.round(ancho * factor),
    alto: Math.round(alto * factor),
  };
}
