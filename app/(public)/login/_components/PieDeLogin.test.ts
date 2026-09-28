import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import { PieDeLogin } from './PieDeLogin';

/**
 * Este archivo es `.ts` y no `.tsx` a proposito, y por eso arma los elementos con
 * `createElement` en vez de JSX: el `include` de vitest.config.ts es
 * `app/**\/*.test.ts`, asi que un `.tsx` no lo recogeria ningun runner y el
 * resultado seria `No test files found`, un verde falso con cero aserciones
 * ejecutadas. Se renderiza con `renderToStaticMarkup` de react-dom/server, que ya
 * esta instalado, y no con @testing-library/react: el entorno de vitest es `node`
 * sin jsdom y esta fase no amplia el stack.
 *
 * LO QUE ESTA PRUEBA NO AFIRMA, y la razon importa: no dice nada sobre
 * `tabindex`. Base UI emite `tabindex="0"` por su cuenta junto al `disabled`
 * nativo (medido con `renderToStaticMarkup` sobre `@base-ui/react/button@1.7.0`
 * el 2026-09-19), asi que afirmar su ausencia seria un rojo PERMANENTE contra la
 * primitiva, no contra nuestro codigo. Un `<button disabled>` no entra al orden
 * de tabulacion aunque lleve `tabindex`, pero eso es comportamiento del motor y
 * solo se prueba en un navegador: esa asercion vive en el plan 10-03. Aca se
 * afirma el ATRIBUTO; alli se afirma la CONSECUENCIA.
 */

// `data-disabled=""` contiene `disabled=""` como subcadena, asi que contar la
// cadena pelada daria 4 donde hay 2. El lookbehind excluye el guion y cualquier
// caracter de palabra que preceda al atributo: solo cuenta el atributo nativo.
const DISABLED_NATIVO = /(?<![-\w])disabled=""/g;

// El pie NO puede conocer ningun ano que no venga por la prop. Se recogen todos
// los de cuatro cifras del markup entero, no solo el del copyright.
const CUALQUIER_ANIO = /\b(?:19|20)\d{2}\b/g;

const CLASE_DEL_PIE =
  'flex flex-col items-center gap-sm px-lg py-lg ' +
  'lg:h-barra lg:flex-row lg:justify-between lg:px-xl lg:py-0';

const render = (anio: string) => renderToStaticMarkup(createElement(PieDeLogin, { anio }));

/**
 * Las aserciones sobre borde y fondo se miden contra la clase DEL FOOTER, no
 * contra el markup entero, y la razon se descubrio viendola en rojo: la clase
 * base de `components/ui/button.tsx` trae `border border-transparent`, y
 * `border-t` es un PREFIJO de `border-transparent`. Un
 * `expect(markup).not.toContain('border-t')` sobre el markup completo es un rojo
 * PERMANENTE mientras haya un `Button` dentro, y en un pie sin botones seria un
 * verde que no mide nada. El senuelo 4 anade `border-t` al `<footer>`, asi que la
 * clase del footer es exactamente el alcance correcto: es mas estricto, no menos.
 */
const claseDelPie = (markup: string) => {
  const encontrada = markup.match(/^<footer class="([^"]*)"/);
  if (!encontrada) throw new Error('el markup no empieza por un <footer> con clase');
  return encontrada[1];
};

describe('PieDeLogin: el ano sale de la prop y de ningun otro sitio', () => {
  it('con 2026 renderiza la copia exacta del contrato', () => {
    // 10-UI-SPEC §12: es copia de contrato, se compara literal.
    expect(render('2026')).toContain('© 2026 VivaGuest. Todos los derechos reservados.');
  });

  it('con 1999 renderiza 1999 y NINGUN otro ano: no lee el reloj', () => {
    // El lado que carga el peso. Sin el, un pie que ignorara la prop y escribiera
    // el ano a mano pasaria el caso de 2026 sin que nadie se enterara: es el
    // senuelo 3 de la Task 3.
    const markup = render('1999');

    expect(markup).toContain('© 1999 VivaGuest. Todos los derechos reservados.');
    expect(markup).not.toContain('2026');
    expect(markup.match(CUALQUIER_ANIO)).toEqual(['1999']);
  });

  it('no hay mas copia que el copyright: ni legales, ni acerca de, ni contacto', () => {
    // D10-5 dice "nada mas", y §12.1 explica por que un rotulo de placeholder no
    // entra. Lo unico que queda fuera del copyright son los dos nombres
    // accesibles de §12, que no son copia visible.
    const markup = render('2026');
    const visible = markup.replace(/<[^>]*>/g, '').trim();

    expect(visible).toBe('© 2026 VivaGuest. Todos los derechos reservados.');
  });
});

