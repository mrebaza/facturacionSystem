"""Genera marketing/n8n-video-diario.json: el flujo de n8n que escribe, renderiza, aprueba y publica el video diario de Al Toque.

Uso: python marketing/build_workflow.py
Reutiliza el renderizador de videos (Remotion + voz neural) ya desplegado; la marca Al Toque viaja en cada pedido.
Los IDs de credenciales se completan al importar (scripts/deploy) o a mano en n8n.
"""
import json
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SYSTEM_PROMPT = (ROOT / 'guionista.md').read_text(encoding='utf-8')
BRAND = json.loads((ROOT / 'marca.json').read_text(encoding='utf-8'))
GRAPH = 'https://graph.facebook.com/v23.0'

# ---------------------------------------------------------------- Esquema de salida de Claude
SCENE = {
    'type': 'object',
    'properties': {
        'type': {'type': 'string', 'enum': ['hook', 'point', 'cta']},
        'text': {'type': 'string'},
        'highlight': {'type': 'array', 'items': {'type': 'string'}},
        'index': {'type': 'integer'},
        'title': {'type': 'string'},
        'narration': {'type': 'string'},
    },
    'required': ['type', 'text', 'narration'],
    'additionalProperties': False,
}
SCHEMA = {
    'type': 'object',
    'properties': {
        'pillar': {'type': 'string', 'enum': ['cuaderno', 'sunat_facil', 'antes_despues', 'truco', 'rubro', 'contador']},
        'topic': {'type': 'string'},
        'title': {'type': 'string'},
        'scenes': {'type': 'array', 'items': SCENE},
        'captions': {
            'type': 'object',
            'properties': {k: {'type': 'string'} for k in ('instagram', 'facebook', 'tiktok', 'linkedin')},
            'required': ['instagram', 'facebook', 'tiktok', 'linkedin'],
            'additionalProperties': False,
        },
    },
    'required': ['pillar', 'topic', 'title', 'scenes', 'captions'],
    'additionalProperties': False,
}

# ---------------------------------------------------------------- Código de los nodos
CONFIG_JS = r"""// ⚙️ CONFIGURACIÓN: cambia aquí los datos de tu cuenta.
const config = {
  telegramChatId: '8534772721',
  // Mismo renderizador de videos que ya tienes desplegado; la marca Al Toque va en cada pedido.
  rendererUrl: 'https://ma-renderer.vercel.app',
  // 'nvidia' = gratis (modelos Nemotron en build.nvidia.com) · 'gemini' = gratis (Google AI Studio)
  // · 'claude' = de pago, mejor redacción. Con 1 o 2 pedidos al día, los dos gratis alcanzan de sobra.
  aiProvider: 'nvidia',
  nvidiaModel: 'nvidia/nemotron-3-super-120b-a12b',
  geminiModel: 'gemini-flash-latest',
  claudeModel: 'claude-opus-5-5',
  instagramUserId: 'PON_AQUI_EL_ID_DE_INSTAGRAM_DE_AL_TOQUE',
  facebookPageId: 'PON_AQUI_EL_ID_DE_LA_PAGINA_DE_AL_TOQUE',
  brand: __BRAND__,
  voice: 'es-PE-CamilaNeural',
  voiceRate: '+8%',
};
return $input.all().map((item) => ({ json: { config, event: item.json } }));
"""

MEDIBLES_JS = r"""// Videos publicados en Instagram que ya tienen datos (más de 2 días y menos de 90).
const store = $getWorkflowStaticData('global');
const config = $input.first().json.config;
const ahora = Date.now();
const medibles = (store.published ?? [])
  .filter((v) => ahora - v.at > 2 * 86400000 && ahora - v.at < 90 * 86400000)
  .slice(-30);
if (!medibles.length) return [{ json: { config, sinDatos: true } }];
return medibles.map((v) => ({ json: { config, mediaId: v.mediaId } }));
"""

