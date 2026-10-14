import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { EmailService, MailboxConnectRequest, MailboxStatut } from '../../core/services/email.service';
import { ToastService } from '../../core/services/toast.service';
import { messageErreur } from './email-utils';

interface Fournisseur {
  cle: string;
  nom: string;
  aide: string;
  couleur: string;
}

/**
 * Connexion de la boîte personnelle de l'utilisateur (IMAP/SMTP), façon Bitrix24 :
 * choix du fournisseur, saisie e-mail + mot de passe (d'application pour Gmail),
 * et serveurs personnalisés pour « Autre (IMAP) ».
 */
@Component({
  selector: 'hd-mailbox-settings-slider',
  standalone: true,
  templateUrl: './mailbox-settings-slider.component.html',
  styleUrl: './mailbox-settings-slider.component.scss'
})
export class MailboxSettingsSliderComponent {
  private emailService = inject(EmailService);
  private toast = inject(ToastService);

  @Input() set statut(valeur: MailboxStatut | null) { this.etat.set(valeur); }
  /** Affichage intégré (rempli la zone) au lieu d'une modale centrée. */
  @Input() inline = false;
  @Output() fermer = new EventEmitter<void>();
  /** Émis après connexion/déconnexion : la boîte doit être rechargée. */
  @Output() change = new EventEmitter<void>();

  readonly etat = signal<MailboxStatut | null>(null);
  readonly fournisseur = signal<string | null>(null);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  readonly email = signal('');
  readonly motDePasse = signal('');
  readonly imapHost = signal('');
  readonly imapPort = signal(993);
  readonly smtpHost = signal('');
  readonly smtpPort = signal(587);

  readonly fournisseurs: Fournisseur[] = [
    { cle: 'gmail', nom: 'Gmail', aide: 'Activez la validation en 2 étapes puis créez un « mot de passe d\'application ».', couleur: '#ea4335' },
    { cle: 'outlook', nom: 'Outlook', aide: 'Connectez n\'importe quelle boîte Microsoft (professionnelle ou personnelle) en vous authentifiant directement chez Microsoft. Aucun mot de passe n\'est saisi dans HelpDesk.', couleur: '#0a66c2' }
  ];

  readonly estOutlook = computed(() => this.fournisseur() === 'outlook');
  readonly estPersonnalise = computed(() => this.fournisseur() === 'imap');
  readonly aideFournisseur = computed(() =>
    this.fournisseurs.find(f => f.cle === this.fournisseur())?.aide ?? '');

  choisir(cle: string) {
    this.fournisseur.set(cle);
    this.erreur.set(null);
  }

  /** Outlook : récupère l'URL Microsoft et redirige la page pour l'authentification (OAuth délégué). */
  connecterMicrosoft() {
    if (this.envoi()) return;
    this.envoi.set(true);
    this.erreur.set(null);
    this.emailService.urlOAuthBoite().subscribe({
      next: ({ url, state }) => {
        try { sessionStorage.setItem('hd_oauth_state', state); } catch { /* mode privé */ }
        window.location.href = url; // redirection vers Microsoft
      },
      error: e => {
        this.envoi.set(false);
        this.erreur.set(messageErreur(e, 'Impossible de démarrer la connexion Microsoft.'));
      }
    });
  }

  connecter() {
    if (this.envoi()) return;
    const email = this.email().trim();
    if (!email) {
      this.erreur.set('Renseignez votre adresse e-mail.');
      return;
    }
    if (!this.estOutlook() && !this.motDePasse()) {
      this.erreur.set('Renseignez votre mot de passe (d\'application pour Gmail).');
      return;
    }
    if (this.estPersonnalise() && (!this.imapHost().trim() || !this.smtpHost().trim())) {
      this.erreur.set('Renseignez les serveurs IMAP et SMTP.');
      return;
    }

    const req: MailboxConnectRequest = {
      provider: this.fournisseur()!,
      email,
      // Outlook/Microsoft 365 : aucun mot de passe (accès via l'application Graph).
      password: this.estOutlook() ? '' : this.motDePasse()
    };
    if (this.estPersonnalise()) {
      req.imapHost = this.imapHost().trim();
      req.imapPort = this.imapPort();
      req.imapSsl = this.imapPort() === 993;
      req.smtpHost = this.smtpHost().trim();
      req.smtpPort = this.smtpPort();
      req.smtpStartTls = this.smtpPort() !== 465;
    }

    this.envoi.set(true);
    this.erreur.set(null);
    this.emailService.connecterBoite(req).subscribe({
      next: statut => {
        this.etat.set(statut);
        this.envoi.set(false);
        this.motDePasse.set('');
        this.fournisseur.set(null);
        this.toast.succes('Boîte connectée', `${statut.email} est maintenant reliée à votre espace.`);
        this.change.emit();
      },
      error: e => {
        this.envoi.set(false);
        this.erreur.set(messageErreur(e, 'Connexion impossible. Vérifiez vos identifiants.'));
      }
    });
  }

  deconnecter() {
    if (this.envoi()) return;
    this.envoi.set(true);
    this.emailService.deconnecterBoite().subscribe({
      next: () => {
        this.envoi.set(false);
        this.etat.set({ connectee: false });
        this.toast.info('Boîte déconnectée', 'Vos identifiants ont été supprimés.');
        this.change.emit();
      },
      error: e => {
        this.envoi.set(false);
        this.toast.erreur('Déconnexion impossible', messageErreur(e, 'Réessayez.'));
      }
    });
  }
}
