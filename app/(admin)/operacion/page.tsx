import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { NoAutorizado, exigirAdmin } from '@/lib/auth/guards';
import { listarApartamentos } from '@/lib/data/apartamentos';
import {
  SIN_AVISOS_REGISTRADOS,
  leerEndpointDePushPropio,
  leerEstadoDeAvisosPorAseador,
} from '@/lib/data/avisos';
import {
  agruparPorDia,
  bandejaSinConfirmar,
  cargaPorAseador,
  leerAlertasAtendidas,
  leerAlertasDelAdmin,
  leerAseadoresActivos,
  leerOperacion,
  leerUltimoExitoDeSync,
  type AlertaDelAdmin,
  type FilaDeOperacion,
} from '@/lib/data/operacion';
import {
  alertasComputadas,
  conteosPorTipo,
  mezclarAlertas,
  type AseoParaAlertas,
  type NotificacionParaAlertas,
} from '@/lib/domain/alertas';
import { estadoDeAvisosDeAseador } from '@/lib/domain/avisos';
import { formatFechaBog, formatFechaLargaBog } from '@/lib/domain/dates';
import { publicEnv } from '@/lib/env';

import { BandejaSinConfirmar } from './_components/BandejaSinConfirmar';
import { BloqueDia } from './_components/BloqueDia';
import { DialogoCrearAseo } from './_components/DialogoCrearAseo';
import { LeyendaDeAseos } from './_components/EstadoAseo';
import { FranjaCarga } from './_components/FranjaCarga';
import type { ContextoDeAcciones } from './_components/MenuAseo';
import { PanelAlertas } from './_components/PanelAlertas';
import { SincronizacionEnVivo } from './_components/SincronizacionEnVivo';
import { TiraAvisosAdmin } from './_components/TiraAvisosAdmin';

export const metadata: Metadata = {
  title: 'Operación · VivaGuest',
};

/**
 * Las filas de `cleanings` recortadas a lo que `alertasComputadas()` necesita.
 *
 * Es un mapeo, no una consulta: los ocho campos ya vienen en `FilaDeOperacion` y
 * los dos del embed tambien. Traer las alertas computadas de un segundo viaje
 * seria leer dos veces la misma tabla en la misma peticion.
 *
 * `apartamentoHoraLimite` viaja aunque el dominio NO la use para calcular el
 * vencimiento: ese se calcula con `cleanings.hora_limite`, que es el snapshot que
 * el trigger puso al crear el aseo, porque APTO-05 permite pactar una hora
 * distinta para un aseo puntual. Va declarada para que la diferencia entre las
 * dos horas quede a la vista y nadie cambie la fuente por descuido.
 */
function aseosParaAlertas(filas: FilaDeOperacion[]): AseoParaAlertas[] {
  return filas.map((f) => ({
    id: f.id,
    property_id: f.property_id,
    is_managed: f.is_managed,
    state: f.state,
    scheduled_date: f.scheduled_date,
    hora_limite: f.hora_limite,
    is_urgent: f.is_urgent,
    created_at: f.created_at,
    apartamento: f.property?.nombre ?? '',
    apartamentoHoraLimite: f.property?.hora_limite ?? f.hora_limite,
  }));
}

/**
 * Las filas de `notifications` con el nombre del apartamento ya resuelto.
 *
 * `leerAlertasDelAdmin()` trae `property_id` y no el nombre, y el join no se pide
 * en esa consulta a proposito: el catalogo entero (39 filas) ya esta leido en
 * esta misma peticion para otras dos cosas, asi que resolver el nombre es una
 * busqueda en un mapa y no un embed mas.
 *
 * `null` y no un `Apartamento desconocido` inventado cuando la notificacion no
 * cuelga de ninguno: quien decide como se ve un slot vacio es el componente.
 */
function notificacionesParaAlertas(
  filas: AlertaDelAdmin[],
  nombres: Record<string, string>,
): NotificacionParaAlertas[] {
  return filas.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    url: n.url,
    cleaning_id: n.cleaning_id,
    property_id: n.property_id,
    created_at: n.created_at,
    apartamento: n.property_id === null ? null : (nombres[n.property_id] ?? null),
  }));
}

/**
 * El texto de la derecha de la cabecera de `Atrasados` (05-UI-SPEC §12.2):
 * `3 aseos · el más viejo del 4 de septiembre`.
 *
 * `el más viejo del {fecha}` es lo que convierte `3 aseos` en una decision: tres
 * de ayer y tres de hace una semana son problemas distintos, y el numero solo no
 * distingue los dos casos.
 *
 * CON UNO SOLO SE DICE `1 aseo · del 4 de septiembre`: "el mas viejo" de un
 * conjunto de uno es una comparacion que no existe, y el contrato solo redacto la
 * forma plural. La fecha se conserva en los dos casos porque es el dato que da la
 * decision.
 *
 * `formatFechaLargaBog` y no `formatFechaBog`: esta ultima emite el dia de la
 * semana (`vie, 4 de septiembre`) y detras de "del" eso es agramatical.
 */
