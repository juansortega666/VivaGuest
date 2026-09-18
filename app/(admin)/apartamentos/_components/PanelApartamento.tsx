import { CalendarDays, ExternalLink, Pencil } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { ApartamentoDeLista } from '@/lib/data/apartamentos';
import type { ProximoAseo } from '@/lib/data/panel-apartamento';
import { formatFechaLargaBog, formatHoraLimite, nombreDeDiaBog } from '@/lib/domain/dates';
import { formatCOP } from '@/lib/domain/money';

import { hayCodigoDeAcceso } from '../_actions';
import { EsqueletoDePanel } from '../../_components/EsqueletoDePanel';
import { FilaDeDato } from '../../_components/FilaDeDato';
import { GrupoDePanel } from '../../_components/GrupoDePanel';
import { PanelLectura } from '../../_components/PanelLectura';
import { EstadoAseo } from '../../operacion/_components/EstadoAseo';
import { CodigoDeAccesoAdmin } from './CodigoDeAccesoAdmin';
import { EstadoApartamento } from './EstadoApartamento';

/**
 * LA FICHA DE LECTURA DEL APARTAMENTO (08-UI-SPEC §7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * ESTA FICHA NO EXISTÍA. D8-3 LA MANDÓ CREAR.
 *
 * La definición del 14 de septiembre decía *"la ficha de un apartamento pasa a
 * panel"*, y era falso de partida: `/apartamentos/[id]` no es una ficha, es el
 * **formulario de edición**, 724 líneas más cuatro editores. Preguntado el
 * dueño si había que crearla, respondió **"debe crearse"**.
 *
 * Y es lo que hace viable la fase entera: una ficha de lectura cabe en 480px sin
 * scroll vertical; un formulario de doce campos con listas dinámicas no cabe
 * nunca. Editar se queda como página y el pie de este panel la enlaza.
 *
 * ── EL CONTENIDO ESTÁ CERRADO POR EL DUEÑO, Y LO QUE NO ESTÁ NO SE MUESTRA ─
 *
 * D8-4, aprobado dato por dato: nombre · cluster · estado · dirección con
 * enlace a Maps · código de acceso · hora límite · responsable y suplente ·
 * tarifa, pago y margen · próximo aseo. **Fuera: cuartos, faltantes base,
 * historial y feeds.** Añadir un dato acá es modificar ese contrato.
 *
 * ── DOS FORMAS, Y SE ELIGEN POR LA MARCA DE GESTIÓN, NO POR UN ESTILO ────
 *
 * Cinco de las 39 unidades son de gestión externa, o sea el 13%: no es un caso
 * raro. Y el panel **cambia de forma por CHECK**, no por decoración: los dos
 * CHECK de la base (`props_assignees_only_when_managed` y
 * `cl_unmanaged_is_inert`) imponen que una unidad externa no tenga responsable,
 * ni suplente, ni tarifas, ni aseador. Por eso la variante informativa tiene
 * TRES bloques de cuerpo y no cuatro: el grupo `A CARGO` no existe, y donde iba
 * `DINERO` va una línea que explica por qué no hay cifras.
 *
 * **Informativa no es un pendiente ni un error.** No se pinta gris, no se marca
 * y no se ofrece completar (`02-UI-SPEC` §5, vigente desde la Fase 2).
 *
 * ── LA TRAMPA DE LAS DOS AUSENCIAS (§6.2 y Pitfall 10) ──────────────────
 *
 * `sin definir` dice que **alguien tiene que ir a llenarlo**; `no aplica` dice
 * que **la base lo prohíbe**. Pintar la primera donde toca la segunda manda al
 * admin a arreglar algo que no se puede arreglar. El compilador obliga a elegir,
 * pero no puede elegir bien por nadie.
 *
 * ── EL CÓDIGO DE ACCESO NO VIAJA AL NAVEGADOR EN ESTA CARGA ─────────────
 *
 * La fila la pinta `CodigoDeAccesoAdmin`, y lo único que este archivo le pasa es
 * el identificador y un booleano de si hay algo detrás. **El valor solo llega
 * por una acción, con su guarda, y solo cuando alguien lo pide con un gesto.**
 * La razón es de §7.3 y no es de criterio: la dirección de este panel es
 * compartible por diseño (criterio 2 del ROADMAP), así que un código renderizado
 * al abrir se entrega a quien sea que abra el chat donde se pegó el enlace. Hay
 * precedente literal sobre esta misma tabla en
 * `apartamentos/[id]/calendario/page.tsx`, con su caso E2E (T-02-74).
 *
 * **Y el booleano no es un rodeo:** la lista de apartamentos no lee la tabla de
 * secretos, ni puede —no tiene grant para `authenticated`—, así que sin él no
 * hay forma de decidir si esa fila lleva botón o lleva ausencia. Lo que cruza es
 * si hay algo, nunca qué hay.
 *
 * ── LO QUE ESTE ARCHIVO NO HACE, Y VA POR NOMBRE ────────────────────────
 *
 *   1. No reimplementa la derivación de estado de apartamento ni la de aseo.
 *      Las dos viven en `lib/domain/` y las pintan `EstadoApartamento` y
 *      `EstadoAseo`, que ya sirven a ocho superficies entre las dos.
 *   2. No construye ningún formateador propio. Dinero, hora límite y fecha
 *      larga salen de los de dominio, que ya tienen sus pruebas.
 *   3. No añade ningún icono fuera de la lista cerrada de §14.5. Los tres que
 *      usa —`ExternalLink`, `CalendarDays`, `Pencil`— están los tres.
 *   4. No muta nada. Activar, desactivar y borrar siguen viviendo en el menú de
 *      la lista, que no se toca. Ningún botón destructivo en toda la fase.
 * ════════════════════════════════════════════════════════════════════════════
 */
