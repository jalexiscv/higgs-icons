# Derechos y publicación

**Estado: pendiente de revisión antes de hacer público el repositorio o distribuir `dist/`.**

El árbol de recursos conserva las rutas heredadas de las aplicaciones de las que proceden. La presencia local de esos archivos no demuestra que se puedan redistribuir públicamente. Antes de subirlos a GitHub o incluirlos en paquetes descargables:

- Confirmar quién creó cada grupo de iconos y documentar su procedencia.
- Verificar permisos/licencias de los recursos que provienen de terceros.
- Separar o reemplazar cualquier grupo cuya redistribución no esté autorizada.
- Elegir y añadir una licencia para el código y los metadatos propios.
- Definir por separado los términos de distribución de los archivos de imagen.
- Revisar que los artefactos generados no incluyan rutas absolutas ni recursos excluidos.

Hasta completar la revisión, no inicializar ni publicar un repositorio público. `dist/` está excluido de Git, pero eso no excluye las carpetas fuente `Apps/`, `Common/` y `Engines/`.