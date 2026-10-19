import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { mensajeError } from '../../core/api.service';
import { Auth } from '../../core/auth.service';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'at-ingresar',
  imports: [FormsModule, RouterLink, LogoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-layout.css',
  template: `
    <main class="auth">
      <section class="lado-marca">
        <a routerLink="/" aria-label="Al Toque, inicio"><at-logo [tam]="40" /></a>
        <div class="col">
          <h1 class="display">¡Habla,<br />caserito!</h1>
          <p>Entra y sigue facturando al toque. Tus boletas, facturas y el cuadre del día te esperan.</p>
        </div>
        <span class="mono mini sec">Facturación electrónica SUNAT · altoquepe.site</span>
      </section>

      <section class="lado-form">
        <form class="form-caja" (ngSubmit)="entrar()" novalidate>
          <h2 class="display">Ingresa</h2>
          @if (vencida) {
            <div class="aviso aviso-amarillo">Tu sesión venció. Vuelve a ingresar, pe.</div>
          }
          @if (error()) {
            <div class="aviso aviso-magenta" role="alert">{{ error() }}</div>
          }
          <div class="campo">
            <label for="email">Correo</label>
            <input id="email" name="email" class="input" type="email" autocomplete="email" required [(ngModel)]="email" />
          </div>
          <div class="campo">
            <label for="clave">Contraseña</label>
            <input id="clave" name="clave" class="input" type="password" autocomplete="current-password" required [(ngModel)]="password" />
          </div>
          <button class="btn btn-tinta btn-grande btn-bloque" type="submit" [disabled]="cargando()">
            {{ cargando() ? 'Entrando…' : 'Entrar al toque' }}
          </button>
          <div class="demo">
            <span>¿Solo quieres mirar? Prueba con el negocio demo.</span>
            <button type="button" class="btn btn-chico btn-borde" (click)="usarDemo()">Usar demo</button>
          </div>
          <p class="pie-form">¿Aún no tienes cuenta? <a routerLink="/registro"><strong>Créala gratis</strong></a></p>
        </form>
      </section>
    </main>
  `,
})
export class IngresarComponent {
  private auth = inject(Auth);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected email = '';
  protected password = '';
  protected cargando = signal(false);
  protected error = signal<string | null>(null);
  protected vencida = this.route.snapshot.queryParamMap.has('vencida');

  protected usarDemo() {
    this.email = 'demo@altoque.pe';
    this.password = 'altoque123';
    this.entrar();
  }

  protected async entrar() {
    if (!this.email || !this.password) {
      this.error.set('Escribe tu correo y tu contraseña.');
      return;
    }
    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.auth.ingresar(this.email.trim(), this.password);
      const volver = this.route.snapshot.queryParamMap.get('volver');
      this.router.navigateByUrl(volver && volver.startsWith('/app') ? volver : '/app');
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }
}
