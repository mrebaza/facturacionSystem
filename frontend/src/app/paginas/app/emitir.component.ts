import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { CatalogosService } from '../../core/catalogos.service';
import { CantidadPipe, SolesPipe, hoyIso, sumarDias } from '../../core/formato';
import { Cliente, Comprobante, MetodoPago, NOMBRE_METODO, Pagina, Producto } from '../../core/modelos';
import { ToastService } from '../../core/toast.service';
import { ComprobanteDocComponent, imprimir } from '../../shared/comprobante-doc.component';
import { IconoComponent } from '../../shared/icono.component';
import { ModalComponent } from '../../shared/modal.component';
import { compartirWhatsapp } from './compartir';

interface Linea {
  clave: number;
  productoId?: number;
  codigo?: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  precio: number;
  tipoAfectacion: string;
  icbper: boolean;
}

interface Serie {
  id: number;
  tipo: string;
  serie: string;
  activo: boolean;
}

const IGV = 0.18;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Component({
  selector: 'at-emitir',
  imports: [FormsModule, RouterLink, SolesPipe, CantidadPipe, IconoComponent, ModalComponent, ComprobanteDocComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './emitir.component.html',
  styleUrl: './emitir.component.css',
})
export class EmitirComponent {
  private api = inject(Api);
  private router = inject(Router);
  private toast = inject(ToastService);
  protected auth = inject(Auth);
  protected cat = inject(CatalogosService);

  protected readonly metodos: MetodoPago[] = ['EFECTIVO', 'YAPE', 'PLIN', 'TARJETA', 'TRANSFERENCIA'];
  protected readonly nombreMetodo = NOMBRE_METODO;

  // tipo y serie
  /** Llegó desde «Nueva cotización»: el botón principal es guardar la cotización. */
  protected readonly modoCotizacion = inject(ActivatedRoute).snapshot.queryParamMap.get('modo') === 'cotizacion';

  protected tipo = signal<'01' | '03'>((inject(ActivatedRoute).snapshot.queryParamMap.get('tipo') as '01' | '03') === '01' ? '01' : '03');
  protected series = signal<Serie[]>([]);
  protected serieId = signal<number | null>(null);
  protected seriesDelTipo = computed(() => this.series().filter((s) => s.tipo === this.tipo() && s.activo));

  // catálogo
  protected productos = signal<Producto[]>([]);
  protected categorias = computed(() => [...new Set(this.productos().map((p) => p.categoria).filter((c): c is string => !!c))].sort());
  protected categoria = signal<string | null>(null);
  protected busqueda = signal('');
  protected visibles = computed(() => {
    const q = this.busqueda().trim().toLowerCase();
    const c = this.categoria();
    return this.productos().filter(
      (p) => p.activo && (!c || p.categoria === c) && (!q || p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().startsWith(q)),
    );
  });
  protected cargandoProductos = signal(true);

  // carrito
  protected lineas = signal<Linea[]>([]);
  private siguienteClave = 1;
  protected vista = signal<'catalogo' | 'pedido'>('catalogo');
  protected totales = computed(() => {
    let gravado = 0, exonerado = 0, inafecto = 0, igv = 0, icbper = 0;
    for (const l of this.lineas()) {
      const bruto = r2(l.cantidad * l.precio);
      if (l.tipoAfectacion === '10') {
        const valor = r2((l.cantidad * l.precio) / (1 + IGV));
        gravado += valor;
        igv += bruto - valor;
      } else if (l.tipoAfectacion === '20') exonerado += bruto;
      else inafecto += bruto;
      if (l.icbper) icbper += Math.floor(l.cantidad) * 0.5;
    }
    const total = r2(gravado + exonerado + inafecto + igv + icbper);
    return { gravado: r2(gravado), exonerado: r2(exonerado), inafecto: r2(inafecto), igv: r2(igv), icbper: r2(icbper), total };
  });
  protected unidades = computed(() => this.lineas().reduce((a, l) => a + l.cantidad, 0));

  // detracción (SPOT): solo factura de más de S/ 700
  protected detraccionCodigo = signal('');
  protected aplicaDetraccion = computed(() => this.tipo() === '01' && this.totales().total > 700);
  protected detraccion = computed(() => {
    if (!this.aplicaDetraccion() || !this.detraccionCodigo()) return null;
    const bien = this.cat.datos().detracciones.find((d) => d.codigo === this.detraccionCodigo());
    if (!bien) return null;
    // Se deposita en soles enteros
    return { ...bien, monto: Math.round((this.totales().total * bien.porcentaje) / 100) };
  });
  /** Lo que el cliente paga al negocio (el total menos la detracción). */
  protected neto = computed(() => r2(this.totales().total - (this.detraccion()?.monto ?? 0)));

  // cliente
  protected clienteAbierto = signal(false);
  protected tipoDoc = '1';
  protected numDoc = '';
  protected nombre = '';
  protected direccion = '';
  protected telefono = '';
  protected email = '';
  protected guardarCliente = true;
  protected clienteId: number | null = null;
  protected buscandoCliente = signal(false);
  protected sugerencias = signal<Cliente[]>([]);
  protected clienteResumen = signal<string | null>(null);

  // pago
  protected formaPago = signal<'CONTADO' | 'CREDITO'>('CONTADO');
  protected metodo = signal<MetodoPago>('EFECTIVO');
  protected recibido = signal<number | null>(null);
  protected referencia = '';
  protected adelanto = signal<number>(0);
  protected numCuotas = signal(1);
  protected primerVencimiento = signal(sumarDias(hoyIso(), 30));
  protected observaciones = '';
  protected verObs = signal(false);
  protected vuelto = computed(() => {
    const r = this.recibido();
    return r && r > this.neto() ? r2(r - this.neto()) : 0;
  });

  // ítem libre
  protected libreAbierto = signal(false);
  protected libre = { descripcion: '', precio: null as number | null, cantidad: 1, unidadMedida: 'NIU', tipoAfectacion: '10' };

  // edición de precio
  protected editando = signal<number | null>(null);

  // resultado
  protected emitiendo = signal(false);
  protected error = signal<string | null>(null);
  protected emitido = signal<Comprobante | null>(null);

  constructor() {
    this.api.get<Pagina<Producto>>('/productos', { soloActivos: true, tamano: 200 })
      .then((p) => this.productos.set(p.content))
      .catch(() => {})
      .finally(() => this.cargandoProductos.set(false));
    this.api.get<Serie[]>('/series').then((s) => this.series.set(s)).catch(() => {});
    if (this.tipo() === '01') {
      this.clienteAbierto.set(true);
      this.tipoDoc = '6';
    }
  }

  // ------------------------------------------------------------------ tipo

  protected cambiarTipo(t: '01' | '03') {
    this.tipo.set(t);
    this.serieId.set(null);
    if (t === '01') {
      this.clienteAbierto.set(true);
      if (this.tipoDoc !== '6') this.limpiarCliente('6');
    } else {
      this.formaPago.set('CONTADO');
    }
    this.router.navigate([], { queryParams: { tipo: t }, replaceUrl: true });
  }

  // ------------------------------------------------------------------ carrito

  protected agregar(p: Producto) {
    this.lineas.update((ls) => {
      const i = ls.findIndex((l) => l.productoId === p.id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, cantidad: l.cantidad + 1 } : l));
      return [...ls, { clave: this.siguienteClave++, productoId: p.id, codigo: p.codigo, descripcion: p.nombre, unidadMedida: p.unidadMedida,
        cantidad: 1, precio: p.precio, tipoAfectacion: p.tipoAfectacion, icbper: p.aplicaIcbper }];
    });
  }

  protected cantidadEn(p: Producto) {
    return this.lineas().find((l) => l.productoId === p.id)?.cantidad ?? 0;
  }

  protected cambiarCantidad(clave: number, delta: number) {
    this.lineas.update((ls) =>
      ls.map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(0, r2(l.cantidad + delta)) } : l)).filter((l) => l.cantidad > 0),
    );
  }

  protected fijarCantidad(clave: number, valor: number | string) {
    const n = Number(valor);
    if (!isFinite(n)) return;
    this.lineas.update((ls) => ls.map((l) => (l.clave === clave ? { ...l, cantidad: Math.max(0, Math.round(n * 1000) / 1000) } : l)));
  }

  protected fijarPrecio(clave: number, valor: number | string) {
    const n = Number(valor);
    if (!isFinite(n) || n <= 0) return;
    this.lineas.update((ls) => ls.map((l) => (l.clave === clave ? { ...l, precio: r2(n) } : l)));
  }

  protected quitar(clave: number) {
    this.lineas.update((ls) => ls.filter((l) => l.clave !== clave));
  }

  protected agregarLibre() {
    const l = this.libre;
    if (!l.descripcion.trim() || !l.precio || l.precio <= 0 || !l.cantidad || l.cantidad <= 0) {
      this.toast.error('Pon descripción, precio y cantidad.');
      return;
    }
    this.lineas.update((ls) => [...ls, { clave: this.siguienteClave++, descripcion: l.descripcion.trim(), unidadMedida: l.unidadMedida,
      cantidad: l.cantidad, precio: r2(l.precio!), tipoAfectacion: l.tipoAfectacion, icbper: false }]);
    this.libre = { descripcion: '', precio: null, cantidad: 1, unidadMedida: 'NIU', tipoAfectacion: '10' };
    this.libreAbierto.set(false);
  }

  // ------------------------------------------------------------------ cliente

  protected limpiarCliente(tipo = this.tipo() === '01' ? '6' : '1') {
    this.tipoDoc = tipo;
    this.numDoc = this.nombre = this.direccion = this.telefono = this.email = '';
    this.clienteId = null;
    this.clienteResumen.set(null);
    this.sugerencias.set([]);
  }

  protected quitarCliente() {
    this.limpiarCliente();
    this.clienteAbierto.set(false);
  }

  protected async alEscribirDoc() {
    const texto = this.numDoc.trim();
    this.clienteId = null;
    if (/[a-záéíóúñ]/i.test(texto) && texto.length >= 2) {
      const r = await this.api.get<Pagina<Cliente>>('/clientes', { q: texto, tamano: 5 }).catch(() => null);
      this.sugerencias.set(r?.content ?? []);
      return;
    }
    this.sugerencias.set([]);
    const completo = (this.tipoDoc === '1' && /^\d{8}$/.test(texto)) || (this.tipoDoc === '6' && /^\d{11}$/.test(texto));
    if (!completo) return;
    this.buscandoCliente.set(true);
    try {
      const guardado = await this.api.get<Cliente>(`/clientes/documento/${this.tipoDoc}/${texto}`).catch(() => null);
      if (guardado) {
        this.usarCliente(guardado);
        return;
      }
      const ruta = this.tipoDoc === '1' ? `/consulta/dni/${texto}` : `/consulta/ruc/${texto}`;
      const r = await this.api.get<{ nombre?: string; razonSocial?: string; direccion?: string }>(ruta).catch(() => null);
      if (r) {
        this.nombre = r.nombre ?? r.razonSocial ?? this.nombre;
        if (r.direccion) this.direccion = r.direccion;
      }
    } finally {
      this.buscandoCliente.set(false);
    }
  }

  protected usarCliente(c: Cliente) {
    this.clienteId = c.id;
    this.tipoDoc = c.tipoDocumento;
    this.numDoc = c.numeroDocumento;
    this.nombre = c.nombre;
    this.direccion = c.direccion ?? '';
    this.telefono = c.telefono ?? '';
    this.email = c.email ?? '';
    this.sugerencias.set([]);
    this.clienteResumen.set(`${c.nombre} · ${this.cat.nombreDoc(c.tipoDocumento)} ${c.numeroDocumento}`);
  }

  // ------------------------------------------------------------------ emitir

  protected async emitir() {
    this.error.set(null);
    const t = this.totales();
    if (!this.lineas().length) return this.fallar('Agrega al menos un producto, pe.');
    const conCliente = this.clienteAbierto() && (this.numDoc.trim() || this.clienteId);
    if (this.tipo() === '01' && (!conCliente || this.tipoDoc !== '6')) return this.fallar('Falta el RUC, pe. Complétalo y seguimos.');
    if (this.tipo() === '03' && !conCliente && t.total >= 700) return this.fallar('Desde S/ 700 la boleta necesita el DNI del cliente.');
    if (conCliente && !this.nombre.trim()) return this.fallar('Falta el nombre del cliente.');

    let pagos: { metodo: MetodoPago; monto: number; referencia?: string }[] = [];
    let cuotas: { monto: number; fechaVencimiento: string }[] | undefined;
    if (this.formaPago() === 'CONTADO') {
      if (this.metodo() === 'EFECTIVO' && this.recibido() && this.recibido()! < this.neto()) return this.fallar('Lo recibido no alcanza para el total.');
      pagos = [{ metodo: this.metodo(), monto: this.neto(), referencia: this.referencia || undefined }];
    } else {
      const adelanto = r2(this.adelanto() || 0);
      if (adelanto >= this.neto()) return this.fallar('Si paga todo hoy, emítela al contado.');
      if (adelanto > 0) pagos = [{ metodo: this.metodo(), monto: adelanto, referencia: this.referencia || undefined }];
      const saldo = r2(this.neto() - adelanto);
      const n = Math.max(1, Math.min(24, this.numCuotas()));
      const base = Math.floor((saldo / n) * 100) / 100;
      cuotas = Array.from({ length: n }, (_, i) => ({
        monto: i === n - 1 ? r2(saldo - base * (n - 1)) : base,
        fechaVencimiento: sumarDias(this.primerVencimiento(), 30 * i),
      }));
    }

    this.emitiendo.set(true);
    try {
      const c = await this.api.post<Comprobante>('/comprobantes', {
        tipo: this.tipo(),
        serieId: this.serieId(),
        cliente: conCliente
          ? { id: this.clienteId, tipoDocumento: this.tipoDoc, numeroDocumento: this.numDoc.trim(), nombre: this.nombre.trim(),
              direccion: this.direccion.trim() || null, telefono: this.telefono.trim() || null, email: this.email.trim() || null,
              guardar: this.guardarCliente }
          : null,
        items: this.lineas().map((l) => ({ productoId: l.productoId, codigo: l.codigo, descripcion: l.descripcion, unidadMedida: l.unidadMedida,
          cantidad: l.cantidad, precioUnitario: l.precio, tipoAfectacion: l.tipoAfectacion, icbper: l.icbper })),
        formaPago: this.formaPago(),
        cuotas,
        pagos,
        detraccion: this.detraccion() ? { codigo: this.detraccion()!.codigo } : null,
        observaciones: this.observaciones.trim() || null,
      });
      this.emitido.set(c);
      this.auth.refrescar();
    } catch (e) {
      this.fallar(mensajeError(e));
    } finally {
      this.emitiendo.set(false);
    }
  }

  /** Guarda el pedido como cotización (no va a SUNAT) y abre la cotización para compartirla. */
  protected async guardarCotizacion() {
    this.error.set(null);
    if (!this.lineas().length) return this.fallar('Agrega al menos un producto, pe.');
    const conCliente = this.clienteAbierto() && (this.numDoc.trim() || this.clienteId);
    if (conCliente && !this.nombre.trim()) return this.fallar('Falta el nombre del cliente.');
    this.emitiendo.set(true);
    try {
      const c = await this.api.post<{ id: number; numero: string }>('/cotizaciones', {
        cliente: conCliente
          ? { id: this.clienteId, tipoDocumento: this.tipoDoc, numeroDocumento: this.numDoc.trim(), nombre: this.nombre.trim(),
              direccion: this.direccion.trim() || null, telefono: this.telefono.trim() || null, email: this.email.trim() || null }
          : this.telefono.trim() || this.nombre.trim()
            ? { nombre: this.nombre.trim() || null, telefono: this.telefono.trim() || null, email: this.email.trim() || null }
            : null,
        items: this.lineas().map((l) => ({ productoId: l.productoId, codigo: l.codigo, descripcion: l.descripcion, unidadMedida: l.unidadMedida,
          cantidad: l.cantidad, precioUnitario: l.precio, tipoAfectacion: l.tipoAfectacion, icbper: l.icbper })),
        diasValidez: 7,
        observaciones: this.observaciones.trim() || null,
      });
      this.toast.ok(`Cotización ${c.numero} guardada`);
      this.router.navigate(['/app/cotizaciones', c.id]);
    } catch (e) {
      this.fallar(mensajeError(e));
    } finally {
      this.emitiendo.set(false);
    }
  }

  protected nuevaVenta() {
    this.emitido.set(null);
    this.lineas.set([]);
    this.recibido.set(null);
    this.referencia = '';
    this.observaciones = '';
    this.adelanto.set(0);
    this.metodo.set('EFECTIVO');
    this.vista.set('catalogo');
    if (this.tipo() === '03') this.quitarCliente();
    else this.limpiarCliente('6');
  }

  protected imprimirTicket() {
    imprimir('ticket');
  }

  protected whatsapp(c: Comprobante) {
    compartirWhatsapp(c, this.telefono);
  }

  protected verDetalle(c: Comprobante) {
    this.router.navigate(['/app/comprobantes', c.id]);
  }

  private fallar(m: string) {
    this.error.set(m);
    this.toast.error(m);
    if (window.innerWidth < 900) this.vista.set('pedido');
  }
}
