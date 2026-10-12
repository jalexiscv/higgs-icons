# Especificaciones de comportamiento (sala limpia)

Esta carpeta guarda las especificaciones de comportamiento de Word escritas en el
papel de **análisis** del procedimiento de sala limpia de
[CONTRIBUTING.md](../../CONTRIBUTING.md) §"Procedimiento de sala limpia". Son la
única vía por la que lo aprendido analizando Word entra al código: quien
implementa trabaja solo con la especificación revisada, ECMA-376 y la
[especificación de la versión web](../especificacion-web/).

## Reglas

- Una especificación describe **comportamiento**: entradas, resultados y reglas
  observadas, en palabras propias, con documentos de prueba sintéticos.
- **No contiene** código, pseudocódigo, constantes, tablas, nombres internos ni
  estructuras del programa analizado, ni capturas o salidas de herramientas de
  análisis.
- Declara su **método** (observación, comparación de resultados, análisis del
  programa) y su estado de revisión.
- Solo se usa para implementar cuando su estado es **Revisada**, y la revisión la
  hace una persona distinta de quien la escribió.
- Cada especificación nueva se añade a la tabla de abajo.

## Plantilla (`<tema>.md`)

```markdown
# <Comportamiento de Word que se describe>

**Método:** observación | comparación de resultados | análisis del programa
**Versión de Word observada:** <versión>
**Analista:** Nombre Apellido <correo>
**Estado:** Borrador | Revisada por Nombre Apellido <correo> el AAAA-MM-DD

## Comportamiento

Qué hace Word, en términos de documento: entradas y resultados.

## Reglas

Reglas numeradas, cada una verificable con un documento de prueba.

## Casos de prueba

Documentos sintéticos (o su XML mínimo) y el resultado esperado de cada uno.

## Límites

Lo que no se observó o queda dudoso.
```

## Especificaciones

| Especificación | Comportamiento | Estado |
| --- | --- | --- |
| — | Todavía no hay especificaciones | — |