APRENDER_JS = r"""// Puntúa cada video con sus métricas de Instagram y guarda los mejores y los peores para el guionista.
const store = $getWorkflowStaticData('global');
const config = $('Videos para medir').first().json.config;
const pedidos = $('Videos para medir').all();
const respuestas = $input.all();
const publicados = store.published ?? [];
const medidos = [];
if (!pedidos[0].json.sinDatos) {
  respuestas.forEach((r, i) => {
    const mediaId = pedidos[i]?.json.mediaId;
    const datos = r.json?.data;
    if (!mediaId || !Array.isArray(datos)) return; // la métrica falló: se ignora ese video
    const m = Object.fromEntries(datos.map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? 0]));
    const video = publicados.find((v) => v.mediaId === mediaId);
    if (!video) return;
    video.metricas = m;
    const alcance = Math.max(m.reach ?? 0, 1);
    // Compartir y guardar pesan más: es lo que mejor predice que el video vende.
    const interacciones = (m.likes ?? 0) + 2 * (m.comments ?? 0) + 3 * (m.shares ?? 0) + 3 * (m.saved ?? 0);
    video.puntaje = alcance >= 30 ? Math.round((interacciones / alcance) * 1000) : null;
    if (video.puntaje !== null) medidos.push(video);
  });
}
medidos.sort((a, b) => b.puntaje - a.puntaje);
const resumen = (v) => ({ pillar: v.pillar, topic: v.topic, hook: v.hook, puntos: v.puntos, puntaje: v.puntaje,
  alcance: v.metricas.reach, vistas: v.metricas.views, compartidos: v.metricas.shares, guardados: v.metricas.saved });
if (medidos.length) {
  store.aprendizaje = {
    actualizado: new Date().toISOString(),
    mejores: medidos.slice(0, 5).map(resumen),
    peores: medidos.length >= 6 ? medidos.slice(-2).map(resumen) : [],
    porPilar: Object.entries(medidos.reduce((acc, v) => {
      (acc[v.pillar] ??= []).push(v.puntaje);
      return acc;
    }, {})).map(([pilar, ps]) => ({ pilar, promedio: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length), videos: ps.length }))
      .sort((a, b) => b.promedio - a.promedio),
  };
}
const lunes = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay() === 1;
const a = store.aprendizaje;
const reporte = a ? [
  '<b>📈 Lo que mejor le funcionó a Al Toque</b>',
  ...a.mejores.slice(0, 3).map((v, i) => `${i + 1}. «${v.hook}» · ${v.pillar} · ${v.puntaje} pts · ${v.alcance ?? 0} de alcance`),
  '',
  '<b>Por pilar</b>',
  ...a.porPilar.map((p) => `${p.pilar}: ${p.promedio} pts (${p.videos} videos)`),
].join('\n') : null;
return [{ json: { config, enviarReporte: lunes && !!reporte, reporte } }];
"""

RECORDAR_JS = r"""// Guarda el video publicado para medirlo en los próximos días.
const script = $('Leer decisión').first().json.item.script;
const store = $getWorkflowStaticData('global');
const hook = script.scenes.find((s) => s.type === 'hook')?.text ?? '';
const puntos = script.scenes.filter((s) => s.type === 'point').map((s) => s.text);
store.published = [...(store.published ?? []), {
  mediaId: $input.first().json.id, at: Date.now(), pillar: script.pillar, topic: script.topic, title: script.title, hook, puntos,
}].slice(-120);
return $input.all();
"""

