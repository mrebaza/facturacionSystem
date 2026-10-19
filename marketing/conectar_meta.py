"""Conecta la página de Facebook y el Instagram de Al Toque para el flujo de n8n.

Lee un archivo de texto con estas líneas (fuera del repositorio, nunca lo subas):

    META_APP_ID=...
    META_APP_SECRET=...
    META_TOKEN=...        token corto del Explorador de la API Graph

Muestra el id de la página y el del Instagram, y copia al portapapeles el token de página que no vence
para pegarlo en la credencial «Meta Al Toque (token de página)» de n8n. Nunca imprime ni guarda tokens.

Uso: python marketing/conectar_meta.py "%USERPROFILE%\\Desktop\\claves-al-toque.txt"
"""
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

GRAPH = 'https://graph.facebook.com/v23.0'
NECESARIOS = {'pages_show_list', 'pages_read_engagement', 'pages_manage_posts',
              'instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'}


def graph(ruta, **params):
    url = f'{GRAPH}/{ruta}?{urllib.parse.urlencode(params)}'
    try:
        with urllib.request.urlopen(url, timeout=60) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        error = json.loads(e.read().decode() or '{}').get('error', {})
        sys.exit(f'Meta respondió {e.code} en /{ruta.split("/")[0]}: {error.get("message", "error desconocido")}')


def leer_claves(ruta):
    claves = {}
    for linea in open(ruta, encoding='utf-8-sig'):
        if '=' in linea and not linea.lstrip().startswith('#'):
            k, v = linea.split('=', 1)
            claves[k.strip()] = v.strip()
    faltan = [k for k in ('META_APP_ID', 'META_APP_SECRET', 'META_TOKEN') if not claves.get(k)]
    if faltan:
        sys.exit('Faltan en el archivo: ' + ', '.join(faltan))
    return claves


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    claves = leer_claves(sys.argv[1])
    app_id, secreto = claves['META_APP_ID'], claves['META_APP_SECRET']

    # 1. Token corto (1 hora) → token de usuario de 60 días.
    largo = graph('oauth/access_token', grant_type='fb_exchange_token', client_id=app_id,
                  client_secret=secreto, fb_exchange_token=claves['META_TOKEN'])['access_token']

    info = graph('debug_token', input_token=largo, access_token=f'{app_id}|{secreto}')['data']
    faltan = NECESARIOS - set(info.get('scopes', []))
    if faltan:
        sys.exit('Al token le faltan permisos: ' + ', '.join(sorted(faltan))
                 + '. Vuelve a generarlo en el Explorador marcándolos.')

    # 2. Con el token largo, el token de página no vence.
    paginas = graph('me/accounts', access_token=largo,
                    fields='id,name,access_token,instagram_business_account{id,username}')['data']
    if not paginas:
        sys.exit('Tu usuario no administra ninguna página (o no la marcaste al dar permisos).')
    pagina = next((p for p in paginas if 'toque' in p['name'].lower()), paginas[0])
    instagram = pagina.get('instagram_business_account')
    if not instagram:
        sys.exit(f'La página «{pagina["name"]}» no tiene una cuenta de Instagram profesional vinculada.')

    # clip.exe es de Windows; el token va directo al portapapeles, sin pasar por la pantalla.
    subprocess.run(['clip'], input=pagina['access_token'].encode('ascii'), check=True)

    print(f'Página de Facebook: {pagina["name"]} ({pagina["id"]})')
    print(f'Instagram: @{instagram.get("username")} ({instagram["id"]})')
    print('Permisos: ' + ', '.join(sorted(info.get('scopes', []))))
    print('El token de página quedó copiado: pégalo (Ctrl+V) como Value de la credencial de Meta en n8n.')
    print('Luego borra el archivo de claves.')


if __name__ == '__main__':
    main()