function resumenDeAtrasados(total: number, masViejo: string | null): string {
  const conteo = `${total} ${total === 1 ? 'aseo' : 'aseos'}`;
  if (masViejo === null) return conteo;

  const cual = total === 1 ? 'del' : 'el más viejo del';
  return `${conteo} · ${cual} ${formatFechaLargaBog(masViejo)}`;
}

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
 * `leerOperacion()` trae la ventana entera (hoy−7 … hoy+6, ampliada hacia atras
 * por D-08) con los dos embeds, y `agruparPorDia`, `bandejaSinConfirmar` y
 * `cargaPorAseador` son proyecciones PURAS sobre ese mismo conjunto. Asi la pantalla tiene UNA marca de tiempo que
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
export default async function OperacionPage({
  searchParams,
}: {
  /** `?alertas=atendidas` es el toggle `Ver atendidas` del panel (§11.4). */
  searchParams: Promise<{ alertas?: string }>;
}) {
  // Se usa `exigirAdmin()` y no `createClient()` a secas porque esta pagina
  // necesita el `id` del usuario: `notifications.recipient_id` es NOT NULL y no
  // existe "una notificacion para el rol", asi que el panel se lee por
  // destinatario. Que el layout ya haya autorizado no da acceso al `user` desde
  // aca, y el guard cuesta la misma llamada que un `getUser()` suelto.
  //
  // Solo se traga `NoAutorizado`, misma regla que el layout: un fallo de entorno
  // o de red tiene que propagarse y romper, no convertirse en un login.
  const contexto = await exigirAdmin().catch((error: unknown) => {
    if (error instanceof NoAutorizado) return null;
    throw error;
  });

  if (!contexto) redirect('/login');

  const { supabase, user } = contexto;

  /**
   * EL INSTANTE DE LA LECTURA, UNO SOLO PARA TODA LA PANTALLA (D-14).
   *
   * Se lee el reloj AQUI, una vez, y baja por parametro a todo lo que lo
   * necesita: la ventana de la consulta, el computo de las alertas, la ventana de
   * las atendidas y la marca de frescura de la cabecera. Llamar `Date.now()`
   * dentro de cada superficie daria cuatro respuestas distintas a la misma
   * pregunta —"¿de cuando son estos datos?"— y esa es exactamente la mentira
   * silenciosa contra la que existe D-14.
   */
  const ahoraMs = Date.now();

  const { alertas: modoAlertas } = await searchParams;
  const verAtendidas = modoAlertas === 'atendidas';

  // En paralelo: son consultas independientes contra la misma sesion, y
  // encadenarlas con `await` seguidos sumaria todas las latencias por nada.
  const [
    operacion,
    aseadores,
    apartamentos,
    notificaciones,
    ultimoExito,
    avisos,
    endpointDelAdmin,
  ] = await Promise.all([
      leerOperacion(supabase, ahoraMs),
      leerAseadoresActivos(supabase),
      listarApartamentos(supabase),
      verAtendidas
        ? leerAlertasAtendidas(supabase, user.id, ahoraMs)
        : leerAlertasDelAdmin(supabase, user.id),
      leerUltimoExitoDeSync(supabase),
      // D-03 (§11.2 y §11.3). Va en el mismo `Promise.all` y no encadenada: es
      // una consulta independiente sobre la misma sesión, y sumarle su latencia
      // a las otras cinco no compraría nada. Es UNA llamada para los ocho
      // aseadores, no una por aseador.
      leerEstadoDeAvisosPorAseador(supabase),
      // NOTIF-02, criterio 3 (§13): el endpoint del propio navegador del propio
      // admin, contra el que el hook de la franja compara su suscripcion viva.
      // Sin el, el hook repararia en silencio en cada carga de la pantalla.
      leerEndpointDePushPropio(supabase, user.id),
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

  /**
   * ── QUIÉN SE QUEDÓ SIN CANAL (D-03, criterio 6) ──────────────────────────
   *
   * La derivación NO se hace acá: se llama a `estadoDeAvisosDeAseador()`, que es
   * la misma función que pinta la columna `AVISOS` de `/aseadores`. Un `if` sobre
   * `suscripciones_vivas === 0` escrito en esta página sería una segunda verdad
   * sobre el mismo dato, y la que se quedara atrás lo haría en silencio.
   *
   * El aseador que NO sale del agregado se resuelve como CERO suscripciones y no
   * como dato ausente: ese cero ES el estado `Sin avisos`, que es justo el que
   * esta pantalla existe para hacer visible.
   *
   * `Sin probar` NO entra en esta lista. La franja de carga marca solo a los
   * mudos (§11.2): dos niveles de advertencia en un chip de 32px lo vuelven
   * ilegible, y ese matiz vive en `/aseadores`.
   *
   * Sale como ARRAY de ids y no como `Set` porque cruza la frontera al cliente,
   * donde un `Set` no sobrevive a la serialización.
   */
  const aseadoresSinAvisos = aseadores
    .filter(
      (a) =>
        estadoDeAvisosDeAseador({
          is_active: a.is_active,
          ...(avisos.get(a.id) ?? SIN_AVISOS_REGISTRADOS),
        }).clave === 'sin_avisos',
    )
    .map((a) => a.id);

  /**
   * `property_id` → el responsable fijo de ese apartamento está mudo.
   *
   * El cruce se hace acá y no en el `Sheet` porque este es el único sitio con
   * los dos lados a la vez: `responsables` lleva el NOMBRE del responsable, no
   * su id, y `aseadoresSinAvisos` está indexado por id.
   */
  const mudos = new Set(aseadoresSinAvisos);
  const responsableSinAvisos = Object.fromEntries(
    apartamentos.map((a) => [a.id, a.responsable_id !== null && mudos.has(a.responsable_id)]),
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

  // Lo mismo para `Atrasados`, que tambien es un bloque agregado con dias dentro.
  const filasAtrasadas = bloques.atrasados.flatMap((grupo) => grupo.filas);

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
    responsableSinAvisos,
    aseadoresSinAvisos,
    hoy: operacion.hoy,
    // EL MISMO instante de la lectura que usan la ventana de la consulta y el
    // computo de las alertas (D-14). Lo consume `FilaAseo` para el `Hourglass` de
    // hora limite vencida: asi la senal de la fila y la alerta del panel salen
    // del mismo reloj y no pueden contradecirse dentro del mismo render.
    ahoraMs,
  };

  /**
   * ── LA DERIVACION DEL PANEL DE ALERTAS VIVE EN EL SERVIDOR ────────────────
   *
   * `alertasComputadas()`, `mezclarAlertas()` y `conteosPorTipo()` corren aca y no
   * en el navegador. Bajarlas al cliente seria duplicar `lib/domain/alertas.ts`,
   * y dos verdades sobre el mismo dato se desincronizan en el primer cambio. El
   * componente solo filtra por tipo, que es una operacion que conserva el orden.
   *
   * En el modo `Ver atendidas` NO se computan las tres derivadas, y no es un
   * olvido: urgente, hora limite vencida y calendario caido no tienen `read_at`,
   * asi que no se pueden atender y no pueden estar en la lista de atendidas. Se
   * pasa `[]` de forma explicita para que la ausencia sea una decision escrita y
   * no un efecto lateral.
   */
  const computadas = verAtendidas
    ? []
    : alertasComputadas({
        aseos: aseosParaAlertas(operacion.filas),
        maxUltimoExito: ultimoExito,
        ahoraMs,
        hoy: operacion.hoy,
      });

  const nombresDeApartamento = Object.fromEntries(apartamentos.map((a) => [a.id, a.nombre]));

  const alertas = mezclarAlertas(
    notificacionesParaAlertas(notificaciones, nombresDeApartamento),
    computadas,
  );

  // El orden de esta lista es el FIJO de `ORDEN_DE_TIPOS`, con los ceros. Nunca
  // por conteo: una lista de filtro que se reordena sola es inusable.
  const conteos = conteosPorTipo(alertas);

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
          {/*
            La marca de ultima actualizacion (§13.1) y el canal de tiempo real que
            la alimenta. Recibe `leidoEnMs`, que es EL instante de la lectura de
            esta peticion: el mismo que usaron la ventana de la consulta y el
            computo de las alertas. Es la marca unica que pide D-14.
          */}
          <SincronizacionEnVivo leidoEnMs={operacion.leidoEnMs} />

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
          {/*
            §13.2: debajo de la cabecera de pagina y ENCIMA de la franja de
            carga, dentro del carril ancho. No es sticky y no empuja el carril
            lateral, que conserva su presupuesto de altura cerrado.
          */}
          <TiraAvisosAdmin
            clavePublica={publicEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
            endpointRegistrado={endpointDelAdmin}
          />

          <FranjaCarga chips={chips} sinAvisos={aseadoresSinAvisos} />

          {/*
            ── `Atrasados`, EL BLOQUE DE D-08 (05-UI-SPEC §12) ─────────────────

            VA PRIMERO, ENCIMA DE `Hoy`: es lo unico de esta pantalla que YA salio
            mal. Y nace EXPANDIDO, al reves que `Manana` y `Siguientes`, que nacen
            colapsados porque son planeacion. Esto es una falla, y una falla
            colapsada es una falla escondida.

            ── Y SOLO SE RENDERIZA SI TIENE CONTENIDO, QUE CONTRADICE §8.1 ─────

            `04-UI-SPEC` §8.1 dice que un dia sin aseos SE PINTA IGUAL, con
            `0 aseos`, porque "que hoy no haya nada es informacion". Aca la regla
            es la contraria y la asimetria tiene razon (§12.3), asi que queda
            escrita o parece un descuido:

              `Hoy` es un HECHO DEL CALENDARIO, y que este vacio es un dato que el
              admin necesita confirmar. `Atrasados` es un FILTRO SOBRE UNA FALLA:
              estar vacio es el estado normal y esperado. Un `Atrasados · 0 aseos`
              visible todos los dias entrena al admin a saltarselo con la vista, y
              el dia que diga `3` no lo va a ver.

            Por dentro AGRUPA POR DIA, igual que `Siguientes` y por la misma razon
            de DASH-01: el bloque abarca varios dias y una lista corrida perderia
            la fecha, que es justo el dato que dice cuan viejo es cada uno. Los
            dias de dentro nacen todos abiertos —todos tienen contenido, porque la
            proyeccion solo emite los que lo tienen—, sin la condicion de
            `Siguientes`, que existe para no apilar cinco vacios.

            Y ESTE BLOQUE ES LO QUE HACE QUE EL CLIC DE UNA ALERTA DE UN DIA
            ANTERIOR ATERRICE EN ALGUN SITIO (§12.1, T-05-55): el `href` de esas
            alertas es `/operacion#aseo-{id}` y ese ancla lo pone `FilaAseo`, asi
            que sin estas filas renderizadas la alerta se veria, se podria tocar y
            no llevaria a ninguna parte.
          */}
          {bloques.atrasados.length > 0 && (
            <BloqueDia
              rotulo="Atrasados"
              filas={filasAtrasadas}
              acciones={acciones}
              expandidoInicial
              resumen={resumenDeAtrasados(filasAtrasadas.length, bloques.masViejoAtrasado)}
            >
              <div className="flex flex-col gap-lg p-md">
                {bloques.atrasados.map((grupo) => (
                  <BloqueDia
                    key={grupo.fecha}
                    fecha={grupo.fecha}
                    filas={grupo.filas}
                    acciones={acciones}
                    expandidoInicial
                  />
                ))}
              </div>
            </BloqueDia>
          )}

          {/*
            Lo que queda POR DETRAS de la ventana de siete dias se CUENTA y no se
            agrupa, exactamente como lo de mas alla del horizonte por el otro
            extremo (§12.4). Va sin expansion y apunta a un destino real: el
            historial del apartamento, que existe y es de solo lectura.

            La ventana tiene tope porque sin el la consulta creceria sin limite
            —la retencion del producto es de seis meses— pero lo que queda afuera
            NO SE ESCONDE: se dice cuanto hay y donde verlo (T-05-54).
          */}
          {bloques.antesDeLaVentana > 0 && (
            <p className="text-micro text-muted-foreground">
              Hay {bloques.antesDeLaVentana}{' '}
              {bloques.antesDeLaVentana === 1 ? 'aseo sin cerrar' : 'aseos sin cerrar'} de antes
              del {formatFechaLargaBog(bloques.primerDiaDeLaVentana)}. Ábrelos desde la ficha de su
              apartamento.
            </p>
          )}

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
          <BandejaSinConfirmar
            filas={sinConfirmar}
            responsables={responsables}
            responsableSinAvisos={responsableSinAvisos}
          />

          {/* Bloque inferior: se lleva el `flex-1` que sobra del carril, tenga
              treinta alertas o ninguna. El panel NO desaparece cuando esta vacio,
              porque su ausencia haria que la bandeja creciera y la geometria del
              carril cambiara cada vez que entra o sale una alerta (§11.5). */}
          <PanelAlertas
            alertas={alertas}
            conteos={conteos}
            ahoraMs={ahoraMs}
            modo={verAtendidas ? 'atendidas' : 'sin_atender'}
          />
        </aside>
      </div>
    </div>
  );
}
