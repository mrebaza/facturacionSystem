import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Api, mensajeError } from '../../core/api.service';
import { FechaPipe } from '../../core/formato';
import { Cotizacion } from '../../core/ventas';
import { CotizacionDocComponent } from '../../shared/cotizacion-doc.component';

/** Lo que ve el cliente con el enlace: la cotización y dos botones para responder. */
@Component({
  selector: 'at-cotizacion-publica',
  imports: [FechaPipe, CotizacionDocComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pagina" style="max-width: 820px">
      @if (c(); as cot) {
        <at-cotizacion-doc [c]="cot" />
        @switch (cot.estado) {
          @case ('ABIERTA') {
            @if (cot.vencida) {
              <div class="aviso aviso-amarillo">Esta cotización venció el {{ cot.validaHasta | fecha }}. Pide una nueva a {{ cot.empresaNombre }}.</div>
            } @else {
              <div class="fila-wrap no-imprimir">
                <button type="button" class="btn btn-tinta btn-grande" [disabled]="ocupado()" (click)="responder(true)">Acepto la cotización</button>
                <button type="button" class="btn btn-borde" [disabled]="ocupado()" (click)="responder(false)">No, gracias</button>
                <button type="button" class="btn btn-fantasma" (click)="imprimir()">Imprimir</button>
              </div>
            }
          }
          @case ('ACEPTADA') { <div class="aviso aviso-verde">¡Gracias! {{ cot.empresaNombre }} ya sabe que aceptaste y te contactará.</div> }
          @case ('RECHAZADA') { <div class="aviso">Registramos tu respuesta. ¡Gracias por considerarnos!</div> }
          @case ('FACTURADA') { <div class="aviso aviso-verde">Esta cotización ya se convirtió en tu comprobante {{ cot.comprobanteNumero }}.</div> }
        }
        @if (error()) { <div class="aviso aviso-magenta">{{ error() }}</div> }
      } @else if (error()) {
        <div class="aviso aviso-magenta">{{ error() }}</div>
      } @else {
        <div class="esqueleto" style="height: 360px"></div>
      }
    </div>
  `,
})
export class CotizacionPublicaComponent {
  private api = inject(Api);
  readonly token = input.required<string>();
  protected c = signal<Cotizacion | null>(null);
  protected error = signal<string | null>(null);
  protected ocupado = signal(false);

  ngOnInit(): void {
    this.api.get<Cotizacion>(`/public/cotizaciones/${this.token()}`).then((c) => this.c.set(c)).catch((e) => this.error.set(mensajeError(e)));
  }

  protected async responder(acepta: boolean) {
    this.ocupado.set(true);
    this.error.set(null);
    try {
      this.c.set(await this.api.post<Cotizacion>(`/public/cotizaciones/${this.token()}/respuesta`, { acepta }));
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.ocupado.set(false);
    }
  }

  protected imprimir() {
    window.print();
  }
}