describe('PieDeLogin: la geometria de §8.1', () => {
  it('el elemento raiz es un footer con la clase exacta del contrato', () => {
    const markup = render('2026');

    expect(markup.startsWith('<footer ')).toBe(true);
    expect(markup).toContain(`class="${CLASE_DEL_PIE}"`);
  });

  it('el padding vertical se anula a partir de lg, o el pie de 56px crece', () => {
    // No es cosmetica: con `lg:h-barra` el alto es fijo y el padding va por dentro
    // de la caja. Un `py-lg` que sobreviva a `lg:` deja 24px de area de contenido
    // para un boton de 28px.
    const markup = render('2026');

    expect(markup).toContain('py-lg');
    expect(markup).toContain('lg:py-0');
  });

  it('no lleva borde superior ni fondo propio: la superficie es la de la pagina', () => {
    // §8.1, decision explicita: un `border-t` seria una linea que cruza la
    // pantalla entera para separar aire de aire. Es el senuelo 4 de la Task 3.
    const clases = claseDelPie(render('2026'));

    // Ni un borde de ningun lado y en ningun breakpoint (`lg:border-t` incluido),
    // y ninguna superficie propia: la del pie es la de la pagina, `--canvas`.
    expect(clases).not.toMatch(/border/);
    expect(clases).not.toMatch(/bg-/);
  });

  it('el copyright va en text-micro y muted-foreground, y en ningun caso en Poppins', () => {
    // §5: Poppins vive SOLO en el wordmark. `/login` es uno de los tres momentos
    // de marca del producto y ese momento es el wordmark, no la pantalla entera.
    // Es el senuelo 5 de la Task 3.
    const markup = render('2026');

    expect(markup).toContain('class="text-micro text-muted-foreground"');
    expect(markup).not.toContain('font-brand');
    expect(markup).not.toContain('text-primary');
    expect(markup).not.toContain('text-display');
  });
});

describe('PieDeLogin: los dos botones estan deshabilitados de verdad', () => {
  it('emite disabled nativo dos veces y aria-disabled ninguna', () => {
    // §10.3 regla 2: un elemento con `aria-disabled` sigue siendo enfocable, y
    // seria exactamente la trampa de foco que se quiere evitar: un control que
    // recibe foco, se anuncia como no disponible y no hace nada al pulsar Enter.
    // Es el senuelo 2 de la Task 3.
    const markup = render('2026');

    expect(markup.match(DISABLED_NATIVO) ?? []).toHaveLength(2);
    expect(markup).not.toContain('aria-disabled');
  });

  it('conserva nombre accesible, y dice "aun no disponible", no "proximamente"', () => {
    // §12.2: `proximamente` es una promesa con fecha implicita, y 10-CONTEXT.md no
    // dice que las cuentas vayan a existir. La copia es contrato.
    const markup = render('2026');

    expect(markup).toContain('aria-label="Instagram, aún no disponible"');
    expect(markup).toContain('aria-label="TikTok, aún no disponible"');
    expect(markup).not.toContain('próximamente');
  });

  it('los dos botones son icon-sm de 28px sin fondo', () => {
    // §8.3: `variant="ghost" size="icon-sm"`. `size-7` son los 28px, y la opacidad
    // del deshabilitado ya la trae la clase base de la primitiva.
    const markup = render('2026');

    expect(markup.match(/size-7/g) ?? []).toHaveLength(2);
    expect(markup).toContain('disabled:opacity-50');
    expect(markup).not.toContain('bg-primary');
  });

  it('el nombre esta en el boton y los dos glifos quedan fuera del arbol', () => {
    // §8.3: `aria-label` en el boton, `aria-hidden` en el svg, o el lector de
    // pantalla leeria el nombre dos veces.
    const markup = render('2026');

    expect(markup.match(/<svg/g) ?? []).toHaveLength(2);
    expect(markup.match(/aria-hidden="true"/g) ?? []).toHaveLength(2);
    expect(markup.match(/focusable="false"/g) ?? []).toHaveLength(2);
    expect(markup).not.toContain('<title');
  });

  it('no hay ningun valor de color literal en todo el pie', () => {
    // Misma clase de defecto que persigue el guardarrail 6, medida sobre el markup
    // renderizado en vez de sobre la forma del archivo. Es el senuelo 1 de la
    // Task 3, que tiene que tumbar los DOS instrumentos.
    const markup = render('2026');

    expect(markup).not.toMatch(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|rgb\(|hsl\(/i);
  });
});
