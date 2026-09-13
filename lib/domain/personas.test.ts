import { describe, expect, it } from 'vitest';

import { iniciales } from './personas';

/**
 * El contrato de las iniciales del círculo de 28px.
 *
 * La función existía sin test porque vivía dentro de un Client Component y
 * probarla habría exigido montar la barra superior entera. Al extraerla a
 * `lib/domain/` deja de tener esa excusa, y estos casos fijan lo que el círculo
 * puede recibir de verdad: la tabla `profiles` no valida la forma del nombre, así
 * que un nombre de una sola palabra o con espacios de más llega tal cual.
 *
 * El tope de DOS letras no es estético: con tres, el círculo de 28px se queda sin
 * aire y el texto de 12px se recorta (UI-SPEC §6.5.4 y §14.3).
 */
describe('iniciales', () => {
  it('toma la primera letra de las dos primeras palabras', () => {
    expect(iniciales('María González')).toBe('MG');
    expect(iniciales('ángela Muñoz')).toBe('ÁM');
  });

  it('SE QUEDA EN DOS LETRAS aunque el nombre traiga más palabras', () => {
    // El caso real: un nombre completo con dos nombres y dos apellidos, que es
    // lo normal en Colombia y lo que la tabla `profiles` acepta sin objetar.
    expect(iniciales('Ana María Rodríguez Peña')).toBe('AM');
    expect(iniciales('José de la Cruz Gil')).toBe('JD');
  });

  it('un nombre de UNA sola palabra produce UNA sola letra', () => {
    // Correcto, y no hace falta rellenar: una letra sola centrada en el círculo
    // se lee bien. Duplicarla diría algo que el nombre no dice.
    expect(iniciales('Zulema')).toBe('Z');
  });

  it('los espacios de más no producen letras vacías', () => {
    // Un nombre pegado de un formulario trae espacios dobles y de los extremos.
    // Sin el filtro, `split` devuelve cadenas vacías y la inicial sale en blanco.
    expect(iniciales('  Ana   Rodríguez  ')).toBe('AR');
    expect(iniciales('Ana\tRodríguez')).toBe('AR');
  });

  it('un nombre vacío o en blanco produce el interrogante, no una cadena vacía', () => {
    // Un círculo mudo se lee como un fallo de carga. El interrogante dice que el
    // dato falta, que es lo que pasa de verdad.
    expect(iniciales('')).toBe('?');
    expect(iniciales('   ')).toBe('?');
  });

  it('siempre sale en mayúscula, venga como venga el nombre', () => {
    // `profiles.full_name` no normaliza mayúsculas y nadie escribe su nombre
    // igual dos veces.
    expect(iniciales('ana rodríguez')).toBe('AR');
    expect(iniciales('aNa RoDrÍgUeZ')).toBe('AR');
  });

  it('nunca devuelve más de dos caracteres, sobre nombres reales', () => {
    // Propiedad, no caso: es el invariante que protege el ancho del círculo, y
    // cae solo si alguien cambia el `slice`.
    const nombres = [
      'Ana Rodríguez',
      'ángela Muñoz',
      'Óscar Peña',
      'Zulema Ríos',
      'Juan Carlos Vélez Restrepo',
      'Ma. del Pilar Ochoa',
    ];

    for (const nombre of nombres) {
      expect(iniciales(nombre).length, `"${nombre}" se pasó de dos letras`).toBeLessThanOrEqual(
        2,
      );
    }
  });
});
