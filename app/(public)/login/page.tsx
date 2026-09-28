import type { Metadata } from 'next';

import { hoyBog } from '@/lib/domain/dates';

import { FormularioLogin } from './_components/FormularioLogin';
import { PanelPublicidad } from './_components/PanelPublicidad';
import { PieDeLogin } from './_components/PieDeLogin';

export const metadata: Metadata = {
  title: 'Entrar · VivaGuest',
};

// `/login` estaba en el manifest de prerenderizado del ultimo build con
// `initialRevalidateSeconds: false`: HTML generado en el build y nunca
// revalidado. Con eso, el ano del pie se congela en el ano del deploy.
// Una hora de ventana es de sobra para un ano en un pie de pagina, y conserva
// el HTML cacheable, que es lo que le importa a un telefono con mala senal.
//
// NO se borre esta linea "porque la pagina es estatica": es precisamente lo que
// hace que deje de serlo del todo. La compuerta que lo defiende vive en
// `page.contrato.test.ts`, porque el defecto exige dos builds en dos fechas
// distintas y ninguna suite de este repo puede mover el reloj del build.
export const revalidate = 3600;

/**
 * `/login` — PLAT-01 y PLAT-02 (UI-SPEC §12.1).
 *
 * No hace ninguna comprobacion de sesion: de eso se encarga el middleware, que
 * manda a su raiz a quien ya tenga sesion valida. Duplicar la comprobacion aqui
 * seria una segunda tabla de ruteo que mantener sincronizada.
 *
 * FASE 10, REDISENO DEL 2026-09-26 (10-UI-SPEC.md §2 y §10.1): la pantalla esta
 * partida **50% publicidad · 50% login** a partir de `lg:` (1024px), sin hueco
 * entre las dos columnas. El reparto vive ENTERO en `@utility rejilla-login` de
 * `app/globals.css`: aqui no hay ni un porcentaje. Debajo de 1024px el panel
 * desaparece por CSS y lo que queda es exactamente la pantalla de antes.
 *
 * ESTO DEROGA D10-2 Y D10-3, decididas el 2026-09-18 y superadas el 2026-09-26
 * por el dueno contra la referencia de Runway. La version derogada repartia
 * 45% de publicidad, un canal vacio del 10% en el medio y 45% de login, y
 * colocaba el formulario en la tercera pista con `lg:col-start-3`. Hoy hay dos
 * pistas y el login va en la segunda. Las medidas de la referencia estan en el
 * bloque `DEROGACION 2026-09-26` de `10-UI-SPEC.md`.
 *
 * Y con el reparto cayo la superficie: el formulario ya NO se envuelve en las
 * primitivas `Card` y `CardContent` de `@/components/ui/card`. Las tres estan
 * escritas aqui con su forma literal a proposito, que es la unica documentacion
 * util de una prohibicion: la que evita que alguien la reintroduzca por no saber
 * que existe. Las primitivas siguen vivas para otras pantallas; lo que no vuelve
 * es su uso en esta.
 *
 * Esta pagina NO lee sesion, ni cookies, ni cabeceras, ni la base (T-10-02). Con
 * `revalidate` la ruta pasa a ISR, o sea UN HTML generado una vez y servido a
 * todos los visitantes durante una hora: el dia que alguien meta aqui una
 * lectura de sesion, el primer visitante fijaria su HTML para los demas.
 *
 * Y el reloj se lee AQUI y en ningun otro sitio de la pantalla, con `hoyBog()`
 * (§8.2). `PieDeLogin` recibe el ano por prop y es funcion pura de su prop, asi
 * que es verificable sin intervenir el tiempo.
 *
 * PROHIBIDO `new Date().getFullYear()` para el ano del pie. El proceso corre en
 * UTC en Vercel y en CI: el 31 de diciembre a las 19:00 de Bogota, UTC ya esta en
 * el ano siguiente y el pie adelantaria el ano durante cinco horas, de noche, una
 * vez al ano. `hoyBog()` ya lleva esa advertencia escrita en su propio comentario
 * y ya tiene su caso de la ventana de UTC en `lib/domain/dates.test.ts`.
 *
 * Y ese `new Date().getFullYear()` de ahi arriba es, ademas, lo que hace que el
 * filtro de lineas de comentario de `page.contrato.test.ts` sea necesario: sobre
 * el archivo crudo la prohibicion se dispararia contra su propia documentacion.
 * Desde el rediseno pasa lo mismo con `lg:col-start-3`, que este comentario
 * nombra dos veces para que nadie lo reintroduzca sin saber que esta prohibido.
 */
