# Estrategia de Documentación

Este documento define cómo se mantiene la documentación de **Higgs Icons** para
desarrolladores y agentes de IA.

## 1. Principios

* **Modularidad:** un archivo por tema.
* **Veracidad:** la documentación refleja el código; si el código cambia, la
  documentación se actualiza en el mismo cambio.
* **Ubicación:** `README.md` es la portada del repositorio en GitHub y lo primero
  que leen los equipos de las aplicaciones consumidoras: resume el uso y enlaza a
  las guías de uso de `docs/` (`obtener-desde-github.md`, `uso-web.md`,
  `uso-escritorio.md`, `manifiesto.md`). El mantenimiento, el funcionamiento
  interno y las reglas del proyecto también viven en `docs/`.
* **Guías de uso ejecutables:** todo fragmento de las guías de uso (CMake,
  scripts, JavaScript, C++) debe funcionar copiado tal cual con la versión
  actual; si un cambio de la API, del manifiesto o del generador lo afecta, la
  guía se actualiza en el mismo cambio. La raíz solo tiene `README.md`, `RIGHTS-AND-PUBLISHING.md` y
  `CLAUDE.md` además del código.
* **Trazabilidad:** la documentación describe *cómo es* el sistema; el historial
  vive en `changelogs/` ([Changelogs.md](Changelogs.md)).
* **Idioma:** documentación y commits en español; código, comentarios y mensajes
  de error del código en inglés.

## 2. Estructura

```
Higgs Icons/
├── README.md                    <-- Uso de la biblioteca + índice "Documentación"
├── RIGHTS-AND-PUBLISHING.md     <-- Procedencia, derechos y publicación
├── CLAUDE.md                    <-- Reglas para la IA (importa los protocolos)
├── docs/
│   ├── obtener-desde-github.md  <-- Cómo incorporar la biblioteca a un proyecto
│   ├── uso-web.md               <-- API JavaScript y recetas
│   ├── uso-escritorio.md        <-- API C++, CMake, JUCE y distribución
│   ├── manifiesto.md            <-- Formato de manifest.json
│   ├── mantenimiento.md         <-- Añadir iconos, curar metadatos, publicar versiones
│   ├── arquitectura.md          <-- Inventario, IDs, generador, salidas, contratos
│   ├── estilo-de-codigo.md      <-- Estilo de JS, C++ generado, datos, pruebas, commits
│   ├── <tema>.md                <-- Documentos nuevos por tema
│   └── protocols/
│       ├── Documentations.md    <-- Este archivo
│       ├── Changelogs.md
│       ├── Releases.md
│       └── Fable/               <-- Protocolos de trabajo de los agentes de IA
└── changelogs/                  <-- Historial de cambios
```

> El índice maestro es la sección **"Documentación"** del `README.md`. Un archivo
> de `docs/` que no esté enlazado desde allí es un archivo huérfano.

## 3. Flujo para documentar

1. **Identificar el documento:** el uso público va a las guías de uso de `docs/`
   (con su resumen en el `README.md`); el mantenimiento, a `docs/mantenimiento.md`;
   los contratos y el flujo interno, a `docs/arquitectura.md`; las convenciones, a
   `docs/estilo-de-codigo.md`. Un tema nuevo se crea como `docs/<tema>.md`, en
   minúsculas, con guiones y sin tildes.
2. **Estructura mínima:** título, descripción, detalle técnico (archivos,
   funciones, claves del manifiesto o de los metadatos), flujos y límites
   conocidos.
3. **Actualizar el índice** del `README.md` si se crea un archivo.
4. **Referencias cruzadas:** enlazar a la fuente de verdad en vez de duplicar.

## 4. Convenciones

* Markdown de GitHub, bloques con lenguaje (```js, ```cpp, ```cmake, ```json,
  ```powershell).
* Rutas relativas en los enlaces.
* Los ejemplos de uso del `README.md` deben funcionar tal cual con la versión
  actual de `dist/`.