export function PanelApartamento({
  fila,
  proximoAseo,
  rutaAlCerrar,
  rutaDelCalendario,
}: {
  /** La fila que la página ya leyó. No se vuelve a la base por ella (§11.4). */
  fila: ApartamentoDeLista;
  /**
   * El próximo aseo, **como promesa sin resolver**. Llega así para que la
   * barrera de suspensión de abajo tenga algo que esperar: el resto del cuerpo
   * ya está en memoria y la cabecera se pinta con su nombre real desde el primer
   * frame, que es justo por lo que el esqueleto no lleva cabecera en gris.
   */
  proximoAseo: Promise<ProximoAseo | null>;
  /**
   * La dirección del anfitrión **ya compuesta**, sin el parámetro del panel y
   * con los demás intactos. Se compone en el servidor; ver `PanelLectura`.
   */
  rutaAlCerrar: string;
  /** Igual, pero añadiendo la vista de calendario de §7.4. */
  rutaDelCalendario: string;
}) {
  const gestionada = fila.gestion_vivaguest;

  return (
    <PanelLectura
      titulo={fila.nombre}
      apoyo={
        /*
          Cluster y estado, en UNA línea (§6.1). El componente de estado se
          reutiliza tal cual: su derivación es el espejo de los tres CHECK de
          `properties` y reescribir el condicional acá es exactamente cómo la
          interfaz se desincroniza de la base.
        */
        <span className="inline-flex items-center gap-xs">
          {fila.cluster} ·<EstadoApartamento fila={fila} />
        </span>
      }
      rutaAlCerrar={rutaAlCerrar}
      pie={
        /*
          §7.4. El pie de la primitiva es `flex-col`, así que los dos botones van
          en su propia fila alineada al extremo derecho.
        */
        <div className="flex flex-row justify-end gap-sm">
          {/*
            `Calendario` es una VISTA DEL MISMO PANEL, no una navegación fuera:
            cambia los parámetros sobre la misma página. Por eso lleva la
            desactivación del salto de scroll, sin la cual mueve la lista de
            detrás exactamente igual que el enlace que abre (§5.2).

            Va con empuje —o sea, sin `replace`— para que el botón atrás
            devuelva a la ficha en vez de sacar de la sección (criterio 3).

            En ESTE plan el destino todavía no renderiza nada distinto: lo llena
            el plan 08-10 con los checkouts y la salud del feed.
          */}
          <Button variant="outline" render={<Link href={rutaDelCalendario} scroll={false} />}>
            <CalendarDays aria-hidden="true" />
            Calendario
          </Button>

          {/*
            El ÚNICO relleno primario de toda la fase (§7.4). Y acá sí es una
            navegación de verdad: se sale de la lista y se entra al formulario,
            que sigue siendo página (D8-3).
          */}
          <Button render={<Link href={`/apartamentos/${fila.id}`} />}>
            <Pencil aria-hidden="true" />
            Editar
          </Button>
        </div>
      }
    >
      {/*
        LA BARRERA DE SUSPENSIÓN ES DEL PANEL, NO DEL SEGMENTO (INSTRUCCIÓN 4).
        El fallback del segmento no se pinta nunca —cero apariciones en doce
        corridas, porque la respuesta del servidor vuelve en ~70 ms— así que no
        habría servido de esqueleto aunque se hubiera quedado.

        **Sin clave.** Ni acá ni en nada que envuelva a la tabla del anfitrión:
        una clave derivada de los parámetros fuerza el remonte del subárbol y se
        lleva por delante las tres piezas del filtro, que hoy sobreviven y
        sobreviven medidas (INSTRUCCIÓN 3). La clave por identificador va sobre
        el panel entero, y la pone la página.

        Las formas: la gestionada son los cuatro grupos de §6.4 (3 filas, 2, 3 y
        1); la informativa son el grupo 1 con su fila de contacto externo y el
        próximo aseo.
      */}
      <Suspense fallback={<EsqueletoDePanel grupos={gestionada ? [3, 2, 3, 1] : [4, 1]} />}>
        <CuerpoDelPanel fila={fila} proximoAseo={proximoAseo} />
      </Suspense>
    </PanelLectura>
  );
}

