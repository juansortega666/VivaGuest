import { UserRoundX } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import type { PanelDeAseadora } from '@/lib/data/panel-aseadora';
import { formatCOP } from '@/lib/domain/money';

import { CirculoIniciales } from '../../_components/CirculoIniciales';
import { FilaDeDato } from '../../_components/FilaDeDato';
import { GrupoDePanel } from '../../_components/GrupoDePanel';
import { PanelLectura } from '../../_components/PanelLectura';
import { estadoDeAhoraMismo } from './BloqueAhoraMismo';

/**
 * EL PANEL DE UNA ASEADORA (08-UI-SPEC §9).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ES EL UNICO DE LOS CUATRO QUE REEMPLAZA ALGO EN VEZ DE CREARLO.
 *
 * `/finanzas/aseadoras/[id]` tenia cuatro bloques y **se borra**. D8-4 cerro el
 * contenido en cinco datos, de los cuales dos son nuevos, y saco por nombre *«el
 * historico de aseos, que ya esta en Finanzas»*. Lo que queda es esto:
 *
 *   nombre · si esta activa o no · de que apartamentos es responsable y en
 *   cuales es suplente · que aseo tiene en curso · cuanto lleva ganado en el
 *   periodo de pago abierto.
 *
 * **Lo que este panel NO muestra, y hay que dejarlo escrito para que nadie lo
 * anada «ya que estamos»:** el historico de aseos, sus pagos mes a mes y sus
 * gastos reportados. Los tres son alcanzables por otras rutas de la seccion, y
 * el panel no los enlaza a proposito: un enlace ahi sacaria de Finanzas, que es
 * lo que D8-2 dice que no puede costar una consulta.
 *
 * ── LOS APARTAMENTOS VAN COMO PARRAFO, Y ESTA MEDIDO (§9.3) ─────────────
 *
 * Una fila por apartamento **no cabe**. Una persona puede ser responsable de
 * doce unidades: doce filas de 21px con su separacion son 340px, mas 25 de
 * encabezado son 365 para ese solo grupo. Sumados los otros tres (287), el total
 * serian **627px contra los 590 disponibles: no cabe por 37**.
 *
 * Como parrafo de nombres separados por coma, doce nombres de unos diez
 * caracteres son unos 140, que a 14px sobre 448 utiles son tres lineas: 63px, y
 * con encabezado, 88. **El grupo pasa de 365 a 88, cuatro veces mas denso**, y
 * los doce nombres siguen visibles sin ningun gesto, que es todo el punto del
 * panel.
 *
 * Las tres reglas que van con eso: el conteo va en el encabezado porque es el
 * dato que el admin busca primero; los nombres son **texto plano y no enlaces**;
 * y el orden es **alfabetico**, no por carga ni por cluster, porque cualquier
 * otro orden se lee como una clasificacion de personas, que es la trampa que el
 * contrato de la Fase 7 ya documento para este mismo equipo.
 *
 * ── EL GRUPO 1 VA PRIMERO A PROPOSITO ───────────────────────────────────
 *
 * Es lo unico del panel que cambia solo, y es la pregunta que hoy se resuelve
 * por WhatsApp. Es el ancla visual. Su copy y sus tres estados salen de la
 * funcion que la Fase 7 ya escribio, importada y no copiada: §9.2 los exige
 * palabra por palabra y una segunda copia se queda atras en el primer retoque.
 *
 * **Y no lleva la linea que fecha el dato.** La ficha si la llevaba; §17.8 la
 * prohibe aqui con su argumento: en un panel que se abre y se cierra en diez
 * segundos, fecharlo ocupa una linea para decir algo que el gesto ya dice.
 *
 * ── NI UNA PALABRA QUE INSINUE SEGUIMIENTO, Y ESO ES EL CRITERIO 5 ──────
 *
 * Nada que situe a una persona en el espacio, ninguna superficie cartografica,
 * ningun par de cifras que la ubique, ninguna marca de ultima conexion y ningun
 * indicador de presencia. El dato no existe en ninguna capa: la funcion de la
 * base no declara ninguna columna de la que se pueda derivar, y la asercion 76
 * de la suite pgTAP lo afirma.
 *
 * La lista exacta de los cinco terminos vive en la expresion regular de la
 * asercion E2E de `e2e/finanzas.spec.ts`, y **se consulta ahi**. No se copia a
 * este archivo ni siquiera dentro de un comentario: el guardarrail de CI de este
 * repo trabaja por expresion regular sobre el codigo, asi que un comentario que
 * cite un literal prohibido hace fallar la revision aunque el codigo este bien.
 * Ya mordio cuatro veces (§14.6).
 * ════════════════════════════════════════════════════════════════════════════
 */
