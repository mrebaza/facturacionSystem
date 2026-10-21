import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../../core/api.service';
import { FechaPipe, SolesPipe } from '../../core/formato';
import { Comprobante, MetodoPago, NOMBRE_METODO, Pagina } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';
import { Cotizacion, ESTADO_COTIZACION, compartirCotizacion } from '../../core/ventas';
import { CotizacionDocComponent } from '../../shared/cotizacion-doc.component';
import { IconoComponent } from '../../shared/icono.component';
import { ModalComponent } from '../../shared/modal.component';

/** Lista de cotizaciones. Se crean desde «Emitir» con el botón «Guardar como cotización». */
@Component({
  selector: 'at-cotizaciones',
  imports: [RouterLink, SolesPipe, FechaPipe, IconoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina" style="max-width: 980px">
      <header class="entre">
        <div>
          <h1 class="titulo">Cotizaciones</h1>
          <p class="suave chico">Mándale el precio a tu cliente por WhatsApp; cuando acepte, la conviertes en boleta o factura al toque.</p>
        </div>
        <a routerLink="/app/emitir" [queryParams]="{ modo: 'cotizacion' }" class="btn btn-tinta"><at-icono nombre="sumar" /> Nueva cotización</a>
      </header>
      @if (cargando()) {
        <div class="esqueleto" style="height: 220px"></div>
      } @else {
        <div class="tabla-caja">
          <table class="tabla">
            <thead><tr><th>Número</th><th>Fecha</th><th>Cliente</th><th>Vence</th><th>Estado</th><th class="derecha">Total</th></tr></thead>
            <tbody>
              @for (c of lista(); track c.id) {
                <tr class="clic" [routerLink]="['/app/cotizaciones', c.id]">
                  <td class="mono">{{ c.numero }}</td>
                  <td>{{ c.fechaEmision | fecha }}</td>
                  <td>{{ c.clienteNombre }}</td>
                  <td>{{ c.validaHasta | fecha }}</td>
                  <td>
                    @if (c.vencida) { <span class="chip chip-gris">Vencida</span> }
                    @else { <span class="chip {{ estados[c.estado].clase }}">{{ estados[c.estado].texto }}</span> }
                  </td>
                  <td class="derecha mono">{{ c.total | soles }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="suave" style="text-align: center; padding: 32px">Aún no tienes cotizaciones. Arma una desde «Emitir».</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class CotizacionesComponent {
  private api = inject(Api);
  private toast = inject(ToastService);
  protected readonly estados = ESTADO_COTIZACION;
  protected lista = signal<Cotizacion[]>([]);
  protected cargando = signal(true);

  constructor() {
    this.api.get<Pagina<Cotizacion>>('/cotizaciones')
      .then((p) => this.lista.set(p.content))
      .catch((e) => this.toast.error(mensajeError(e)))
      .finally(() => this.cargando.set(false));
  }
}

/** Una cotización: verla, compartirla, marcar la respuesta del cliente y convertirla en comprobante. */
@Component({
  selector: 'at-cotizacion-detalle',
  imports: [FormsModule, RouterLink, SolesPipe, FechaPipe, IconoComponent, ModalComponent, CotizacionDocComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina" style="max-width: 900px">
      <a routerLink="/app/cotizaciones" class="enlace chico"><at-icono nombre="izquierda" [tam]="16" /> Cotizaciones</a>
      @if (c(); as cot) {
        <header class="entre">
          <div>
            <h1 class="titulo">{{ cot.numero }}</h1>
            <p class="suave chico">{{ cot.clienteNombre }} · vale hasta el {{ cot.validaHasta | fecha }}</p>
          </div>
          @if (cot.vencida) { <span class="chip chip-gris">Vencida</span> }
          @else { <span class="chip {{ estados[cot.estado].clase }}">{{ estados[cot.estado].texto }}</span> }
        </header>

        <div class="fila-wrap">
          @if (cot.estado === 'FACTURADA') {
            <a class="btn btn-tinta" [routerLink]="['/app/comprobantes', cot.comprobanteId]">Ver {{ cot.comprobanteNumero }}</a>
          } @else {
            <button type="button" class="btn btn-tinta" (click)="abrirFacturar(cot)"><at-icono nombre="boleta" /> Convertir en comprobante</button>
            <button type="button" class="btn btn-verde" (click)="compartir(cot)"><at-icono nombre="whatsapp" /> Enviar por WhatsApp</button>
            @if (cot.estado === 'ABIERTA') {
              <button type="button" class="btn btn-borde" (click)="marcar(cot, 'ACEPTADA')">Aceptó</button>
              <button type="button" class="btn btn-fantasma" (click)="marcar(cot, 'RECHAZADA')">No aceptó</button>
            }
          }
          <button type="button" class="btn btn-borde" (click)="imprimir()"><at-icono nombre="imprimir" /> Imprimir</button>
        </div>

        <at-cotizacion-doc [c]="cot" />

        <at-modal [abierto]="facturando()" titulo="Convertir en comprobante" (cerrar)="facturando.set(false)">
          <div class="col">
            <div class="fila-wrap">
              <button type="button" class="btn" [class.btn-tinta]="tipo === '03'" [class.btn-borde]="tipo !== '03'" (click)="tipo = '03'">Boleta</button>
              <button type="button" class="btn" [class.btn-tinta]="tipo === '01'" [class.btn-borde]="tipo !== '01'" (click)="tipo = '01'" [disabled]="cot.clienteTipoDoc !== '6'">Factura</button>
            </div>
            @if (cot.clienteTipoDoc !== '6') { <p class="suave chico">Para factura, la cotización debe tener el RUC del cliente.</p> }
            <div class="campo">
              <label for="metodo">¿Cómo pagó?</label>
              <select id="metodo" class="input" [(ngModel)]="metodo" name="metodo">
                @for (m of metodos; track m) { <option [value]="m">{{ nombreMetodo[m] }}</option> }
              </select>
            </div>
            <p>Total: <strong class="mono">{{ cot.total | soles }}</strong></p>
            <button type="button" class="btn btn-tinta btn-bloque" [disabled]="ocupado()" (click)="facturar(cot)">
              {{ ocupado() ? 'Emitiendo…' : 'Emitir ' + (tipo === '01' ? 'factura' : 'boleta') }}
            </button>
          </div>
        </at-modal>
      } @else {
        <div class="esqueleto" style="height: 320px"></div>
      }
    </div>
  `,
})
export class CotizacionDetalleComponent {
  private api = inject(Api);
  private toast = inject(ToastService);
  private router = inject(Router);
  readonly id = input.required<string>();
  protected readonly estados = ESTADO_COTIZACION;
  protected readonly metodos: MetodoPago[] = ['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA', 'TRANSFERENCIA'];
  protected readonly nombreMetodo = NOMBRE_METODO;
  protected c = signal<Cotizacion | null>(null);
  protected facturando = signal(false);
  protected ocupado = signal(false);
  protected tipo: '01' | '03' = '03';
  protected metodo: MetodoPago = 'EFECTIVO';

  ngOnInit(): void {
    this.api.get<Cotizacion>(`/cotizaciones/${this.id()}`).then((c) => this.c.set(c)).catch((e) => this.toast.error(mensajeError(e)));
  }

  protected compartir(c: Cotizacion) {
    compartirCotizacion(c);
  }

  protected imprimir() {
    window.print();
  }

  protected async marcar(c: Cotizacion, estado: 'ACEPTADA' | 'RECHAZADA') {
    try {
      this.c.set(await this.api.post<Cotizacion>(`/cotizaciones/${c.id}/estado`, { estado }));
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  protected abrirFacturar(c: Cotizacion) {
    this.tipo = c.clienteTipoDoc === '6' ? '01' : '03';
    this.facturando.set(true);
  }

  protected async facturar(c: Cotizacion) {
    this.ocupado.set(true);
    try {
      const comprobante = await this.api.post<Comprobante>(`/cotizaciones/${c.id}/facturar`, {
        tipo: this.tipo,
        pagos: [{ metodo: this.metodo, monto: c.total }],
      });
      this.toast.ok(`Listo: ${comprobante.numero} emitido`);
      this.router.navigate(['/app/comprobantes', comprobante.id]);
    } catch (e) {
      this.toast.error(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
