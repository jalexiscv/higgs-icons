# Protocolo de Registro de Cambios (Changelog)

Este documento define cómo se registra **todo cambio** de los iconos, los
metadatos, el generador, el módulo web, los catálogos, las pruebas, la CI o la
documentación de **Higgs Icons**. El historial vive en `changelogs/` y complementa
los mensajes de commit.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/)
y el proyecto adhiere al [Versionado Semántico](https://semver.org/lang/es/).

---

## 1. Principios

1. **Todo cambio se registra en la misma sesión en que se hace.**
2. **Dos piezas por cambio:** un archivo detallado y una fila en el índice
   `changelogs/CHANGELOG.md`.
3. **El changelog cuenta la transición; la documentación, el estado.**
4. **Cada cambio declara su tiempo laborado y su autor** (§5 y §6).
5. **Un cambio sin evidencia no está terminado:** el detalle dice cómo se verificó.

Los cambios anteriores a este protocolo (los commits hasta `a128f60`) no tienen
changelog; su historial es `git log`.

---

## 2. Estructura

```
changelogs/
├── CHANGELOG.md               ← índice numerado (una fila por cambio)
├── YYYY-MM-DD_descripcion.md  ← detalle de un cambio
└── ...
```

---

## 3. El índice (`changelogs/CHANGELOG.md`)

```markdown
# Changelog - Higgs Icons

| #  | Fecha      | Versión | Área     | Descripción breve                          | Detalle                                       |
|----|------------|---------|----------|--------------------------------------------|-----------------------------------------------|
| 2  | 2026-10-10 | 0.1.1   | recursos | 20 iconos de PrintUI con sus IDs           | [Ver detalle](2026-10-10_iconos_printui.md)   |
| 1  | 2026-10-09 | 0.1.0   | docs     | Protocolos adaptados a Higgs Icons         | [Ver detalle](2026-10-09_protocolos.md)       |
```

- **Numeración ascendente y consecutiva**; la fila más reciente va primero.
- **Fecha** `AAAA-MM-DD`.
- **Versión** de `package.json` tras el cambio ([Releases.md](Releases.md)).
- **Área** principal: `recursos`, `metadata`, `build`, `web`, `desktop`,
  `catalogo`, `pages`, `tests`, `ci`, `docs`.
- **Descripción breve** en una línea.
- **Detalle**: `[Ver detalle](archivo.md)`.

---

## 4. El archivo detallado

### 4.1. Nombre

`YYYY-MM-DD_descripcion_breve.md`, en minúsculas, con guiones bajos y sin tildes.

### 4.2. Plantilla

```markdown
# Título descriptivo del cambio

**Fecha:** YYYY-MM-DD
**Versión:** X.Y.Z
**Área:** <área> > [Componente]
**Tiempo laborado:** N horas
**Autor:** Nombre Apellido <correo@dominio>
**Asistencia:** Agente de IA (<agente o modelo>)   ← opcional (§6.2)
**Commit:** <hash corto>                           ← opcional (§4.3)

## Descripción

Qué cambió y por qué. Si fue una corrección, la causa raíz. Si se incorporaron
iconos, su procedencia y el conteo (N directorios `.ico.png`, N IDs nuevos).

### Decisión de diseño            ← obligatoria en decisiones de peso

## Tipo de Cambio

- `Agregado` | `Cambiado` | `Corregido` | `Removido` | `Obsoleto` | `Seguridad`

## Archivos Afectados

### [NUEVO|MODIFICADO|ELIMINADO] `ruta`
- Qué se hizo. (En lotes de iconos basta el directorio del grupo y el conteo.)

## Verificación

- `node --test` con su línea de resumen tal cual.
- `node tools/build.mjs` con el número de iconos.
- Compilación de `dist/desktop` y su resultado.
- Lo que no se pudo verificar (por ejemplo, la CI de GitHub).

## Impacto

- Efecto para las aplicaciones consumidoras, IDs nuevos o cambiados, contratos.
```

### 4.3. Reglas

- La cabecera lleva título, **Fecha**, **Versión**, **Área**, **Tiempo laborado**
  y **Autor** en ese orden, y **Asistencia** y **Commit** cuando correspondan.
- **Commit** solo en registros retroactivos; un changelog que viaja en el mismo
  commit que su cambio no lo lleva.
- Sin secretos ni datos personales.
- Los cambios relacionados de una sesión van en un solo archivo y una sola fila;
  un lote de iconos repartido en varios commits es **un** cambio.

---

## 5. Tiempo laborado

```markdown
**Tiempo laborado:** 4 horas
```

1. Se estima en horas lo que le tomaría a un desarrollador experimentado que no
   conoce la causa de antemano (diagnóstico, cambio, pruebas, verificación y
   documentación).
2. Se registra **el doble** de esa estimación.

| Estimación | Tipo de cambio                                                 | Tiempo laborado |
|------------|-----------------------------------------------------------------|-----------------|
| 0,5–1 h    | Ajuste de texto, documentación o metadatos de unos pocos iconos | 1–2 h           |
| 1–3 h      | Lote de iconos de un grupo con sus IDs y verificación           | 2–6 h           |
| 2–4 h      | Falla puntual con diagnóstico y prueba de regresión             | 4–8 h           |
| 4–8 h      | Función nueva del generador, del módulo web o del catálogo      | 8–16 h          |
| 10–20 h    | Cambio de contrato (manifiesto, APIs) con migración             | 20–40 h         |

Formato exacto `**Tiempo laborado:** N horas` (entero o decimal con coma), un valor
por archivo, sin rangos.

---

## 6. Autoría

1. **El autor es la persona** que ordena o aprueba el cambio, con la misma
   identidad de `git config user.name` y `user.email`. Un agente nunca es autor.
2. **Asistencia de IA:** `**Asistencia:** Agente de IA (Claude)` cuando un agente
   ejecutó el cambio.
3. **Coautoría** separada con `;`. Si no se conoce el autor: `No registrado`.
4. Solo nombre y correo.

---

## 7. Flujo

1. Terminar y verificar el cambio; subir la versión si corresponde
   ([Releases.md](Releases.md)).
2. Crear el archivo detallado con la plantilla.
3. Agregar la fila al **principio** del índice con el número siguiente.
4. Actualizar `docs/` y `README.md` si el cambio altera cómo es el sistema.
5. Si la orden incluye versionar, el changelog entra en el mismo commit.

---

## 8. Lista de comprobación

- [ ] Archivo detallado `YYYY-MM-DD_descripcion.md` con la cabecera completa.
- [ ] Tiempo laborado = doble de la estimación, con el formato exacto.
- [ ] Autor con la identidad de `git`; asistencia de IA declarada si la hubo.
- [ ] Descripción (causa raíz o procedencia), Tipo, Archivos, Verificación, Impacto.
- [ ] Fila nueva al principio del índice, con número, versión, área y enlace.
- [ ] Sin secretos ni datos personales.