export function PanelAseadora({
  datos,
  rutaAlCerrar,
}: {
  /**
   * El panel entero, **ya resuelto**, y aqui no hay promesa que esperar.
   *
   * ── POR QUE ESTE PANEL NO TIENE BARRERA DE SUSPENSION, AL REVES QUE LOS
   *    OTROS TRES ────────────────────────────────────────────────────────
   *
   * En `/apartamentos` el anfitrion resuelve el identificador contra las 39
   * filas que ya leyo, asi que el nombre y la linea de apoyo estan en memoria
   * desde el primer frame y solo el cuerpo espera. **Aqui eso es imposible**: la
   * lista del Resumen esta recortada por el rango del filtro, asi que la
   * existencia se decide con una lectura propia, y esa misma lectura es la que
   * trae el nombre y el estado de la cabecera.
   *
   * Las dos salidas eran: envolver el panel entero en una barrera, que hace que
   * **el panel aparezca solo cuando llegan los datos** y eso §11.1 punto 3 lo
   * prohibe por nombre; o dejar que el anfitrion espere y pintar el panel
   * completo de una vez, que es lo que se hace. Una barrera alrededor del cuerpo
   * con la lectura ya resuelta seria un esqueleto que no puede pintarse nunca, o
   * sea una mentira sobre como carga este panel.
   *
   * El costo esta contado en la cabecera de `lib/data/panel-aseadora.ts`: dos
   * latencias mas que la pantalla sin panel, y solo cuando el panel esta
   * abierto.
   */
  datos: PanelDeAseadora;
  /**
   * La direccion del anfitrion **ya compuesta**: sus parametros vivos, sin el
   * del panel. Se compone en el servidor; ver `PanelLectura`.
   *
   * Cerrar contra una constante reseteria el periodo del admin a mes actual, y
   * la asercion de ancla del spec de finanzas existe para atrapar justo eso.
   */
  rutaAlCerrar: string;
}) {
  return (
    <PanelLectura
      titulo={
        /*
          El circulo de 28px que ya existe desde la Fase 7, mas el nombre. El
          circulo va oculto al lector: el nombre completo esta justo al lado y
          anunciarlo seria decir «eme ge, Maria Gonzalez», que es leer dos veces
          lo mismo y la primera vez en un idioma que no existe.
        */
        <span className="inline-flex items-center gap-sm">
          <CirculoIniciales nombre={datos.nombre} />
          {datos.nombre}
        </span>
      }
      apoyo={
        datos.estaActiva ? (
          'Activa'
        ) : (
          /*
            El icono de 14px en el color de aviso (§9.2). Va oculto porque
            acompana al texto: leerlo seria repetir «desactivada».
          */
          <span className="inline-flex items-center gap-xs text-status-warn">
            <UserRoundX className="size-3.5 shrink-0" strokeWidth={2} aria-hidden="true" />
            Desactivada
          </span>
        )
      }
      rutaAlCerrar={rutaAlCerrar}
      /*
        SIN PIE. §9.1 no le da ninguna accion, y sin pie el cuerpo disponible
        pasa de 506px a 590 a 700 de viewport (§6.4). Son los 37 que el parrafo
        de nombres necesita para que el panel quepa.
      */
    >
      {/*
        Sin barrera de suspension y **sin clave**: la clave por identificador va
        sobre el panel entero y la pone la pagina (INSTRUCCION 3). Una clave
        derivada de los parametros aqui, o en cualquier cosa que envuelva al
        contenido del anfitrion, fuerza el remonte del subarbol.
      */}
      <CuerpoDelPanel datos={datos} />
    </PanelLectura>
  );
}

