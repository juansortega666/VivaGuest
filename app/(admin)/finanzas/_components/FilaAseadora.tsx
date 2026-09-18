import Link from 'next/link';

import type { FilaDeCostoPorAseadora } from '@/lib/domain/finanzas';
import { formatCOP } from '@/lib/domain/money';

import { CirculoIniciales } from '../../_components/CirculoIniciales';

/**
 * Una fila del bloque 3: lo que cuesta una persona en el periodo (07-UI-SPEC §6.5.4).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * EL NUMERO ES EL DATO. LA BARRA ES CONTEXTO DE PROPORCION Y NADA MAS.
 *
 * El dueno pidio barras. Las barras solas no comunican aqui: sin una escala
 * comun declarada, una barra solo dice "mas que el de al lado", que es
 * exactamente la lectura que ya se rechazo para el revenue por persona. Y el
 * numero solo tampoco alcanza: dos cifras parecidas no dejan ver que una persona
 * es el veintiocho por ciento de la nomina del periodo y la otra el veinticinco.
 *
 * ── LA BARRA NO ES UN INDICADOR DE PROGRESO, Y POR ESO NO ES `Progress` ──
 *
 * Esa primitiva significa "avance de una tarea" y su relleno es el color de
 * acento, que esta en una lista cerrada. Ni la semantica ni el color aplican:
 * ocho barras de acento en un bloque hacen que el acento deje de significar
 * nada. Va en texto tenue sobre pista tenue.
 *
 * **Se oculta a las tecnologias de asistencia.** El numero esta a ocho pixeles y
 * dice lo mismo con mas precision; anunciarla seria leer la misma cifra dos veces
 * por cada persona. Y **sin transicion de ancho**, que es layout: el contrato de
 * movimiento solo permite color, borde y opacidad.
 *
 * ── LA PROPORCION NO SE CALCULA AQUI ─────────────────────────────────────
 *
 * Llega resuelta desde el dominio, entre cero y uno, y contra el TOTAL del
 * periodo. Dos consumidores que multiplicaran por cien cada uno por su cuenta es
 * como una barra acaba al cuatro mil por ciento de ancho, asi que la escala se
 * fija en un solo sitio y este componente solo la pinta.
 *
 * ── LA REGLA ANTI RANKING, QUE NO ES DE ESTILO ───────────────────────────
 *
 * Ninguna fila lleva posicion, medalla, corona ni color segun el puesto, y todas
 * las barras son del mismo color. El costo por persona depende de cuantos aseos
 * le asignaron, no de como trabaja: una lectura de podio aqui es una conclusion
 * falsa sobre una persona. El tipo de la fila ni siquiera declara una posicion,
 * asi que no hay nada que renderizar.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function FilaAseadora({
  fila,
  rango,
  ancla,
}: {
  fila: FilaDeCostoPorAseadora;
  rango: string;
  ancla: string;
}) {
  /**
   * La segunda línea. Con gastos nombra las dos partidas; sin gastos, solo los
   * aseos.
   *
   * No se escribe `· $ 0 en gastos` cuando no hay: ese cero es cierto, pero
   * repetido en las ocho filas convierte una señal (esta persona compró cosas) en
   * ruido de fondo.
   */
  const apoyo =
    fila.gastos > 0
      ? `${fila.aseos} aseos · ${formatCOP(fila.gastos)} en gastos`
      : `${fila.aseos} aseos`;

  /**
   * EL ÚNICO ENLACE ENTRANTE DEL PRODUCTO A LA FICHA DE UNA PERSONA, Y DESDE LA
   * FASE 8 APUNTA AL PANEL.
   *
   * La página `/finanzas/aseadoras/[id]` ya no existe: se borró y su contenido
   * vive ahora en `/finanzas?aseadora={id}` (08-UI-SPEC §9).
   *
   * **La dirección se COMPONE, nunca se escribe como consulta literal**
   * (INSTRUCCIÓN 5 de `08-02-MEDICION.md`). Está medido en el otro anfitrión: un
   * `href` con la consulta escrita a mano borró un parámetro del anfitrión **al
   * abrir**, antes de que el cierre tuviera nada que conservar. Aquí lo que se
   * conserva es el rango y el ancla, que son los dos parámetros que el Resumen
   * gobierna y que llegan ya normalizados desde el servidor: si se perdieran, el
   * periodo del admin volvería a mes actual por tocar un nombre.
   */
  const destino = new URLSearchParams({ rango, ancla, aseadora: fila.aseadoraId });

  return (
    <div className="transicion relative flex h-fila-aseador flex-col justify-center gap-xs px-lg hover:bg-canvas has-[a:focus-visible]:bg-canvas">
      <div className="flex items-center gap-sm">
        <CirculoIniciales nombre={fila.nombre} />

        <div className="flex min-w-0 flex-col">
          <Link
            href={`/finanzas?${destino.toString()}`}
            // Sin salto de scroll, sin excepción (§5.2, D8-8): el enlace abre un
            // panel encima de esta misma pantalla, y la lista de detrás no se ha
            // movido. Devolverla al tope perdería el sitio del admin, que es la
            // mitad del criterio 1 del ROADMAP.
            scroll={false}
            // `title` con el nombre completo, porque la celda trunca: sin él, un
            // nombre largo se pierde y no hay forma de recuperarlo sin entrar.
            title={fila.nombre}
            className="transicion truncate rounded-sm text-body font-semibold text-foreground after:absolute after:inset-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {fila.nombre}
          </Link>

          <span className="truncate text-micro text-muted-foreground">{apoyo}</span>
        </div>

        {/*
          Alineado a la derecha y con numerales tabulares, sin excepción: en una
          columna de montos sin `tabular-nums` los miles no se apilan y no se
          puede comparar de un vistazo, que es lo único que este bloque hace.
        */}
        <span className="ml-auto shrink-0 text-body font-semibold tabular-nums text-foreground">
          {formatCOP(fila.costo)}
        </span>
      </div>

      {/*
        4px de alto, a todo el ancho, debajo de la fila. El ancho sale de la
        proporción contra el total del periodo, así que con un equipo con la carga
        repartida ninguna barra pasa del 20%: se ve vacío y está bien, porque eso
        es exactamente lo que significa una carga repartida. Una barra al 60% es
        una señal real y se lee de un vistazo.
      */}
      <div aria-hidden="true" className="h-xs w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-muted-foreground"
          // Estilo en línea y no una clase: el ancho es un dato calculado, y una
          // clase arbitraria por fila no existiría en el CSS generado. No es un
          // valor de color, así que no toca el guardarraíl que vigila eso.
          style={{ width: `${fila.proporcion * 100}%` }}
        />
      </div>
    </div>
  );
}
