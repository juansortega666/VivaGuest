import type { Metadata } from 'next';

import { listarApartamentos } from '@/lib/data/apartamentos';
import {
  agruparPorDia,
  bandejaSinConfirmar,
  cargaPorAseador,
  leerAseadoresActivos,
  leerOperacion,
} from '@/lib/data/operacion';
import { formatFechaBog } from '@/lib/domain/dates';
import { createClient } from '@/lib/supabase/server';

import { BandejaSinConfirmar } from './_components/BandejaSinConfirmar';
import { BloqueDia } from './_components/BloqueDia';
import { DialogoCrearAseo } from './_components/DialogoCrearAseo';
import { LeyendaDeAseos } from './_components/EstadoAseo';
import { FranjaCarga } from './_components/FranjaCarga';
import type { ContextoDeAcciones } from './_components/MenuAseo';

export const metadata: Metadata = {
  title: 'Operación · VivaGuest',
};

/**
 * `/operacion` — la pantalla de la Fase 4 (04-UI-SPEC.md §6).
 *
 * Es la ruta UNICA del dashboard operativo (D-01): no hay `/dia`, ni
 * `/sin-confirmar`, ni `/alertas`. Tres rutas a la misma informacion serian tres
 * sitios donde mirar lo mismo, y el trabajo del admin es mirar UNA pantalla.
 *
 * RSC. El cliente se construye con el JWT del usuario, nunca con la fabrica
 * administrativa (T-04-06): `scripts/ci/check-service-role.sh` rompe el build si
 * aparece. El layout de `(admin)` ya declara `force-dynamic`, asi que esto no se
 * cachea jamas: son datos por usuario.
 *
 * ── LA GEOMETRIA ESTA MEDIDA, NO ESTIMADA (§6.1) ────────────────────────────
 * El `<main>` del layout aporta `max-w-admin` (1440px) y `px-xl` (24px), o sea
 * 1392px utiles. Sobre eso, la rejilla es `minmax(0, 1fr) var(--container-rail)`
 * con `gap-2xl` (32px):
 *
 *   a 1440px → carril ancho = 1392 − 360 − 32 = 1000px
 *   a 1280px → 1280 − 48 = 1232 utiles → carril ancho = 840px
 *
 * Las columnas fijas de la tabla de dia suman 532px (§7.1), asi que a 1280px
 * APARTAMENTO recibe 308px contra su minimo de 200: sobran 108px de holgura. El
 * minimo de 1280px viene de `02-UI-SPEC.md` §6.3; lo que aporta esta pantalla es
 * haberlo verificado con cuentas.
 *
 * `minmax(0, 1fr)` y no `1fr` a secas: el minimo implicito de una pista de
 * rejilla es `auto`, asi que una tabla ancha ensancharia la pista y empujaria el
 * carril lateral fuera del viewport en vez de hacer scroll dentro de su card.
 *
 * ── POR DEBAJO DE 1280px SE APILA, Y EL ORDEN NO ES CAPRICHOSO (§6.4) ───────
 * Primero el carril lateral, despues los dias. Lo que exige accion va antes que
 * lo que se consulta, que es el criterio entero de D-02. El `aside` va SEGUNDO
 * en el DOM (para que en escritorio ocupe la columna derecha) y sube con
 * `max-xl:order-first`.
 *
 * No se construye vista movil de `(admin)`.
 *
 * ── UNA SOLA IDA A `cleanings` PARA LAS TRES SUPERFICIES ───────────────────
 * `leerOperacion()` trae la ventana entera (hoy … hoy+6) con los dos embeds, y
 * `agruparPorDia`, `bandejaSinConfirmar` y `cargaPorAseador` son proyecciones
 * PURAS sobre ese mismo conjunto. Asi la pantalla tiene UNA marca de tiempo que
 * mostrar y no tres, que es lo que D-14 pide. La lista de aseadores activos si es
 * un segundo viaje: vive en `profiles` y no hay forma de traerla en el mismo.
 *
 * ── Y POR QUE HAY UN TERCER VIAJE, AL CATALOGO ─────────────────────────────
 * `listarApartamentos()` alimenta DOS cosas que la consulta de aseos no puede
 * dar, y por eso no se duplica el embed de `leerOperacion`:
 *
 *   1. El RESPONSABLE FIJO de cada apartamento, que es la linea
 *      `Queda asignado a {nombre}` del Sheet de confirmacion (§10). No sale de
 *      `cleanings.aseador_id`: un aseo sin confirmar todavia no tiene aseador,
 *      porque es `confirm_cleaning` quien lo asigna al responsable. El dato vive
 *      en `properties.responsable_id`.
 *   2. Las unidades GESTIONADAS Y ACTIVAS del combobox de `Crear aseo` (§12.3).
 *      El catalogo trae las 39; la operacion solo las que tienen aseo en la
 *      ventana, que no es lo mismo.
 *
 * Son 39 filas y ~8 perfiles, en la misma sesion y en paralelo con las otras dos.
 */