/** El cuerpo, que es lo único que espera al viaje del próximo aseo. */
async function CuerpoDelPanel({
  fila,
  proximoAseo,
}: {
  fila: ApartamentoDeLista;
  proximoAseo: Promise<ProximoAseo | null>;
}) {
  /**
   * LAS DOS ESPERAS VAN JUNTAS, Y NO UNA DETRÁS DE OTRA. Este cuerpo ya está
   * detrás de la barrera de suspensión, así que encadenarlas sumaría los dos
   * viajes en el tiempo que el esqueleto está a la vista sin ganar nada.
   *
   * Lo segundo que se espera es UN BOOLEANO, y ese es todo el punto: la lista de
   * apartamentos no lee la tabla de secretos, ni puede, así que sin esto no hay
   * forma de saber si la fila del código lleva botón o lleva ausencia. Lo que
   * cruza es si hay algo detrás, nunca qué hay: el valor solo llega por la
   * acción, y solo cuando alguien lo pide.
   */
  const [aseo, hayCodigo] = await Promise.all([proximoAseo, hayCodigoDeAcceso(fila.id)]);
  const gestionada = fila.gestion_vivaguest;

  return (
    <>
      <GrupoDePanel encabezado="UBICACIÓN Y ACCESO" conSeparador>
        <FilaDeDato {...filaDeDireccion(fila)} />

        {/*
          LA FILA DEL CÓDIGO, Y LO ÚNICO QUE CRUZA SON DOS COSAS QUE NO SON EL
          CÓDIGO: el identificador del apartamento y si hay algo detrás (§7.3).

          De la tabla de secretos no sale NADA hacia este árbol. El valor lo trae
          una acción, con su guarda, y solo cuando alguien pulsa. La razón no es
          de criterio: la dirección de este panel es compartible por diseño
          (criterio 2 del ROADMAP), y un código renderizado al abrir se entrega a
          quien sea que abra el chat donde se pegó el enlace. Y esconderlo
          detrás de un `useState` no serviría, porque lo que se pasa como prop a
          un componente de cliente viaja en la carga de React y queda en el
          documento aunque no se pinte.
        */}
        <CodigoDeAccesoAdmin apartamentoId={fila.id} hayCodigo={hayCodigo} />

        {/* 24 horas y sin AM/PM, del formateador que ya existe. */}
        <FilaDeDato etiqueta="Hora límite" valor={formatHoraLimite(fila.hora_limite)} cifra />

        {/*
          EN LA INFORMATIVA, EL CONTACTO EXTERNO SUBE A ESTE GRUPO. No es una
          licencia: un grupo de una sola fila no lleva encabezado (§6.3), y
          entonces son 25px gastados en decir dos veces lo mismo. Si la fila sube,
          el rótulo `Contacto externo` ya dice todo lo que decía el encabezado.
        */}
        {gestionada ? null : (
          <FilaDeDato
            etiqueta="Contacto externo"
            {...(fila.contacto_externo === null
              ? ({ valor: null, ausencia: 'sin definir' } as const)
              : { valor: fila.contacto_externo, completo: fila.contacto_externo })}
          />
        )}
      </GrupoDePanel>

      {gestionada ? (
        <>
          <GrupoDePanel encabezado="A CARGO" conSeparador>
            {/*
              VACÍO EN UNA GESTIONADA ES `Sin asignar` EN EL COLOR DE AVISO, NO
              UN GLIFO. La regla la fijó `FilaAseo.tsx` y no es estilo: un
              apartamento gestionado sin responsable es trabajo que nadie tiene
              asignado, y un em dash lo cuenta como un dato que falta.
            */}
            <FilaDeDato
              etiqueta="Responsable"
              valor={
                fila.responsableNombre === null ? (
                  <span className="text-status-warn">Sin asignar</span>
                ) : (
                  <NombreDeAseador nombre={fila.responsableNombre} activo={fila.responsableActivo} />
                )
              }
            />

            {/* El suplente SÍ es opcional, así que su vacío es glifo. */}
            <FilaDeDato
              etiqueta="Suplente"
              {...(fila.suplenteNombre === null
                ? ({ valor: null, ausencia: 'sin definir' } as const)
                : {
                    valor: (
                      <NombreDeAseador nombre={fila.suplenteNombre} activo={fila.suplenteActivo} />
                    ),
                  })}
            />
          </GrupoDePanel>

          <GrupoDePanel encabezado="DINERO" conSeparador>
            <FilaDeDato etiqueta="Tarifa al huésped" {...cifra(fila.tarifa_huesped)} />
            <FilaDeDato etiqueta="Pago al aseador" {...cifra(fila.pago_aseador)} />
            {/*
              EL MARGEN SE CALCULA, NO SE GUARDA. No existe en ninguna columna y
              no debe existir: es una resta de dos cifras que ya están, y
              materializarla sería un tercer sitio que mantener sincronizado con
              los otros dos.
            */}
            <FilaDeDato etiqueta="Margen" {...filaDeMargen(fila)} />
          </GrupoDePanel>
        </>
      ) : (
        /*
          DONDE IBA EL GRUPO `DINERO`, UNA LÍNEA. Copy exacto, y es el que el
          contrato de la Fase 2 ya fijó para el formulario: repetirlo con otras
          palabras haría que el mismo hecho se leyera distinto en dos pantallas.

          No es un `GrupoDePanel` porque no es una lista de definición: no hay
          par rótulo-dato que anunciar, hay una explicación.
        */
        <>
          <p className="text-micro text-muted-foreground">
            Las unidades de gestión externa no llevan tarifas.
          </p>
          <Separator />
        </>
      )}

      <GrupoDePanel encabezado="PRÓXIMO ASEO">
        <ProximoAseoDelPanel aseo={aseo} gestionada={gestionada} />
      </GrupoDePanel>
    </>
  );
}