PREPARE_JS = r"""// Arma el pedido a la IA: pilar del día, temas recientes (para no repetir) y, si vienes de "Rehacer", qué evitar.
const SYSTEM = __SYSTEM__;
const SCHEMA = __SCHEMA__;
// lunes a domingo
const PILLARS = ['cuaderno', 'sunat_facil', 'truco', 'rubro', 'antes_despues', 'contador', 'cuaderno'];
const store = $getWorkflowStaticData('global');
const recentTopics = (store.recentTopics ?? []).slice(-30);
const input = $input.first().json;
const config = input.config;
const today = new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const weekday = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Lima' })).getDay(); // 0 = domingo
const pillar = PILLARS[(weekday + 6) % 7];

let request = `Hoy es ${today}. Escribe el video de hoy con el pilar "${pillar}".\n\nTemas recientes que NO debes repetir:\n${recentTopics.map((t) => '- ' + t).join('\n') || '- (ninguno todavía)'}`;
const aprendizaje = store.aprendizaje;
if (aprendizaje?.mejores?.length) {
  const linea = (v) => `- [${v.pillar}] gancho «${v.hook}» · puntos: ${(v.puntos ?? []).join(' / ')} · puntaje ${v.puntaje}`;
  request += `\n\nLo que MEJOR le funcionó a Al Toque en Instagram (aprende del tipo de gancho, el ritmo y el ángulo; no los copies):\n${aprendizaje.mejores.map(linea).join('\n')}`;
  if (aprendizaje.peores?.length) {
    request += `\n\nLo que PEOR funcionó (evita ese enfoque):\n${aprendizaje.peores.map(linea).join('\n')}`;
  }
  const mejorPilar = aprendizaje.porPilar?.[0];
  if (mejorPilar && mejorPilar.pilar !== pillar) {
    request += `\n\nEl pilar con mejor respuesta es "${mejorPilar.pilar}". Si encaja, usa su energía en el pilar de hoy.`;
  }
}
if (input.redo) {
  request += `\n\nEl equipo rechazó la propuesta anterior ("${input.redo.topic}"). Propón un tema y un gancho claramente distintos.`;
}

// Gemini no acepta additionalProperties en el esquema: se quita solo para él.
const withoutExtras = (schema) => JSON.parse(JSON.stringify(schema, (key, value) => (key === 'additionalProperties' ? undefined : value)));
const claude = {
  url: 'https://api.anthropic.com/v1/messages',
  version: '2023-06-01',
  beta: 'server-side-fallback-2026-07-01',
  body: {
    model: config.claudeModel,
    max_tokens: 16000,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    fallbacks: 'default',
    system: SYSTEM,
    messages: [{ role: 'user', content: request }],
  },
};
const gemini = {
  url: `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`,
  version: '',
  beta: '',
  body: {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: request }] }],
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: withoutExtras(SCHEMA), temperature: 0.9 },
  },
};
// NVIDIA usa el formato de OpenAI: el esquema va dentro de las instrucciones y la respuesta se valida al leerla.
const nvidia = {
  url: 'https://integrate.api.nvidia.com/v1/chat/completions',
  version: '',
  beta: '',
  body: {
    model: config.nvidiaModel,
    messages: [
      { role: 'system', content: `${SYSTEM}

El JSON debe cumplir este esquema:
${JSON.stringify(SCHEMA)}` },
      { role: 'user', content: request },
    ],
    temperature: 0.8,
    max_tokens: 8192,
    chat_template_kwargs: { enable_thinking: false },
  },
};
const requests = { claude, gemini, nvidia };
return [{ json: { config, request: requests[config.aiProvider] ?? gemini } }];
"""

READ_SCRIPT_JS = r"""// Lee el JSON que devolvió la IA (NVIDIA, Gemini o Claude) y recuerda el tema para no repetirlo.
const response = $input.first().json;
const config = $('Preparar pedido a la IA').first().json.config;
let text;
if (config.aiProvider === 'claude') {
  if (response.stop_reason === 'refusal') throw new Error('Claude rechazó el pedido: ' + JSON.stringify(response.stop_details));
  if (response.stop_reason === 'max_tokens') throw new Error('La respuesta de Claude se cortó (max_tokens).');
  text = (response.content ?? []).find((block) => block.type === 'text')?.text;
} else if (config.aiProvider === 'nvidia') {
  const choice = response.choices?.[0];
  if (!choice) throw new Error('NVIDIA no devolvió respuesta: ' + JSON.stringify(response).slice(0, 300));
  if (choice.finish_reason === 'length') throw new Error('La respuesta de NVIDIA se cortó (max_tokens).');
  text = choice.message?.content ?? '';
} else {
  const candidate = response.candidates?.[0];
  if (!candidate) throw new Error('Gemini no devolvió respuesta: ' + JSON.stringify(response.promptFeedback ?? response).slice(0, 300));
  if (candidate.finishReason && candidate.finishReason !== 'STOP') throw new Error('Gemini terminó con ' + candidate.finishReason);
  text = (candidate.content?.parts ?? []).map((part) => part.text ?? '').join('');
}
// Algunos modelos envuelven el JSON en ```json … ``` o dejan su razonamiento antes: se toma solo el objeto.
const json = String(text ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
const script = JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1));
if (!Array.isArray(script.scenes) || script.scenes.length < 3) throw new Error('El guion no tiene escenas suficientes.');
if (!script.captions?.instagram || !script.scenes.some((scene) => scene.type === 'cta')) throw new Error('Al guion le faltan los textos o el cierre.');
const store = $getWorkflowStaticData('global');
store.recentTopics = [...(store.recentTopics ?? []), script.topic].slice(-30);
return [{ json: { config, script } }];
"""

