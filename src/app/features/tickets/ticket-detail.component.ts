import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TicketEditionDialogComponent } from './ticket-edition-dialog.component';
import { ChatOuvertureService } from '../../core/services/chat-ouverture.service';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ReferenceService } from '../../core/services/reference.service';
import { TicketService } from '../../core/services/ticket.service';
import { ToastService } from '../../core/services/toast.service';
import {
  Collaborateur, NotificationHisto, ORDRE_ETATS, Ticket, UpdateTicketRequest,
  classeEtat, classeImportance, tailleFichier, tempsRelatif
} from '../../core/models/models';

interface ActionEtat {
  etat: string;
  libelle: string;
  icone: 'ouvert' | 'cours' | 'dev' | 'test' | 'attente' | 'cloture';
}

const LONGUEUR_MAX_COMMENTAIRE = 1000;

@Component({
  selector: 'hd-ticket-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TicketEditionDialogComponent],
  templateUrl: './ticket-detail.component.html',
  styleUrl: './ticket-detail.component.scss'
})
export class TicketDetailComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private ticketService = inject(TicketService);
  private referenceService = inject(ReferenceService);
  private notifications = inject(NotificationService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);
  readonly auth = inject(AuthService);
  readonly chat = inject(ChatOuvertureService);

  readonly classeEtat = classeEtat;
  readonly classeImportance = classeImportance;
  readonly tempsRelatif = tempsRelatif;
  readonly tailleFichier = tailleFichier;
  readonly longueurMax = LONGUEUR_MAX_COMMENTAIRE;

  /**
   * Etats proposes en action, selon le role (l'annulation est une action a part).
   * Un developpeur ne fait que developper et envoyer au test interne.
   */
  readonly actionsEtat = computed<ActionEtat[]>(() => this.auth.estDev()
    ? [
        { etat: 'En développement', libelle: 'En développement', icone: 'dev' },
        { etat: 'Test interne', libelle: 'Envoyer en test interne', icone: 'test' }
      ]
    : [
        { etat: 'Ouvert', libelle: 'Ouvert', icone: 'ouvert' },
        { etat: 'En cours', libelle: 'En cours', icone: 'cours' },
        { etat: 'En développement', libelle: 'En développement', icone: 'dev' },
        { etat: 'Test interne', libelle: 'Test interne', icone: 'test' },
        { etat: 'En attente de validation', libelle: 'En attente de validation', icone: 'attente' },
        { etat: 'Clôturé', libelle: 'Clôturer', icone: 'cloture' }
      ]);

  private readonly ticketId = Number(this.route.snapshot.paramMap.get('id'));

  readonly ticket = signal<Ticket | null>(null);
  readonly chargement = signal(true);
  readonly introuvable = signal(false);
  readonly suivi = signal<NotificationHisto[]>([]);
  readonly collaborateurs = signal<Collaborateur[]>([]);

  readonly commentaire = signal('');
  readonly collaborateurChoisi = signal<number | null>(null);
  /** Etat choisi dans le formulaire, envoye seulement a la validation. */
  readonly etatChoisi = signal<string | null>(null);
  readonly resolution = signal('');
  /** Capture d'ecran jointe a l'action de test (rejet vers le dev ou validation vers le client). */
  readonly capture = signal<File | null>(null);
  readonly erreurCapture = signal<string | null>(null);

  /** Action en cours d'envoi (pour afficher le bon indicateur et bloquer les doubles clics). */
  readonly actionEnCours = signal<string | null>(null);
  readonly confirmationAnnulation = signal(false);
  /** Popup de correction du ticket (administrateur). */
  readonly edition = signal(false);

  /** Fusion de doublons (administrateur) : saisie du n° de ticket cible. */
  readonly fusionOuverte = signal(false);
  readonly cibleFusion = signal('');
  readonly fusionEnCours = signal(false);

  readonly peutTraiter = computed(() => !this.auth.estClient());
  readonly estTermine = computed(() => {
    const etat = this.ticket()?.etat;
    return etat === 'Clôturé' || etat === 'Annulé';
  });
  readonly estResponsable = computed(() => {
    const t = this.ticket();
    return !!t && t.collaborateurId === this.auth.user()?.id;
  });
  /** Seul un collaborateur affecte au produit peut "s'en occuper" (un admin confie). */
  readonly peutSenOccuper = computed(() =>
    this.auth.estCollaborateur() && !this.estResponsable() &&
    this.collaborateurs().some(c => c.id === this.auth.user()?.id));

  /**
   * Nom lisible du responsable (le ticket ne stocke que son email).
   * Le client n'a pas acces a la liste des collaborateurs : on utilise alors le suivi.
   */
  readonly nomResponsable = computed(() => {
    const t = this.ticket();
    if (!t?.collaborateurId) return null;
    const depuisListe = this.collaborateurs().find(c => c.id === t.collaborateurId)?.nomComplet;
    const depuisSuivi = [...this.suivi()].reverse()
      .find(e => e.collaborateurId === t.collaborateurId && e.collaborateurNom)?.collaborateurNom;
    return depuisListe || depuisSuivi || t.collaborateur;
  });

  readonly commentaireTropLong = computed(() => this.commentaire().length > LONGUEUR_MAX_COMMENTAIRE);

  /** Le ticket attend le test interne d'un collaborateur (apres le developpement). */
  readonly estEnTestInterne = computed(() => this.ticket()?.etat === 'Test interne');

  /** Renvoi au developpeur depuis le test interne : il faut lui expliquer pourquoi. */
  readonly estUnRejetDeTest = computed(() =>
    this.estEnTestInterne() && this.etatChoisi() === 'En développement');

  /** Clôturer (justification client) et rejeter un test (explication au dev) exigent un message. */
  readonly justificationManquante = computed(() =>
    (this.etatChoisi() === 'Clôturé' || this.estUnRejetDeTest()) && !this.commentaire().trim());

  /** Collaborateurs (ROLE_USER) et developpeurs (ROLE_DEV) proposes dans « Confier à ». */
  readonly collegues = computed(() => this.collaborateurs().filter(c => c.role !== 'ROLE_DEV'));
  readonly developpeurs = computed(() => this.collaborateurs().filter(c => c.role === 'ROLE_DEV'));

  /**
   * En phase de test interne, un collaborateur n'a que trois issues :
   * test concluant (validation client), renvoi au developpeur, ou annulation.
   * Les boutons d'etat ne restent visibles que pour l'admin.
   */
  readonly etatsVisibles = computed(() => this.auth.estAdmin() || !this.estEnTestInterne());

  /** La capture est proposee quand le collaborateur tranche un test interne. */
  readonly captureProposee = computed(() =>
    this.estEnTestInterne() && !this.auth.estDev() &&
    (this.etatChoisi() === 'En attente de validation' || this.etatChoisi() === 'En développement'));

  /**
   * Un ticket avance, il ne recule pas : revenir a une etape precedente est
   * reserve a l'admin (exception : le rejet du test interne, gere par la banniere).
   */
  etatIndisponible(etat: string): boolean {
    const actuel = this.ticket()?.etat ?? null;
    if (etat === actuel) return true;
    if (this.auth.estAdmin()) return false;
    const indexActuel = ORDRE_ETATS.indexOf(actuel ?? '');
    return indexActuel >= 0 && ORDRE_ETATS.indexOf(etat) <= indexActuel;
  }

  /** Rien de choisi et rien d'écrit : le bouton Valider est inactif. */
  readonly rienAEnvoyer = computed(() =>
    !this.etatChoisi() && this.collaborateurChoisi() === null && !this.commentaire().trim());

  /** Résumé de ce qui sera envoyé au client, affiché au-dessus du bouton Valider. */
  readonly recap = computed(() => {
    const parts: string[] = [];
    const collab = this.collaborateurChoisi();
    if (collab !== null) {
      parts.push(collab === this.auth.user()?.id
        ? 'vous devenez responsable'
        : `confié à ${this.collaborateurs().find(c => c.id === collab)?.nomComplet ?? 'un collègue'}`);
    }
    if (this.etatChoisi()) parts.push(`état « ${this.etatChoisi()} »`);
    if (this.commentaire().trim()) parts.push('votre message');
    if (this.capture() && this.captureProposee()) parts.push('votre capture');
    return parts.join(' + ');
  });

  /** Le client doit se prononcer : valider la solution ou annuler le ticket. */
  readonly validationAttendueDuClient = computed(() =>
    this.auth.estClient() && this.ticket()?.etat === 'En attente de validation');

  constructor() {
    this.charger();

    // Mise a jour en direct : un collegue ou le client fait evoluer le ticket.
    let premierPassage = true;
    effect(() => {
      this.notifications.signalRafraichir();
      if (premierPassage) { premierPassage = false; return; }
      this.charger();
    }, { allowSignalWrites: true });

    // Recharge la liste « Confier à… » dès que le produit du ticket change (ex. après « Modifier »).
    effect(() => {
      const produit = this.ticket()?.produit ?? null;
      if (produit !== this.produitCollaborateurs) {
        this.produitCollaborateurs = produit;
        this.chargerCollaborateurs(produit);
      }
    }, { allowSignalWrites: true });
  }

  /** Produit pour lequel la liste des collaborateurs est actuellement chargée. */
  private produitCollaborateurs: string | null = null;

  private charger() {
    this.ticketService.parId(this.ticketId).subscribe({
      next: ticket => {
        this.ticket.set(ticket);
        this.resolution.set(ticket.resolution ?? '');
        this.chargement.set(false);
        // La liste « Confier à… » est (re)chargée par l'effect qui suit le produit du ticket.
      },
      error: () => {
        this.chargement.set(false);
        this.introuvable.set(true);
      }
    });
    this.ticketService.suivi(this.ticketId).subscribe({
      next: s => this.suivi.set(s),
      error: () => {}
    });
  }

  private chargerCollaborateurs(produit: string | null) {
    // Un developpeur n'assigne personne : la liste ne lui est pas accessible.
    if (!this.peutTraiter() || this.auth.estDev() || !produit) return;
    this.referenceService.collaborateurs(produit)
      .subscribe({ next: c => this.collaborateurs.set(c), error: () => {} });
  }

  // ---------- Actions (tout est choisi puis envoye en une fois) ----------

  /** Choisit ou dechoisit un etat cible ; rien n'est envoye avant Valider. */
  choisirEtat(etat: string) {
    if (etat === this.ticket()?.etat) return;
    this.etatChoisi.set(this.etatChoisi() === etat ? null : etat);
  }

  /** Raccourci : se designer soi-meme comme futur responsable. */
  jeMenOccupe() {
    const moi = this.auth.user()?.id ?? null;
    this.collaborateurChoisi.set(this.collaborateurChoisi() === moi ? null : moi);
  }

  surCapture(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const choisi = entree.files?.[0] ?? null;
    entree.value = '';

    this.erreurCapture.set(null);
    if (!choisi) return;
    if (choisi.size > 10 * 1024 * 1024) {
      this.erreurCapture.set(`« ${choisi.name} » dépasse 10 Mo.`);
      return;
    }
    this.capture.set(choisi);
  }

  retirerCapture() {
    this.capture.set(null);
    this.erreurCapture.set(null);
  }

  /**
   * Envoi unique : assignation + etat + message (+ capture) partent ensemble,
   * le client ne recoit donc qu'une seule notification.
   */
  valider() {
    if (this.rienAEnvoyer() || this.justificationManquante()) return;

    const etat = this.etatChoisi();
    const collaborateurId = this.collaborateurChoisi();
    this.envoyer('valider', {
      ...(etat ? { etat } : {}),
      ...(collaborateurId !== null ? { collaborateurId } : {})
    }, etat ? `Ticket passé à « ${etat} »` : (collaborateurId !== null ? 'Responsable mis à jour' : 'Message envoyé au client'),
    true, this.captureProposee() ? this.capture() : null);
  }

  demanderAnnulation() {
    this.confirmationAnnulation.set(true);
  }

  confirmerAnnulation() {
    this.confirmationAnnulation.set(false);
    if (this.auth.estClient()) { this.deciderClient(false); return; }
    this.envoyer('etat:Annulé', { etat: 'Annulé' }, 'Ticket annulé');
  }

  // ---------- Fusion de doublons (administrateur) ----------

  ouvrirFusion() {
    this.cibleFusion.set('');
    this.fusionOuverte.set(true);
  }
  fermerFusion() {
    this.fusionOuverte.set(false);
  }
  confirmerFusion() {
    const cible = Number((this.cibleFusion() || '').trim().replace('#', ''));
    const source = this.ticket()?.id;
    if (!source) return;
    if (!Number.isInteger(cible) || cible <= 0) {
      this.toast.erreur('Numéro invalide', 'Saisissez le numéro du ticket cible (ex. 1442).');
      return;
    }
    if (cible === source) {
      this.toast.erreur('Fusion impossible', 'La cible doit être un autre ticket.');
      return;
    }
    this.fusionEnCours.set(true);
    this.ticketService.fusionner(source, cible).subscribe({
      next: () => {
        this.fusionEnCours.set(false);
        this.fusionOuverte.set(false);
        this.toast.succes('Tickets fusionnés', `Ce ticket a été fusionné dans le #${cible}.`);
        this.router.navigate(['/tickets', cible]);
      },
      error: e => {
        this.fusionEnCours.set(false);
        this.toast.erreur('Fusion impossible', e.error?.message ?? 'Réessayez dans un instant.');
      }
    });
  }

  // ---------- Décision du client (ticket en attente de validation) ----------

  validerSolution() {
    this.deciderClient(true);
  }

  private deciderClient(valide: boolean) {
    const t = this.ticket();
    if (!t || this.actionEnCours() || this.commentaireTropLong()) return;

    this.actionEnCours.set(valide ? 'client:valider' : 'client:annuler');
    this.ticketService.validationClient(t.id, valide, this.commentaire().trim() || null).subscribe({
      next: maj => {
        this.ticket.set(maj);
        this.actionEnCours.set(null);
        this.commentaire.set('');
        this.toast.succes(
          valide ? 'Solution validée — ticket clôturé' : 'Ticket annulé',
          'Notre équipe a été prévenue. Merci !');
        this.ticketService.suivi(t.id).subscribe({ next: s => this.suivi.set(s), error: () => {} });
      },
      error: e => {
        this.actionEnCours.set(null);
        this.toast.erreur('Action impossible', e.error?.message ?? 'Réessayez dans un instant.');
      }
    });
  }

  @HostListener('document:keydown.escape')
  surEchap() {
    this.confirmationAnnulation.set(false);
    this.fusionOuverte.set(false);
  }

  enregistrerResolution() {
    this.envoyer('resolution', { resolution: this.resolution() }, 'Note interne enregistrée', false);
  }

  /**
   * Envoie une action. Le commentaire saisi est joint a toute action "visible client"
   * (etat, assignation, message) et vide apres succes. La capture eventuelle est
   * rattachee a l'evenement du suivi juste apres.
   */
  private envoyer(action: string, requete: UpdateTicketRequest, succes: string,
                  joindreCommentaire = true, capture: File | null = null) {
    const t = this.ticket();
    if (!t || this.actionEnCours() || this.commentaireTropLong()) return;

    const commentaire = joindreCommentaire ? this.commentaire().trim() : '';
    this.actionEnCours.set(action);

    const terminer = () => {
      this.actionEnCours.set(null);
      if (commentaire) this.commentaire.set('');
      this.collaborateurChoisi.set(null);
      this.etatChoisi.set(null);
      this.capture.set(null);
      this.toast.succes(succes, joindreCommentaire ? 'Le client a été notifié.' : undefined);
      this.ticketService.suivi(t.id).subscribe({ next: s => this.suivi.set(s), error: () => {} });
    };

    this.ticketService.modifier(t.id, { ...requete, commentaire: commentaire || null }).subscribe({
      next: maj => {
        this.ticket.set(maj);
        if (!capture) { terminer(); return; }
        this.ticketService.joindreCaptureSuivi(t.id, capture).subscribe({
          next: terminer,
          error: e => {
            // L'action est passee : on ne l'echoue pas pour la capture.
            this.toast.erreur('Capture non envoyée', e.error?.message ?? "L'action est enregistrée, mais la capture n'a pas pu être jointe.");
            terminer();
          }
        });
      },
      error: e => {
        this.actionEnCours.set(null);
        this.toast.erreur('Action impossible', e.error?.message ?? 'Réessayez dans un instant.');
      }
    });
  }

  // ---------- Pièce jointe ----------

  /** Apercu inline d'une image jointe (URL de blob approuvee). */
  readonly apercuFichier = signal<SafeUrl | null>(null);
  private apercuUrlBrute: string | null = null;

  /**
   * Voir la piece jointe : une image s'affiche directement dans la page ;
   * un autre type s'ouvre dans un onglet (ou se telecharge si les popups sont bloques).
   */
  voirFichier() {
    if (this.apercuFichier()) { this.fermerApercu(); return; }

    if (this.ticket()?.fichierType?.startsWith('image/')) {
      this.recupererFichier(url => {
        this.apercuUrlBrute = url;
        this.apercuFichier.set(this.sanitizer.bypassSecurityTrustUrl(url));
      });
      return;
    }

    // L'onglet doit etre ouvert PENDANT le clic (sinon bloque comme popup).
    const onglet = window.open('', '_blank');
    this.recupererFichier(url => {
      if (onglet) {
        onglet.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        // Popups bloques : on telecharge a la place.
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = this.ticket()?.fichierNom ?? 'piece-jointe';
        lien.click();
        URL.revokeObjectURL(url);
      }
    }, () => onglet?.close());
  }

  fermerApercu() {
    this.apercuFichier.set(null);
    if (this.apercuUrlBrute) { URL.revokeObjectURL(this.apercuUrlBrute); this.apercuUrlBrute = null; }
  }

  /** Capture d'un evenement du suivi affichee en ligne (une a la fois). */
  readonly captureSuiviOuverte = signal<{ id: number; url: SafeUrl } | null>(null);
  private captureSuiviBrute: string | null = null;

  voirCaptureSuivi(e: NotificationHisto) {
    const dejaOuverte = this.captureSuiviOuverte()?.id === e.id;
    this.fermerCaptureSuivi();
    if (dejaOuverte) return;

    const t = this.ticket();
    if (!t) return;
    this.ticketService.captureSuivi(t.id, e.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        if (e.fichierType?.startsWith('image/')) {
          this.captureSuiviBrute = url;
          this.captureSuiviOuverte.set({ id: e.id, url: this.sanitizer.bypassSecurityTrustUrl(url) });
        } else {
          // Autre type de fichier : on le telecharge.
          const lien = document.createElement('a');
          lien.href = url;
          lien.download = e.fichierNom ?? 'capture';
          lien.click();
          URL.revokeObjectURL(url);
        }
      },
      error: () => this.toast.erreur('Capture indisponible', "Le fichier n'a pas pu être récupéré.")
    });
  }

  fermerCaptureSuivi() {
    this.captureSuiviOuverte.set(null);
    if (this.captureSuiviBrute) { URL.revokeObjectURL(this.captureSuiviBrute); this.captureSuiviBrute = null; }
  }

  telechargerFichier() {
    const nom = this.ticket()?.fichierNom ?? 'piece-jointe';
    this.recupererFichier(url => {
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = nom;
      lien.click();
      URL.revokeObjectURL(url);
    });
  }

  /** Recupere le blob avec le jeton (un simple lien <a href> ne serait pas authentifie). */
  private recupererFichier(action: (url: string) => void, surErreur?: () => void) {
    const t = this.ticket();
    if (!t || this.actionEnCours()) { surErreur?.(); return; }
    this.actionEnCours.set('fichier');
    this.ticketService.fichier(t.id).subscribe({
      next: blob => {
        this.actionEnCours.set(null);
        action(URL.createObjectURL(blob));
      },
      error: () => {
        this.actionEnCours.set(null);
        surErreur?.();
        this.toast.erreur('Fichier indisponible', "La pièce jointe n'a pas pu être récupérée.");
      }
    });
  }

  /** Corrections enregistrees par l'admin : on recharge le ticket et son suivi. */
  surTicketCorrige(maj: Ticket) {
    this.edition.set(false);
    this.ticket.set(maj);
    this.toast.succes('Ticket corrigé', 'Les modifications sont visibles dans le suivi du ticket.');
    this.ticketService.suivi(maj.id).subscribe({ next: s => this.suivi.set(s), error: () => {} });
  }

  supprimer() {
    const t = this.ticket();
    if (!t) return;
    if (!confirm(`Supprimer définitivement le ticket #${t.id} ? Cette action est irréversible.`)) return;
    this.ticketService.supprimer(t.id).subscribe({
      next: () => { this.toast.succes('Ticket supprimé'); this.router.navigate(['/tickets']); },
      error: () => this.toast.erreur('Suppression impossible')
    });
  }

  // ---------- Suivi ----------

  libelleSuivi(e: NotificationHisto): string {
    const par = e.parNom ? ` par ${e.parNom}` : '';
    switch (e.typeEvent) {
      case 'CREATION':    return `Ticket créé${par}`;
      case 'ASSIGNATION':
        return e.collaborateurNom && e.collaborateurNom !== e.parNom
          ? `Confié à ${e.collaborateurNom}${par}`
          : `Pris en charge${par}`;
      case 'ASSIGNATION_ETAT':
        return e.collaborateurNom && e.collaborateurNom !== e.parNom
          ? `Confié à ${e.collaborateurNom} et état changé${par}`
          : `Pris en charge et état changé${par}`;
      case 'VALIDATION_CLIENT': return `Solution validée par le client${par}`;
      case 'ANNULATION_CLIENT': return `Ticket annulé par le client${par}`;
      case 'COMMENTAIRE': return `Message${par}`;
      case 'MISE_A_JOUR': return `Informations du ticket mises à jour${par}`;
      default:            return `État changé${par}`;
    }
  }
}
