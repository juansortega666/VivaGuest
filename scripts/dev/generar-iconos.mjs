#!/usr/bin/env node
/**
 * GENERA LOS CINCO PNG DE `public/` DESDE `public/marca/vivaguest-tile.svg`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EL RASTERIZADOR ES PLAYWRIGHT Y NO UNA LIBRERÍA DE IMAGEN
 *
 * `@playwright/test@1.62.1` YA ESTÁ INSTALADO y ya pasó la compuerta humana de
 * legitimidad de dependencias del plan 05-01. Meter `sharp`, `resvg` o
 * `puppeteer` solo para convertir un SVG en cinco PNG significaría abrir esa
 * compuerta otra vez, con su verificación contra el registry, para una tarea que
 * el Chromium que ya está en disco hace igual de bien.
 *
 * Y hay una segunda razón, menos obvia: el motor que rasteriza es el MISMO que
 * después va a pintar el icono en el teléfono. Un SVG que renderice raro en
 * Chromium se ve raro acá, en la generación, y no en la pantalla de inicio de la
 * aseadora.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ── ES REEJECUTABLE, Y ESO ES UN CRITERIO, NO UNA CORTESÍA ────────────────────
 *
 * Correrlo dos veces produce los mismos cinco archivos. Nada depende de fuentes
 * instaladas en la máquina (las letras del SVG son geometría, ver el comentario
 * del propio SVG), ni de la red, ni de `.next/`. Lo único que hace falta es el
 * Chromium de Playwright; si no está descargado, el script lo dice con el
 * comando exacto en vez de escupir una traza.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────
 *
 *   node scripts/dev/generar-iconos.mjs
 */

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FUENTE = resolve(RAIZ, "public/marca/vivaguest-tile.svg");

/**
 * El cuadro local en el que dibuja `#marca` dentro del SVG. Si se cambia allá,
 * se cambia acá: es la única constante compartida entre los dos archivos.
 */
const MARCA = { ancho: 210, alto: 100 };

/** El lado del `viewBox` del SVG. La escala se calcula siempre contra este. */
const LIENZO = 512;

/**
 * Las cinco variantes, con la regla de `05-UI-SPEC.md` §14.2 que justifica cada
 * una. `fraccion` es cuánto del ancho ocupa la marca.
 */