SAVE_PENDING_JS = r"""// Guarda el video pendiente de aprobación; los botones de Telegram solo llevan su id.
const job = $input.first().json;
const { config, script } = $('Leer guion').first().json;
const store = $getWorkflowStaticData('global');
store.pending = store.pending ?? {};
store.pending[job.id] = { url: job.url, script, createdAt: Date.now() };
// Se olvidan los pendientes de más de 7 días.
for (const [key, value] of Object.entries(store.pending)) {
  if (Date.now() - value.createdAt > 7 * 86400000) delete store.pending[key];
}
const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const caption = `<b>${escape(script.title)}</b>\nPilar: ${escape(script.pillar)} · ${Math.round(job.durationSeconds)} s\n\n<b>Instagram/Facebook:</b>\n${escape(script.captions.instagram)}`.slice(0, 1000);
return [{ json: { config, id: job.id, url: job.url, caption } }];
"""

DECISION_JS = r"""// Interpreta el botón que tocaste en Telegram.
const { config, event } = $input.first().json;
const query = event.callback_query;
const [action, id] = String(query.data ?? '').split(':');
const fromChat = String(query.message?.chat?.id ?? '');
const store = $getWorkflowStaticData('global');
const item = store.pending?.[id];
let result = action;
if (fromChat !== String(config.telegramChatId)) result = 'ignorar';
else if (!item) result = 'expirado';
else if (action !== 'redo') delete store.pending[id];
return [{ json: { config, action: result, id, item, queryId: query.id, redo: item ? { topic: item.script.topic } : null } }];
"""

# ---------------------------------------------------------------- Ayudas para crear nodos
nodes, connections = [], {}


def node(name, type_, version, params, pos, **extra):
    nodes.append({'id': str(uuid.uuid4()), 'name': name, 'type': type_, 'typeVersion': version,
                  'position': pos, 'parameters': params, **extra})
    return name


def link(src, dst, out=0, inp=0):
    outputs = connections.setdefault(src, {'main': []})['main']
    while len(outputs) <= out:
        outputs.append([])
    outputs[out].append({'node': dst, 'type': 'main', 'index': inp})


def code(name, js, pos):
    return node(name, 'n8n-nodes-base.code', 2, {'jsCode': js}, pos)


def condition(left, right, op='equals', type_='string'):
    return {'id': str(uuid.uuid4()), 'leftValue': left, 'rightValue': right, 'operator': {'type': type_, 'operation': op}}


def if_node(name, left, right, pos, op='equals'):
    return node(name, 'n8n-nodes-base.if', 2.2, {
        'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose', 'version': 2},
                       'conditions': [condition(left, right, op)], 'combinator': 'and'},
        'options': {}}, pos)


def http(name, method, url, pos, cred=None, query=None, body=None, timeout=60000, headers=None, **extra):
    params = {'method': method, 'url': url, 'options': {'timeout': timeout}}
    creds = {}
    if cred:
        kind, cred_name = cred
        params.update({'authentication': 'genericCredentialType', 'genericAuthType': kind})
        creds = {'credentials': {kind: {'id': '', 'name': cred_name}}}
    if headers:
        params.update({'sendHeaders': True, 'headerParameters': {'parameters': [{'name': k, 'value': v} for k, v in headers.items()]}})
    if query:
        params.update({'sendQuery': True, 'queryParameters': {'parameters': [{'name': k, 'value': v} for k, v in query.items()]}})
    if body is not None:
        params.update({'sendBody': True, 'specifyBody': 'json', 'jsonBody': body})
    return node(name, 'n8n-nodes-base.httpRequest', 4.2, params, pos, **creds, **extra)


def wait(name, amount, unit, pos):
    return node(name, 'n8n-nodes-base.wait', 1.1, {'amount': amount, 'unit': unit}, pos, webhookId=str(uuid.uuid4()))


TELEGRAM = {'credentials': {'telegramApi': {'id': '', 'name': 'Telegram Al Toque'}}}


