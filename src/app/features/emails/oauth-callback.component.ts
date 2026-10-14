import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { EmailService } from '../../core/services/email.service';
import { ToastService } from '../../core/services/toast.service';
import { messageErreur } from './email-utils';

/**
 * Page de retour Microsoft (OAuth délégué) : reçoit le `code`, l'envoie au backend
 * pour finaliser la connexion de la boîte, puis redirige vers la boîte mail.
 */
@Component({
  selector: 'hd-oauth-callback',
  standalone: true,
  template: `
    <div class="oc-scene">
      <div class="oc-carte">
        @if (etat() === 'encours') {
          <span class="oc-spinner" aria-hidden="true"></span>
          <h1>Connexion de votre boîte…</h1>
          <p>Finalisation avec Microsoft, un instant.</p>
        } @else if (etat() === 'ok') {
          <div class="oc-ok" aria-hidden="true">✓</div>
          <h1>Boîte connectée</h1>
          <p>{{ email() }} est reliée à votre espace. Redirection…</p>
        } @else {
          <div class="oc-err" aria-hidden="true">!</div>
          <h1>Connexion impossible</h1>
          <p>{{ erreur() }}</p>
          <button type="button" class="oc-btn" (click)="retour()">Retour à la boîte mail</button>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: linear-gradient(135deg, #0b3a66 0%, #124a7e 46%, #0c3760 100%); }
    .oc-scene { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .oc-carte {
      width: min(420px, 100%); background: #fff; border-radius: 16px; padding: 40px 32px;
      text-align: center; box-shadow: 0 20px 60px rgba(4, 20, 40, .4);
      font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    }
    .oc-carte h1 { margin: 18px 0 6px; font-size: 20px; color: #1a2331; }
    .oc-carte p { margin: 0; font-size: 14px; color: #5a6472; }
    .oc-spinner {
      width: 40px; height: 40px; display: inline-block; border-radius: 50%;
      border: 4px solid #d6e2f0; border-top-color: #1769c0; animation: oc-spin .8s linear infinite;
    }
    @keyframes oc-spin { to { transform: rotate(360deg); } }
    .oc-ok, .oc-err { width: 52px; height: 52px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; font-size: 28px; font-weight: 700; color: #fff; }
    .oc-ok { background: #1bce7b; }
    .oc-err { background: #e5484d; }
    .oc-btn { margin-top: 18px; padding: 10px 18px; border: none; border-radius: 8px; background: #1769c0; color: #fff; font-weight: 600; font-size: 14px; cursor: pointer; }
    .oc-btn:hover { background: #1458a3; }
  `]
})
export class OAuthCallbackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private emailService = inject(EmailService);
  private toast = inject(ToastService);

  readonly etat = signal<'encours' | 'ok' | 'erreur'>('encours');
  readonly erreur = signal('');
  readonly email = signal('');

  ngOnInit() {
    const params = this.route.snapshot.queryParamMap;
    const code = params.get('code');
    const erreurMs = params.get('error_description') || params.get('error');

    if (erreurMs) {
      this.echec(erreurMs);
      return;
    }
    if (!code) {
      this.echec('Code d\'autorisation manquant dans la réponse de Microsoft.');
      return;
    }

    this.emailService.connecterOAuthBoite(code).subscribe({
      next: statut => {
        this.email.set(statut.email ?? '');
        this.etat.set('ok');
        this.toast.succes('Boîte connectée', `${statut.email} est maintenant reliée à votre espace.`);
        setTimeout(() => this.router.navigate(['/emails']), 1400);
      },
      error: e => this.echec(messageErreur(e, 'La connexion de la boîte a échoué.'))
    });
  }

  private echec(message: string) {
    this.erreur.set(message);
    this.etat.set('erreur');
  }

  retour() {
    this.router.navigate(['/emails']);
  }
}
