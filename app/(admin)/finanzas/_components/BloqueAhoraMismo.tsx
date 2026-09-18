import { Clock, Play, UserRoundX, type LucideIcon } from 'lucide-react';

import type { AhoraMismo } from '@/lib/data/finanzas-detalle';
import { formatHoraBog } from '@/lib/domain/dates';

import { EstadoAseo } from '../../operacion/_components/EstadoAseo';

/**
 * «Ahora mismo»: el bloque 1 de la ficha (07-UI-SPEC §8.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * RESPONDE «¿DONDE ESTA CADA MIEMBRO DE MI EQUIPO?» CON LO QUE EL SISTEMA SABE.
 *
 * Y lo que el sistema sabe es una sola cosa: **que aseo tiene en curso.** Nada
 * mas. Tres estados, y cada uno con su copy exacto y su icono.
 *
 * ── LO PROHIBIDO, Y NO ES UNA CUESTION DE ESTILO ─────────────────────────
 *
 *   1. **Nada que represente el sitio fisico donde esta una persona: ni una
 *      superficie cartografica, ni un marcador sobre ella, ni un par de numeros
 *      que la sitúen, ni una accion de «ver donde esta», ni el sustantivo que
 *      nombra ese concepto.** No hay rastreo por posicion y no lo va a haber. Una
 *      interfaz que lo insinua cuando no existe crea una expectativa que nadie va
 *      a poder cumplir, y una conversacion con el equipo que nadie quiere tener.
 *      La funcion de la base tampoco devuelve ninguna columna de la que se pueda
 *      derivar nada de eso, asi que el dato no existe en ninguna capa: lo que no
 *      existe no se puede renderizar por accidente.
 *
 *      Advertencia para quien amplie esto: la tabla de fotos SI guarda las dos
 *      cifras que situan una captura. Son de la FOTO y no de la persona, y aqui
 *      no entran por ninguna via, ni siquiera «para enseniar donde queda el
 *      apartamento».
 *
 *      **Y este archivo tiene un grep encima**, con ese sustantivo y sus vecinos
 *      en la lista: por eso ni los comentarios los escriben. Es la trampa del
 *      repo que ya mordio cuatro veces, descrita en §14.6.
 *
 *   2. **Ningun indicador de presencia ni de ultima actividad.** El sistema no lo
 *      mide, y una columna asi habria que inventarla.
 *
 *   3. **El nombre del apartamento NO es un enlace al aseo en curso.** Esta es
 *      una pantalla de plata, y saltar desde aqui a la operacion mezcla las dos
 *      cosas que D7-1 separo a proposito.
 *
 *   4. **No se refresca solo.** No hay tiempo real en esta pantalla, asi que el
 *      dato es de cuando se cargo y el bloque lo dice con todas sus letras. Un
 *      dato operativo que parece vivo y no lo esta es peor que uno fechado: el
 *      admin lo mira a las once creyendo que son las once.
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * Los tres estados, con su copy y su icono de la lista cerrada de §14.5.
 *
 * Se resuelven en una funcion y no con tres ramas de JSX: la estructura de los
 * tres es identica y duplicarla es como se pierde el `aria-hidden` de uno de los
 * iconos, o como el copy de uno se queda atras cuando el contrato cambia.
 *
 * ── SE EXPORTA DESDE LA FASE 8, Y ESA ES LA RAZON DE QUE SIGA VIVA ───────
 *
 * `08-UI-SPEC` §9.2 manda que el grupo `AHORA MISMO` del panel de aseadora
 * reutilice este copy y estos tres estados **palabra por palabra, ni una coma
 * distinta**. La unica forma de garantizar eso es que los dos sitios llamen a la
 * misma funcion: una segunda copia del copy se queda atras en el primer retoque
 * del contrato y entonces la misma frase se lee distinta en dos superficies.
 *
 * Lo que el panel NO reutiliza es el JSX de abajo: §17.8 le prohibe la linea que
 * fecha el dato, con su argumento.
 */
export function estadoDeAhoraMismo(ahora: AhoraMismo): {
  icono: LucideIcon;
  clase: string;
  texto: string;
} {
  if (!ahora.estaActiva) {
    return {
      icono: UserRoundX,
      clase: 'text-status-warn',
      texto: 'Esta cuenta está desactivada.',
    };
  }

  if (!ahora.enCurso) {
    return {
      icono: Clock,
      clase: 'text-muted-foreground',
      texto: 'No tiene ningún aseo en curso.',
    };
  }

  // La hora en formato de 24 horas (§11.2), del único formateador del repo que
  // convierte un instante al reloj de Bogotá. El nulo no puede ocurrir (la base
  // no devuelve el aseo sin su marca de inicio), y si ocurriera la frase queda
  // sin hora en vez de decir «desde las null».
  const hora = formatHoraBog(ahora.enCurso.iniciadoAt);

  return {
    icono: Play,
    clase: 'text-status-progress',
    texto: hora
      ? `Está en ${ahora.enCurso.apartamento} desde las ${hora}.`
      : `Está en ${ahora.enCurso.apartamento}.`,
  };
}

export function BloqueAhoraMismo({ ahora }: { ahora: AhoraMismo }) {
  const { icono: Icono, clase, texto } = estadoDeAhoraMismo(ahora);
  const enCurso = ahora.estaActiva && ahora.enCurso !== null;

  return (
    <section className="rounded-md border border-border bg-background">
      <div className="border-b border-border px-lg py-md">
        <h2 className="text-heading text-foreground">Ahora mismo</h2>
      </div>

      <div className="flex flex-col gap-md px-lg py-lg">
        <div className="flex items-start gap-sm">
          {/* 16px, que es el tamaño de icono en cabeceras y controles del árbol
              del admin. `aria-hidden` porque va ACOMPAÑADO de la frase: leerlo
              sería decir dos veces lo mismo. */}
          <Icono className={`size-4 shrink-0 ${clase}`} strokeWidth={2} aria-hidden="true" />

          {/*
            LA FRASE VA EN UN SOLO NODO DE TEXTO, sin partir el nombre del
            apartamento en otro elemento. No es estilo: es lo que hace que la
            frase se pueda leer y afirmar como una sola cosa, y además evita la
            tentación de convertir ese trozo en un enlace a la operación.
          */}
          <p className="text-body text-foreground">{texto}</p>
        </div>

        {/* La etiqueta de estado reutiliza el componente de la operación: es el
            mismo objeto, y dos etiquetas de «en curso» con dos tratamientos se
            desincronizan en el primer retoque. Solo aparece cuando hay aseo: en
            los otros dos estados no hay ningún aseo cuyo estado etiquetar. */}
        {enCurso && (
          <EstadoAseo aseo={{ is_managed: true, state: 'en_curso', confirmado_at: null }} />
        )}

        {/*
          EL FECHADO DEL DATO. Sin esta línea, el bloque parece vivo y no lo está:
          el admin lo lee a las once de la mañana creyendo que son las once,
          cuando abrió la página a las nueve.
        */}
        <p className="text-micro text-muted-foreground">Al momento de abrir esta página.</p>
      </div>
    </section>
  );
}