def telegram_message(name, text, pos, chat='={{ $json.config.telegramChatId }}'):
    return node(name, 'n8n-nodes-base.telegram', 1.2, {
        'chatId': chat, 'text': text, 'additionalFields': {'appendAttribution': False, 'parse_mode': 'HTML'}}, pos, **TELEGRAM)


RENDERER = ('httpHeaderAuth', 'Renderizador M&A')
AI_KEY = ('httpHeaderAuth', 'Clave de IA')
META = ('httpQueryAuth', 'Meta Al Toque (token de página)')

# ---------------------------------------------------------------- Entradas
node('Cada día 6:00', 'n8n-nodes-base.scheduleTrigger', 1.2,
     {'rule': {'interval': [{'field': 'days', 'triggerAtHour': 6}]}}, [0, 0])
node('Probar ahora', 'n8n-nodes-base.manualTrigger', 1, {}, [0, 180])
node('Botón de Telegram', 'n8n-nodes-base.telegramTrigger', 1.2,
     {'updates': ['callback_query'], 'additionalFields': {}}, [0, 520], webhookId=str(uuid.uuid4()), **TELEGRAM)
code('Configuración', CONFIG_JS.replace('__BRAND__', json.dumps(BRAND, ensure_ascii=False)), [220, 260])
for trigger in ('Cada día 6:00', 'Probar ahora', 'Botón de Telegram'):
    link(trigger, 'Configuración')
if_node('¿Es un botón?', '={{ !!$json.event.callback_query }}', 'true', [440, 260])
link('Configuración', '¿Es un botón?')

# ---------------------------------------------------------------- Generación
prepare = PREPARE_JS.replace('__SYSTEM__', json.dumps(SYSTEM_PROMPT, ensure_ascii=False)).replace('__SCHEMA__', json.dumps(SCHEMA, ensure_ascii=False))
node('Preparar pedido a la IA', 'n8n-nodes-base.code', 2, {'jsCode': prepare}, [680, 100], executeOnce=True)
code('Videos para medir', MEDIBLES_JS, [560, -140])
link('¿Es un botón?', 'Videos para medir', out=1)
if_node('¿Hay videos que medir?', '={{ !$json.sinDatos }}', 'true', [760, -140])
link('Videos para medir', '¿Hay videos que medir?')
http('Instagram: métricas', 'GET', f"={GRAPH}/{{{{ $json.mediaId }}}}/insights", [960, -240], cred=META,
     query={'metric': 'reach,likes,comments,shares,saved,views'}, onError='continueRegularOutput')
link('¿Hay videos que medir?', 'Instagram: métricas', out=0)
code('Aprender de los resultados', APRENDER_JS, [1160, -140])
link('Instagram: métricas', 'Aprender de los resultados')
link('¿Hay videos que medir?', 'Aprender de los resultados', out=1)
link('Aprender de los resultados', 'Preparar pedido a la IA')
if_node('¿Es lunes?', '={{ $json.enviarReporte }}', 'true', [1360, -260])
link('Aprender de los resultados', '¿Es lunes?')
telegram_message('Reporte semanal', '={{ $json.reporte }}', [1560, -260])
link('¿Es lunes?', 'Reporte semanal', out=0)
# La credencial «Clave de IA» lleva la cabecera de la clave: Authorization: Bearer nvapi-… (NVIDIA),
# x-goog-api-key (Gemini) o x-api-key (Claude).
http('La IA escribe el guion', 'POST', '={{ $json.request.url }}', [900, 100], cred=AI_KEY,
     headers={'anthropic-version': '={{ $json.request.version }}', 'anthropic-beta': '={{ $json.request.beta }}'},
     body='={{ JSON.stringify($json.request.body) }}', timeout=600000, retryOnFail=True, maxTries=3, waitBetweenTries=15000)
link('Preparar pedido a la IA', 'La IA escribe el guion')
code('Leer guion', READ_SCRIPT_JS, [1120, 100])
link('La IA escribe el guion', 'Leer guion')
http('Pedir el video', 'POST', '={{ $json.config.rendererUrl }}/render', [1340, 100], cred=RENDERER,
     body='={{ JSON.stringify({ title: $json.script.title, scenes: $json.script.scenes, brand: $json.config.brand, voice: $json.config.voice, voiceRate: $json.config.voiceRate }) }}', retryOnFail=True, maxTries=3)
