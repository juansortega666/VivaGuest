import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import { IconoInstagram, IconoTikTok } from './IconosRedes';

/**
 * Por que existe esta prueba: un color de marca dentro de uno de estos dos
 * glifos rompe el swap de marca de dos lineas de `app/globals.css`. El path
 * oficial de Instagram y el de TikTok se publican CON su color de relleno, asi
 * que copiarlos tal cual es el error mas probable de todo el plan 10-02.
 *
 * El guardarrail 6 de `scripts/ci/check-service-role.sh` ya persigue ese mismo
 * defecto, pero lo atrapa TARDE: en `npm run ci:arch`, despues del commit y de
 * la forma del archivo. Esta prueba lo atrapa sobre el markup RENDERIZADO, que
 * es un instrumento distinto: uno mira la forma del codigo, el otro mira lo que
 * sale al DOM. Los dos tienen que caer ante el mismo defecto, y en el senuelo 1
 * de la Task 3 se comprueba que los dos caen de verdad.
 *
 * Este archivo es `.ts` y no `.tsx` a proposito, y por eso arma los elementos
 * con `createElement` en vez de JSX: el `include` de vitest.config.ts es
 * `app/**\/*.test.ts`, asi que un `.tsx` no lo recogeria ningun runner y el
 * resultado seria `No test files found`, un verde falso con cero aserciones
 * ejecutadas. Se renderiza con `renderToStaticMarkup` de react-dom/server, que
 * ya esta instalado, y no con @testing-library/react: el entorno de vitest es
 * `node` sin jsdom y esta fase no amplia el stack.
 */

// Expresion regular, no cadena: es la misma CLASE de defecto que persigue el
// guardarrail 6, no un valor concreto. Cubre el hexadecimal de 3 digitos, el de
// 6, y las dos funciones de color de CSS que un recurso de marca puede traer.
const COLOR_LITERAL = /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|rgb\(|hsl\(/i;

const glifos = [
  ['IconoInstagram', IconoInstagram],
  ['IconoTikTok', IconoTikTok],
] as const;

describe('IconoInstagram', () => {
  it('es un trazo en currentColor con la metrica de los lucide del producto', () => {
    // 10-UI-SPEC §11.3 regla 4: la marca de Instagram es un contorno, asi que va
    // de trazo y con strokeWidth 2 para igualar el peso de los iconos lucide.
    const markup = renderToStaticMarkup(createElement(IconoInstagram));

    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="2"');
  });
});

describe('IconoTikTok', () => {
  it('es un glifo relleno en currentColor, porque su marca solo existe solida', () => {
    // §11.3 regla 4: la asimetria trazo/relleno frente a Instagram es inevitable
    // y no es un defecto que perseguir. Son dos marcas ajenas, no un mismo set.
    const markup = renderToStaticMarkup(createElement(IconoTikTok));

    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="currentColor"');
  });
});

describe('los dos glifos de marca', () => {
  it.each(glifos)('%s no lleva ningun valor de color literal', (_nombre, Glifo) => {
    const markup = renderToStaticMarkup(createElement(Glifo));

    expect(markup).not.toMatch(COLOR_LITERAL);
  });

  it.each(glifos)('%s queda fuera del arbol de accesibilidad', (_nombre, Glifo) => {
    // §11.3 regla 3: el nombre accesible vive en el `aria-label` del boton que
    // los envuelve, nunca en el svg, o el lector lo leeria dos veces.
    const markup = renderToStaticMarkup(createElement(Glifo));

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('focusable="false"');
  });

  it.each(glifos)('%s mide 16px por clase, no por atributo', (_nombre, Glifo) => {
    // §11.3 regla 2: tamano por clase `size-4`. Nada de width/height en el svg,
    // que es lo que impediria que `icon-sm` o una clase de uso lo reescalara.
    const markup = renderToStaticMarkup(createElement(Glifo));

    expect(markup).toContain('class="size-4"');
    expect(markup).not.toContain('width="24"');
    expect(markup).not.toContain('height="24"');
  });

  it.each(glifos)('%s no lleva texto, ni title, ni desc', (_nombre, Glifo) => {
    const markup = renderToStaticMarkup(createElement(Glifo));

    expect(markup).not.toContain('<title');
    expect(markup).not.toContain('<desc');
    // Nada entre el cierre de una etiqueta y la apertura de la siguiente: si
    // hubiera texto suelto en el svg, este markup lo mostraria.
    expect(markup).not.toMatch(/>[^<>]*[A-Za-z][^<>]*</);
  });

  it.each(glifos)('%s deja reafirmar aria-hidden desde el sitio de uso', (_nombre, Glifo) => {
    // El spread va DESPUES de los valores por defecto, para que §8.3 pueda
    // escribir `aria-hidden="true"` en el punto de uso sin pelear con el valor
    // por defecto ni duplicar el atributo.
    const markup = renderToStaticMarkup(
      createElement(Glifo, { 'aria-hidden': true, className: 'size-4' }),
    );

    expect(markup).toContain('aria-hidden="true"');
    expect(markup.match(/aria-hidden/g)).toHaveLength(1);
  });
});