/**
 * El nombre de un aseador, con la marca de desactivado detrás.
 *
 * La marca es la del contrato de la Fase 2 (`02-UI-SPEC` §8.3) y existe por la
 * misma razón que allí: si el responsable de un apartamento quedó desactivado,
 * su nombre tiene que seguir apareciendo. Borrarlo de la pantalla perdería el
 * dato sin que nada se lo diga al admin.
 */
function NombreDeAseador({ nombre, activo }: { nombre: string; activo: boolean | null }) {
  return (
    <>
      {nombre}
      {activo === false ? <span className="text-status-idle"> (inactivo)</span> : null}
    </>
  );
}

/** Una cifra de dinero, o su ausencia. Las dos con numerales tabulares. */
function cifra(valor: number | null) {
  return valor === null
    ? ({ valor: null, ausencia: 'sin definir', cifra: true } as const)
    : ({ valor: formatCOP(valor), cifra: true } as const);
}

/**
 * El margen: la tarifa menos el pago.
 *
 * **Negativo va en el color de aviso y NUNCA en el destructivo**, que es la
 * regla del contrato de la Fase 7 (§4.4): el destructivo se reserva para lo que
 * borra o revoca, y un margen en rojo de borrar diría que pasó algo grave
 * cuando lo que pasa es que hay que revisar una tarifa. El signo menos va
 * explícito —lo pone el formateador— para que la señal no dependa solo del
 * color (§13.5).
 */
function filaDeMargen(fila: ApartamentoDeLista) {
  const { tarifa_huesped: tarifa, pago_aseador: pago } = fila;

  // Sin una de las dos no hay resta que hacer. `== null` y no falsedad: un pago
  // de cero es una configuración, no un campo sin llenar.
  if (tarifa === null || pago === null) {
    return { valor: null, ausencia: 'sin definir', cifra: true } as const;
  }

  const margen = tarifa - pago;

  return {
    valor:
      margen < 0 ? <span className="text-status-warn">{formatCOP(margen)}</span> : formatCOP(margen),
    cifra: true,
  } as const;
}

