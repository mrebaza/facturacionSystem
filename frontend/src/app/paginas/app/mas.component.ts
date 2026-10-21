import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../core/auth.service';
import { IconoComponent } from '../../shared/icono.component';

@Component({
  selector: 'at-mas',
  imports: [RouterLink, IconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina">
      <h1 class="titulo">Más</h1>
      @if (auth.perfil(); as p) {
        <div class="tarjeta-tinta col" style="gap: 2px">
          <strong>{{ p.empresa.nombreComercial || p.empresa.razonSocial }}</strong>
          <span class="mono mini">RUC {{ p.empresa.ruc }} · Plan {{ p.empresa.plan.nombre }}</span>
          <span class="mini" style="color: var(--amarillo)">{{ p.nombre }} · {{ p.rol.toLowerCase() }}</span>
        </div>
      }
      <nav class="lista">
        @for (l of enlaces; track l.ruta) {
          <a class="lista-item" [routerLink]="l.ruta" [queryParams]="l.q">
            <span class="fila"><at-icono [nombre]="l.icono" /> <strong>{{ l.texto }}</strong></span>
            <at-icono nombre="derecha" [tam]="18" />
          </a>
        }
      </nav>
      <button type="button" class="btn btn-borde" (click)="auth.salir('/')"><at-icono nombre="salir" /> Cerrar sesión</button>
    </div>
  `,
})
export class MasComponent {
  protected auth = inject(Auth);
  protected readonly enlaces = [
    { ruta: '/app/negocios', texto: 'Mis negocios', icono: 'local', q: {} },
    { ruta: '/app/cotizaciones', texto: 'Cotizaciones', icono: 'nota', q: {} },
    { ruta: '/app/compras', texto: 'Compras e IGV del mes', icono: 'grafico', q: {} },
    { ruta: '/app/productos', texto: 'Productos', icono: 'caja', q: {} },
    { ruta: '/app/caja', texto: 'Caja del día', icono: 'dinero', q: {} },
    { ruta: '/app/reportes', texto: 'Reportes', icono: 'grafico', q: {} },
    { ruta: '/app/ajustes', texto: 'Mi negocio', icono: 'local', q: { tab: 'negocio' } },
    { ruta: '/app/ajustes', texto: 'SUNAT y certificado', icono: 'llave', q: { tab: 'sunat' } },
    { ruta: '/app/ajustes', texto: 'Series y locales', icono: 'boleta', q: { tab: 'series' } },
    { ruta: '/app/ajustes', texto: 'Equipo', icono: 'clientes', q: { tab: 'equipo' } },
    { ruta: '/app/ajustes', texto: 'Plan', icono: 'estrella', q: { tab: 'plan' } },
  ];
}