/** Los cuatro grupos de §9.1, en su orden. */
function CuerpoDelPanel({ datos }: { datos: PanelDeAseadora }) {
  const { icono: Icono, clase, texto } = estadoDeAhoraMismo(datos.ahora);
  const sinApartamentos =
    datos.responsableDe.length === 0 && datos.suplenteEn.length === 0;

  return (
    <>
      <GrupoDePanel encabezado="AHORA MISMO" conSeparador>
        {/*
          NO es una fila dato-valor: no hay par rotulo-dato, hay una frase. El
          par va igual en termino y definicion, que es lo que la lista de
          definicion del grupo exige para que un lector anuncie el par y no dos
          textos sueltos (§13.2). El termino va oculto porque el encabezado del
          grupo ya lo dice.

          Y LA FRASE VA EN UN SOLO NODO DE TEXTO, sin partir el nombre del
          apartamento en otro elemento: es lo que la hace afirmable como una sola
          cosa, y ademas evita la tentacion de convertir ese trozo en un enlace a
          la operacion. Esta es una pantalla de plata (D7-1).
        */}
        <div className="flex items-start gap-sm">
          <dt className="sr-only">Ahora mismo</dt>
          <Icono
            className={`size-4 shrink-0 translate-y-px ${clase}`}
            strokeWidth={2}
            aria-hidden="true"
          />
          <dd className="text-body text-foreground">{texto}</dd>
        </div>
      </GrupoDePanel>

      {datos.responsableDe.length > 0 && (
        <GrupoDePanel encabezado={`RESPONSABLE DE (${datos.responsableDe.length})`} conSeparador>
          <ParrafoDeApartamentos termino="Responsable de" apartamentos={datos.responsableDe} />
        </GrupoDePanel>
      )}

      {datos.suplenteEn.length > 0 && (
        <GrupoDePanel encabezado={`SUPLENTE EN (${datos.suplenteEn.length})`} conSeparador>
          <ParrafoDeApartamentos termino="Suplente en" apartamentos={datos.suplenteEn} />
        </GrupoDePanel>
      )}

      {/*
        VACIO: EL GRUPO ENTERO NO SE RENDERIZA (§9.3). Un encabezado con cero y
        un glifo debajo son 46px para decir una ausencia que nadie fue a buscar.
        Si los DOS estan vacios, una sola linea micro con el literal de §15.2.

        No es un `GrupoDePanel` porque no es una lista de definicion: no hay par
        rotulo-dato que anunciar, hay una explicacion. Mismo criterio que la
        linea de gestion externa del panel de apartamento.
      */}
      {sinApartamentos && (
        <>
          <p className="text-micro text-muted-foreground">
            No es responsable ni suplente de ningún apartamento.
          </p>
          <Separator />
        </>
      )}

      <GrupoDePanel encabezado="EN EL PERIODO ABIERTO">
        <PeriodoAbiertoDelPanel periodo={datos.periodoAbierto} />
      </GrupoDePanel>
    </>
  );
}

/**
 * Los nombres, como un parrafo que envuelve. §9.3.
 *
 * **Texto plano, nunca enlaces.** Un enlace aqui llevaria al panel del
 * apartamento, o sea fuera de Finanzas, que es exactamente lo que D8-2 dice que
 * no puede costar una consulta. Es la misma disciplina que `SheetDesglosePago`
 * aplica a sus lineas, por otra razon.
 *
 * El termino va oculto: el encabezado del grupo, con su conteo, ya lo dice en
 * pantalla, y repetirlo dentro seria leerlo dos veces.
 */
function ParrafoDeApartamentos({
  termino,
  apartamentos,
}: {
  termino: string;
  apartamentos: { id: string; nombre: string }[];
}) {
  return (
    <div>
      <dt className="sr-only">{termino}</dt>
      <dd className="text-body text-foreground">
        {apartamentos.map((a) => a.nombre).join(', ')}
      </dd>
    </div>
  );
}

/**
 * El grupo 4: lo que lleva ganado en el periodo de pago **sin cerrar**.
 *
 * No es el rango del filtro de la pantalla, y la diferencia importa: con el
 * filtro en dia, el rango haria que `Lleva ganado` dijera lo de un dia, que no
 * es lo que la etiqueta promete. La razon completa esta en la cabecera de
 * `lib/data/panel-aseadora.ts`.
 *
 * La segunda linea nombra las dos partidas solo cuando hay gastos. No se
 * escribe `· $ 0 en gastos` cuando no hay: ese cero es cierto, pero convierte
 * una senal (esta persona compro cosas) en ruido. Es el mismo criterio de la
 * fila del bloque 3, y el mismo copy.
 */
function PeriodoAbiertoDelPanel({ periodo }: { periodo: PanelDeAseadora['periodoAbierto'] }) {
  if (periodo === null) {
    return (
      <div>
        <dt className="sr-only">Lleva ganado</dt>
        <dd className="text-micro text-muted-foreground">
          Todavía no lleva ningún aseo en este periodo.
        </dd>
      </div>
    );
  }

  const apoyo =
    periodo.gastos > 0
      ? `${periodo.aseos} aseos · ${formatCOP(periodo.gastos)} en gastos`
      : `${periodo.aseos} aseos`;

  return (
    <>
      {/* La fila que ANCLA el panel (§4.4): peso 600 y numerales tabulares. */}
      <FilaDeDato etiqueta="Lleva ganado" valor={formatCOP(periodo.ganado)} ancla cifra />

      <div>
        <dt className="sr-only">Detalle</dt>
        <dd className="text-micro text-muted-foreground">{apoyo}</dd>
      </div>
    </>
  );
}
