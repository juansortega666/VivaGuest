import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { Inbox } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { EstadoVacio, clasesDeEstadoVacio } from './EstadoVacio';

/**
 * Este archivo es `.ts` y no `.tsx` a proposito, y por eso arma los elementos
 * con `createElement` en vez de JSX: el `include` de vitest.config.ts es
 * `app/**\/*.test.ts`, asi que un `.tsx` no lo recogeria ningun runner y el
 * resultado seria `No test files found`, un verde falso.
 *
 * Se renderiza con `renderToStaticMarkup` de react-dom/server, que ya esta
 * instalado, en vez de con @testing-library/react: el contrato de la fase
 * prohibe ampliar el stack en este plan, y el entorno de vitest es `node` sin
 * jsdom. Para lo que hay que verificar (que clases sale, que el encabezado
 * sigue siendo un h2 y que la accion se renderiza) el markup estatico alcanza.
 */

const props = {
  icono: Inbox,
  encabezado: 'No hay aseos',
  cuerpo: 'Cuando llegue un checkout aparece aca.',
};

const accion = createElement('button', { type: 'button' }, 'Crear aseo');

describe('clasesDeEstadoVacio', () => {
  it('la variante por defecto conserva exactamente las clases de la Fase 2', () => {
    // Es regresion si cambia: lo consumen tres superficies ya entregadas.
    expect(clasesDeEstadoVacio()).toEqual({
      contenedor: 'flex flex-col items-center gap-lg py-3xl text-center',
      icono: 'size-8 text-muted-foreground',
      encabezado: 'text-heading text-foreground',
      cuerpo: 'max-w-vacio text-body text-muted-foreground',
    });
    expect(clasesDeEstadoVacio(false)).toEqual(clasesDeEstadoVacio());
  });

  it('la variante compacta baja icono, encabezado, cuerpo y padding', () => {
    expect(clasesDeEstadoVacio(true)).toEqual({
      contenedor: 'flex flex-col items-center gap-lg py-xl text-center',
      icono: 'size-6 text-muted-foreground',
      encabezado: 'text-body font-semibold text-foreground',
      cuerpo: 'max-w-vacio text-micro text-muted-foreground',
    });
  });
});

describe('EstadoVacio', () => {
  it('sin la prop renderiza igual que hoy: icono size-8, encabezado text-heading, cuerpo text-body, py-3xl', () => {
    const markup = renderToStaticMarkup(createElement(EstadoVacio, props));

    expect(markup).toContain('class="flex flex-col items-center gap-lg py-3xl text-center"');
    expect(markup).toContain('size-8 text-muted-foreground');
    expect(markup).toContain('<h2 class="text-heading text-foreground">No hay aseos</h2>');
    expect(markup).toContain('class="max-w-vacio text-body text-muted-foreground"');

    expect(markup).not.toContain('py-xl');
    expect(markup).not.toContain('size-6');
    expect(markup).not.toContain('text-micro');
  });

  it('con compacto baja el icono a size-6, el encabezado a 14/600, el cuerpo a 12/400 y el bloque a py-xl', () => {
    const markup = renderToStaticMarkup(
      createElement(EstadoVacio, { ...props, compacto: true }),
    );

    expect(markup).toContain('class="flex flex-col items-center gap-lg py-xl text-center"');
    expect(markup).toContain('size-6 text-muted-foreground');
    expect(markup).toContain(
      '<h2 class="text-body font-semibold text-foreground">No hay aseos</h2>',
    );
    expect(markup).toContain('class="max-w-vacio text-micro text-muted-foreground"');

    expect(markup).not.toContain('py-3xl');
    expect(markup).not.toContain('size-8');
    expect(markup).not.toContain('text-heading');
  });

  it('en las dos variantes el encabezado es un h2 y el cuerpo conserva max-w-vacio', () => {
    for (const compacto of [false, true]) {
      const markup = renderToStaticMarkup(createElement(EstadoVacio, { ...props, compacto }));

      expect(markup).toContain('<h2 ');
      expect(markup).toContain('</h2>');
      expect(markup).toContain('max-w-vacio');
    }
  });

  it('en las dos variantes se renderiza la accion', () => {
    for (const compacto of [false, true]) {
      const markup = renderToStaticMarkup(
        createElement(EstadoVacio, { ...props, compacto, accion }),
      );

      expect(markup).toContain('<button type="button">Crear aseo</button>');
    }
  });
});
