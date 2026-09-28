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
 * NO es cosmetico, y esta MEDIDO: el comentario de `page.tsx` que documenta la
 * prohibicion nombra literalmente `new Date().getFullYear()`, asi que sobre el
 * archivo crudo `includes('getFullYear')` y `/new\s+Date\s*\(/` dan las dos
 * `true`. Sin el filtro, dos de las aserciones de abajo serian ROJO PERMANENTE
 * contra el archivo CORRECTO, por su propia documentacion. Con el filtro dan las
 * dos `false`.
 *
 * Y al contrario: el filtro descarta lineas que EMPIEZAN por comentario, no
 * comentarios al final de una linea de codigo. Asi que un nombre prohibido escrito
 * detras de codigo SI se caza — y por eso no se escriben nombres prohibidos en
 * comentarios de linea con codigo delante.
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

/**
 * LA GEOMETRIA DEL REDISENO DEL 2026-09-26, y por que se defiende desde aca.
 *
 * El dueno derogo D10-2 y D10-3 y la pantalla paso a 50/50 sin canal, con el
 * formulario SIN tarjeta alrededor. Los dos defectos que persigue este `describe`
 * son los dos que un rediseno revierte solo: que alguien devuelva la `Card`
 * "porque el formulario se ve desnudo", y que alguien devuelva el login a la
 * tercera pista copiando el codigo viejo de otra rama. El E2E los mide en el
 * navegador; esta compuerta los caza en el codigo fuente, que es donde aparecen
 * primero y sin levantar un servidor.
 *
 * EL FILTRO DE LINEAS DE COMENTARIO ES LOAD-BEARING PARA LOS DOS CASOS, y esto
 * no se afirma: se MIDE, igual que lo midio 10-03 para el reloj del proceso.
 * `page.tsx` documenta las dos prohibiciones con su forma literal — nombra
 * `lg:col-start-3` en el bloque de la derogacion y nombra `Card`, `CardContent` y
 * la ruta de su modulo en el parrafo que explica que la superficie desaparecio —
 * asi que sobre el archivo CRUDO las cuatro busquedas dan `true` y las dos
 * aserciones de abajo serian ROJO PERMANENTE contra el archivo CORRECTO.
 * Medicion del 2026-09-28, con el filtro puesto y quitado:
 *
 *   SIN filtro, col-start-3          presente: true
 *   CON filtro, col-start-3          presente: false
 *   SIN filtro, CardContent          presente: true
 *   CON filtro, CardContent          presente: false
 *   SIN filtro, @/components/ui/card presente: true
 *   CON filtro, @/components/ui/card presente: false
 *   SIN filtro, Card                 presente: true
 *   CON filtro, Card                 presente: false
 *
 * Y la regla de edicion de este archivo sigue en pie, ahora con dos nombres mas:
 * los nombres prohibidos van en lineas que EMPIEZAN por marca de comentario (la
 * de linea, la de bloque, el asterisco de continuacion o la de bloque en JSX),
 * NUNCA detras de codigo y nunca en una linea de continuacion que empiece por
 * texto. Un nombre prohibido escrito de otra forma llega al codigo filtrado y
 * pone esto rojo sin que nada este roto.
 */
describe('page.tsx coloca el login con la geometria del rediseno', () => {
  it('no vuelve a encerrar el formulario en una tarjeta', () => {
    // Las tres mitades. La del import es la que de verdad cierra la puerta: sin
    // el modulo no hay forma de usar la primitiva. Las otras dos cazan el caso
    // de que alguien la traiga por otra ruta o la reexporte.
    expect(CODIGO).not.toContain('@/components/ui/card');
    expect(CODIGO).not.toContain('CardContent');
    expect(CODIGO).not.toContain('Card');
  });

  it('coloca el login en la columna 2, y la columna 3 ya no existe', () => {
    // Con dos pistas del 50% la tercera columna no existe: un `col-start-3`
    // superviviente deja el bloque sin colocar. Las dos mitades, porque la
    // primera sola pasaria con las dos clases puestas a la vez.
    expect(CODIGO).toContain('lg:col-start-2');
    expect(CODIGO).not.toContain('col-start-3');
  });
});
