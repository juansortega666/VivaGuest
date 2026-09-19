import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * POR QUE ESTA PRUEBA LEE CODIGO FUENTE EN VEZ DE MEDIR COMPORTAMIENTO.
 *
 * No es pereza y no es una prueba que no prueba nada: es que los dos defectos que
 * persigue NO son observables con los instrumentos de este repo (10-UI-SPEC §0.1
 * hallazgo C). Demostrar que `new Date().getFullYear()` en una pagina
 * prerenderizada congela el ano exige DOS builds en DOS fechas distintas, y la
 * suite hace un build por corrida sin poder mover el reloj del build. Demostrar
 * que leer el reloj del proceso adelanta el ano cinco horas el 31 de diciembre
 * exige controlar el reloj del SERVIDOR en el momento del render, y Playwright
 * controla el del navegador (`timezoneId`), no el del proceso de Next.
 *
 * Lo que SI es observable ya esta probado y no se duplica aqui: `hoyBog()` tiene
 * su caso de la ventana de UTC en `lib/domain/dates.test.ts`, con `setSystemTime`
 * a las 02:30 UTC afirmando el dia anterior de Bogota. Ese es el defecto de
 * clase, y esta cazado.
 *
 * El unico hueco que queda es SI LA PAGINA LLAMA A ESE HELPER O SE INVENTA OTRO,
 * y eso es un hecho estatico. Se cierra como lo cierran los tres guardarrailes de
 * `npm run ci:arch`: leyendo el archivo, descartando las lineas de comentario y
 * afirmando sobre el codigo ejecutable. Vive en una prueba unitaria y no en
 * `scripts/ci/` porque el alcance de la Fase 10 no incluye `scripts/`.
 *
 * NO BORRAR POR PARECER REDUNDANTE. El dia que alguien cambie `hoyBog()` por el
 * reloj del proceso, o borre el `revalidate` "porque la pagina es estatica",
 * esta es la unica cosa del repo que se pone roja, y el sintoma de produccion
 * aparece en enero.
 */

const FUENTE = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

/**
 * El mismo filtro de lineas de comentario del guardarrail 6 de
 * `scripts/ci/check-service-role.sh` (`COMENTARIO_RE`), mas `{/*` por el JSX.
 *
 * NO es cosmetico: el comentario de `page.tsx` que explica el defecto nombra
 * `new Date()` y `getFullYear`, asi que sin el filtro la prueba se pondria roja
 * contra el archivo CORRECTO, por su propia documentacion. Y al contrario: el
 * filtro descarta lineas que EMPIEZAN por comentario, no comentarios al final de
 * una linea de codigo, asi que un nombre prohibido escrito detras de codigo si se
 * caza.
 */
const CODIGO = FUENTE.split('\n')
  .filter((linea) => !/^\s*(\{\/\*|\/\/|\/\*|\*)/.test(linea))
  .join('\n');

describe('page.tsx declara su ventana de revalidacion', () => {
  it('exporta revalidate con valor 3600', () => {
    // Sin esta linea la ruta se queda en el manifest de prerenderizado con
    // `initialRevalidateSeconds: false` y el ano queda congelado en el del
    // deploy. Se afirma sobre el codigo, no sobre el comentario que lo explica.
    expect(CODIGO).toMatch(/export\s+const\s+revalidate\s*=\s*3600\s*;?/);
  });
});

describe('page.tsx lee el reloj de Bogota, y solo de Bogota', () => {
  it('toma el ano de hoyBog() cortando los cuatro primeros caracteres', () => {
    expect(CODIGO).toContain('hoyBog');
    expect(CODIGO).toMatch(/hoyBog\(\)\.slice\(\s*0\s*,\s*4\s*\)/);
  });

  it('importa el helper del dominio y no define un formateador propio', () => {
    expect(CODIGO).toMatch(/import\s*\{[^}]*\bhoyBog\b[^}]*\}\s*from\s*'@\/lib\/domain\/dates'/);
    expect(CODIGO).not.toContain('Intl.DateTimeFormat');
  });

  it('no lee el ano del reloj del proceso', () => {
    // El proceso corre en UTC en Vercel y en CI: el 31 de diciembre a las 19:00
    // de Bogota, `getFullYear()` del proceso ya devuelve el ano siguiente.
    expect(CODIGO).not.toContain('getFullYear');
    expect(CODIGO).not.toContain('getUTCFullYear');
  });

  it('no construye ninguna fecha nueva', () => {
    expect(CODIGO).not.toMatch(/new\s+Date\s*\(/);
    expect(CODIGO).not.toContain('Date.now');
  });

  it('no nombra la zona a mano: TZ_BOGOTA es la unica constante de zona del repo', () => {
    expect(CODIGO).not.toContain('America/Bogota');
    expect(CODIGO).not.toContain('TZ_BOGOTA');
  });
});

/**
 * T-10-02, y es el riesgo que NACE en este plan. Mientras `/login` era HTML
 * estatico puro no habia nada que filtrar. Con `revalidate` la ruta pasa a ISR:
 * UN HTML generado una vez y servido a todos los visitantes durante una hora. El
 * dia que alguien meta aqui una lectura de sesion, el primer visitante fijaria su
 * HTML para los demas.
 */
describe('page.tsx no lee sesion: su HTML es cacheado y compartido entre visitantes', () => {
  it('no lee cookies', () => {
    expect(CODIGO).not.toMatch(/\bcookies\s*\(/);
    expect(CODIGO).not.toContain('next/headers');
  });

  it('no lee cabeceras', () => {
    expect(CODIGO).not.toMatch(/\bheaders\s*\(/);
    expect(CODIGO).not.toMatch(/\bdraftMode\s*\(/);
  });

  it('no construye ningun cliente de Supabase', () => {
    expect(CODIGO).not.toContain('createServerClient');
    expect(CODIGO).not.toContain('createBrowserClient');
    expect(CODIGO).not.toContain('createClient');
    expect(CODIGO).not.toContain('supabase');
    expect(CODIGO).not.toContain('getUser');
  });

  it('no se declara dinamica: eso anularia el cacheo que este contrato defiende', () => {
    expect(CODIGO).not.toContain('force-dynamic');
    expect(CODIGO).not.toMatch(/export\s+const\s+dynamic\s*=/);
  });
});
