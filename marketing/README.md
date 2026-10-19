# Publicidad automática de Al Toque

Un video vertical por día para Instagram, Facebook y TikTok, escrito por IA (gratis, con NVIDIA), renderizado con la marca Al Toque
y publicado solo después de que lo apruebes desde Telegram.

```
06:00  n8n elige el pilar del día ─► la IA escribe guion y textos ─► el renderizador arma el MP4 (voz + subtítulos)
       ─► te llega a Telegram con 3 botones: ✅ Publicar · 🔄 Rehacer · 🗑 Descartar
       ─► ✅ publica el Reel en Instagram y el video en Facebook y te avisa
```

| Archivo | Qué es |
|---|---|
| `guionista.md` | Instrucciones de la IA: voz de marca, pilares, reglas SUNAT permitidas, datos reales (precios, prueba gratis). |
| `marca.json` | Colores, logo y textos de cierre que usa el video. |
| `build_workflow.py` | Genera el flujo de n8n. Cambias el guionista o la marca → `python marketing/build_workflow.py`. |
| `n8n-video-diario.json` | El flujo listo para importar en n8n. |
| `ejemplo-video.json` | Un guion de ejemplo para probar el renderizador. |

## Aprende de lo que funciona

Cada mañana, antes de escribir, el flujo mide en Instagram los videos publicados hace entre 2 y 90 días
(alcance, me gusta, comentarios, compartidos, guardados y vistas) y les da un puntaje:

```
puntaje = (me gusta + 2 × comentarios + 3 × compartidos + 3 × guardados) ÷ alcance × 1000
```

Compartir y guardar pesan más porque son la señal de que el video le sirvió a alguien. Los videos con menos de 30 de alcance no cuentan.

- La IA recibe los **5 mejores** (gancho, puntos, pilar) como referencia de tono y ritmo, y los **2 peores** para evitar ese enfoque.
- Si un pilar rinde más que los demás, se le sugiere usar su energía en el tema del día.
- **Cada lunes** te llega a Telegram el ranking: los 3 mejores videos y el promedio por pilar.
- Necesita la credencial de Meta (la misma que publica). Mientras no haya videos medidos, el flujo funciona igual que antes.

Lo medido vive en los datos del flujo en n8n (`published` y `aprendizaje`); no hace falta base de datos aparte.

## Pilares (uno por día)

| Día | Pilar | De qué habla |
|---|---|---|
| Lunes | cuaderno | Lo que cuesta llevar todo a mano. |
| Martes | sunat_facil | Una regla SUNAT en simple (boleta con DNI desde S/ 700, 7 días para anular, detracciones…). |
| Miércoles | truco | Una función: Yape/Plin en caja, boleta por WhatsApp, stock solo, DNI que se completa. |
| Jueves | rubro | El problema contado para bodega, ferretería, botica, restaurante… |
| Viernes | antes_despues | Tres pasos a mano contra un toque. |
| Sábado | contador | Para estudios contables: todos sus clientes en una cuenta. |
| Domingo | cuaderno | Otra vuelta al dolor principal. |

La IA no puede inventar testimonios, clientes, cifras ni normas: el guionista solo le permite usar datos reales.

## Ponerlo en marcha (una sola vez)

El flujo ya está importado en n8n (apagado) con la IA de NVIDIA. Faltan 3 credenciales; los nodos las buscan por nombre.

### 1. IA gratis de NVIDIA → credencial «Clave de IA»
1. Crea tu cuenta en **build.nvidia.com** (NVIDIA Developer Program, gratis) y genera una API key (`nvapi-…`).
2. En n8n: **Credentials › Add › Header Auth**, nombre **Clave de IA**, Name `Authorization`, Value `Bearer nvapi-…`.

Usa `nvidia/nemotron-3-super-120b-a12b` en las GPUs de NVIDIA, sin costo y sin cargar el servidor. El nivel gratis
es para prototipos (unas 40 peticiones por minuto; el flujo hace 1 o 2 al día). Si algún día se acaba, en *Configuración*
cambia `aiProvider` a `'gemini'` y la credencial a `x-goog-api-key` con una clave gratis de Google AI Studio.

> ¿Modelo local? El servidor tiene 1 núcleo y ~1,6 GB libres, sin GPU: un modelo de 4B no cabe y uno de 1B escribe mal
> en español y frenaría a los demás sistemas. Si algún día hay un VPS con 8 GB libres, `aiProvider: 'nvidia'` funciona
> también contra Ollama (cambia la URL a `http://ollama:11434/v1/chat/completions`), porque usa el mismo formato.

### 2. Renderizador → credencial «Renderizador M&A»
Header Auth, Name `Authorization`, Value `Bearer <RENDER_TOKEN>` (Dokploy › ma-company-contenido › ma-renderer › Environment).

### 3. Facebook e Instagram → credencial «Meta Al Toque (token de página)»
1. Crea la **página de Facebook** de Al Toque y una cuenta de **Instagram profesional** (Empresa o Creador).
   En Instagram › Configuración › Centro de cuentas, vincúlala a la página.
2. En **developers.facebook.com** › Mis apps › Crear app › tipo **Empresa**. Agrega el producto
   **Instagram › API con inicio de sesión de Facebook**. Copia el *App ID* y la *App Secret* (Configuración › Básica).
   La app puede quedarse en modo desarrollo: como eres administrador, publica en tus propias cuentas sin revisión de Meta.
3. Abre el **Explorador de la API Graph**, elige tu app, *Obtener token de acceso de usuario* y marca:
   `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`,
   `instagram_content_publish`, `instagram_manage_insights` (y `business_management` si la página está en un portfolio comercial).
   Al aceptar, elige la página y el Instagram de Al Toque.
4. Pega App ID, App Secret y el token en `Desktop\claves-al-toque.txt` y ejecuta en **tu** PowerShell:
   ```
   python marketing\conectar_meta.py "$env:USERPROFILE\Desktop\claves-al-toque.txt"
   ```
   Muestra el id de la página y del Instagram, y deja en el portapapeles un token de página **que no vence**.
5. En n8n: **Query Auth**, nombre **Meta Al Toque (token de página)**, Name `access_token`, Value: Ctrl+V.
6. Pon los dos ids en el nodo **Configuración** (`instagramUserId`, `facebookPageId`) y borra el archivo de claves.

### 4. Probar
Abre cada nodo en rojo y elige su credencial si n8n no la tomó sola. Toca **Probar ahora**: en ~8 minutos te llega
el video a Telegram. Si te gusta, **✅ Publicar** y activa el flujo.

TikTok y LinkedIn quedan como nodos desactivados hasta que esas redes aprueben la app (igual que en M&A).

## Canales que no son videos (del estudio de mercado)

- **Google Maps**: busca «ferretería», «botica», «bodega» + distrito; escribe por WhatsApp a los que no tienen sistema.
- **Contadores**: son el aliado con más alcance. Ofréceles el acceso multi-RUC y una comisión por referido.
- **Grupos de Facebook de bodegueros y emprendedores**: contenido útil (cómo emitir boleta, qué es la detracción), nada de spam.
- **WhatsApp Business**: catálogo con los 3 planes, respuestas rápidas y estados con los videos de la semana.
- **Meta Ads**: campaña «mensajes a WhatsApp», S/ 10–15 al día por zona, con el video que mejor funcione en orgánico.
