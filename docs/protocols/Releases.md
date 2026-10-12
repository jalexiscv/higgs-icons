# Protocolo de Versiones

Este documento define cómo se numera cada versión de **Higgs Icons**. Lo siguen
por igual los desarrolladores y los agentes de IA. Su regla central: **todo
cambio que altera lo que reciben las aplicaciones sube la versión**, y la versión
nueva solo se da por buena con la verificación completa en verde.

---

## 1. Principios

1. **Una sola fuente de verdad.** La versión vive únicamente en `"version"` de
   [package.json](../../package.json). El generador la copia a
   `libraryVersion` de `dist/web/manifest.json`. No se escribe a mano en ningún
   otro archivo.
2. **Qué sube la versión:** todo cambio entregado que altera las salidas o su
   uso: iconos añadidos o quitados, `metadata/ids.json`, `metadata/overrides.json`,
   `tools/build.mjs`, `packages/web/index.js` o `catalog/`. Los cambios que solo
   tocan documentación, protocolos, changelogs, pruebas o la CI **no** suben la
   versión (en su changelog la versión es la vigente).
3. **Gradual:** cada versión incrementa el parche (`0.1.0` → `0.1.1` → `0.1.2`);
   nunca se repite, se salta ni baja.
4. **Una versión fallida no consume número:** si la verificación falla, se
   restaura `package.json` y el siguiente intento usa el mismo número.
5. **Trazable:** el número aparece en el changelog del cambio.

---

## 2. Esquema de numeración

[Versionado Semántico](https://semver.org/lang/es/) `MAYOR.MENOR.PARCHE`:

| Número   | Cuándo sube                                                         | Quién lo decide |
|----------|----------------------------------------------------------------------|-----------------|
| `PARCHE` | Cada cambio que altera las salidas sin romper contratos              | Automático (§3) |
| `MENOR`  | Un conjunto de funciones nuevas (campo nuevo del manifiesto, función nueva de la API) | El autor |
| `MAYOR`  | Cambios rompientes: IDs renombrados o quitados, manifiesto o APIs incompatibles | El autor |

Mientras la versión sea `0.x`, un cambio rompiente sube `MENOR` por decisión del
autor. Los saltos de `MENOR` y `MAYOR` los propone el agente con una
recomendación ([Fable/Decisions.md](Fable/Decisions.md) §4), nunca los toma solo.

---

## 3. Cómo se produce una versión

```powershell
npm version patch --no-git-tag-version   # 0.1.0 -> 0.1.1 en package.json
npm run check                            # node --test && node tools/build.mjs
# y la compilación de dist/desktop indicada en CLAUDE.md
```

1. Terminar y verificar el cambio con la versión actual
   ([Fable/Execution.md](Fable/Execution.md) fase 5).
2. Subir el parche con `npm version patch --no-git-tag-version` (o
   `npm version <x.y.z> --no-git-tag-version` si el autor decidió otro número).
3. Repetir `npm run check` y la compilación C++; comprobar que
   `dist/web/manifest.json` informa la versión nueva en `libraryVersion`.
4. Si algo falla, restaurar `package.json` (`git checkout -- package.json` si no
   tenía otros cambios) y volver a la fase 4.
5. Registrar la versión en el changelog (`**Versión:**` y columna del índice).
6. **Versionar solo si la orden lo incluye:** el commit lleva `package.json` y el
   changelog; la etiqueta es `vX.Y.Z` (`git tag -a vX.Y.Z -m "Higgs Icons X.Y.Z"`).

Varios cambios relacionados de una misma orden salen en **una sola** versión.

---

## 4. Lo que no se hace

- **No se publica** en ningún sitio (npm, GitHub Releases, Pages): `dist/` está
  fuera de Git. Publicar es decisión del autor
  ([RIGHTS-AND-PUBLISHING.md](../../RIGHTS-AND-PUBLISHING.md)).
- No se edita la versión a mano ni se sube `MENOR`/`MAYOR` por iniciativa propia.

---

## 5. Anti-patrones Prohibidos

| Anti-patrón                                                  | Conducta correcta                                |
|--------------------------------------------------------------|---------------------------------------------------|
| Entregar un cambio de las salidas sin subir la versión       | Parche nuevo (§1.2)                               |
| Subir la versión por un cambio solo de documentación         | La versión no cambia (§1.2)                       |
| Editar `package.json` a mano para la versión                 | `npm version … --no-git-tag-version` (§3)         |
| Dejar la versión subida tras una verificación fallida        | Restaurar; un fallo no consume número (§1.4)      |
| Subir `MENOR` o `MAYOR` por iniciativa propia                | Proponerlo al autor (§2)                          |
| Publicar `dist/` sin orden                                   | Decide el autor (§4)                              |