export default function LoginPage() {
  return (
    // `data-slot="pantalla-login"` es el MARCO DE REFERENCIA de las aserciones
    // de sangrado del E2E, y existe por una razon medida: `app/layout.tsx` pinta
    // una barra de ambiente de pruebas de 48px en todo entorno que no se declare
    // de produccion, y la suite E2E corre justamente ahi. Por eso este contenedor
    // es `min-h-[calc(100svh-var(--alto-barra-pruebas,0px))]` y **no empieza en
    // el borde del viewport**. Medir el sangrado contra el viewport daria un rojo
    // contra el codigo CORRECTO, que es el peor tipo de rojo: el que hace que
    // alguien "arregle" el producto para complacer al instrumento.
    //
    // El fondo se queda en `--canvas` y NO pasa a blanco (§6.4). Vive aqui y no
    // en el `<main>` porque hay dos columnas que compartirlo.
    <div
      className="flex min-h-[calc(100svh-var(--alto-barra-pruebas,0px))] flex-col bg-canvas"
      data-slot="pantalla-login"
    >
      <div className="flex flex-1 lg:grid lg:rejilla-login">
        {/*
          * COLUMNA 1. El envoltorio hace tres cosas y ninguna es decorativa:
          *
          * 1. DECLARA EL CORTE DE `lg:` EN UN SOLO SITIO. Antes lo llevaba la
          *    raiz de `PanelPublicidad`; se muda aqui porque el wordmark tiene
          *    que desaparecer con el panel, y dos declaraciones del mismo corte
          *    en dos sitios se desincronizan a la primera. Sigue siendo CSS y no
          *    renderizado condicional (§2.4): sin salto tras la primera pintura.
          *
          * 2. ES EL ANCLA DEL WORDMARK. `relative` aqui y `absolute` en el
          *    wordmark es lo que lo pone ENCIMA del panel sin meterlo DENTRO.
          *
          * 3. SACA AL WORDMARK DEL SUBARBOL `aria-hidden`, Y ESTA ES LA TRAMPA.
          *    La raiz de `PanelPublicidad` lleva `aria-hidden="true"`, asi que un
          *    wordmark renderizado dentro del panel desaparece del arbol de
          *    accesibilidad **sin que la pantalla cambie ni un pixel**. Es hermano
          *    y no hijo justamente por eso, y el E2E lo defiende con un `closest`
          *    y no con un localizador de texto: los localizadores de texto de
          *    Playwright no filtran subarboles `aria-hidden` y darian verde con el
          *    defecto puesto.
        */}
        <div className="relative hidden lg:block" data-slot="columna-anuncio">
          <PanelPublicidad />

          {/*
            * EL SEGUNDO WORDMARK. A 32px (`2xl`) de los dos bordes del panel,
            * como en la referencia de Runway. Es un `<p>` y no un `<h1>`, y la
            * alternativa se descarto con razones: mudar el `<h1>` aqui dejaria al
            * `<main>` sin encabezado y pondria el unico encabezado de nivel 1 de
            * la pagina flotando sobre una region decorativa. La pagina sigue
            * teniendo exactamente un `<h1>`, y sigue estando sobre el formulario.
            *
            * NO lleva `aria-hidden`: un lector de pantalla lee la marca dos
            * veces. Eso es redundancia, no barrera, y es el precio de que el
            * wordmark exista de verdad para quien no ve la pantalla.
            *
            * EL COLOR ES BLANCO, POR DECISION DEL DUENO DEL 2026-09-26, Y LA
            * INFRACCION DE CONTRASTE ESTA MEDIDA Y ACEPTADA. Las cifras, con la
            * formula de WCAG 2.1 sobre los cuatro grises de §6.1:
            *
            *      gris           blanco encima     `--foreground` encima
            *      --anuncio-1      1.27:1              14.0:1
            *      --anuncio-4      1.77:1              10.0:1
            *
            * El wordmark es texto grande (24px, peso 600), cuyo umbral de WCAG
            * 1.4.3 es 3:1. El contraste real de hoy es **1.27:1** sobre el gris
            * mas claro. Estas cifras NO justifican el color: documentan el tamano
            * de la infraccion que se esta aceptando. Tres cosas que les dan
            * sentido, y las tres importan:
            *
            *   - LA PREMISA DEL DUENO, y es correcta: los cuatro grises son el
            *     marcador de posicion de un creativo que todavia no existe. No
            *     son el fondo final. El blanco es lo correcto contra la imagen
            *     que algun dia ocupe ese espacio; lo que no es correcto es el
            *     fondo de hoy.
            *   - ESTO NO ES UNA EXENCION DE WCAG 1.4.3. La del producto (los dos
            *     iconos inactivos del pie a 2.09:1, §10.4) SI es legitima, porque
            *     la norma excluye expresamente los componentes inactivos. Aca no
            *     hay exclusion que aplique: es texto sobre una superficie
            *     decorativa. Se registra como infraccion conocida y aceptada, con
            *     esa etiqueta y no con otra, porque un auditor tiene que poder
            *     distinguir las dos.
            *   - LA CONDICION DE SALIDA: el dia que entre el primer creativo real
            *     hay que volver a medir el wordmark contra ESE fondo, y si es
            *     claro, ponerle velo o cambiarle el color. La obligacion esta
            *     escrita en §10.4 y la hereda quien cierre la pregunta abierta 2
            *     de `10-CONTEXT.md`.
            *
            * LO QUE NO SE HACE, Y ES DELIBERADO: no se oscurecen los cuatro
            * grises de §6.1 y no se le mete un velo al panel. Las dos cosas son
            * parches contra un fondo provisional y las dos reabririan el juicio
            * del fundido. Quien quiera cambiar este color tiene que borrar antes
            * la entrada de §10.4, no al reves.
            *
            * Y la clase es la utilidad de blanco del preset, sin token propio: un
            * token sugeriria que el color se cambia desde la capa de tema, y es lo
            * contrario, cambia con el creativo.
          */}
          <p
            className="absolute left-2xl top-2xl font-brand text-display text-white"
            data-slot="wordmark-panel"
          >
            VivaGuest
          </p>
        </div>

        {/*
          * COLUMNA 2. El envoltorio existe por dos razones, y ninguna es cosmetica:
          * 1. lleva la colocacion de columna que antes vivia en el `<main>`, asi
          *    que el `<main>` solo se ocupa de centrar su contenido;
          * 2. es el sitio donde el pie va a vivir como HERMANO del `<main>`:
          *    dentro de la columna y FUERA del `<main>`, que es lo unico que
          *    conserva su rol `contentinfo` (medido en 10-03, senuelo 4).
          *
          * Las lineas de este bloque empiezan por `*` a proposito: el filtro de
          * `page.contrato.test.ts` descarta lineas que EMPIEZAN por comentario, y
          * los nombres prohibidos escritos de otra forma llegarian al codigo.
        */}
        <div className="flex flex-1 flex-col lg:col-start-2" data-slot="columna-login">
          <main className="flex flex-1 flex-col items-center justify-center p-lg lg:p-xl">
            {/*
              El wordmark va en `--foreground`, NO en el color de marca. El coral de la
              identidad (`--brand-identity`) da 2.64:1 contra blanco y no llega al 4.5:1
              que WCAG exige para texto; su sitio son el logo y las areas grandes, no una
              palabra de 24px. Poppins si es la tipografia de marca y el login es uno de
              los tres sitios donde vive (UI-SPEC §3, ACTUALIZACION 2026-09-01).
            */}
            <h1 className="mb-2xl font-brand text-display text-foreground">VivaGuest</h1>

            {/*
              * 400px es la medida del contrato (D10-7) y se conserva; `w-full` debajo
              * de esa anchura para que en un telefono no se salga de la pantalla.
              *
              * LO QUE DESAPARECIO EL 2026-09-26 ES LA SUPERFICIE, no la medida: el
              * bloque ya no vive dentro de una tarjeta. Sin borde, sin sombra y sin
              * padding propio. La referencia de Runway no encierra el formulario en
              * ninguna superficie, y los unicos bordes que le quedan al bloque son los
              * de los propios `Input`.
            */}
            <div className="w-full max-w-login" data-slot="bloque-login">
              <FormularioLogin />
            </div>
          </main>

          {/*
            * EL PIE VIVE DENTRO DE LA COLUMNA DEL LOGIN, Y FUERA DEL `<main>`.
            * Dos mitades, y son independientes:
            *
            * 1. POR QUE DENTRO DE LA COLUMNA. Decision del dueno del 2026-09-26
            *    contra la referencia de Runway: esto deroga la mitad de D10-2 que
            *    pedia el pie a ancho completo. Su ancho lo decide ahora la columna
            *    y no la pantalla, asi que ni un pixel del pie cruza a la mitad
            *    izquierda. Y trae una consecuencia geometrica que conviene tener
            *    escrita: la region del split queda como UNICO hijo del contenedor
            *    de la pantalla, asi que el panel se lleva el alto completo.
            *    Por lo mismo cae el motivo por el que el pie no se capaba a
            *    `max-w-admin`: ya no hay nada que capar, lo capa su columna.
            *
            * 2. POR QUE SIGUE FUERA DEL `<main>`, Y ESTO NO SE DEROGA. Esta
            *    MEDIDO en 10-03 (senuelo 4): un `<footer>` descendiente de
            *    `<main>` **deja de mapear al rol `contentinfo`**, porque el rol
            *    solo aplica cuando el elemento esta al alcance del `body`. El
            *    elemento sigue existiendo, sigue pintando la copia, y desaparece
            *    del indice de regiones del lector de pantalla. Es el modo de
            *    fallo silencioso perfecto: la pantalla se ve identica.
          */}
          <PieDeLogin anio={hoyBog().slice(0, 4)} />
        </div>
      </div>
    </div>
  );
}
