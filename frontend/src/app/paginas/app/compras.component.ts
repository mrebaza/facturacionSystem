import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../../core/api.service';
import { FechaPipe, SolesPipe, hoyIso } from '../../core/formato';
import { ToastService } from '../../core/toast.service';
import { Compra, ResumenTributario, TIPOS_COMPRA } from '../../core/ventas';
import { IconoComponent } from '../../shared/icono.component';
import { ModalComponent } from '../../shared/modal.component';

interface Formulario {
  id: number | null;
  fechaEmision: string;
  tipoDocumento: string;
  serie: string;
  numero: string;
  proveedorTipoDoc: string;
  proveedorNumDoc: string;
  proveedorNombre: string;
  categoria: string;
  total: number | null;
  conIgv: boolean;
  estadoPago: 'PAGADO' | 'POR_PAGAR';
  fechaVencimiento: string;
  observaciones: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Compras y gastos: registra las facturas de tus proveedores y ve cuánto IGV te toca pagar este mes (el que cobraste
 * menos el de tus compras con factura). Al cierre, descargas el Registro de Compras para tu contador.
 */
@Component({
  selector: 'at-compras',
  imports: [FormsModule, SolesPipe, FechaPipe, IconoComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina" style="max-width: 1000px">
      <header class="entre">
        <div>
          <h1 class="titulo">Compras y gastos</h1>
          <p class="suave chico">Anota cada factura de tus proveedores: su IGV se resta del que pagas a SUNAT.</p>
        </div>
        <div class="fila-wrap">
          <input type="month" class="input" [ngModel]="periodo()" (ngModelChange)="cambiarPeriodo($event)" aria-label="Mes" />
          <button type="button" class="btn btn-tinta" (click)="nueva()"><at-icono nombre="sumar" /> Registrar compra</button>
        </div>
      </header>

      @if (resumen(); as r) {
        <div class="cuadro">
          <div class="tarjeta col">
            <span class="mini suave">IGV de tus ventas</span>
            <strong class="mono grande">{{ r.ventasIgv | soles }}</strong>
            <span class="mini suave">{{ r.comprobantes }} comprobantes · {{ r.ventasTotal | soles }}</span>
          </div>
          <div class="tarjeta col">
            <span class="mini suave">IGV de tus compras (crédito fiscal)</span>
            <strong class="mono grande">− {{ r.comprasIgv | soles }}</strong>
            <span class="mini suave">{{ r.compras }} compras · {{ r.comprasTotal | soles }}</span>
          </div>
          <div class="tarjeta-amarilla col">
            @if (r.saldoAFavor > 0) {
              <span class="mini">Saldo a tu favor</span>
              <strong class="mono grande">{{ r.saldoAFavor | soles }}</strong>
              <span class="mini">Se arrastra al próximo mes.</span>
            } @else {
              <span class="mini">IGV a pagar estimado</span>
              <strong class="mono grande">{{ r.igvPorPagar | soles }}</strong>
              <span class="mini">Confírmalo con tu contador antes de declarar.</span>
            }
          </div>
        </div>
        <div class="fila-wrap chico">
          <span>Ganancia estimada del mes (ventas − gastos, sin IGV): <strong class="mono">{{ r.utilidadEstimada | soles }}</strong></span>
          @if (r.porPagarProveedores > 0) { <span class="chip chip-magenta">Debes a proveedores {{ r.porPagarProveedores | soles }}</span> }
        </div>
        @if (categorias().length) {
          <div class="tarjeta col">
            <h2 class="subtitulo">¿En qué se va la plata?</h2>
            @for (c of categorias(); track c.nombre) {
              <div class="barra-cat">
                <span class="chico">{{ c.nombre }}</span>
                <div class="pista"><i [style.width.%]="c.porcentaje"></i></div>
                <span class="mono chico">{{ c.monto | soles }}</span>
              </div>
            }
          </div>
        }
      }

      <div class="entre">
        <h2 class="subtitulo">Compras del mes</h2>
        <button type="button" class="btn btn-borde btn-chico" (click)="exportar()"><at-icono nombre="descargar" /> Registro de Compras (Excel)</button>
      </div>
      <div class="tabla-caja">
        <table class="tabla">
          <thead><tr><th>Fecha</th><th>Comprobante</th><th>Proveedor</th><th>Categoría</th><th class="derecha">IGV</th><th class="derecha">Total</th><th></th></tr></thead>
          <tbody>
            @for (c of lista(); track c.id) {
              <tr>
                <td>{{ c.fechaEmision | fecha }}</td>
                <td class="mono chico">{{ c.tipoNombre }} {{ c.serie }}-{{ c.numero }}</td>
                <td>{{ c.proveedorNombre }}<span class="mini suave" style="display: block">{{ c.proveedorNumDoc }}</span></td>
                <td>{{ c.categoria }}</td>
                <td class="derecha mono">@if (c.creditoFiscal) { {{ c.igv | soles }} } @else { <span class="suave">—</span> }</td>
                <td class="derecha mono">{{ c.total | soles }}@if (c.estadoPago === 'POR_PAGAR') { <span class="chip chip-magenta">por pagar</span> }</td>
                <td class="derecha">
                  @if (c.estadoPago === 'POR_PAGAR') { <button type="button" class="btn btn-fantasma btn-chico" (click)="pagada(c)">Pagada</button> }
                  <button type="button" class="btn btn-fantasma btn-chico" (click)="editar(c)" aria-label="Editar"><at-icono nombre="editar" [tam]="16" /></button>
                  <button type="button" class="btn btn-fantasma btn-chico" (click)="borrar(c)" aria-label="Borrar"><at-icono nombre="borrar" [tam]="16" /></button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="suave" style="text-align: center; padding: 28px">Sin compras este mes.</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <at-modal [abierto]="!!form()" [titulo]="form()?.id ? 'Editar compra' : 'Registrar compra'" (cerrar)="form.set(null)" [ancho]="560">
      @if (form(); as f) {
        <form class="col" (ngSubmit)="guardar(f)">
          <div class="fila-wrap">
            <div class="campo" style="flex: 1"><label for="tipo">Comprobante</label>
              <select id="tipo" name="tipo" class="input" [(ngModel)]="f.tipoDocumento" (ngModelChange)="f.conIgv = $event === '01' || $event === '14'">
                @for (t of tipos; track t.codigo) { <option [value]="t.codigo">{{ t.nombre }}</option> }
              </select></div>
            <div class="campo" style="width: 110px"><label for="serie">Serie</label><input id="serie" name="serie" class="input mono" [(ngModel)]="f.serie" required maxlength="20" placeholder="F001" /></div>
            <div class="campo" style="width: 120px"><label for="num">Número</label><input id="num" name="num" class="input mono" [(ngModel)]="f.numero" required maxlength="20" /></div>
          </div>
          <div class="fila-wrap">
            <div class="campo" style="width: 150px"><label for="ruc">RUC o DNI</label>
              <input id="ruc" name="ruc" class="input mono" [(ngModel)]="f.proveedorNumDoc" required maxlength="15" inputmode="numeric" (blur)="buscarProveedor(f)" /></div>
            <div class="campo" style="flex: 1"><label for="prov">Proveedor</label><input id="prov" name="prov" class="input" [(ngModel)]="f.proveedorNombre" required maxlength="200" /></div>
          </div>
          <div class="fila-wrap">
            <div class="campo" style="width: 160px"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date" class="input" [(ngModel)]="f.fechaEmision" [max]="hoy" required /></div>
            <div class="campo" style="flex: 1"><label for="cat">Categoría</label>
              <select id="cat" name="cat" class="input" [(ngModel)]="f.categoria">
                @for (c of listaCategorias(); track c) { <option [value]="c">{{ c }}</option> }
              </select></div>
          </div>
          <div class="fila-wrap">
            <div class="campo" style="width: 160px"><label for="total">Total (S/)</label><input id="total" name="total" type="number" min="0.01" step="0.01" class="input mono" [(ngModel)]="f.total" required /></div>
            <label class="fila chico"><input type="checkbox" name="conIgv" [(ngModel)]="f.conIgv" /> Incluye IGV 18 %</label>
          </div>
          @if (f.total) {
            <p class="mini suave mono">Base {{ base(f) | soles }} · IGV {{ igv(f) | soles }}</p>
          }
          <div class="fila-wrap">
            <label class="fila chico"><input type="radio" name="pago" value="PAGADO" [(ngModel)]="f.estadoPago" /> Pagada</label>
            <label class="fila chico"><input type="radio" name="pago" value="POR_PAGAR" [(ngModel)]="f.estadoPago" /> Por pagar</label>
            @if (f.estadoPago === 'POR_PAGAR') { <input type="date" name="vence" class="input" [(ngModel)]="f.fechaVencimiento" aria-label="Vence" /> }
          </div>
          <button type="submit" class="btn btn-tinta btn-bloque" [disabled]="ocupado()">Guardar</button>
        </form>
      }
    </at-modal>
  `,
  styles: `
    .cuadro { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .grande { font-size: 28px; }
    .barra-cat { display: grid; grid-template-columns: 180px 1fr 110px; gap: 10px; align-items: center; }
    .pista { height: 10px; border-radius: 99px; background: var(--linea); overflow: hidden; }
    .pista i { display: block; height: 100%; background: var(--tinta); }
    @media (max-width: 600px) { .barra-cat { grid-template-columns: 110px 1fr 90px; } }
  `,
})
export class ComprasComponent {
  private api = inject(Api);
  private toast = inject(ToastService);
  protected readonly tipos = TIPOS_COMPRA;
  protected readonly hoy = hoyIso();
  protected periodo = signal(hoyIso().substring(0, 7));
  protected lista = signal<Compra[]>([]);
  protected resumen = signal<ResumenTributario | null>(null);
  protected listaCategorias = signal<string[]>([]);
  protected form = signal<Formulario | null>(null);
  protected ocupado = signal(false);
  protected categorias = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    const filas = Object.entries(r.gastoPorCategoria).map(([nombre, monto]) => ({ nombre, monto: Number(monto) })).filter((f) => f.monto > 0);
    const max = Math.max(...filas.map((f) => f.monto), 1);
    return filas.sort((a, b) => b.monto - a.monto).map((f) => ({ ...f, porcentaje: (f.monto / max) * 100 }));
  });

  constructor() {
    this.api.get<string[]>('/compras/categorias').then((c) => this.listaCategorias.set(c)).catch(() => {});
    this.cargar();
  }

  private rango(): { desde: string; hasta: string } {
    const [a, m] = this.periodo().split('-').map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return { desde: `${this.periodo()}-01`, hasta: `${this.periodo()}-${String(ultimo).padStart(2, '0')}` };
  }

  private async cargar() {
    try {
      const [l, r] = await Promise.all([
        this.api.get<Compra[]>('/compras', this.rango()),
        this.api.get<ResumenTributario>('/compras/resumen', { periodo: this.periodo() }),
      ]);
      this.lista.set(l);
      this.resumen.set(r);
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  protected cambiarPeriodo(valor: string) {
    if (!valor) return;
    this.periodo.set(valor);
    this.cargar();
  }

  protected nueva() {
    this.form.set({ id: null, fechaEmision: this.hoy, tipoDocumento: '01', serie: '', numero: '', proveedorTipoDoc: '6',
      proveedorNumDoc: '', proveedorNombre: '', categoria: 'Mercadería', total: null, conIgv: true, estadoPago: 'PAGADO',
      fechaVencimiento: '', observaciones: '' });
  }

  protected editar(c: Compra) {
    this.form.set({ id: c.id, fechaEmision: c.fechaEmision, tipoDocumento: c.tipoDocumento, serie: c.serie, numero: c.numero,
      proveedorTipoDoc: c.proveedorTipoDoc, proveedorNumDoc: c.proveedorNumDoc, proveedorNombre: c.proveedorNombre,
      categoria: c.categoria, total: c.total, conIgv: c.igv > 0, estadoPago: c.estadoPago, fechaVencimiento: c.fechaVencimiento ?? '',
      observaciones: c.observaciones ?? '' });
  }

  protected base(f: Formulario): number {
    return f.conIgv ? r2((f.total ?? 0) / 1.18) : 0;
  }

  protected igv(f: Formulario): number {
    return f.conIgv ? r2((f.total ?? 0) - this.base(f)) : 0;
  }

  /** Al escribir el RUC, completa la razón social (SUNAT). */
  protected async buscarProveedor(f: Formulario) {
    const doc = f.proveedorNumDoc.trim();
    f.proveedorTipoDoc = doc.length === 11 ? '6' : doc.length === 8 ? '1' : '0';
    if (f.proveedorNombre.trim() || (doc.length !== 11 && doc.length !== 8)) return;
    const ruta = doc.length === 11 ? `/consulta/ruc/${doc}` : `/consulta/dni/${doc}`;
    const r = await this.api.get<{ nombre?: string; razonSocial?: string }>(ruta).catch(() => null);
    if (r) {
      f.proveedorNombre = r.razonSocial ?? r.nombre ?? '';
      this.form.set({ ...f });
    }
  }

  protected async guardar(f: Formulario) {
    if (!f.total || f.total <= 0) return this.toast.error('Escribe el total del comprobante.');
    this.ocupado.set(true);
    const cuerpo = {
      fechaEmision: f.fechaEmision, tipoDocumento: f.tipoDocumento, serie: f.serie, numero: f.numero,
      proveedorTipoDoc: f.proveedorTipoDoc, proveedorNumDoc: f.proveedorNumDoc.trim(), proveedorNombre: f.proveedorNombre,
      categoria: f.categoria, baseImponible: this.base(f), igv: this.igv(f), noGravado: f.conIgv ? 0 : f.total, total: f.total,
      estadoPago: f.estadoPago, fechaVencimiento: f.estadoPago === 'POR_PAGAR' ? f.fechaVencimiento || null : null,
      observaciones: f.observaciones || null,
    };
    try {
      if (f.id) await this.api.put(`/compras/${f.id}`, cuerpo);
      else await this.api.post('/compras', cuerpo);
      this.toast.ok('Compra guardada');
      this.form.set(null);
      this.cargar();
    } catch (e) {
      this.toast.error(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async pagada(c: Compra) {
    try {
      await this.api.post(`/compras/${c.id}/pagada`);
      this.cargar();
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  protected async borrar(c: Compra) {
    if (!confirm(`¿Borrar ${c.tipoNombre} ${c.serie}-${c.numero} de ${c.proveedorNombre}?`)) return;
    try {
      await this.api.delete(`/compras/${c.id}`);
      this.cargar();
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  protected exportar() {
    this.api.descargar('/compras/exportar', this.rango()).catch((e) => this.toast.error(mensajeError(e)));
  }
}