/**
 * La dirección: enlace a Maps cuando lo hay, texto plano cuando no.
 *
 * ── UNA LÍNEA TRUNCADA, Y ES UNA DECISIÓN ───────────────────────────────
 *
 * Reservarle dos líneas cuesta 21px, que es la mitad de la holgura del panel
 * entero (§6.4). El texto completo va en el `title` de la fila y es además el
 * nombre accesible del enlace, porque el recorte lo hace el CSS y no el texto.
 * Quien necesite leerla entera tiene el enlace a Maps justo ahí, que es lo que
 * de verdad se hace con una dirección.
 */
function filaDeDireccion(fila: ApartamentoDeLista) {
  const { direccion, maps_url: mapsUrl } = fila;

  if (direccion === null) {
    return { etiqueta: 'Dirección', valor: null, ausencia: 'sin definir' } as const;
  }

  // Sin enlace de Maps, texto plano SIN icono: un icono de enlace externo que no
  // enlaza a nada es una promesa que la fila no cumple.
  if (mapsUrl === null) {
    return { etiqueta: 'Dirección', valor: direccion, completo: direccion } as const;
  }

  return {
    etiqueta: 'Dirección',
    completo: direccion,
    valor: (
      <a
        href={mapsUrl}
        // Las dos protecciones de referente. `noopener` corta el acceso de la
        // pestaña nueva a esta ventana; `noreferrer` además no le cuenta a Maps
        // de dónde viene.
        target="_blank"
        rel="noopener noreferrer"
        className="transicion rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {direccion}
        {/* 14px dentro de fila, y oculto al lector porque acompaña al texto. */}
        <ExternalLink
          className="ml-xs inline size-3.5 align-text-bottom"
          strokeWidth={2}
          aria-hidden="true"
        />
      </a>
    ),
  } as const;
}

/**
 * El grupo `PRÓXIMO ASEO`, que **no es una fila dato-valor** (§7.1).
 *
 * Son dos líneas: la fecha con el estado al otro extremo, y debajo quién lo
 * hace, en micro. `FilaDeDato` no sirve acá porque pondría la fecha como rótulo
 * atenuado, y la fecha es el dato, no el rótulo.
 *
 * Los pares van igual en término y definición, que es lo que la lista de
 * definición del grupo exige y lo que hace que un lector anuncie el par en vez
 * de dos textos sueltos (§13.2). El término de la segunda línea va oculto porque
 * en pantalla el nombre debajo de la fecha ya se lee como quién la atiende.
 */
function ProximoAseoDelPanel({
  aseo,
  gestionada,
}: {
  aseo: ProximoAseo | null;
  gestionada: boolean;
}) {
  if (aseo === null) {
    return (
      <div>
        <dt className="sr-only">Próximo aseo</dt>
        <dd className="text-micro text-muted-foreground">No tiene ningún aseo programado.</dd>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-baseline justify-between gap-md">
        {/*
          `jueves 18 de septiembre`, compuesto de los dos formateadores que ya
          existen. Uno solo con día y fecha los junta con `", "` en es-CO, que no
          es el copy de §7.1. Mismo criterio que `lib/domain/periodo.ts`.
        */}
        <dt className="min-w-0 truncate text-body text-foreground">
          {`${nombreDeDiaBog(aseo.scheduled_date)} ${formatFechaLargaBog(aseo.scheduled_date)}`}
        </dt>
        <dd className="shrink-0">
          {/* En una unidad externa, este componente ya pinta su clave `externa`. */}
          <EstadoAseo aseo={aseo} />
        </dd>
      </div>

      <div>
        <dt className="sr-only">A cargo</dt>
        <dd className="text-micro text-muted-foreground">
          <QuienLoHace aseo={aseo} gestionada={gestionada} />
        </dd>
      </div>
    </>
  );
}

/**
 * Quién hace el próximo aseo, y **acá está la trampa del Pitfall 10**.
 *
 * En una unidad de gestión externa no hay aseador porque `cl_unmanaged_is_inert`
 * lo prohíbe: la ausencia es `no aplica`, no `sin definir`. Decir `sin definir`
 * mandaría al admin a asignar a alguien que la base va a rechazar.
 *
 * En una gestionada sin asignar sí hay trabajo que repartir, y ahí la regla es
 * la de `FilaAseo.tsx`: `Sin asignar` en el color de aviso.
 */
function QuienLoHace({ aseo, gestionada }: { aseo: ProximoAseo; gestionada: boolean }) {
  if (!gestionada) {
    return (
      <>
        <span aria-hidden="true">—</span>
        <span className="sr-only">no aplica</span>
      </>
    );
  }

  if (aseo.aseador === null) {
    return <span className="text-status-warn">Sin asignar</span>;
  }

  return <>{aseo.aseador.full_name}</>;
}