link('Leer guion', 'Pedir el video')
wait('Esperar el render', 7, 'minutes', [1560, 100])
link('Pedir el video', 'Esperar el render')
http('Consultar el render', 'GET', "={{ $('Pedir el video').first().json.statusUrl }}", [1780, 100], cred=RENDERER, retryOnFail=True, maxTries=3)
link('Esperar el render', 'Consultar el render')
if_node('¿Video listo?', '={{ $json.status }}', 'done', [2000, 100])
link('Consultar el render', '¿Video listo?')
if_node('¿Falló?', '={{ $json.status }}', 'error', [2220, 260])
link('¿Video listo?', '¿Falló?', out=1)
wait('Esperar un poco más', 1, 'minutes', [2440, 360])
link('¿Falló?', 'Esperar un poco más', out=1)
link('Esperar un poco más', 'Consultar el render')
telegram_message('Avisar error de render', "=⚠️ No se pudo generar el video de hoy: {{ $json.error }}", [2440, 200],
                 chat="={{ $('Leer guion').first().json.config.telegramChatId }}")
link('¿Falló?', 'Avisar error de render', out=0)
code('Guardar pendiente', SAVE_PENDING_JS, [2220, 0])
link('¿Video listo?', 'Guardar pendiente', out=0)
node('Enviar a Telegram para aprobar', 'n8n-nodes-base.telegram', 1.2, {
    'operation': 'sendVideo', 'chatId': '={{ $json.config.telegramChatId }}', 'file': '={{ $json.url }}',
    'replyMarkup': 'inlineKeyboard',
    'inlineKeyboard': {'rows': [{'row': {'buttons': [
        {'text': '✅ Publicar', 'additionalFields': {'callback_data': '=ok:{{ $json.id }}'}},
        {'text': '🔄 Rehacer', 'additionalFields': {'callback_data': '=redo:{{ $json.id }}'}},
        {'text': '🗑 Descartar', 'additionalFields': {'callback_data': '=no:{{ $json.id }}'}},
    ]}}]},
    'additionalFields': {'caption': '={{ $json.caption }}', 'parse_mode': 'HTML'}}, [2440, 0], **TELEGRAM)
link('Guardar pendiente', 'Enviar a Telegram para aprobar')

# ---------------------------------------------------------------- Decisión
code('Leer decisión', DECISION_JS, [680, 520])
link('¿Es un botón?', 'Leer decisión', out=0)
node('Responder al botón', 'n8n-nodes-base.telegram', 1.2, {
    'resource': 'callback', 'operation': 'answerQuery', 'queryId': '={{ $json.queryId }}',
    'additionalFields': {'text': "={{ { ok: 'Publicando…', redo: 'Preparando otra versión…', no: 'Descartado', expirado: 'Este video ya no está pendiente', ignorar: 'No autorizado' }[$json.action] }}"}},
    [900, 520], **TELEGRAM)
link('Leer decisión', 'Responder al botón')
node('¿Qué decidiste?', 'n8n-nodes-base.switch', 3.2, {
    'rules': {'values': [
        {'conditions': {'options': {'caseSensitive': True, 'leftValue': '', 'typeValidation': 'loose', 'version': 2},
                        'conditions': [condition("={{ $('Leer decisión').first().json.action }}", value)], 'combinator': 'and'},
         'renameOutput': True, 'outputKey': label}
        for value, label in (('ok', 'Publicar'), ('redo', 'Rehacer'), ('no', 'Descartar'))]},
    'options': {}}, [1120, 520])
link('Responder al botón', '¿Qué decidiste?')

# Rehacer: vuelve a escribir el guion con otro enfoque.
code('Volver a generar', "return [{ json: { config: $('Leer decisión').first().json.config, redo: $('Leer decisión').first().json.redo } }];", [1340, 420])
link('¿Qué decidiste?', 'Volver a generar', out=1)
link('Volver a generar', 'Preparar pedido a la IA')

telegram_message('Confirmar descarte', '=🗑 Video descartado.', [1340, 760], chat="={{ $('Leer decisión').first().json.config.telegramChatId }}")
link('¿Qué decidiste?', 'Confirmar descarte', out=2)

