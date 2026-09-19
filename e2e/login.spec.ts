import { expect, leerCredenciales, test } from './fixtures';

/**
 * CRITERIO 1 DEL ROADMAP: login por rol con sesion persistente.
 *
 * Este es el unico archivo de la suite que hace login tecleando en la pantalla.
 * El resto arranca con `storageState` ya puesto: un test de otra cosa que empieza
 * por el login se cae por razones que no tienen que ver con lo que mide.
 */

test.describe('Login por rol', () => {
  test('el admin entra y aterriza en /operacion', async ({ page }) => {
    const { admin } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(admin.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    // La pantalla de login redirige a `/` y es el MIDDLEWARE quien elige la raiz
    // segun `app_metadata.role`. Lo que este test mide es el RUTEO, no la
    // pantalla de destino.
    //
    // La raiz del admin es `/operacion` desde el plan 04-09, no `/apartamentos`:
    // el dashboard operativo es lo que se abre para trabajar y el catalogo es
    // donde se va a configurar. La tabla vive en `lib/auth/routing.test.ts`.
    await expect(page).toHaveURL(/\/operacion$/);
  });

  test('el aseador entra y aterriza en /mis-aseos', async ({ page }) => {
    const { aseador1 } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(aseador1.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(aseador1.password);
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page).toHaveURL(/\/mis-aseos$/);
    // Su superficie, no la del admin. El stub existe justamente para poder
    // afirmar esto con una asercion de contenido y no solo de URL.
    await expect(page.getByRole('heading', { name: 'Mis aseos' })).toBeVisible();
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * LA ASERCION CENTRAL DEL CRITERIO 1. No borrar, no relajar.
   *
   * Una recarga real es lo unico que ejerce el camino completo: el navegador
   * manda las cookies, el middleware corre `getUser()`, `setAll` reescribe las
   * cookies refrescadas en el response y el navegador las vuelve a guardar. Si
   * `setAll` esta mal implementado, o si el `NextResponse` se reconstruye sin
   * copiar las cookies, la sesion se pierde justo aqui y no en el login.
   *
   * Con dos usuarios en desarrollo nadie notaria el fallo a mano: hace falta
   * volver a cargar en el momento justo en que el token se refresca. Este test
   * lo fuerza en cada corrida.
   * ─────────────────────────────────────────────────────────────────────────
   */
  test('la sesion sobrevive a una recarga de pagina', async ({ page }) => {
    const { aseador1 } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(aseador1.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(aseador1.password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page).toHaveURL(/\/mis-aseos$/);

    await page.reload();

    // Sigue dentro. Si la sesion no persistiera, el middleware habria mandado a
    // /login, que es exactamente el sintoma de "los usuarios se desloguean solos".
    await expect(page).toHaveURL(/\/mis-aseos$/);
    await expect(page.getByRole('heading', { name: 'Mis aseos' })).toBeVisible();

    // Y una segunda recarga: el primer refresco de cookies es el que puede
    // dejarlas desincronizadas sin que la primera navegacion lo note.
    await page.reload();
    await expect(page).toHaveURL(/\/mis-aseos$/);
  });

  /**
   * ─────────────────────────────────────────────────────────────────────────
   * NO se comprueba aqui el `Cache-Control` anti-cache del middleware, y no es
   * un olvido: se intento y era un FALSO VERDE.
   *
   * La version descartada recargaba con sesion y afirmaba que la respuesta
   * traia `no-store`. Pasaba. Se rompio `setAll` a proposito, dejandolo en la
   * firma de un argumento, y **seguia pasando**: Next marca `no-store` por su
   * cuenta en toda ruta dinamica, asi que la asercion media el default del
   * framework, no el trabajo del middleware. Habria dado confianza con el
   * agujero abierto, que es peor que no tener test.
   *
   * Esa invariante se mide donde si tiene dientes, en
   * `lib/supabase/middleware.test.ts`: se invoca `setAll` con sus dos
   * argumentos igual que lo hace `@supabase/ssr` y se comprueba que las
   * cabeceras acaban en el response. Ese test SI se pone rojo con el senuelo.
   * ─────────────────────────────────────────────────────────────────────────
   */
});

test.describe('Errores de credenciales', () => {
  test('credenciales malas muestran el mensaje del contrato', async ({ page }) => {
    const { aseador1 } = leerCredenciales();

    await page.goto('/login');
    await page.getByLabel('Email').fill(aseador1.email);
    await page.getByLabel('Contraseña', { exact: true }).fill('contrasena-incorrecta');
    await page.getByRole('button', { name: 'Entrar' }).click();

    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('un email inexistente muestra EL MISMO mensaje', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('no.existe.jamas@vivaguest.test');
    await page.getByLabel('Contraseña', { exact: true }).fill('cualquier-cosa-larga');
    await page.getByRole('button', { name: 'Entrar' }).click();

    // Identico al test anterior, y eso es el punto: si algun dia alguien
    // "mejora" el copy para decir que el email no existe, este test se cae. Es
    // la unica defensa contra la enumeracion de usuarios por credenciales.
    await expect(page.getByText('Email o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FASE 10 — LA PANTALLA PARTIDA. Todo lo de abajo se anadio DESPUES de los cinco
 * casos de arriba y ninguno de ellos se toco: son la red de seguridad de que el
 * marco nuevo no le rompio nada al formulario, y son la unica forma de saberlo
 * sin editar `FormularioLogin.tsx`.
 *
 * El proyecto corre a 1280x720 (`devices['Desktop Chrome']`), por encima del
 * corte de 1024, asi que los cinco casos de arriba se ejecutan CON el split
 * activo.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * DEFIENDE D10-3 (el reparto 45/10/45 y el canal central) y D10-6 (debajo de
 * 1024px el panel no existe).
 *
 * Las cifras salen de `10-UI-SPEC.md` §2.2 y son aritmetica, no gusto:
 *   - 1280 x 0.45 = 576  → ancho de la columna del anuncio y de la del login
 *   - 1280 x 0.10 = 128  → el canal central, que es el unico hueco de la pantalla
 *   - la columna 3 arranca en 1280 x 0.55 = 704, o sea en la mitad DERECHA
 *   - 24 = `p-xl`, el recuadro de la tarjeta insertada (§3.1)
 *
 * El localizador es `data-slot` y no `data-testid` porque el repo no usa
 * `data-testid` en ningun sitio, y porque el panel es `aria-hidden`, sin texto y
 * sin rol: no hay forma de alcanzarlo por rol ni por contenido.
 */
test.describe('El split del login', () => {
  test('a 1280 la pantalla esta partida 45/10/45 y el login vive en la columna 3', async ({
    page,
  }) => {
    // 1280x720 es el viewport del proyecto: no se cambia a proposito, para que
    // este caso mida la misma geometria que ven los cinco casos de arriba.
    await page.goto('/login');

    const panel = page.locator('[data-slot="panel-publicidad"]');
    const principal = page.getByRole('main');
    const tarjetaAnuncio = page.locator('[data-slot="anuncio"]');
    const tarjetaLogin = page.locator('[data-slot="card"]');

    await expect(panel).toBeVisible();

    const cajaPanel = await panel.boundingBox();
    const cajaPrincipal = await principal.boundingBox();
    const cajaAnuncio = await tarjetaAnuncio.boundingBox();
    const cajaLogin = await tarjetaLogin.boundingBox();
    if (!cajaPanel || !cajaPrincipal || !cajaAnuncio || !cajaLogin) {
      throw new Error('No se pudo medir la pantalla partida.');
    }

    // 45% y 45%: las dos columnas miden lo mismo.
    expect(Math.round(cajaPanel.width)).toBe(576);
    expect(Math.round(cajaPrincipal.width)).toBe(576);

    // El 10% que falta es UN canal central, no dos margenes exteriores (§2.1).
    expect(Math.round(cajaPrincipal.x - (cajaPanel.x + cajaPanel.width))).toBe(128);

    // Los 400px del contrato (D10-7) siguen intactos, y la Card cae en la mitad
    // derecha de la pantalla: es lo que prueba que `lg:col-start-3` existe. Sin
    // esta asercion la prueba de anchos pasaria igual con el formulario ENCIMA
    // del panel.
    expect(Math.round(cajaLogin.width)).toBe(400);
    expect(cajaLogin.x).toBeGreaterThanOrEqual(640);

    // El recuadro de 24px de la tarjeta insertada, y que su `size-full` se
    // resolvio contra un alto de verdad en vez de colapsar a cero. El alto
    // exacto NO se afirma a proposito: cambia cuando el pie de pagina aterrice
    // en 10-03, y una asercion que el plan siguiente tiene que editar es una
    // asercion que no defiende nada.
    expect(Math.round(cajaAnuncio.x)).toBe(24);
    expect(cajaAnuncio.height).toBeGreaterThan(500);
  });

  test('a 390 el panel no existe y el login se ve como siempre', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    // `display: none` por CSS (§2.4): no hay renderizado condicional que pueda
    // producir un salto despues de la primera pintura.
    await expect(page.locator('[data-slot="panel-publicidad"]')).toBeHidden();

    // Y lo demas es exactamente la pantalla de hoy.
    await expect(page.locator('[data-slot="card"]')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});

/**
 * DEFIENDE D10-4: cuatro grises, 5s por paso, 600ms de fundido, sin un kilobyte
 * de JavaScript.
 *
 * La aritmetica de `10-UI-SPEC.md` §7.2: 4 pasos x 5s = 20s de ciclo. El
 * `linear` no es intercambiable por `ease-out` — un fundido de 600ms entre dos
 * grises a 1.115:1 con `ease-out` arranca de golpe y se lee como un parpadeo.
 *
 * Con el movimiento NORMAL no se afirma el color computado: en cualquier
 * instante del ciclo es cualquiera de los cuatro grises o una interpolacion
 * entre dos, asi que afirmar uno concreto seria una asercion que pasa por suerte.
 */
test.describe('El contrato de la animacion del placeholder', () => {
  test('la tarjeta del anuncio corre `ciclo-anuncio 20s linear infinite`', async ({ page }) => {
    await page.goto('/login');

    const animacion = await page.locator('[data-slot="anuncio"]').evaluate((el) => {
      const estilo = getComputedStyle(el);
      return {
        nombre: estilo.animationName,
        duracion: estilo.animationDuration,
        curva: estilo.animationTimingFunction,
        repeticiones: estilo.animationIterationCount,
      };
    });

    expect(animacion.nombre).toBe('ciclo-anuncio');
    expect(animacion.duracion).toBe('20s');
    expect(animacion.curva).toBe('linear');
    expect(animacion.repeticiones).toBe('infinite');
  });
});

/**
 * DEFIENDE D10-4 por su otro lado, que es el que se rompe sin que nadie lo vea:
 * con `prefers-reduced-motion: reduce` el panel sigue VISIBLE y quieto en
 * `--anuncio-1`, no en blanco.
 *
 * El mecanismo, medido en `10-UI-SPEC.md` §7.3: el bloque global de
 * `globals.css` pone `animation-duration: 0s !important`, y con
 * `animation-fill-mode: none` (el de fabrica) NINGUN keyframe queda aplicado, asi
 * que el elemento cae a su propio `background-color`. Por eso `bg-anuncio-1` en
 * la clase base NO es redundante: es el estado de movimiento reducido, y es la
 * clase que la primera limpieza borra por "duplicada" (trampa 3 de §11.5).
 *
 * Los colores se comparan con una SONDA y nunca contra un literal escrito a
 * mano. Esta medido en `e2e/calendario.spec.ts:333-356`: `getComputedStyle` no
 * devuelve `rgb()`, devuelve el valor tal como lo declara la capa de tokens, y
 * el valor declarado y el computado no son la misma cadena (`oklch(100% 0 0)`
 * contra `oklch(1 0 0)`). Comparar contra un literal da un rojo que no
 * significa nada.
 */
test.describe('El placeholder con movimiento reducido', () => {
  // `test.use({ reducedMotion: 'reduce' })` NO compila con `@playwright/test@1.62.1`:
  // `reducedMotion` no es una clave de `PlaywrightTestOptions` en esta version
  // (comprobado: `colorScheme` si esta, `reducedMotion` y `contrast` solo viven en
  // `BrowserContextOptions`). Se declara por `contextOptions`, que SI es opcion de
  // test, y asi la emulacion existe desde que nace el contexto y no despues de la
  // primera pintura.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('el panel se queda quieto en el gris 1 y el spinner sigue girando', async ({ page }) => {
    await page.goto('/login');

    const panel = page.locator('[data-slot="panel-publicidad"]');
    await expect(panel).toBeVisible();

    const pintura = await page.locator('[data-slot="anuncio"]').evaluate((el) => {
      const sonda = (token: string) => {
        const div = document.createElement('div');
        div.style.backgroundColor = `var(${token})`;
        document.body.appendChild(div);
        const v = getComputedStyle(div).backgroundColor;
        div.remove();
        return v;
      };

      // El spinner se mide con una sonda de CLASE y no con el boton `Entrar`
      // real: el spinner solo existe mientras la Server Action esta en vuelo, asi
      // que afirmarlo sobre el boton seria una carrera contra la red. Lo que hay
      // que defender es que la regla `.animate-spin` del bloque de movimiento
      // reducido sigue en pie, y eso no depende del tiempo.
      const sondaSpinner = () => {
        const div = document.createElement('div');
        div.className = 'animate-spin';
        document.body.appendChild(div);
        const v = getComputedStyle(div).animationDuration;
        div.remove();
        return v;
      };

      return {
        anuncio: getComputedStyle(el).backgroundColor,
        duracion: getComputedStyle(el).animationDuration,
        gris1: sonda('--anuncio-1'),
        gris4: sonda('--anuncio-4'),
        spinner: sondaSpinner(),
      };
    });

    // La animacion esta apagada...
    expect(pintura.duracion).toBe('0s');

    // ...y el panel sigue PINTADO, en el gris 1. Las dos mitades: que ES el gris
    // 1 y que NO es el gris 4. Afirmar solo la primera dejaria pasar un panel
    // transparente el dia que la sonda devolviera lo mismo por accidente.
    expect(pintura.anuncio).toBe(pintura.gris1);
    expect(pintura.anuncio).not.toBe(pintura.gris4);

    // La UNICA excepcion del contrato de movimiento sigue viva: un spinner es
    // informacion de estado, no decoracion.
    expect(pintura.spinner).not.toBe('0s');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LOS DOS NUMEROS QUE EL DUENO ESCOGIO: el 45% y el corte en 1024px.
 *
 * El 1024 no es un numero redondo elegido a gusto: es ARITMETICA
 * (`10-UI-SPEC.md` §2.2). El formulario mide 400px (`max-w-login`, D10-7) y su
 * columna lleva `lg:p-xl`, 24px por lado, asi que la columna necesita 448px.
 *
 *     448 / 0.45 = 995.6px de viewport
 *
 * **Por debajo de 996px el 45% empezaria a comerse el padding del formulario.**
 * El corte de D10-6 queda 28.4px por encima de ese piso, con 6.4px de holgura
 * sobre el padding a cada lado: a 1024 el aire a la izquierda de la Card son
 * 24 + 6.4 = **30.4px**. Esa cifra es la que hace visible el modo de fallo, y es
 * la razon de medirla en el viewport mas apretado y no en el mas comodo.
 *
 * La frontera se prueba por los DOS lados. Un caso de un pixel parece mania y no
 * lo es: es lo que distingue "el panel desaparece en el telefono" de "el panel
 * desaparece cuando a la media query le apetece".
 * ─────────────────────────────────────────────────────────────────────────────
 */
test.describe('El arranque del split y la holgura vertical', () => {
  test('a 1024 el panel ya se ve y la Card conserva sus 400px', async ({ page }) => {
    // 1024 es `lg:` exacto: `--breakpoint-lg` no esta redeclarado en
    // `globals.css`, asi que `lg:` son los 64rem de fabrica.
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/login');

    await expect(page.locator('[data-slot="panel-publicidad"]')).toBeVisible();

    const cajaPrincipal = await page.getByRole('main').boundingBox();
    const cajaLogin = await page.locator('[data-slot="card"]').boundingBox();
    if (!cajaPrincipal || !cajaLogin) throw new Error('No se pudo medir el login a 1024.');

    // 400 y no menos: si el 45% hubiera empezado a comerse el padding, la Card
    // se encogeria, y ese es exactamente el modo de fallo que el piso de 995.6px
    // predice.
    expect(Math.round(cajaLogin.width)).toBe(400);

    // 24 de `lg:p-xl` + 6.4 de holgura = 30.4. Con tolerancia de 2px porque el
    // 45% de 1024 es 460.8 y el navegador reparte subpixeles.
    expect(cajaLogin.x - cajaPrincipal.x).toBeCloseTo(30.4, 0);
  });

  test('a 1023, un pixel por debajo del corte, el panel no existe', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 768 });
    await page.goto('/login');

    await expect(page.locator('[data-slot="panel-publicidad"]')).toBeHidden();

    const cajaLogin = await page.locator('[data-slot="card"]').boundingBox();
    if (!cajaLogin) throw new Error('No se pudo medir la Card a 1023.');
    expect(Math.round(cajaLogin.width)).toBe(400);
  });

  test('a 1024x768 el login no queda debajo del pliegue', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/login');

    // El bloque del login mide 321px medidos contra las primitivas instaladas
    // (§2.3) y la region mas apretada le deja 152px de aire a cada lado. Lo que
    // esta asercion atrapa es el modo de fallo que de verdad duele en una
    // pantalla de acceso: que el boton `Entrar` quede debajo del pliegue.
    const recorrido = await page.evaluate(() => ({
      alto: document.documentElement.scrollHeight,
      visible: document.documentElement.clientHeight,
    }));

    expect(recorrido.alto).toBeLessThanOrEqual(recorrido.visible);
  });
});

/**
 * El ano esperado se calcula AQUI, con un formateador de zona de Bogota
 * explicito. Y es la unica forma correcta de calcularlo en este archivo:
 *
 *   - `playwright.config.ts` fija `timezoneId: 'America/Bogota'` para el
 *     NAVEGADOR. El servidor de Next corre con la zona de la maquina, que en CI
 *     es UTC. La zona del navegador no alcanza al render del servidor.
 *   - `new Date().getFullYear()` del proceso de test caeria en EXACTAMENTE la
 *     misma trampa que se esta persiguiendo: el 31 de diciembre a las 19:00 de
 *     Bogota devolveria el ano siguiente, coincidiria con un producto defectuoso
 *     y la prueba pasaria en verde contra el defecto.
 *
 * Mismo patron y misma zona literal que `e2e/calendario.spec.ts:68`. No se
 * importa `hoyBog()` a proposito: un instrumento que comparte el helper con el
 * producto no puede distinguir un helper roto de un helper correcto.
 */
function anioBogota(): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    timeZone: 'America/Bogota',
  }).format(new Date());
}

/** La copia literal de `10-UI-SPEC.md` §12. Es contrato, no texto de relleno. */
function copyrightEsperado(): string {
  return `© ${anioBogota()} VivaGuest. Todos los derechos reservados.`;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFIENDE D10-2 (el pie full-width abajo) y D10-5 (el ano calculado).
 *
 * Las cifras salen de `10-UI-SPEC.md` §8.1 y son aritmetica:
 *   - `lg:h-barra` = **56px** exactos a partir de 1024px
 *   - `lg:px-xl` = **24px**, y esa es LA UNICA ALINEACION QUE ESTA PANTALLA
 *     REGALA: el borde izquierdo del copyright cae exactamente sobre el borde
 *     izquierdo de la tarjeta del anuncio, que tambien esta a 24px del viewport.
 *     Es gratis solo mientras `px-xl` siga ahi, y por eso se mide contra la
 *     tarjeta y no contra el numero 24 a secas.
 *
 * Se afirma el texto COMPLETO y no solo el ano: la copia de §12 es contrato, y un
 * pie que pierda "Todos los derechos reservados" tiene que ponerse rojo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
test.describe('El pie del login a partir de lg:', () => {
  test('es la unica contentinfo, mide 56px y alinea con la tarjeta del anuncio', async ({
    page,
  }) => {
    // 1280x720 es el viewport del proyecto: no se cambia, para que este caso mida
    // la misma geometria que ven los cinco casos de login de arriba.
    await page.goto('/login');

    const pie = page.getByRole('contentinfo');
    await expect(pie).toBeVisible();

    // EXACTAMENTE una. Dos `contentinfo` en una pagina obligan al lector de
    // pantalla a desambiguarlas por nombre, y ninguna de las dos lo tiene (§10.1).
    await expect(page.getByRole('contentinfo')).toHaveCount(1);

    // Y vive FUERA del `<main>`: `<main>` envuelve solo el login. Esto es lo que
    // se rompe si alguien "simplifica" el arbol metiendo el pie dentro.
    await expect(page.locator('main footer')).toHaveCount(0);

    // `toHaveText` sobre el parrafo y NO `getByText(...)` + `toBeVisible()`: los
    // dos caen ante un ano equivocado, pero el segundo cae con `element(s) not
    // found`, que no dice QUE ano salio. Medido con el senuelo del ano literal.
    // Mismo hallazgo de clase que el `.match() ?? []` del plan 10-02: una prueba
    // que cae sin explicar por que es media prueba.
    await expect(pie.locator('p')).toHaveText(copyrightEsperado());

    const cajaPie = await pie.boundingBox();
    const cajaCopyright = await pie.locator('p').boundingBox();
    const cajaAnuncio = await page.locator('[data-slot="anuncio"]').boundingBox();
    if (!cajaPie || !cajaCopyright || !cajaAnuncio) {
      throw new Error('No se pudo medir el pie del login a 1280.');
    }

    // `lg:h-barra` = 56. El alto SI se afirma exacto aca porque es una altura
    // fijada por clase, no una altura derivada del texto.
    expect(Math.round(cajaPie.height)).toBe(56);

    // Los 24px de `lg:px-xl`, y que son LOS MISMOS 24px de la tarjeta del
    // anuncio. La segunda mitad es la que convierte un numero en una alineacion.
    expect(Math.round(cajaCopyright.x)).toBe(24);
    expect(Math.abs(cajaCopyright.x - cajaAnuncio.x)).toBeLessThanOrEqual(1);
  });
});

/**
 * Debajo de `lg:` desaparece el PANEL, no el pie. §8.1: a 390px de ancho quedan
 * 358px utiles y la fila necesitaria 288 + 16 + 60 = **364px**, asi que se pasa
 * por 6px y el texto envolveria. Apilado, el pie mide ~85px.
 *
 * El alto va como RANGO (80..90) y no como numero exacto a proposito: depende de
 * la metrica real de Geist al renderizar, y una asercion de un pixel sobre texto
 * es una asercion que se cae sin que nada este roto. El rango si distingue los dos
 * modos de fallo que importan: una fila (56px) y un pie que crecio al doble.
 */
test.describe('El pie del login en el telefono', () => {
  test('sigue visible, apilado, y mide entre 80 y 90 de alto', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/login');

    // El panel no, el pie si. Las dos mitades juntas son lo que dice que el
    // `hidden lg:block` esta en el panel y NO se le pego al pie por copiar y pegar.
    await expect(page.locator('[data-slot="panel-publicidad"]')).toBeHidden();

    const pie = page.getByRole('contentinfo');
    await expect(pie).toBeVisible();
    await expect(pie.locator('p')).toHaveText(copyrightEsperado());

    const cajaPie = await pie.boundingBox();
    const cajaCopyright = await pie.locator('p').boundingBox();
    const cajaIconos = await pie.locator('div').first().boundingBox();
    if (!cajaPie || !cajaCopyright || !cajaIconos) {
      throw new Error('No se pudo medir el pie del login a 390.');
    }

    // Apilado: el copyright esta ARRIBA del bloque de iconos. En una fila las dos
    // `y` serian practicamente la misma.
    expect(cajaCopyright.y).toBeLessThan(cajaIconos.y);

    expect(Math.round(cajaPie.height)).toBeGreaterThanOrEqual(80);
    expect(Math.round(cajaPie.height)).toBeLessThanOrEqual(90);
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * DEFIENDE §10.3: los dos iconos deshabilitados NO son una trampa de foco.
 *
 * Y esto solo se puede probar en un navegador, por una razon MEDIDA en el plan
 * 10-02: `@base-ui/react` emite `tabindex="0"` junto con `disabled`. El markup
 * literal que sale de la primitiva es
 *
 *     <button type="button" data-disabled="" tabindex="0" disabled="" ...>
 *
 * asi que leer el `tabindex` no dice NADA. Lo que decide es que el motor no le da
 * el foco a un control deshabilitado, y eso es comportamiento del navegador.
 *
 * NO se usa `toBeDisabled()` de Playwright, y no es una preferencia: esta MEDIDO.
 * Con `aria-disabled` en vez de `disabled` (o sea con la trampa de foco de §10.3
 * regla 2 puesta, y con el probe de foco de abajo devolviendo `true`),
 * `await expect(boton).toBeDisabled()` pasa en **VERDE**. Es una asercion que da
 * el visto bueno a un control que recibe el foco, se anuncia como no disponible y
 * no hace nada al pulsar Enter. No distingue el caso correcto del caso prohibido,
 * que es la definicion de una asercion que no mide nada.
 * ─────────────────────────────────────────────────────────────────────────────
 */
test.describe('Los dos iconos de redes no atrapan el foco', () => {
  const REDES = ['Instagram, aún no disponible', 'TikTok, aún no disponible'];

  for (const nombre of REDES) {
    test(`${nombre}: disabled nativo, sin aria-disabled, y focus() no le da el foco`, async ({
      page,
    }) => {
      await page.goto('/login');

      const boton = page.getByRole('contentinfo').getByLabel(nombre);

      const atributos = await boton.evaluate((el) => ({
        disabled: el.hasAttribute('disabled'),
        ariaDisabled: el.getAttribute('aria-disabled'),
      }));

      // Las DOS mitades. La primera sola pasaria con `aria-disabled` anadido
      // encima, y ese es justamente el estado que §10.3 regla 2 prohibe.
      expect(atributos.disabled).toBe(true);
      expect(atributos.ariaDisabled).toBeNull();

      // El probe de foco: se le PIDE el foco y se comprueba si lo recibio. Esta es
      // la asercion que de verdad defiende §10.3, porque mide la consecuencia y no
      // el atributo.
      const recibioFoco = await boton.evaluate((el) => {
        (el as HTMLElement).focus();
        return document.activeElement === el;
      });
      expect(recibioFoco).toBe(false);
    });
  }

  test('cuatro Tab desde la contrasena no alcanzan ninguno de los dos', async ({ page }) => {
    await page.goto('/login');

    // Se arranca en `Contraseña` con `exact: true` por una colision MEDIDA: el
    // boton de mostrar/ocultar lleva `aria-label="Mostrar contraseña"` y sin
    // `exact` el localizador casa con dos elementos (strict mode).
    await page.getByLabel('Contraseña', { exact: true }).focus();

    const alcanzados: string[] = [];
    for (let salto = 0; salto < 4; salto += 1) {
      await page.keyboard.press('Tab');
      alcanzados.push(
        await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''),
      );
    }

    // Cuatro saltos alcanzan de sobra el final del documento desde la contrasena:
    // mostrar/ocultar, Entrar, y lo que venga despues. Ninguno puede ser una red.
    for (const nombre of REDES) {
      expect(alcanzados).not.toContain(nombre);
    }
  });
});
