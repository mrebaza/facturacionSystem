// Cotizaciones y compras: formas de la API.

export type EstadoCotizacion = 'ABIERTA' | 'ACEPTADA' | 'RECHAZADA' | 'FACTURADA';

export interface CotizacionItem {
  item: number;
  productoId: number | null;
  codigo: string | null;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  precioUnitario: number;
  tipoAfectacion: string;
  icbper: boolean;
  total: number;
}

export interface Cotizacion {
  id: number;
  numero: string;
  estado: EstadoCotizacion;
  vencida: boolean;
  fechaEmision: string;
  validaHasta: string;
  clienteTipoDoc: string;
  clienteNumDoc: string;
  clienteNombre: string;
  clienteDireccion: string | null;
  clienteEmail: string | null;
  clienteTelefono: string | null;
  moneda: string;
  totalGravado: number;
  totalExonerado: number;
  totalInafecto: number;
  totalIgv: number;
  totalIcbper: number;
  total: number;
  observaciones: string | null;
  comprobanteId: number | null;
  comprobanteNumero: string | null;
  tokenPublico: string;
  vendedor: string;
  empresaNombre: string;
  empresaRuc: string;
  empresaDireccion: string;
  empresaTelefono: string | null;
  items: CotizacionItem[];
  createdAt: string;
}

export const ESTADO_COTIZACION: Record<EstadoCotizacion, { texto: string; clase: string }> = {
  ABIERTA: { texto: 'Enviada', clase: 'chip-amarillo' },
  ACEPTADA: { texto: 'Aceptada', clase: 'chip-verde' },
  RECHAZADA: { texto: 'Rechazada', clase: 'chip-magenta' },
  FACTURADA: { texto: 'Facturada', clase: 'chip-tinta' },
};

export type EstadoPagoCompra = 'PAGADO' | 'POR_PAGAR';

export interface Compra {
  id: number;
  fechaEmision: string;
  tipoDocumento: string;
  tipoNombre: string;
  serie: string;
  numero: string;
  proveedorTipoDoc: string;
  proveedorNumDoc: string;
  proveedorNombre: string;
  categoria: string;
  baseImponible: number;
  igv: number;
  noGravado: number;
  total: number;
  estadoPago: EstadoPagoCompra;
  fechaVencimiento: string | null;
  observaciones: string | null;
  creditoFiscal: boolean;
}

export interface ResumenTributario {
  periodo: string;
  ventasBase: number;
  ventasIgv: number;
  ventasTotal: number;
  comprobantes: number;
  comprasBase: number;
  comprasIgv: number;
  comprasTotal: number;
  compras: number;
  igvPorPagar: number;
  saldoAFavor: number;
  porPagarProveedores: number;
  gastoPorCategoria: Record<string, number>;
  utilidadEstimada: number;
}

export const TIPOS_COMPRA: { codigo: string; nombre: string }[] = [
  { codigo: '01', nombre: 'Factura' },
  { codigo: '03', nombre: 'Boleta' },
  { codigo: '12', nombre: 'Ticket' },
  { codigo: '14', nombre: 'Recibo de servicios (luz, agua)' },
  { codigo: '07', nombre: 'Nota de crédito' },
  { codigo: '08', nombre: 'Nota de débito' },
  { codigo: '00', nombre: 'Otro' },
];

/** Abre WhatsApp con el enlace de la cotización. */
export function compartirCotizacion(c: Cotizacion): void {
  const enlace = `${location.origin}/cotizacion/${c.tokenPublico}`;
  const texto = `¡Hola! Te envío la cotización ${c.numero} de ${c.empresaNombre} por S/ ${c.total.toFixed(2)}, válida hasta el ${c.validaHasta.split('-').reverse().join('/')}. Puedes verla y aceptarla aquí: ${enlace}`;
  const tel = (c.clienteTelefono ?? '').replace(/\D/g, '');
  const numero = tel.length === 9 ? '51' + tel : tel;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
}