# Publicar: Instagram (Reel en dos pasos) y Facebook en paralelo.
code('Datos para publicar', r"""const d = $('Leer decisión').first().json;
return [{ json: { config: d.config, url: d.item.url, captions: d.item.script.captions, title: d.item.script.title } }];""", [1340, 600])
link('¿Qué decidiste?', 'Datos para publicar', out=0)

http('Instagram: subir Reel', 'POST', f"={GRAPH}/{{{{ $json.config.instagramUserId }}}}/media", [1560, 560], cred=META,
     query={'media_type': 'REELS', 'video_url': '={{ $json.url }}', 'caption': '={{ $json.captions.instagram }}', 'share_to_feed': 'true'})
link('Datos para publicar', 'Instagram: subir Reel')
wait('Instagram procesa', 1, 'minutes', [1780, 560])
link('Instagram: subir Reel', 'Instagram procesa')
http('Instagram: ¿listo?', 'GET', f"={GRAPH}/{{{{ $('Instagram: subir Reel').first().json.id }}}}", [2000, 560], cred=META,
     query={'fields': 'status_code'})
link('Instagram procesa', 'Instagram: ¿listo?')
if_node('¿Reel procesado?', '={{ $json.status_code }}', 'FINISHED', [2220, 560])
link('Instagram: ¿listo?', '¿Reel procesado?')
if_node('¿Reel con error?', '={{ $json.status_code }}', 'ERROR', [2440, 700])
link('¿Reel procesado?', '¿Reel con error?', out=1)
link('¿Reel con error?', 'Instagram procesa', out=1)
http('Instagram: publicar', 'POST', f"={GRAPH}/{{{{ $('Datos para publicar').first().json.config.instagramUserId }}}}/media_publish", [2440, 520], cred=META,
     query={'creation_id': "={{ $('Instagram: subir Reel').first().json.id }}"})
link('¿Reel procesado?', 'Instagram: publicar', out=0)
telegram_message('Avisar Instagram', '=✅ Publicado en Instagram. Lo mediré en 2 días para aprender qué funciona.', [2880, 400], chat="={{ $('Datos para publicar').first().json.config.telegramChatId }}")
code('Recordar publicación', RECORDAR_JS, [2660, 400])
link('Instagram: publicar', 'Recordar publicación')
link('Recordar publicación', 'Avisar Instagram')
telegram_message('Avisar error de Instagram', '=⚠️ Instagram no pudo procesar el video.', [2660, 700], chat="={{ $('Datos para publicar').first().json.config.telegramChatId }}")
link('¿Reel con error?', 'Avisar error de Instagram', out=0)

http('Facebook: publicar video', 'POST', f"=https://graph-video.facebook.com/v23.0/{{{{ $json.config.facebookPageId }}}}/videos", [1560, 840], cred=META,
     query={'file_url': '={{ $json.url }}', 'description': '={{ $json.captions.facebook }}', 'title': '={{ $json.title }}'}, timeout=300000)
link('Datos para publicar', 'Facebook: publicar video')
telegram_message('Avisar Facebook', '=✅ Publicado en Facebook.', [1780, 840], chat="={{ $('Datos para publicar').first().json.config.telegramChatId }}")
link('Facebook: publicar video', 'Avisar Facebook')

node('LinkedIn (pendiente)', 'n8n-nodes-base.noOp', 1, {}, [1560, 1000], disabled=True,
     notes='Se activa cuando LinkedIn apruebe la app (Community Management API).')
link('Datos para publicar', 'LinkedIn (pendiente)')
node('TikTok (pendiente)', 'n8n-nodes-base.noOp', 1, {}, [1560, 1140], disabled=True,
     notes='Se activa cuando TikTok audite la app (Content Posting API).')
link('Datos para publicar', 'TikTok (pendiente)')

workflow = {
    # id fijo: importar de nuevo actualiza el mismo flujo en vez de duplicarlo.
    'id': 'AlToqueVideoDia1',
    'name': 'Al Toque · Video diario',
    'nodes': nodes,
    'connections': connections,
    'settings': {'timezone': 'America/Lima', 'executionOrder': 'v1', 'saveManualExecutions': True},
}
out = Path(__file__).with_name('n8n-video-diario.json')
out.write_text(json.dumps(workflow, ensure_ascii=False, indent=1), encoding='utf-8')
print(f'{out.name}: {len(nodes)} nodos')
