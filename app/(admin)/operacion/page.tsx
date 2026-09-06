import { Plus } from 'lucide-react';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';

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
 */
export default function OperacionPage() {
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

          {/* El dialogo lo cablea el plan 04-10 (`DialogoCrearAseo`). */}
          <Button type="button" variant="outline">
            <Plus aria-hidden="true" />
            Crear aseo
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2xl xl:grid-cols-[minmax(0,1fr)_var(--container-rail)]">
        {/* Carril ancho: franja de carga, los tres bloques de dia y la leyenda.
            Lo llena la tercera tarea de este mismo plan. `min-w-0` para que una
            tabla ancha haga scroll dentro de su card en vez de ensanchar la
            pista. */}
        <div className="flex min-w-0 flex-col gap-lg"></div>

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
        ></aside>
      </div>
    </div>
  );
}
