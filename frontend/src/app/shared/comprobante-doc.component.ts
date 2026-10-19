import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CantidadPipe, FechaPipe, SolesPipe, HoraPipe } from '../core/formato';
import { Comprobante, Detalle, NOMBRE_METODO, NOMBRE_TIPO } from '../core/modelos';
import { LogoComponent } from './logo.component';

const DOCS: Record<string, string> = { '0': 'DOC', '1': 'DNI', '4': 'CE', '6': 'RUC', '7': 'PAS', A: 'CED' };

/** Representación impresa: ticket de 80 mm (ticketera térmica) o A4. */
@Component({
  selector: 'at-comprobante-doc',
  imports: [SolesPipe, FechaPipe, HoraPipe, CantidadPipe, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = comp();
    @if (formato() === 'ticket') {
      <article class="ticket doc-imprimible" [attr.aria-label]="c.tipoNombre + ' ' + c.numero">
        <div class="centro col-c">
          <at-logo variante="unatinta" [tam]="26" />
          <strong class="emp">{{ c.emisor.nombreComercial || c.emisor.razonSocial }}</strong>
          @if (c.emisor.nombreComercial) { <div>{{ c.emisor.razonSocial }}</div> }
          <div>RUC {{ c.emisor.ruc }}</div>
          <div>{{ c.emisor.direccion }}</div>
          <div>{{ c.emisor.distrito }} - {{ c.emisor.provincia }}</div>
          @if (c.emisor.telefono) { <div>Tel. {{ c.emisor.telefono }}</div> }
        </div>

        <div class="bloque centro">
          <strong>{{ c.tipoNombre.toUpperCase() }}</strong>
          <strong class="num">{{ c.numero }}</strong>
          <div>{{ c.fechaEmision | fecha }} · {{ c.horaEmision.substring(0, 5) }}</div>
        </div>

        <div class="bloque">
          @if (c.clienteTipoDoc === '0') {
            <div>Cliente: {{ c.clienteNombre }}</div>
          } @else {
            <div>{{ docCliente() }}: {{ c.clienteNumDoc }}</div>
            <div>{{ c.clienteNombre }}</div>
            @if (c.clienteDireccion) { <div>{{ c.clienteDireccion }}</div> }
          }
          @if (c.referencia) {
            <div class="sep-chica">Modifica: {{ nombreTipo(c.referencia.tipo) }} {{ c.referencia.numero }}</div>
            <div>Motivo: {{ c.motivoDescripcion }}</div>
          }
        </div>

        <div class="bloque items">
          @for (d of c.detalles; track d.item) {
            <div class="item">
              <span>{{ d.cantidad | cant }} x {{ d.descripcion }}</span>
              <span>{{ importe(d) }}</span>
            </div>
            @if (d.cantidad !== 1) { <div class="pu">  P.U. {{ d.precioUnitario.toFixed(2) }}</div> }
          }
        </div>

        <div class="bloque totales">
          @if (c.totalGravado > 0) { <div class="item"><span>Op. gravada</span><span>{{ c.totalGravado.toFixed(2) }}</span></div> }
          @if (c.totalExonerado > 0) { <div class="item"><span>Op. exonerada</span><span>{{ c.totalExonerado.toFixed(2) }}</span></div> }
          @if (c.totalInafecto > 0) { <div class="item"><span>Op. inafecta</span><span>{{ c.totalInafecto.toFixed(2) }}</span></div> }
          <div class="item"><span>IGV {{ c.igvPorcentaje }}%</span><span>{{ c.totalIgv.toFixed(2) }}</span></div>
          @if (c.totalIcbper > 0) { <div class="item"><span>ICBPER</span><span>{{ c.totalIcbper.toFixed(2) }}</span></div> }
          <div class="item total"><span>TOTAL</span><span>{{ c.total | soles: c.moneda }}</span></div>
          <div class="letras">SON: {{ c.totalLetras }}</div>
          @if (c.detraccion; as d) {
            <div class="letras">OPERACIÓN SUJETA AL SPOT · Detracción {{ d.porcentaje }}%: {{ d.monto.toFixed(2) }} · Cta. BN {{ d.cuentaBanco }}</div>
          }
        </div>

        <div class="bloque">
          <div>Forma de pago: {{ c.formaPago === 'CREDITO' ? 'Crédito' : 'Contado' }}</div>
          @for (p of c.pagos; track p.id) {
            <div class="item"><span>{{ metodo(p.metodo) }}</span><span>{{ p.monto.toFixed(2) }}</span></div>
          }
          @for (q of c.cuotas; track q.numero) {
            <div class="item"><span>Cuota {{ q.numero }} · vence {{ q.fechaVencimiento | fecha }}</span><span>{{ q.monto.toFixed(2) }}</span></div>
          }
          @if (c.observaciones) { <div>Obs.: {{ c.observaciones }}</div> }
          <div>Atendió: {{ c.vendedor }}</div>
        </div>

        <div class="bloque centro col-c">
          <img class="qr" [src]="qrUrl()" alt="Código QR del comprobante" width="96" height="96" />
          @if (c.hash) { <div class="hash">Hash: {{ c.hash }}</div> }
          <div class="mini-legal">Representación impresa de la {{ c.tipoNombre.toLowerCase() }}. Consúltala en {{ enlace() }}</div>
          @if (c.estadoSunat === 'ANULADO') { <strong class="anulado">ANULADO</strong> }
          @if (c.emisor.ambiente !== 'PRODUCCION') { <div class="mini-legal">Documento de prueba · sin valor tributario</div> }
          <div class="gracias display">{{ c.emisor.mensajeTicket }}</div>
        </div>
      </article>
      <svg class="zigzag" viewBox="0 0 300 12" preserveAspectRatio="none" aria-hidden="true">
        <path [attr.d]="zigzag" fill="#FFFFFF"></path>
      </svg>
    } @else {
      <article class="a4 doc-imprimible" [attr.aria-label]="c.tipoNombre + ' ' + c.numero">
        <header class="a4-cab">
          <div class="a4-emisor">
            <strong class="a4-nombre">{{ c.emisor.nombreComercial || c.emisor.razonSocial }}</strong>
            @if (c.emisor.nombreComercial) { <div>{{ c.emisor.razonSocial }}</div> }
            <div>{{ c.emisor.direccion }} · {{ c.emisor.distrito }}, {{ c.emisor.provincia }}</div>
            @if (c.emisor.telefono || c.emisor.email) { <div>{{ c.emisor.telefono }} {{ c.emisor.email }}</div> }
          </div>
          <div class="a4-caja">
            <div class="mono">RUC {{ c.emisor.ruc }}</div>
            <strong>{{ c.tipoNombre.toUpperCase() }}</strong>
            <div class="mono a4-num">{{ c.numero }}</div>
          </div>
        </header>

        <section class="a4-datos">
          <div><span class="lbl">Cliente</span>{{ c.clienteNombre }}</div>
          <div><span class="lbl">{{ docCliente() }}</span>{{ c.clienteTipoDoc === '0' ? '—' : c.clienteNumDoc }}</div>
          <div><span class="lbl">Fecha de emisión</span>{{ c.fechaEmision | fecha }} {{ c.horaEmision | hora }}</div>
          <div><span class="lbl">Dirección</span>{{ c.clienteDireccion || '—' }}</div>
          <div><span class="lbl">Moneda</span>{{ c.moneda === 'PEN' ? 'Soles' : c.moneda }}</div>
          <div><span class="lbl">Forma de pago</span>{{ c.formaPago === 'CREDITO' ? 'Crédito' : 'Contado' }}
            @if (c.fechaVencimiento) { · vence {{ c.fechaVencimiento | fecha }} }</div>
          @if (c.referencia) {
            <div><span class="lbl">Documento que modifica</span>{{ nombreTipo(c.referencia.tipo) }} {{ c.referencia.numero }}</div>
            <div><span class="lbl">Motivo</span>{{ c.motivoCodigo }} · {{ c.motivoDescripcion }}</div>
          }
        </section>

        <table class="a4-tabla">
          <thead><tr><th>Cant.</th><th>Und.</th><th>Descripción</th><th class="d">V. unit.</th><th class="d">P. unit.</th><th class="d">Importe</th></tr></thead>
          <tbody>
            @for (d of c.detalles; track d.item) {
              <tr>
                <td>{{ d.cantidad | cant }}</td><td>{{ d.unidadMedida }}</td>
                <td>{{ d.descripcion }}@if (d.tipoAfectacion !== '10') { <span class="afe"> ({{ d.tipoAfectacion === '20' ? 'exonerado' : 'inafecto' }})</span> }</td>
                <td class="d">{{ d.valorUnitario.toFixed(4) }}</td><td class="d">{{ d.precioUnitario.toFixed(2) }}</td><td class="d">{{ importe(d) }}</td>
              </tr>
            }
          </tbody>
        </table>

        <section class="a4-pie">
          <div class="a4-izq">
            <div class="letras"><span class="lbl">Son</span>{{ c.totalLetras }}</div>
            @if (c.detraccion; as d) {
              <div class="spot"><span class="lbl">Operación sujeta al SPOT</span>
                Sistema de Pago de Obligaciones Tributarias con el Gobierno Central. Bien/servicio {{ d.codigo }}{{ d.descripcion ? ' · ' + d.descripcion : '' }}.
                Detracción {{ d.porcentaje }}%: {{ d.monto | soles }} · Cta. Banco de la Nación {{ d.cuentaBanco }}. Neto a pagar: {{ c.netoACobrar | soles }}.
              </div>
            }
            @if (c.cuotas.length) {
              <div><span class="lbl">Cuotas</span>
                @for (q of c.cuotas; track q.numero) { <div>Cuota {{ q.numero }}: {{ q.monto | soles }} · vence {{ q.fechaVencimiento | fecha }}</div> }
              </div>
            }
            @if (c.observaciones) { <div><span class="lbl">Observaciones</span>{{ c.observaciones }}</div> }
            <div class="fila-qr">
              <img [src]="qrUrl()" alt="Código QR del comprobante" width="110" height="110" />
              <div class="mini-legal">
                Representación impresa de la {{ c.tipoNombre.toLowerCase() }}.<br />
                Consulta y descarga el XML en {{ enlace() }}
                @if (c.hash) { <br />Hash: {{ c.hash }} }
                @if (c.emisor.ambiente !== 'PRODUCCION') { <br /><strong>Documento de prueba · sin valor tributario</strong> }
              </div>
            </div>
          </div>
          <table class="a4-totales">
            @if (c.totalGravado > 0) { <tr><td>Op. gravada</td><td>{{ c.totalGravado | soles }}</td></tr> }
            @if (c.totalExonerado > 0) { <tr><td>Op. exonerada</td><td>{{ c.totalExonerado | soles }}</td></tr> }
            @if (c.totalInafecto > 0) { <tr><td>Op. inafecta</td><td>{{ c.totalInafecto | soles }}</td></tr> }
            <tr><td>IGV {{ c.igvPorcentaje }}%</td><td>{{ c.totalIgv | soles }}</td></tr>
            @if (c.totalIcbper > 0) { <tr><td>ICBPER</td><td>{{ c.totalIcbper | soles }}</td></tr> }
            <tr class="t"><td>Total</td><td>{{ c.total | soles: c.moneda }}</td></tr>
          </table>
        </section>
        @if (c.estadoSunat === 'ANULADO') { <div class="sello">ANULADO</div> }
        <footer class="a4-marca"><at-logo variante="unatinta" [tam]="16" /> <span>Emitido con Al Toque · altoquepe.site</span></footer>
      </article>
    }
  `,
  styles: `
    :host { display: block; }
    .ticket { width: 300px; max-width: 100%; margin: 0 auto; background: #fff; padding: 22px 18px 14px; font-family: var(--f-mono);
      font-size: 12px; line-height: 1.45; color: var(--tinta); display: flex; flex-direction: column; gap: 10px; word-break: break-word; }
    .zigzag { display: block; width: 300px; max-width: 100%; height: 12px; margin: 0 auto; }
    .col-c { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .emp { font-family: var(--f-texto); font-size: 16px; margin-top: 6px; }
    .bloque { border-top: 1px dashed var(--tinta); padding-top: 10px; display: flex; flex-direction: column; gap: 2px; }
    .num { font-size: 14px; }
    .item { display: flex; justify-content: space-between; gap: 10px; }
    .item span:last-child { white-space: nowrap; }
    .pu { color: var(--gris); font-size: 11px; white-space: pre; }
    .total { font-size: 17px; font-weight: 700; margin-top: 4px; }
    .letras { font-size: 11px; margin-top: 4px; }
    .sep-chica { margin-top: 6px; }
    .qr { width: 96px; height: 96px; image-rendering: pixelated; }
    .hash { font-size: 10px; word-break: break-all; }
    .mini-legal { font-size: 10px; color: var(--gris); overflow-wrap: anywhere; }
    .gracias { font-family: var(--f-texto); font-size: 18px; margin-top: 6px; line-height: 1.05; }
    .anulado { font-size: 18px; letter-spacing: .2em; color: var(--magenta); }

    .a4 { background: #fff; color: var(--tinta); width: 100%; max-width: 820px; margin: 0 auto; padding: 36px; font-size: 13px;
      display: flex; flex-direction: column; gap: 18px; position: relative; }
    .a4-cab { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; }
    .a4-nombre { font-size: 22px; font-weight: 900; font-stretch: 80%; display: block; margin-bottom: 4px; }
    .a4-caja { border: 2px solid var(--tinta); border-radius: 12px; padding: 12px 18px; text-align: center; display: flex;
      flex-direction: column; gap: 4px; min-width: 230px; }
    .a4-num { font-size: 18px; font-weight: 700; }
    .a4-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; background: var(--papel); border-radius: 12px; padding: 14px 16px; }
    .lbl { display: block; font-family: var(--f-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--gris); }
    .a4-tabla { width: 100%; border-collapse: collapse; }
    .a4-tabla th { font-family: var(--f-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .06em; text-align: left;
      border-bottom: 2px solid var(--tinta); padding: 6px 6px; }
    .a4-tabla td { border-bottom: 1px solid var(--linea); padding: 7px 6px; vertical-align: top; }
    .a4-tabla .d { text-align: right; font-family: var(--f-mono); white-space: nowrap; }
    .afe { color: var(--gris); font-size: 11px; }
    .a4-pie { display: flex; justify-content: space-between; gap: 24px; align-items: flex-start; }
    .a4-izq { display: flex; flex-direction: column; gap: 10px; flex: 1; min-width: 0; }
    .fila-qr { display: flex; gap: 12px; align-items: center; }
    .spot { font-size: 11px; border: 1px dashed var(--tinta); border-radius: 8px; padding: 8px 10px; }
    .fila-qr img { width: 110px; height: 110px; }
    .a4-totales { border-collapse: collapse; min-width: 240px; flex-shrink: 0; font-family: var(--f-mono); }
    .a4-totales td:last-child { white-space: nowrap; }
    .a4-totales td { padding: 4px 0; }
    .a4-totales td:last-child { text-align: right; padding-left: 20px; }
    .a4-totales .t td { border-top: 2px solid var(--tinta); font-weight: 700; font-size: 16px; padding-top: 8px; }
    .sello { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg); font-size: 72px; font-weight: 900;
      color: rgba(209, 18, 107, .22); border: 6px solid rgba(209, 18, 107, .22); padding: 0 24px; border-radius: 12px; pointer-events: none; }
    .a4-marca { display: flex; align-items: center; gap: 8px; justify-content: center; font-size: 11px; color: var(--gris); }
    @media (max-width: 640px) {
      .a4 { padding: 18px; }
      .a4-cab, .a4-pie { flex-direction: column; }
      .a4-caja { width: 100%; }
      .a4-datos { grid-template-columns: 1fr; }
      .a4-totales { width: 100%; }
    }
  `,
})
export class ComprobanteDocComponent {
  readonly comp = input.required<Comprobante>();
  readonly formato = input<'ticket' | 'a4'>('ticket');

  /** Importe de la línea sin el ICBPER: el impuesto a la bolsa va aparte en los totales. */
  protected importe(d: Detalle): string {
    return (d.total - (d.icbper ?? 0)).toFixed(2);
  }

  protected readonly qrUrl = computed(() => `/api/public/c/${this.comp().tokenPublico}/qr.svg`);
  protected readonly enlace = computed(() => `${location.host}/c/${this.comp().tokenPublico}`);
  protected readonly docCliente = computed(() => DOCS[this.comp().clienteTipoDoc] ?? 'DOC');
  protected readonly zigzag = (() => {
    let d = 'M0 0 H300 ';
    for (let x = 300; x > 0; x -= 15) d += `L${x - 7.5} 12 L${x - 15} 0 `;
    return d + 'Z';
  })();

  protected nombreTipo(t: keyof typeof NOMBRE_TIPO) {
    return NOMBRE_TIPO[t];
  }

  protected metodo(m: keyof typeof NOMBRE_METODO) {
    return NOMBRE_METODO[m];
  }
}

/** Imprime solo el documento, con el tamaño de papel correcto. */
export function imprimir(formato: 'ticket' | 'a4') {
  const estilo = document.createElement('style');
  estilo.textContent =
    (formato === 'ticket' ? '@page { size: 80mm auto; margin: 0; }' : '@page { size: A4; margin: 10mm; }') +
    ` @media print {
        body * { visibility: hidden !important; }
        .doc-imprimible, .doc-imprimible * { visibility: visible !important; }
        .doc-imprimible { position: absolute !important; left: 0; top: 0; box-shadow: none !important; ${formato === 'ticket' ? 'width: 72mm !important; padding: 2mm !important;' : 'max-width: none !important; padding: 0 !important;'} }
      }`;
  document.head.appendChild(estilo);
  setTimeout(() => {
    window.print();
    setTimeout(() => estilo.remove(), 500);
  }, 50);
}
