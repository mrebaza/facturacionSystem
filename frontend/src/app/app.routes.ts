import { Routes } from '@angular/router';
import { soloInvitados, soloLogueados } from './core/auth.service';

export const routes: Routes = [
  { path: '', title: 'Al Toque · Factura al toque, pe', loadComponent: () => import('./paginas/landing/landing.component').then((m) => m.LandingComponent) },
  { path: 'ingresar', title: 'Ingresar · Al Toque', canActivate: [soloInvitados], loadComponent: () => import('./paginas/auth/ingresar.component').then((m) => m.IngresarComponent) },
  { path: 'registro', title: 'Crea tu cuenta · Al Toque', canActivate: [soloInvitados], loadComponent: () => import('./paginas/auth/registro.component').then((m) => m.RegistroComponent) },
  { path: 'cotizacion/:token', title: 'Tu cotización · Al Toque', loadComponent: () => import('./paginas/publico/cotizacion-publica.component').then((m) => m.CotizacionPublicaComponent) },
  { path: 'c/:token', title: 'Tu comprobante · Al Toque', loadComponent: () => import('./paginas/publico/comprobante-publico.component').then((m) => m.ComprobantePublicoComponent) },
  { path: 'terminos', title: 'Términos · Al Toque', loadComponent: () => import('./paginas/legal/legal.component').then((m) => m.TerminosComponent) },
  { path: 'privacidad', title: 'Privacidad · Al Toque', loadComponent: () => import('./paginas/legal/legal.component').then((m) => m.PrivacidadComponent) },
  {
    path: 'app',
    canActivate: [soloLogueados],
    loadComponent: () => import('./paginas/app/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', title: 'Inicio · Al Toque', loadComponent: () => import('./paginas/app/inicio.component').then((m) => m.InicioComponent) },
      { path: 'emitir', title: 'Emitir · Al Toque', loadComponent: () => import('./paginas/app/emitir.component').then((m) => m.EmitirComponent) },
      { path: 'comprobantes', title: 'Comprobantes · Al Toque', loadComponent: () => import('./paginas/app/comprobantes.component').then((m) => m.ComprobantesComponent) },
      { path: 'comprobantes/:id', title: 'Comprobante · Al Toque', loadComponent: () => import('./paginas/app/comprobante-detalle.component').then((m) => m.ComprobanteDetalleComponent) },
      { path: 'cotizaciones', title: 'Cotizaciones · Al Toque', loadComponent: () => import('./paginas/app/cotizaciones.component').then((m) => m.CotizacionesComponent) },
      { path: 'cotizaciones/:id', title: 'Cotización · Al Toque', loadComponent: () => import('./paginas/app/cotizaciones.component').then((m) => m.CotizacionDetalleComponent) },
      { path: 'compras', title: 'Compras · Al Toque', loadComponent: () => import('./paginas/app/compras.component').then((m) => m.ComprasComponent) },
      { path: 'clientes', title: 'Clientes · Al Toque', loadComponent: () => import('./paginas/app/clientes.component').then((m) => m.ClientesComponent) },
      { path: 'productos', title: 'Productos · Al Toque', loadComponent: () => import('./paginas/app/productos.component').then((m) => m.ProductosComponent) },
      { path: 'reportes', title: 'Reportes · Al Toque', loadComponent: () => import('./paginas/app/reportes.component').then((m) => m.ReportesComponent) },
      { path: 'caja', title: 'Caja · Al Toque', loadComponent: () => import('./paginas/app/caja.component').then((m) => m.CajaComponent) },
      { path: 'ajustes', title: 'Ajustes · Al Toque', loadComponent: () => import('./paginas/app/ajustes.component').then((m) => m.AjustesComponent) },
      { path: 'negocios', title: 'Mis negocios · Al Toque', loadComponent: () => import('./paginas/app/negocios.component').then((m) => m.NegociosComponent) },
      { path: 'mas', title: 'Más · Al Toque', loadComponent: () => import('./paginas/app/mas.component').then((m) => m.MasComponent) },
    ],
  },
  { path: '**', title: 'No encontrado · Al Toque', loadComponent: () => import('./paginas/legal/legal.component').then((m) => m.NoEncontradoComponent) },
];
