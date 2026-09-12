import Compressor from 'compressorjs';

import {
  LADO_LARGO_PX,
  calidadDelIntento,
  cumpleObjetivo,
  debeReintentar,
} from './politica';

/**
 * Comprimir la foto EN EL TELÉFONO, antes de que salga de él.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * DOS RAZONES, Y LA SEGUNDA NO ES DE COSTO:
 *
 *   1. **Storage.** El presupuesto del free tier se calcula en `PROJECT.md`
 *      sobre ~6 fotos por aseo. Una foto de teléfono sin tocar pesa 4 MB.
 *
 *   2. **EL EXIF DE UNA FOTO LLEVA LAS COORDENADAS GPS DE DONDE SE TOMÓ.** O
 *      sea la casa donde está la aseadora en ese momento. CHECK-04 exige
 *      eliminarlo, y eso no es una optimización: es que la ubicación de una
 *      persona no tiene por qué viajar dentro de una foto de un baño.
 *
 * ── LA CONTRADICCIÓN DE `CLAUDE.md`, RESUELTA Y MEDIDA ──────────────────────
 *
 * `CLAUDE.md` §6 eligió otra librería y decía `preserveExif: true`. CHECK-04
 * dice lo contrario. **Gana CHECK-04**, por la razón 2 de arriba.
 *
 * Y con `compressorjs` la contradicción desaparece sola: su `retainExif` es
 * `false` por defecto, y su `checkOrientation` (también por defecto) **lee la
 * orientación y rota los píxeles**. Así la foto sale derecha SIN necesitar la
 * etiqueta que acabamos de borrar, que era justo el problema difícil.
 *
 * ── POR QUÉ `compressorjs` Y NO OTRA ────────────────────────────────────────
 *
 * Comparadas el 2026-09-12 con datos del registry y de GitHub:
 *
 *   · `compressorjs`               5766 estrellas, push 2026-08-29, 5 issues
 *   · `pica`                       4150 estrellas, pero es un *resampler*, no
 *                                  maneja orientación ni EXIF
 *   · `browser-image-compression`  1715 estrellas y **3 años sin release**;
 *                                  además declara `uzip` como dependencia de
 *                                  producción sin usarla en el bundle
 *   · `image-conversion`            954 estrellas, abandonada en 2022
 *
 * Cinco issues abiertos con 5,7k estrellas es la señal de mantenimiento que
 * decidió. MIT, dos dependencias y las dos son hojas sin dependencias propias.
 *
 * ── Y POR QUÉ JPEG Y NO WEBP ────────────────────────────────────────────────
 *
 * Se investigó el 2026-09-12. **Safari no puede CODIFICAR WebP en canvas**
 * (`browser-compat-data`: `toBlob > type_parameter_webp > safari: false`, y
 * `safari_ios` lo espeja). El iPhone lo muestra pero no lo genera, y toda esta
 * compresión ocurre en el cliente. WebP obligaría a mantener dos caminos con el
 * iPhone siempre en el viejo.
 *
 * Medido además en Chromium sobre una imagen con ruido: a calidad 0.6 el WebP
 * salió **34% MÁS GRANDE** que el JPEG. "WebP siempre pesa menos" es falso;
 * depende del contenido.
 *
 * ── QUÉ NO HACE ESTE MÓDULO ─────────────────────────────────────────────────
 *
 * **No muestra nada.** No hay indicador de compresión en pantalla (§8.3 del
 * contrato de UI): es trabajo del sistema, no información útil para quien está
 * de pie frente a un baño. La pantalla solo enseña la foto y su progreso de
 * subida.
 *
 * ── DÓNDE ESTÁ LA LÓGICA PROBADA ────────────────────────────────────────────
 *
 * En `lib/fotos/politica.ts`, que es puro y sí tiene tests. Este archivo es
 * cableado: necesita `canvas` e `Image`, así que Vitest (que corre en Node) no
 * puede instrumentarlo. Mismo criterio que `lib/push/sw-handlers.ts`.
 * ════════════════════════════════════════════════════════════════════════════
 */

export interface FotoComprimida {
  /** Lo que se sube. JPEG, sin EXIF, con la orientación ya aplicada. */
  blob: Blob;
  /** Las tres columnas de `cleaning_photos` que salen de aquí. */
  bytes: number;
  width: number;
  height: number;
  mimeType: 'image/jpeg';
  /** Cuántas recodificaciones costó. Para el SUMMARY, no para la pantalla. */
  intentos: number;
  /** Falso si se agotaron los intentos y se devuelve la mejor conseguida. */
  cumplioObjetivo: boolean;
}

/** Una pasada de compresión. Envuelve el callback de la librería en promesa. */
function unaPasada(archivo: File | Blob, calidad: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    new Compressor(archivo, {
      // El lado largo, conservando proporción y sin agrandar: `resize: 'none'`
      // más `maxWidth`/`maxHeight` es exactamente eso en esta librería.
      maxWidth: LADO_LARGO_PX,
      maxHeight: LADO_LARGO_PX,
      resize: 'none',
      quality: calidad,
      mimeType: 'image/jpeg',
      // Los dos que implementan CHECK-04. Son los valores por defecto de la
      // librería; se escriben EXPLÍCITOS porque son un requisito y no una
      // preferencia, y un cambio de default de la librería no puede pasar
      // desapercibido.
      checkOrientation: true,
      retainExif: false,
      success: (resultado) => resolver(resultado),
      error: (e) => rechazar(e),
    });
  });
}

/** Alto y ancho reales del blob resultante, para las columnas de la fila. */
async function medir(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('no se pudo medir la foto comprimida'));
      img.src = url;
    });
    return { width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Comprime hasta cumplir el objetivo o hasta agotar los intentos.
 *
 * **No lanza cuando no llega al objetivo.** Devuelve la mejor conseguida con
 * `cumplioObjetivo: false`, y el llamador decide. La razón está en
 * `politica.ts`: una evidencia que no se puede subir es peor que un archivo un
 * poco más grande.
 */
export async function comprimirFoto(archivo: File): Promise<FotoComprimida> {
  let mejor: Blob | null = null;
  let intentos = 0;

  for (let i = 0; i < 10; i += 1) {
    const calidad = calidadDelIntento(i);
    if (calidad === null) break;

    const blob = await unaPasada(archivo, calidad);
    intentos = i + 1;
    // Siempre se conserva la última, que es la más pequeña de las probadas.
    mejor = blob;

    if (!debeReintentar(blob.size, i)) break;
  }

  if (mejor === null) throw new Error('la compresion no produjo ningun resultado');

  const { width, height } = await medir(mejor);

  return {
    blob: mejor,
    bytes: mejor.size,
    width,
    height,
    mimeType: 'image/jpeg',
    intentos,
    cumplioObjetivo: cumpleObjetivo(mejor.size),
  };
}