const VARIANTES = [
  {
    archivo: "public/icon-192.png",
    lado: 192,
    fraccion: 0.55,
    fondo: true,
    // Tile lleno, sin transparencia. Es el `icon` de toda notificación.
    alfaEsperada: false,
  },
  {
    archivo: "public/icon-512.png",
    lado: 512,
    fraccion: 0.55,
    fondo: true,
    alfaEsperada: false,
  },
  {
    archivo: "public/icon-maskable-512.png",
    lado: 512,
    // LA MARCA ENTERA TIENE QUE CABER EN EL CÍRCULO CENTRAL DE 410 px: fuera de
    // ahí Android recorta, y recorta distinto en cada fabricante.
    //
    // La cuenta, hecha y no estimada: al 45% la marca mide 230.4 × 109.7, y la
    // diagonal de ese rectángulo —que es lo que de verdad hay que meter en el
    // círculo— da sqrt(230.4² + 109.7²) = 255.2, contra los 410 disponibles.
    // Sobra un 38%. Al 55% del resto de variantes la diagonal sería 311.9, que
    // TAMBIÉN cabría, pero sin margen para que el logotipo definitivo de 2018
    // sea más ancho que estas dos letras.
    fraccion: 0.45,
    fondo: true,
    alfaEsperada: false,
  },
  {
    archivo: "public/apple-touch-icon.png",
    lado: 180,
    fraccion: 0.55,
    fondo: true,
    // SIN TRANSPARENCIA Y SIN ESQUINAS REDONDEADAS. iOS aplica su propia
    // máscara: un icono pre-redondeado sale con doble redondeo, y uno con
    // transparencia sale con el fondo en negro. Acá no se dibuja ningún
    // `rx`/`ry` y el fondo cubre el lienzo entero.
    alfaEsperada: false,
  },
  {
    archivo: "public/badge-72.png",
    lado: 72,
    // Sin tile detrás, la marca puede ocupar mucho más ancho sin verse apretada.
    fraccion: 0.78,
    // MONOCROMO, SILUETA SÓLIDA SOBRE TRANSPARENTE. Android lo pinta como
    // máscara en la barra de estado: usa solo el canal alfa y descarta el color.
    // Un badge a color sale como un cuadrado gris.
    fondo: false,
    alfaEsperada: true,
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Verificación del PNG, leyendo la cabecera a mano
// ───────────────────────────────────────────────────────────────────────────

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Lee ancho, alto y tipo de color del IHDR. Sin librería: el IHDR es el primer
 * chunk y está en posición fija.
 *
 * Existe porque la alternativa es confiar en que el screenshot salió del tamaño
 * pedido, y un icono de 512 donde se esperaba uno de 180 no rompe nada visible:
 * simplemente se ve mal en un teléfono que nadie tiene a mano.
 */
function leerCabeceraPng(datos) {
  if (!datos.subarray(0, 8).equals(FIRMA_PNG)) {
    throw new Error("el archivo generado no es un PNG");
  }
  return {
    ancho: datos.readUInt32BE(16),
    alto: datos.readUInt32BE(20),
    // 0 gris, 2 RGB, 3 paleta, 4 gris+alfa, 6 RGBA.
    tipoDeColor: datos.readUInt8(25),
  };
}

const TIENE_ALFA = new Set([4, 6]);

// ───────────────────────────────────────────────────────────────────────────
// Generación
// ───────────────────────────────────────────────────────────────────────────

/**
 * El HTML que envuelve el SVG, con la variante YA APLICADA.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * POR QUÉ LOS PARÁMETROS SE APLICAN EN UN `<script>` INLINE Y NO CON
 * `page.evaluate()` DESPUÉS DE CARGAR. ESTO ES UN BUG MEDIDO, NO UNA PREFERENCIA.
 *
 * La primera versión hacía `setContent()` y después un `evaluate()` que movía
 * `#marca` y quitaba `#fondo`. Resultado: el script NO era reejecutable. Cinco
 * corridas seguidas produjeron TRES combinaciones distintas de hashes, porque
 * `screenshot()` capturaba unas veces el frame anterior a esa mutación y otras
 * el posterior. Confirmado midiendo: el hash `d70998ca` de `icon-192.png`
 * resultó ser, exactamente, el del SVG renderizado SIN mutar.
 *
 * El síntoma es especialmente feo porque los dos frames se ven IGUALES a ojo:
 * el transform por defecto del SVG ya es el del 55%, y lo único que cambia es
 * la precisión de los flotantes. O sea, no hay nada que mirar; solo `git status`
 * ensuciándose después de correr un comando que no cambió nada.
 *
 * Encadenar dos `requestAnimationFrame` antes del screenshot NO lo arregló: se
 * probó y seguía flapeando. Lo que sí lo arregla es que no haya mutación
 * después de la carga. Un `<script>` inline corre durante el parseo, antes del
 * primer pintado, y `setContent(..., { waitUntil: 'load' })` garantiza que ya
 * corrió. Solo existe un frame posible, así que no hay carrera que perder.
 * ══════════════════════════════════════════════════════════════════════════════
 */
function pagina(svg, lado, { fraccion, fondo }) {
  const parametros = JSON.stringify({
    fraccion,
    fondo,
    marca: MARCA,
    lienzo: LIENZO,
  });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${lado}px;height:${lado}px;background:transparent}
    svg{display:block;width:${lado}px;height:${lado}px}
  </style></head><body>${svg}<script>
    (function () {
      var p = ${parametros};
      if (!p.fondo) {
        var f = document.getElementById('fondo');
        if (!f) throw new Error('el SVG no tiene #fondo');
        f.remove();
      }
      var m = document.getElementById('marca');
      // Si alguien renombra el id en el SVG, esto revienta acá y no produce
      // cinco iconos con la marca colocada por defecto, que es el fallo que
      // nadie nota hasta que ve el teléfono.
      if (!m) throw new Error('el SVG no tiene #marca');
      var escala = (p.lienzo * p.fraccion) / p.marca.ancho;
      var tx = (p.lienzo - p.marca.ancho * escala) / 2;
      var ty = (p.lienzo - p.marca.alto * escala) / 2;
      m.setAttribute('transform', 'translate(' + tx + ' ' + ty + ') scale(' + escala + ')');
    })();
  <\/script></body></html>`;
}

async function abrirNavegador() {
  let chromium;
  try {
    ({ chromium } = await import("@playwright/test"));
  } catch {
    throw new Error(
      "falta @playwright/test. Instálalo con:\n\n  npm install -D @playwright/test@1.62.1\n",
    );
  }
  try {
    return await chromium.launch();
  } catch (causa) {
    // El fallo típico no es que Playwright no esté: es que el binario del
    // navegador no esté descargado, que es un `npm ci` en una máquina limpia.
    // Un mensaje con el comando exacto ahorra el viaje a la documentación.
    throw new Error(
      `no se pudo abrir Chromium. Si nunca lo descargaste en esta máquina:\n\n  npx playwright install chromium\n\nDetalle: ${
        causa instanceof Error ? causa.message.split("\n")[0] : String(causa)
      }`,
    );
  }
}

async function generar() {
  const svg = await readFile(FUENTE, "utf8");
  const navegador = await abrirNavegador();

  try {
    for (const variante of VARIANTES) {
      const { archivo, lado, fraccion, fondo, alfaEsperada } = variante;

      const contexto = await navegador.newContext({
        viewport: { width: lado, height: lado },
        deviceScaleFactor: 1,
      });
      const hoja = await contexto.newPage();
      // La colocación se calcula SIEMPRE en el espacio del viewBox (512), no en
      // píxeles de salida: así el mismo cálculo sirve para los cinco tamaños. Y
      // se aplica dentro de la página antes del primer pintado; ver `pagina()`.
      await hoja.setContent(pagina(svg, lado, { fraccion, fondo }), {
        waitUntil: "load",
      });

      const png = await hoja.screenshot({
        type: "png",
        // `omitBackground` deja el lienzo transparente. Solo el badge lo quiere:
        // en los demás una transparencia es un fondo negro en iOS.
        omitBackground: !fondo,
      });
      await contexto.close();

      const cabecera = leerCabeceraPng(png);
      if (cabecera.ancho !== lado || cabecera.alto !== lado) {
        throw new Error(
          `${archivo}: salió ${cabecera.ancho}x${cabecera.alto} y se pedía ${lado}x${lado}`,
        );
      }
      const tieneAlfa = TIENE_ALFA.has(cabecera.tipoDeColor);
      if (tieneAlfa !== alfaEsperada) {
        throw new Error(
          `${archivo}: canal alfa ${tieneAlfa ? "presente" : "ausente"} y se esperaba lo contrario ` +
            `(tipo de color PNG ${cabecera.tipoDeColor})`,
        );
      }

      await writeFile(resolve(RAIZ, archivo), png);
      console.log(
        `  ${archivo.padEnd(32)} ${lado}x${lado}  marca ${Math.round(fraccion * 100)}%  ` +
          `${tieneAlfa ? "con alfa" : "opaco"}`,
      );
    }
  } finally {
    await navegador.close();
  }
}

console.log("generando los iconos desde public/marca/vivaguest-tile.svg\n");
try {
  await generar();
  console.log("\nlisto: 5 de 5.");
} catch (error) {
  console.error(`\nfalló: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
