# Hallazgos fuera de alcance — fase 05

Cosas encontradas mientras se ejecutaba un plan que NO las cubría. No se
arreglaron a propósito (regla de frontera de alcance del ejecutor); quedan acá
para que un plan futuro las recoja.

## 1. Comentario desactualizado en `SheetConfirmar.tsx` (encontrado en 05-15)

`app/(admin)/operacion/_components/SheetConfirmar.tsx`, bloque
`LA TANDA SE CONGELA AL ABRIR`: dice *"`confirmarAseo` llama a
`revalidatePath('/operacion')`"*. Eso dejó de ser cierto en el plan 04-14, que
quitó `revalidatePath` de las nueve actions por el bug medido que cuelga el
navegador. La MISMA frase está en `DialogoReasignar.tsx`
(`alCambiarApertura`) y, según el propio bloque de cabecera de `_actions.ts`,
en `MenuAseo` y en los cinco diálogos.

- **Por qué no se tocó en 05-15:** es preexistente, lo introdujo otra fase y no
  lo causó ningún cambio de este plan. Arreglarlo bien es reescribir la misma
  frase en siete sitios, que es un cambio propio y no una nota al margen de un
  plan de UI.
- **Impacto:** cero en runtime. Es un comentario que miente sobre por qué existe
  el `router.refresh()` de al lado, y el riesgo real es que alguien lea "ya se
  revalida" y quite el refresco del cliente, que es lo único que refresca.
