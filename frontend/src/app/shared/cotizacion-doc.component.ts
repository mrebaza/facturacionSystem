import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CantidadPipe, FechaPipe, SolesPipe } from '../core/formato';
import { Cotizacion } from '../core/ventas';

/** La cotización como documento: la ven el negocio y el cliente, y se imprime en A4. */
@Component({
  selector: 'at-cotizacion-doc',
  imports: [SolesPipe, CantidadPipe, FechaPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let x = c();
    <article class="doc tarjeta-plana">
      <header class="entre cab">
        <div>
          <strong class="emisor">{{ x.empresaNombre }}</strong>
          <div class="mini suave">RUC {{ x.empresaRuc }} · {{ x.empresaDireccion }}@if (x.empresaTelefono) { · {{ x.empresaTelefono }} }</div>
        </div>
        <div class="caja-num">
          <span class="mini">COTIZACIÓN</span>
          <strong class="mono">{{ x.numero }}</strong>
        </div>
      </header>
      <div class="datos chico">
        <div><span class="suave">Cliente:</span> {{ x.clienteNombre }}@if (x.clienteTipoDoc !== '0') { · {{ x.clienteTipoDoc === '6' ? 'RUC' : 'Doc.' }} {{ x.clienteNumDoc }} }</div>
        <div><span class="suave">Fecha:</span> {{ x.fechaEmision | fecha }} · <span class="suave">Válida hasta:</span> {{ x.validaHasta | fecha }}</div>
      </div>
      <table class="tabla">
        <thead><tr><th>Cant.</th><th>Descripción</th><th class="derecha">P. unit.</th><th class="derecha">Importe</th></tr></thead>
        <tbody>
          @for (i of x.items; track i.item) {
            <tr><td class="mono">{{ i.cantidad | cant }}</td><td>{{ i.descripcion }}</td><td class="derecha mono">{{ i.precioUnitario | soles }}</td><td class="derecha mono">{{ i.total | soles }}</td></tr>
          }
        </tbody>
      </table>
      <div class="totales mono">
        @if (x.totalGravado) { <div class="entre"><span>Op. gravada</span><span>{{ x.totalGravado | soles }}</span></div> }
        @if (x.totalExonerado) { <div class="entre"><span>Op. exonerada</span><span>{{ x.totalExonerado | soles }}</span></div> }
        @if (x.totalInafecto) { <div class="entre"><span>Op. inafecta</span><span>{{ x.totalInafecto | soles }}</span></div> }
        <div class="entre"><span>IGV</span><span>{{ x.totalIgv | soles }}</span></div>
        <div class="entre total"><strong>TOTAL</strong><strong>{{ x.total | soles }}</strong></div>
      </div>
      @if (x.observaciones) { <p class="chico">{{ x.observaciones }}</p> }
      <p class="mini suave">Precios incluyen IGV. Esta cotización no es un comprobante de pago. Atendido por {{ x.vendedor }}.</p>
    </article>
  `,
  styles: `
    .doc { display: flex; flex-direction: column; gap: 14px; }
    .cab { align-items: flex-start; }
    .emisor { font-size: 20px; }
    .caja-num { border: 2px solid var(--tinta); border-radius: 12px; padding: 8px 14px; display: flex; flex-direction: column; align-items: center; }
    .datos { display: flex; flex-direction: column; gap: 4px; }
    .totales { margin-left: auto; width: min(280px, 100%); display: flex; flex-direction: column; gap: 4px; }
    .total { border-top: 2px solid var(--tinta); padding-top: 6px; font-size: 18px; }
  `,
})
export class CotizacionDocComponent {
  readonly c = input.required<Cotizacion>();
}
