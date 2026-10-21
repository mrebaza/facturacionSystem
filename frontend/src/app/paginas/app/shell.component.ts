import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Auth } from '../../core/auth.service';
import { CatalogosService } from '../../core/catalogos.service';
import { IconoComponent } from '../../shared/icono.component';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'at-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, IconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="shell">
      <aside class="lateral" aria-label="Menú">
        <a routerLink="/app" class="lat-logo" aria-label="Inicio"><at-logo [tam]="34" /></a>
        <a routerLink="/app/emitir" class="btn btn-tinta btn-bloque emitir"><at-icono nombre="sumar" /> Emitir al toque</a>
        <nav class="lat-nav">
          @for (l of enlaces; track l.ruta) {
            @if (!l.admin || auth.esAdmin()) {
              <a [routerLink]="l.ruta" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: l.ruta === '/app' }">
                <at-icono [nombre]="l.icono" /> {{ l.texto }}
              </a>
            }
          }
        </nav>
        <div class="lat-pie">
          @if (auth.empresa(); as e) {
            <a class="negocio" routerLink="/app/negocios" title="Cambiar o agregar negocio">
              <strong>{{ e.nombreComercial || e.razonSocial }}</strong>
              <span class="mono mini">RUC {{ e.ruc }}{{ (auth.perfil()?.negocios ?? 1) > 1 ? ' · cambiar' : '' }}</span>
            </a>
          }
          <button type="button" class="btn btn-fantasma btn-chico" (click)="auth.salir('/')"><at-icono nombre="salir" [tam]="18" /> Salir</button>
        </div>
      </aside>

      <div class="principal">
        @if (avisoAmbiente(); as a) {
          <a class="banda-ambiente no-imprimir" routerLink="/app/ajustes" [queryParams]="{ tab: a.tab }">{{ a.texto }}</a>
        }
        <main id="contenido">
          <router-outlet />
        </main>
      </div>

      @if (mostrarFab()) {
        <a routerLink="/app/emitir" class="fab no-imprimir" aria-label="Emitir comprobante"><at-icono nombre="sumar" [tam]="28" [grosor]="2.6" /></a>
      }

      <nav class="inferior no-imprimir" aria-label="Navegación principal">
        <a routerLink="/app" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }"><at-icono nombre="inicio" [tam]="24" />Inicio</a>
        <a routerLink="/app/comprobantes" routerLinkActive="activo"><at-icono nombre="boleta" [tam]="24" />Comprobantes</a>
        <a routerLink="/app/clientes" routerLinkActive="activo"><at-icono nombre="clientes" [tam]="24" />Clientes</a>
        <a routerLink="/app/mas" routerLinkActive="activo" [class.activo]="enMas()"><at-icono nombre="mas" [tam]="24" />Más</a>
      </nav>
    </div>
  `,
  styles: `
    .shell { min-height: 100dvh; }
    .lateral { display: none; }
    .principal { min-width: 0; }
    .banda-ambiente { display: block; background: var(--tinta); color: var(--amarillo); text-decoration: none; font-size: 13px; font-weight: 700;
      padding: 8px 16px; text-align: center; }
    .banda-ambiente:hover { color: var(--blanco); }
    .inferior { position: fixed; z-index: 50; left: 0; right: 0; bottom: 0; background: var(--blanco); border-top: 1px solid var(--linea);
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); padding: 8px 8px calc(12px + env(safe-area-inset-bottom)); }
    .inferior a { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; text-decoration: none; color: var(--gris);
      font-size: 12px; font-weight: 600; min-height: 44px; }
    .inferior a.activo { color: var(--tinta); font-weight: 800; }
    .fab { position: fixed; z-index: 51; right: 18px; bottom: calc(88px + env(safe-area-inset-bottom)); width: 60px; height: 60px; border-radius: 20px;
      background: var(--tinta); color: var(--amarillo); display: flex; align-items: center; justify-content: center; box-shadow: var(--sombra-alta); }
    .fab:hover { color: var(--amarillo); background: #000; }

    @media (min-width: 900px) {
      .shell { display: grid; grid-template-columns: 248px minmax(0, 1fr); }
      .inferior, .fab { display: none; }
      .lateral { display: flex; flex-direction: column; gap: 18px; position: sticky; top: 0; height: 100dvh; padding: 22px 16px;
        background: var(--blanco); border-right: 1px solid var(--linea); }
      .lat-logo { padding: 0 6px; text-decoration: none; }
      .lat-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; overflow-y: auto; }
      .lat-nav a { display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; text-decoration: none; font-weight: 700; color: var(--gris); }
      .lat-nav a:hover { background: var(--papel); color: var(--tinta); }
      .lat-nav a.activo { background: var(--amarillo); color: var(--tinta); }
      .lat-pie { border-top: 1px solid var(--linea); padding-top: 14px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
      .negocio { display: flex; flex-direction: column; line-height: 1.25; padding: 6px; border-radius: 10px; color: inherit; text-decoration: none; }
      .negocio:hover { background: var(--papel); }
    }
  `,
})
export class ShellComponent {
  protected auth = inject(Auth);
  private router = inject(Router);

  protected readonly enlaces = [
    { ruta: '/app', texto: 'Inicio', icono: 'inicio', admin: false },
    { ruta: '/app/comprobantes', texto: 'Comprobantes', icono: 'boleta', admin: false },
    { ruta: '/app/cotizaciones', texto: 'Cotizaciones', icono: 'nota', admin: false },
    { ruta: '/app/clientes', texto: 'Clientes', icono: 'clientes', admin: false },
    { ruta: '/app/productos', texto: 'Productos', icono: 'caja', admin: false },
    { ruta: '/app/caja', texto: 'Caja del día', icono: 'dinero', admin: false },
    { ruta: '/app/compras', texto: 'Compras e IGV', icono: 'grafico', admin: false },
    { ruta: '/app/reportes', texto: 'Reportes', icono: 'grafico', admin: false },
    { ruta: '/app/ajustes', texto: 'Ajustes', icono: 'ajustes', admin: false },
  ];

  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), {
    initialValue: this.router.url,
  });
  protected enMas = computed(() => ['/app/productos', '/app/caja', '/app/reportes', '/app/ajustes'].some((r) => this.url().startsWith(r)));
  protected mostrarFab = computed(() => {
    const u = this.url().split('?')[0];
    return u !== '/app' && !u.startsWith('/app/emitir') && !/^\/app\/comprobantes\/\d+/.test(u);
  });

  protected avisoAmbiente = computed(() => {
    const e = this.auth.empresa();
    if (!e) return null;
    if (e.estado === 'SUSPENDIDA') return { texto: 'Tu cuenta está suspendida. Renueva tu plan para seguir emitiendo →', tab: 'plan' };
    if (e.estado === 'PRUEBA' && e.pruebaHasta) {
      const dias = Math.ceil((new Date(e.pruebaHasta + 'T23:59:59').getTime() - Date.now()) / 86400000);
      if (dias < 0) return { texto: 'Se acabó tu prueba gratis. Elige un plan para seguir emitiendo →', tab: 'plan' };
      if (e.ambienteSunat !== 'PRODUCCION') return { texto: `Prueba gratis: te quedan ${dias} días · Modo pruebas SUNAT (sin valor tributario). Pasa a producción →`, tab: 'sunat' };
    }
    if (e.ambienteSunat !== 'PRODUCCION') return { texto: 'Modo pruebas SUNAT: tus comprobantes aún no tienen valor tributario. Pasa a producción →', tab: 'sunat' };
    return null;
  });

  constructor() {
    inject(CatalogosService).cargar();
  }
}