export default async function OperacionPage() {
  const supabase = await createClient();

  // En paralelo: son tres consultas independientes contra la misma sesion, y
  // encadenarlas con tres `await` seguidos sumaria las tres latencias por nada.
  const [operacion, aseadores, apartamentos] = await Promise.all([
    leerOperacion(supabase),
    leerAseadoresActivos(supabase),
    listarApartamentos(supabase),
  ]);

  const bloques = agruparPorDia(operacion.filas, operacion.hoy);
  const chips = cargaPorAseador(operacion.filas, operacion.hoy, aseadores);
  const sinConfirmar = bandejaSinConfirmar(operacion.filas);

  // `property_id` → nombre del responsable fijo. `null` cuando no tiene, que es
  // la carencia que el Sheet levanta ANTES de que `confirm_cleaning` lance su
  // `P0001 sin_responsable`.
  const responsables = Object.fromEntries(
    apartamentos.map((a) => [a.id, a.responsableNombre]),
  );

  // El combobox de `Crear aseo` no autoriza nada —`create_manual_cleaning`
  // comprueba gestion y actividad por dentro, y un Server Action es un endpoint
  // publico (T-04-04)—, asi que este filtro es UX: no ofrecer lo que la base va a
  // rechazar. Ya vienen ordenadas por nombre desde `listarApartamentos`.
  const apartamentosParaCrear = apartamentos
    .filter((a) => a.gestion_vivaguest && a.is_active)
    .map((a) => ({ id: a.id, nombre: a.nombre }));

  // `Siguientes` cuenta lo de sus cinco dias juntos en su cabecera, y cada dia
  // vuelve a contar lo suyo en la propia. No es duplicar: la de fuera es la que se
  // ve con el bloque cerrado, que es como nace.
  const filasSiguientes = bloques.siguientes.flatMap((grupo) => grupo.filas);

  // Lo que el menu de cada fila necesita y la fila no trae (plan 04-11). Baja por
  // `BloqueDia` -> `TablaDia` -> `FilaAseo` sin que ninguno de los tres lo use:
  // el consumidor es `MenuAseo`. Va como UN objeto y no como tres props sueltas
  // para que anadir un cuarto dato manana no vuelva a tocar los tres.
  //
  // Los tres datos ya estaban leidos: `aseadores` alimenta los chips de carga,
  // `responsables` alimenta la bandeja, y `hoy` es el dia de negocio que la
  // consulta uso para su ventana. No hay ningun viaje nuevo a la base.
  const acciones: ContextoDeAcciones = {
    aseadores,
    responsables,
    hoy: operacion.hoy,
  };

  return (
    <div className="flex flex-col gap-xl">
      {/*
        Cabecera de pagina: titulo a la izquierda, acciones a la derecha.

        EL UNICO BOTON PRIMARIO DE ESTA PANTALLA NO ESTA AQUI: es
        `Confirmar N aseos` de la bandeja (§4.2). `Crear aseo` va en `outline`
        porque crear un aseo a mano es una accion rara y deliberada, y dos
        rellenos primarios compitiendo dejarian al ojo eligiendo entre ellos justo
        cuando hay quince cosas pendientes.
      */}
      <div className="flex items-center justify-between gap-lg">
        <h1 className="text-display text-foreground">Operación</h1>

        <div className="flex items-center gap-md">
          {/* Sitio de la marca de ultima actualizacion (§13.1). La construye el
              plan 04-13, que es quien tiene el instante de lectura y el estado de
              sincronizacion. */}

          {/* El dialogo trae su propio disparador, igual que
              `DialogoCrearAseador` de la Fase 2: el patron de "dialogo fuera del
              menu" existe porque un `DropdownMenu` desmonta lo que tiene dentro
              al cerrarse, y aqui el padre es esta cabecera, no un menu. */}
          <DialogoCrearAseo apartamentos={apartamentosParaCrear} hoy={operacion.hoy} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2xl xl:grid-cols-[minmax(0,1fr)_var(--container-rail)]">
        {/* Carril ancho. `min-w-0` para que una tabla ancha haga scroll dentro de
            su card en vez de ensanchar la pista de la rejilla. */}
        <div className="flex min-w-0 flex-col gap-lg">
          <FranjaCarga chips={chips} />

          {/*
            `Hoy` nace expandido; `Manana` y `Siguientes`, colapsados (§8.1). El
            estado no se persiste: cada carga vuelve a esto mismo.
          */}
          <BloqueDia
            rotulo="Hoy"
            fecha={bloques.hoy.fecha}
            filas={bloques.hoy.filas}
            acciones={acciones}
            expandidoInicial
          />

          <BloqueDia
            rotulo="Mañana"
            fecha={bloques.manana.fecha}
            filas={bloques.manana.filas}
            acciones={acciones}
          />

          {/*
            `Siguientes` AGRUPA POR DIA, no es una lista corrida: DASH-01 pide
            "organizados por dia", y 31 filas seguidas pierden justo el ancla que
            el requisito nombra. Cinco dias es el horizonte con el que se decide un
            suplente; mas alla no hay ninguna decision que tomar hoy.

            Los dias de dentro nacen abiertos si tienen algo y cerrados si no:
            cinco estados vacios apilados al abrir el bloque son un muro, y §8.1
            dice literalmente que el vacio se ve "al expandir".
          */}
          <BloqueDia
            rotulo={`Siguientes (${bloques.siguientes.length} días)`}
            filas={filasSiguientes}
            acciones={acciones}
          >
            <div className="flex flex-col gap-lg p-md">
              {bloques.siguientes.map((grupo) => (
                <BloqueDia
                  key={grupo.fecha}
                  fecha={grupo.fecha}
                  filas={grupo.filas}
                  acciones={acciones}
                  expandidoInicial={grupo.filas.length > 0}
                />
              ))}
            </div>
          </BloqueDia>

          {/*
            Lo que queda mas alla del horizonte se CUENTA, no se agrupa, y va sin
            expansion: no hay ninguna decision que tomar hoy sobre un aseo de
            dentro de dos semanas, pero saber que existe evita la pregunta
            "¿y no hay nada mas?".
          */}
          {bloques.masAllaDelHorizonte > 0 && (
            <p className="text-micro text-muted-foreground">
              Hay {bloques.masAllaDelHorizonte}{' '}
              {bloques.masAllaDelHorizonte === 1 ? 'aseo programado' : 'aseos programados'} después
              del {formatFechaBog(bloques.ultimoDiaDelHorizonte)}.
            </p>
          )}

          {/* La leyenda va UNA SOLA VEZ, al pie del carril (§5). Repetirla bajo
              cada uno de los tres dias seria tres veces el mismo parrafo. */}
          <LeyendaDeAseos />
        </div>

        {/*
          ── EL CARRIL LATERAL, Y POR QUE TIENE ALTURA CERRADA (§6.2) ─────────
          D-02 exige que la bandeja Y el panel de alertas esten visibles sin
          scroll de pagina, siempre. Con 15 sin confirmar y 30 alertas eso solo se
          cumple con un presupuesto de altura cerrado y scroll INTERNO en cada
          lista. Su geometria se reserva aqui aunque las dos cards las construyan
          los planes 04-10 y 04-13: dejarlo para entonces significaria descubrir a
          mitad de camino que una empuja a la otra fuera de la pantalla.

          El reparto acordado, que las dos cards tienen que respetar:
            bandeja: cabecera + CTA fuera del scroll; lista a `max-h-[40%]` del
            carril con scroll propio.
            alertas: cabecera fuera del scroll; lista a `flex-1` con scroll propio.

          A 1080p con cromo de navegador (~900px de viewport util) el carril mide
          ~820px: la bandeja cae en ~328px (ocho filas de 40px de quince) y el
          panel en ~460px (siete filas de 64px de treinta). Ningun caso empuja al
          otro fuera de la pantalla, que es exactamente lo que D-02 pide.

          El `sticky` y la altura solo se aplican de `xl` para arriba: apilado, el
          carril lleva sus listas completas sin recorte y sin pegarse.

          `100svh` y no `100vh`: en un navegador con barra retractil `vh` cuenta
          el viewport grande y la ultima fila de alertas queda debajo del cromo.
        */}
        <aside
          aria-label="Pendientes y alertas"
          className="flex flex-col gap-lg max-xl:order-first xl:sticky xl:top-barra xl:h-[calc(100svh-var(--spacing-barra)-var(--spacing-xl))]"
        >
          {/* Bloque superior. El inferior queda para el panel de alertas del
              plan 04-13, que se lleva el `flex-1` que sobra. */}
          <BandejaSinConfirmar filas={sinConfirmar} responsables={responsables} />
        </aside>
      </div>
    </div>
  );
}
