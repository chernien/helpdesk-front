import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'hd-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, LogoComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  /** Numero decoratif du billet d'acces (date du jour, facon ticket imprime). */
  readonly numeroBillet = new Date().toISOString().slice(2, 10).replace(/-/g, '');

  readonly chargement = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly motDePasseVisible = signal(false);

  readonly form = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]]
  });

  get username() { return this.form.controls.username; }
  get password() { return this.form.controls.password; }

  basculerVisibilite() {
    this.motDePasseVisible.update(v => !v);
  }

  soumettre() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.chargement.set(true);
    this.erreur.set(null);

    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => {
        const prenom = this.auth.prenomAffiche();
        this.toast.succes(prenom ? `Bienvenue, ${prenom}` : 'Bienvenue', 'Vous êtes connecté à votre espace support.');
        this.notifications.demarrer();
        const retour = this.route.snapshot.queryParamMap.get('retour') ?? '/tickets';
        this.router.navigateByUrl(retour);
      },
      error: (e) => {
        this.chargement.set(false);
        this.erreur.set(
          e.status === 401
            ? "Identifiants incorrects ou compte désactivé. Vérifiez votre email et votre mot de passe."
            : "Le serveur est injoignable. Vérifiez que l'API est démarrée, puis réessayez."
        );
      }
    });
  }
}
