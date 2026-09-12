import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import type { ChipDeCarga } from '@/lib/data/operacion';

import { FranjaCarga } from './FranjaCarga';

/**
 * `.ts` y no `.tsx`, y por eso arma los elementos con `createElement`: el
 * `include` de `vitest.config.ts` es `app/**\/*.test.ts`, asi que un `.tsx` no lo
 * recogeria ningun runner y el resultado seria `No test files found`, un verde
 * falso. Misma tecnica y misma razon que `app/(admin)/_components/EstadoVacio.test.ts`.
 *
 * LO QUE ESTE ARCHIVO EXISTE PARA VIGILAR es el unico cambio de comportamiento
 * de esta franja en toda la fase (05-UI-SPEC §11.2): antes se ocultaba cuando la
 * carga de hoy era cero, y ahora se queda si hay alguien sin avisos. Es
 * contraintuitivo, y sin un test alguien lo "simplifica" de vuelta y el defecto
 * solo se ve el dia que no hay trabajo, que es justo el dia en que la franja
 * importa.
 */

const MARIA = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';

function chip(aseadorId: string | null, nombre: string, conteo: number): ChipDeCarga {
  return { aseadorId, nombre, conteo };
}

function pintar(chips: ChipDeCarga[], sinAvisos: string[]): string {
  return renderToStaticMarkup(createElement(FranjaCarga, { chips, sinAvisos }));
}

describe('la condicion de render', () => {
  it('con cero carga y NADIE sin avisos no se renderiza, como siempre', () => {
    expect(pintar([chip(MARIA, 'María G.', 0), chip(ANA, 'Ana P.', 0)], [])).toBe('');
  });

  it('con cero carga y UN aseador sin avisos SI se renderiza: es el dia con tiempo para arreglarlo', () => {
    const markup = pintar([chip(MARIA, 'María G.', 0), chip(ANA, 'Ana P.', 0)], [ANA]);

    expect(markup).toContain('Carga de hoy');
    expect(markup).toContain('Ana P.');
  });

  it('con carga y nadie sin avisos se renderiza igual que antes', () => {
    expect(pintar([chip(MARIA, 'María G.', 5)], [])).toContain('Carga de hoy');
  });
});

describe('la marca del chip', () => {
  it('la campana sale SOLO en el chip del mudo', () => {
    const markup = pintar([chip(MARIA, 'María G.', 5), chip(ANA, 'Ana P.', 4)], [ANA]);

    // Una sola silueta en toda la franja, y su etiqueta accesible es la de §11.2.
    expect(markup.split('Sin avisos activos')).toHaveLength(2);
    expect(markup).toContain(
      'Ana P. no tiene avisos activos. Si le confirmas un aseo, no le va a sonar el teléfono.',
    );
  });

  it('el chip del mudo CONSERVA su fondo neutro: el tinte sigue reservado al chip sin persona', () => {
    const markup = pintar([chip(ANA, 'Ana P.', 4)], [ANA]);

    expect(markup).toContain('bg-muted');
    // Con un solo chip, y ese chip siendo el del mudo, el tinte de aviso no
    // puede aparecer en ningun sitio del markup.
    expect(markup).not.toContain('bg-surface-warn');
  });

  it('`Sin asignar` nunca lleva campana, aunque la lista de mudos trajera un id nulo', () => {
    const markup = pintar([chip(MARIA, 'María G.', 2), chip(null, 'Sin asignar', 3)], []);

    expect(markup).toContain('Sin asignar');
    expect(markup).not.toContain('Sin avisos activos');
  });

  it('`Sin probar` no existe para esta franja: solo se marca lo que llega en la lista', () => {
    // María no viene en `sinAvisos`, asi que no se marca pase lo que pase con su
    // verificacion. El matiz `Sin probar` vive en la columna de `/aseadores`.
    const markup = pintar([chip(MARIA, 'María G.', 1)], []);

    expect(markup).not.toContain('Sin avisos activos');
  });
});
