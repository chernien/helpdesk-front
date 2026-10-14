import {
  Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild, computed, inject, signal
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { EmailDetail, EmailDossier, EmailService, EmailSummary } from '../../core/services/email.service';
import { ToastService } from '../../core/services/toast.service';
import { EmailCorpsComponent } from './email-corps.component';
import {
  adresses, couleurAvatar, formatDateLongue, formatTaille, initiale, initiales, messageErreur
} from './email-utils';

export type ModeRedaction = 'repondre' | 'tous' | 'transferer';

/** Ouverture d'un e-mail dans le panneau : un nouvel objet a chaque ouverture (clic, fleches…). */
export interface OuvertureEmail {
  resume: EmailSummary;
  mode: ModeRedaction | null;
}

/**
 * Panneau coulissant d'un e-mail (facon Divalto / Bitrix24) :
 * en-tete avec action principale, carte du message, reponse rapide.
 */
@Component({
  selector: 'hd-email-detail-slider',
  standalone: true,
  imports: [EmailCorpsComponent],
  templateUrl: './email-detail-slider.component.html',
  styleUrl: './email-detail-slider.component.scss'
})
export class EmailDetailSliderComponent {
  private emailService = inject(EmailService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private hote = inject(ElementRef<HTMLElement>);

  @ViewChild('zoneTexte') zoneTexte?: ElementRef<HTMLTextAreaElement>;

  readonly couleurAvatar = couleurAvatar;
  readonly initiale = initiale;
  readonly initiales = initiales;
  readonly formatDateLongue = formatDateLongue;
  readonly formatTaille = formatTaille;

  readonly resume = signal<EmailSummary | null>(null);
  readonly detail = signal<EmailDetail | null>(null);
  private readonly dossierActif = signal<EmailDossier | null>(null);
  private readonly dossiersListe = signal<EmailDossier[]>([]);

  @Input() set ouverture(o: OuvertureEmail) {
    this.resume.set(o.resume);
    this.menuPlus.set(false);
    this.fermerRedaction();
    if (o.mode) this.ouvrirRedaction(o.mode);
  }
  @Input() set email(e: EmailDetail | null) { this.detail.set(e); }
  @Input() set dossiers(d: EmailDossier[]) { this.dossiersListe.set(d); }
  @Input() set dossier(d: EmailDossier | null) { this.dossierActif.set(d); }
  @Input() aPrecedent = false;
  @Input() aSuivant = false;
  @Input() peutCreerTicket = false;
  /** Un autre panneau (creation de ticket) est ouvert par-dessus. */
  @Input() derriere = false;

  @Output() fermer = new EventEmitter<void>();
  @Output() naviguer = new EventEmitter<-1 | 1>();
  @Output() creerTicket = new EventEmitter<void>();
  @Output() voirTicket = new EventEmitter<number>();
  /** Deplacement demande (ID de dossier ou nom connu : junkemail, deleteditems, inbox). */
  @Output() deplacer = new EventEmitter<string>();
  @Output() marquerNonLu = new EventEmitter<void>();

  readonly menuPlus = signal(false);
  readonly mode = signal<ModeRedaction | null>(null);
  readonly texte = signal('');
  readonly destinataires = signal('');
  readonly envoi = signal(false);

  readonly titre = computed(() => this.detail()?.objet || this.resume()?.objet || '(Sans objet)');
  readonly expediteur = computed(() => {
    const e = this.detail() ?? this.resume();
    return e?.de || e?.deEmail || '(Inconnu)';
  });
  readonly estSpam = computed(() => this.dossierActif()?.cle === 'junkemail');
  readonly estCorbeille = computed(() => this.dossierActif()?.cle === 'deleteditems');
  readonly dossiersCibles = computed(() => {
    const actif = this.dossierActif();
    return this.dossiersListe().filter(d => d.id !== actif?.id);
  });
  readonly monNom = computed(() => this.auth.user()?.nomComplet || this.auth.user()?.username || '');

  readonly libelleMode = computed(() => {
    switch (this.mode()) {
      case 'repondre':   return `Répondre à ${this.expediteur()}`;
      case 'tous':       return 'Répondre à tous les participants';
      case 'transferer': return 'Transférer';
      default:           return '';
    }
  });

  ouvrirRedaction(mode: ModeRedaction) {
    this.mode.set(mode);
    this.menuPlus.set(false);
    setTimeout(() => {
      const cible = this.hote.nativeElement.querySelector(mode === 'transferer' ? '#dt-destinataires' : '#dt-texte');
      (cible as HTMLElement | null)?.focus();
      cible?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  fermerRedaction() {
    this.mode.set(null);
    this.texte.set('');
    this.destinataires.set('');
    this.envoi.set(false);
  }

  envoyer() {
    const id = this.resume()?.id;
    const mode = this.mode();
    if (!id || !mode || this.envoi()) return;

    const texte = this.texte().trim();
    let requete;
    if (mode === 'transferer') {
      const liste = adresses(this.destinataires());
      if (!liste.length) { this.toast.erreur('Destinataire manquant', 'Indiquez au moins une adresse e-mail.'); return; }
      requete = this.emailService.transferer(id, liste, texte);
    } else {
      if (!texte) { this.toast.erreur('Message vide', 'Écrivez votre réponse avant de l\'envoyer.'); return; }
      requete = this.emailService.repondre(id, texte, mode === 'tous');
    }

    this.envoi.set(true);
    requete.subscribe({
      next: () => {
        this.toast.succes(mode === 'transferer' ? 'E-mail transféré' : 'Réponse envoyée',
          'Le message est parti depuis la boîte support.');
        this.fermerRedaction();
      },
      error: e => {
        this.envoi.set(false);
        this.toast.erreur('Envoi impossible', messageErreur(e, 'Le message n\'a pas pu être envoyé.'));
      }
    });
  }

  /** Ctrl+Entree envoie, comme dans Outlook. */
  surClavierTexte(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.envoyer();
    }
  }

  /** Télécharge une pièce jointe de l'e-mail (lien authentifié via Graph). */
  telechargerPj(pj: { id: string | null; nom: string | null }) {
    const email = this.detail();
    if (!email || !pj.id) return;
    this.emailService.telechargerPieceJointe(email.id, pj.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = pj.nom ?? 'piece-jointe';
        lien.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.erreur('Pièce jointe indisponible', "Le fichier n'a pas pu être récupéré.")
    });
  }

  demanderDeplacement(dossierId: string) {
    this.menuPlus.set(false);
    this.deplacer.emit(dossierId);
  }

  @HostListener('document:click', ['$event'])
  surClicExterieur(event: MouseEvent) {
    if (!this.menuPlus()) return;
    const zone = this.hote.nativeElement.querySelector('.dt-plus');
    if (zone && !zone.contains(event.target as Node)) this.menuPlus.set(false);
  }
}
