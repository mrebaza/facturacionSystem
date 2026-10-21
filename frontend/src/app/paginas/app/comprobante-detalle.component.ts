import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { CatalogosService } from '../../core/catalogos.service';
import { FechaPipe, SolesPipe } from '../../core/formato';
import { Comprobante, MetodoPago, NOMBRE_METODO, NOMBRE_TIPO } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';
import { ComprobanteDocComponent, imprimir } from '../../shared/comprobante-doc.component';
import { EstadoPagoComponent, EstadoSunatComponent } from '../../shared/estados.component';
import { IconoComponent } from '../../shared/icono.component';
import { ModalComponent } from '../../shared/modal.component';
import { compartirWhatsapp, copiarEnlace } from './compartir';

interface Envio {
  id: number;
  operacion: string;
  ambiente: string;
  exito: boolean;
  codigo?: string;
  mensaje?: string;
  duracionMs?: number;
  createdAt: string;
}

interface ItemNota {
  incluir: boolean;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  tipoAfectacion: string;
  productoId?: number;
  codigo?: string;
}

@Component({
  selector: 'at-comprobante-detalle',
  imports: [FormsModule, RouterLink, SolesPipe, FechaPipe, IconoComponent, ModalComponent, ComprobanteDocComponent, EstadoSunatComponent, EstadoPagoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './comprobante-detalle.component.html',
  styles: `
    .grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; }
    @media (min-width: 1000px) { .grid { grid-template-columns: minmax(0, 1fr) 380px; align-items: start; } .lado { position: sticky; top: 16px; } }
    .doc-caja { background: var(--blanco); border-radius: var(--radio); padding: 18px 0; overflow-x: auto; }
    .doc-caja.ticket { background: var(--amarillo); padding: 24px 8px; }
    .acciones { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .acciones .btn { min-height: 46px; font-size: 15px; }
    .dato { display: flex; justify-content: space-between; gap: 10px; font-size: 15px; }
    .grande { font-size: 22px; }
    .msg { font-size: 14px; word-break: break-word; }
    .items-nota { display: flex; flex-direction: column; gap: 8px; max-height: 320px; overflow-y: auto; }
    .item-nota { display: grid; grid-template-columns: auto minmax(0, 1fr) 76px 92px; gap: 8px; align-items: center; background: var(--blanco); border-radius: 12px; padding: 8px 10px; }
    .item-nota .input { min-height: 38px; padding: 6px 8px; font-size: 14px; }
    .bitacora { font-size: 13px; }
    .bitacora li { padding: 6px 0; border-bottom: 1px solid var(--linea); }
    details summary { cursor: pointer; font-weight: 700; }
  `,
})
export class ComprobanteDetalleComponent {
  private api = inject(Api);
  private toast = inject(ToastService);
  private router = inject(Router);
  protected auth = inject(Auth);
  protected cat = inject(CatalogosService);

  readonly id = input.required<string>();
  protected c = signal<Comprobante | null>(null);
  protected formato = signal<'ticket' | 'a4'>(window.innerWidth >= 1000 ? 'a4' : 'ticket');
  protected envios = signal<Envio[]>([]);
  protected ocupado = signal(false);

  protected readonly metodos: MetodoPago[] = ['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA', 'TRANSFERENCIA', 'OTRO'];
  protected readonly nombreMetodo = NOMBRE_METODO;

  // cobro
  protected cobroAbierto = signal(false);
  protected cobro = { metodo: 'EFECTIVO' as MetodoPago, monto: 0, referencia: '' };

  // anulación
  protected anularAbierto = signal(false);
  protected motivoAnulacion = '';

  // nota
  protected notaAbierta = signal(false);
  protected notaTipo = signal<'07' | '08'>('07');
  protected motivo = signal('01');
  protected motivoDescripcion = '';
  protected itemsNota = signal<ItemNota[]>([]);
  protected motivosNota = computed(() =>
    Object.entries(this.notaTipo() === '07' ? this.cat.datos().motivosNotaCredito : this.cat.datos().motivosNotaDebito).map(([codigo, nombre]) => ({ codigo, nombre })),
  );
  protected esTotal = computed(() => this.notaTipo() === '07' && ['01', '02', '06'].includes(this.motivo()));
  protected totalNota = computed(() => (this.esTotal() ? this.c()?.total ?? 0
    : this.itemsNota().filter((i) => i.incluir).reduce((a, i) => a + Math.round(i.cantidad * i.precioUnitario * 100) / 100, 0)));

  protected esValido = computed(() => ['ACEPTADO', 'OBSERVADO'].includes(this.c()?.estadoSunat ?? ''));
  protected puedeAnular = computed(() => {
    const c = this.c();
    if (!c || !this.auth.esAdmin()) return false;
    if (c.estadoSunat === 'RECHAZADO') return true;
    if (!this.esValido()) return false;
    const dias = (Date.now() - new Date(c.fechaEmision + 'T00:00:00').getTime()) / 86400000;
    return dias <= 8 && !c.notas.length;
  });

  constructor() {
    // La ruta se reutiliza al saltar entre un comprobante y sus notas: recarga cuando cambia el id.
    effect(() => {
      this.id();
      untracked(() => {
        this.c.set(null);
        this.cargar();
      });
    });
  }

  protected async cargar() {
    try {
      this.c.set(await this.api.get<Comprobante>(`/comprobantes/${this.id()}`));
      this.api.get<Envio[]>(`/comprobantes/${this.id()}/envios`).then((e) => this.envios.set(e)).catch(() => {});
    } catch (e) {
      this.toast.error(mensajeError(e));
      this.router.navigateByUrl('/app/comprobantes');
    }
  }

  protected nombreTipo(t: keyof typeof NOMBRE_TIPO) {
    return NOMBRE_TIPO[t];
  }

  protected imprimir() {
    imprimir(this.formato());
  }

  protected whatsapp(c: Comprobante) {
    compartirWhatsapp(c);
  }

  /** Envía el comprobante (con su XML y CDR) al correo del cliente, o al que se escriba. */
  protected async enviarCorreo(c: Comprobante) {
    const email = prompt('¿A qué correo lo enviamos?', c.clienteEmail ?? '');
    if (email === null) return;
    try {
      const r = await this.api.post<{ enviado: boolean; email: string | null; motivo: string | null }>(`/comprobantes/${c.id}/correo`, { email: email.trim() || null });
      if (r.enviado) this.toast.ok(`Enviado a ${r.email}`);
      else this.toast.error(r.motivo ?? 'No se pudo enviar.');
    } catch (e) {
      this.toast.error(mensajeError(e));
    }
  }

  protected async copiar(c: Comprobante) {
    if (await copiarEnlace(c)) this.toast.ok('Enlace copiado. Pégalo donde quieras.');
    else this.toast.error('No se pudo copiar el enlace.');
  }

  protected descargar(que: 'xml' | 'cdr') {
    this.api.descargar(`/comprobantes/${this.id()}/${que}`).catch((e) => this.toast.error(mensajeError(e)));
  }

  protected async accion<T>(fn: () => Promise<T>, ok: string) {
    this.ocupado.set(true);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'numero' in r) this.c.set(r as unknown as Comprobante);
      this.toast.ok(ok);
      return r;
    } catch (e) {
      this.toast.error(mensajeError(e));
      return null;
    } finally {
      this.ocupado.set(false);
    }
  }

  protected async reenviar() {
    const r = await this.accion(() => this.api.post<Comprobante>(`/comprobantes/${this.id()}/reenviar`), 'Listo, lo enviamos otra vez a SUNAT.');
    if (r) this.cargar();
  }

  protected abrirCobro(c: Comprobante) {
    this.cobro = { metodo: 'EFECTIVO', monto: c.saldo, referencia: '' };
    this.cobroAbierto.set(true);
  }

  protected async cobrar() {
    const r = await this.accion(() => this.api.post<Comprobante>(`/comprobantes/${this.id()}/pagos`, this.cobro), '¡Cobro registrado, caserito!');
    if (r) this.cobroAbierto.set(false);
  }

  protected async anular() {
    if (!this.motivoAnulacion.trim()) return this.toast.error('Cuéntanos por qué lo anulas.');
    const r = await this.accion(() => this.api.post<Comprobante>(`/comprobantes/${this.id()}/anular`, { motivo: this.motivoAnulacion.trim() }),
      'Anulación enviada a SUNAT.');
    if (r) {
      this.anularAbierto.set(false);
      this.cargar();
    }
  }

  protected abrirNota(tipo: '07' | '08') {
    const c = this.c()!;
    this.notaTipo.set(tipo);
    this.motivo.set('01');
    this.motivoDescripcion = '';
    this.itemsNota.set(tipo === '07'
      ? c.detalles.map((d) => ({ incluir: true, descripcion: d.descripcion, unidadMedida: d.unidadMedida, cantidad: d.cantidad,
          precioUnitario: d.precioUnitario, tipoAfectacion: d.tipoAfectacion, productoId: d.productoId, codigo: d.codigo }))
      : [{ incluir: true, descripcion: '', unidadMedida: 'ZZ', cantidad: 1, precioUnitario: 0, tipoAfectacion: '10' }]);
    this.notaAbierta.set(true);
  }

  protected otroConcepto() {
    this.itemsNota.update((l) => [...l, { incluir: true, descripcion: '', unidadMedida: 'ZZ', cantidad: 1, precioUnitario: 0, tipoAfectacion: '10' }]);
  }

  protected tocarItem(i: number, cambio: Partial<ItemNota>) {
    this.itemsNota.update((l) => l.map((x, j) => (j === i ? { ...x, ...cambio } : x)));
  }

  protected async emitirNota() {
    const descripcion = this.motivoDescripcion.trim() || this.motivosNota().find((m) => m.codigo === this.motivo())?.nombre || '';
    const items = this.esTotal() ? undefined
      : this.itemsNota().filter((i) => i.incluir && i.cantidad > 0 && i.precioUnitario > 0 && i.descripcion.trim())
          .map(({ incluir: _, ...resto }) => resto);
    if (items && !items.length) return this.toast.error('Indica al menos un ítem con monto.');
    const r = await this.accion(() => this.api.post<Comprobante>(`/comprobantes/${this.id()}/notas`, {
      tipo: this.notaTipo(), motivoCodigo: this.motivo(), motivoDescripcion: descripcion, items,
    }), this.notaTipo() === '07' ? '¡Nota de crédito emitida!' : '¡Nota de débito emitida!');
    if (r) {
      this.notaAbierta.set(false);
      this.router.navigate(['/app/comprobantes', (r as Comprobante).id]);
    }
  }
}
