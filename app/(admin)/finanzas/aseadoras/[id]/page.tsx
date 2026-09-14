import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  costoDeLaFicha,
  identificadorValido,
  leerAhoraMismo,
  leerAseadoraDeLaFicha,
  leerAseosDeAseadora,
  leerGastosDeAseadora,
  leerPagosDeAseadora,
} from '@/lib/data/finanzas-detalle';
import { firmarRecibo } from '@/lib/data/recibos';
import { hoyBog } from '@/lib/domain/dates';
import {
  etiquetaDeRango,
  rangoDePeriodo,
  type RangoDePeriodo,
} from '@/lib/domain/periodo';
import { createClient } from '@/lib/supabase/server';

import { FichaAseadora } from '../../_components/FichaAseadora';
import { SubNavFinanzas } from '../../_components/SubNavFinanzas';

export const metadata: Metadata = {
  title: 'Ficha de la aseadora · VivaGuest',
};

/**
 * `/finanzas/aseadoras/[id]` — la ficha de una persona (07-UI-SPEC §8).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE UN DATO OPERATIVO VIVE DENTRO DE UNA PANTALLA DE PLATA.
 *
 * El bloque «Ahora mismo» no es de dinero, y aun asi va aqui. La razon la dio el
 * dueno: cuando abre la ficha de alguien, la pregunta que tiene en la cabeza no
 * es solo «cuanto me costo», es tambien «que esta haciendo». Mandarlo a buscar
 * eso a la pantalla de operacion convierte una pregunta en dos pantallas.
 *
 * Lo que NO hace es traerse la operacion entera: el nombre del apartamento en
 * curso no es un enlace al aseo, porque saltar desde aqui a la operacion mezcla
 * las dos cosas que D7-1 separo.
 *
 * ── UN IDENTIFICADOR CUALQUIERA NO PUEDE TUMBAR LA PANTALLA (T-07-56) ────
 *
 * Se comprueba la FORMA antes de consultar. Sin eso, una cadena arbitraria en la
 * direccion llega a Postgres como argumento de tipo identificador, responde
 * `22P02`, y la pantalla se cae con un error de tipo que no sabe explicar.
 *
 * Y la existencia se decide en dos pasos, los dos con el mismo 404: el perfil no
 * es de una aseadora, o la funcion de estado devuelve cero filas (que solo puede
 * significar que ese identificador no es de ningun perfil). **Los dos casos dan
 * lo mismo a proposito**: distinguirlos le confirmaria la existencia del perfil a
 * quien no puede verlo.
 *
 * ── LAS URL DE LOS RECIBOS SE FIRMAN AQUI, EN EL SERVIDOR (T-07-54) ──────
 *
 * El bucket es privado y la ruta del archivo es, por si sola, una autorizacion:
 * quien la conoce puede pedir que se la firmen. Las funciones de la base
 * devuelven bucket y ruta porque el servidor los necesita; **lo unico que viaja
 * al navegador es la URL ya firmada y con vida corta**. Se firman solo los gastos
 * de esta persona en este periodo, que es lo que la pantalla realmente ofrece
 * abrir, y no todas las filas de ninguna tabla.
 * ════════════════════════════════════════════════════════════════════════════
 */

/** Igual que en el Resumen y en el detalle: lo desconocido cae en `mes`. */
function normalizarRango(valor: string | undefined): RangoDePeriodo {
  return valor === 'dia' || valor === 'semana' || valor === 'mes' ? valor : 'mes';
}

/** Igual que en el Resumen y en el detalle: se comprueba la FORMA. */
function normalizarAncla(valor: string | undefined, hoy: string): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hoy;
}

function texto(valor: string | string[] | undefined): string | undefined {
  return typeof valor === 'string' ? valor : undefined;
}

export default async function FichaDeAseadoraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const aseadoraId = identificadorValido(id);
  if (!aseadoraId) notFound();

  const parametros = await searchParams;
  const hoy = hoyBog();
  const rango = normalizarRango(texto(parametros.rango));
  const ancla = normalizarAncla(texto(parametros.ancla), hoy);
  const { desde, hasta } = rangoDePeriodo(rango, ancla);

  const supabase = await createClient();

  // Las cinco lecturas van en paralelo. `pagos` NO recibe el rango, y no es un
  // olvido: el bloque de pagos ignora el filtro de periodo a propósito y la
  // función de la base ni siquiera acepta un rango que pasarle.
  const [aseadora, ahora, aseos, pagos, gastos] = await Promise.all([
    leerAseadoraDeLaFicha(supabase, aseadoraId),
    leerAhoraMismo(supabase, aseadoraId),
    leerAseosDeAseadora(supabase, aseadoraId, { desde, hasta }),
    leerPagosDeAseadora(supabase, aseadoraId),
    leerGastosDeAseadora(supabase, aseadoraId, { desde, hasta }),
  ]);

  if (!aseadora || !ahora) notFound();

  // Las firmas, en paralelo y solo para los gastos que TODAVÍA tienen foto. Un
  // gasto cuya foto se purgó no produce ninguna firma: la ficha no le ofrece el
  // botón y pinta la leyenda de que ya no está disponible.
  const firmados = await Promise.all(
    gastos.map(async (gasto) => ({
      gastoId: gasto.gastoId,
      recibo: await firmarRecibo(supabase, gasto.evidencia),
    })),
  );

  // `flatMap` y no `filter` mas `map`: TypeScript estrecha la union discriminada
  // dentro del cuerpo del `flatMap`, y con el par no hace falta ninguna asercion
  // de tipo sobre el resultado del filtro.
  const urlPorGasto = new Map<string, string>(
    firmados.flatMap(({ gastoId, recibo }) =>
      recibo.estado === 'firmado' ? [[gastoId, recibo.url] as [string, string]] : [],
    ),
  );

  return (
    <FichaAseadora
      aseadora={aseadora}
      ahora={ahora}
      aseos={aseos}
      pagos={pagos}
      gastos={gastos}
      urlPorGasto={urlPorGasto}
      // La cifra grande se suma de las MISMAS listas que se pintan debajo: la
      // ficha no se puede contradecir a sí misma dentro de la misma pantalla.
      costo={costoDeLaFicha(aseos, gastos)}
      etiquetaDelPeriodo={etiquetaDeRango(rango, desde, hasta)}
      // El periodo VIAJA de vuelta: volver al resumen no puede cambiarle el
      // rango al admin, sería un cambio de contexto invisible.
      volver={`/finanzas?rango=${rango}&ancla=${ancla}`}
      // El sub-nav entra como ranura y va DEBAJO de la cabecera (§5.2), no
      // envolviendo la ficha: su sitio en la jerarquia es el mismo que en el
      // Resumen, justo bajo el titulo de la pagina.
      subNav={<SubNavFinanzas />}
    />
  );
}
