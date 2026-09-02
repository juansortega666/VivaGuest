import { existsSync } from 'node:fs';
import { join } from 'node:path';

import Image from 'next/image';

/**
 * La columna izquierda de APTO-12: dónde sacar el link en Airbnb (UI-SPEC §10.1).
 *
 * ── LA GUÍA NO ES EL REQUISITO. LA VALIDACIÓN EN VIVO SÍ ────────────────────
 * El UI-SPEC lo dice con todas las letras: *"Si hay que recortar alcance, se
 * recorta la guía a texto sin capturas, nunca la validación."* Por eso este
 * componente RENDERIZA COMPLETO SIN NINGUNA CAPTURA, y las capturas son un
 * añadido opcional. No son inventables: salen de la cuenta real de VivaGuest en
 * Airbnb, y la UI de Airbnb cambia. Llegan como tarea de contenido en el plan
 * 02-15 (deuda 6 del UI-SPEC).
 *
 * ── POR QUÉ ES UN SERVER COMPONENT ──────────────────────────────────────────
 * La detección de si la captura existe se hace con `existsSync` sobre `public/`
 * en el servidor. La alternativa sería un `<img onError>` en el cliente, que
 * pinta un roto durante un instante y mete un icono fuera de la lista cerrada de
 * §14.3. Esto es una comprobación de fichero en tiempo de render de una pantalla
 * que se visita cuatro veces por apartamento en toda la vida del catálogo.
 *
 * ── EL COLAPSO POR DEBAJO DE 1024px ─────────────────────────────────────────
 * Es un `<details open>` nativo, sin JavaScript. En el layout de dos columnas
 * (≥1024px) el `<summary>` se oculta y el contenido queda siempre visible por
 * CSS: un `<details>` con `open` y el disparador escondido no se puede cerrar,
 * que es exactamente lo que se quiere arriba de 1024px.
 */

interface Paso {
  numero: number;
  texto: string;
  /** Nombre del archivo dentro de `public/guia-airbnb/`. */
  archivo: string;
  alt: string;
}

/**
 * Copy literal de UI-SPEC §10.1. Está marcado allí como **a verificar contra la
 * UI real de Airbnb antes de publicar**: Airbnb mueve sus menús y este texto
 * envejece con ellos.
 */
const PASOS: readonly Paso[] = [
  {
    numero: 1,
    texto: 'En Airbnb, entra a Anuncios y abre el anuncio de este apartamento.',
    archivo: 'paso-1.webp',
    alt: 'Menú de Airbnb con la sección Anuncios resaltada',
  },
  {
    numero: 2,
    texto: 'Abre la pestaña Calendario.',
    archivo: 'paso-2.webp',
    alt: 'Pestaña Calendario dentro del anuncio de Airbnb',
  },
  {
    numero: 3,
    texto: 'En el panel de la derecha busca Disponibilidad → Sincronizar calendarios.',
    archivo: 'paso-3.webp',
    alt: 'Panel Disponibilidad con la opción Sincronizar calendarios',
  },
  {
    numero: 4,
    texto: 'Toca Exportar calendario y copia el link que termina en .ics.',
    archivo: 'paso-4.webp',
    alt: 'Diálogo Exportar calendario con el link de exportación',
  },
];

const DIR_CAPTURAS = 'guia-airbnb';

function hayCaptura(archivo: string): boolean {
  return existsSync(join(process.cwd(), 'public', DIR_CAPTURAS, archivo));
}

const ROTULO = '¿Dónde encuentro este link en Airbnb?';

function ListaDePasos() {
  return (
    <ol className="mt-lg flex flex-col gap-lg">
      {PASOS.map((paso) => (
        <li key={paso.numero} className="flex flex-col gap-sm">
          <div className="flex items-baseline gap-sm">
            {/*
              El número va en 12/600, que es el peso de "etiqueta" de §3. No
              lleva `--primary`: la lista cerrada de §4.4 no incluye
              numeradores de guía.
            */}
            <span className="text-micro font-semibold text-muted-foreground tabular-nums">
              {paso.numero}
            </span>
            <p className="text-body text-foreground">{paso.texto}</p>
          </div>

          {hayCaptura(paso.archivo) && (
            <Image
              src={`/${DIR_CAPTURAS}/${paso.archivo}`}
              alt={paso.alt}
              width={640}
              height={400}
              loading="lazy"
              className="rounded-md border border-border"
            />
          )}
        </li>
      ))}
    </ol>
  );
}

export function GuiaAirbnb() {
  return (
    <section className="rounded-md bg-canvas p-lg">
      {/*
        Por debajo de 1024px la guía se pliega, abierta por defecto. Es un
        `<details>` nativo: sin estado de React, sin JavaScript, y funciona
        antes de que hidrate nada.
      */}
      <details open className="lg:hidden">
        <summary className="cursor-pointer text-heading text-foreground">{ROTULO}</summary>
        <ListaDePasos />
      </details>

      {/* A partir de 1024px es una columna fija: no hay nada que plegar. */}
      <div className="hidden lg:block">
        <h2 className="text-heading text-foreground">{ROTULO}</h2>
        <ListaDePasos />
      </div>
    </section>
  );
}
