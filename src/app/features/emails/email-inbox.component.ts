import {
  Component, ElementRef, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal
} from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { AgentService, libelleModele } from '../../core/services/agent.service';
import { LienEmailTicket, NotificationService } from '../../core/services/notification.service';
import { EmailDetail, EmailDossier, EmailService, EmailSummary, MailboxStatut } from '../../core/services/email.service';
import { ToastService } from '../../core/services/toast.service';
import { Ticket } from '../../core/models/models';
import { EmailDetailSliderComponent, ModeRedaction, OuvertureEmail } from './email-detail-slider.component';
import { EmailTicketSliderComponent } from './email-ticket-slider.component';
import { EmailRedactionSliderComponent } from './email-redaction-slider.component';
import { MailboxSettingsSliderComponent } from './mailbox-settings-slider.component';
import { couleurAvatar, formatHeure, initiale, messageErreur } from './email-utils';
import { SupprimerTicketDialogComponent } from '../../shared/supprimer-ticket-dialog.component';

const CLE_PANNEAU_DOSSIERS = 'hd_mail_dossiers';
const TAILLE_PAGE = 25;

/**
 * Boite mail facon Divalto / Bitrix24 : liste en cartes sur fond illustre,
 * actions groupees, dossiers (glisser-deposer), panneaux coulissants
 * pour lire, repondre, rediger et creer un ticket depuis un e-mail.
 */
@Component({
  selector: 'hd-email-inbox',
  standalone: true,
  imports: [EmailDetailSliderComponent, EmailTicketSliderComponent, EmailRedactionSliderComponent, MailboxSettingsSliderComponent,
            SupprimerTicketDialogComponent],
  templateUrl: './email-inbox.component.html',
  styleUrl: './email-inbox.component.scss'
})
export class EmailInboxComponent implements OnDestroy {
  private emailService = inject(EmailService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private auth = inject(AuthService);
  private agentService = inject(AgentService);
  private notifications = inject(NotificationService);
  private hote = inject(ElementRef<HTMLElement>);

  @ViewChild(EmailTicketSliderComponent) sliderTicket?: EmailTicketSliderComponent;

  readonly initiale = initiale;
  readonly couleurAvatar = couleurAvatar;
  readonly formatHeure = formatHeure;

  /** Un developpeur ne cree pas de tickets (regle de l'API). */
  readonly peutCreerTicket = computed(() => this.auth.aLeRole('ROLE_ADMIN', 'ROLE_USER'));

  /** Suppression d'un ticket depuis son badge (réservée à l'admin, comme côté API). */
  readonly estAdmin = this.auth.estAdmin;
  readonly ticketASupprimer = signal<number | null>(null);

  /** Ticket supprimé : tous les e-mails qui y étaient liés perdent leur badge. */
  surTicketSupprime(id: number) {
    this.ticketASupprimer.set(null);
    this.emails.update(liste => liste.map(e => e.ticketId === id ? { ...e, ticketId: null } : e));
  }

  // ─── Dossiers ───────────────────────────────────────────────
  readonly dossiers = signal<EmailDossier[]>([]);
  /** ID du dossier affiche, ou nom connu Graph ("inbox" au depart). */
  readonly dossierCourant = signal('inbox');
  readonly dossierActif = computed(() =>
    this.dossiers().find(d => d.id === this.dossierCourant() || d.cle === this.dossierCourant()) ?? null);
  readonly nomDossier = computed(() => this.dossierActif()?.nom ?? 'Boîte de réception');
  readonly estBoiteReception = computed(() =>
    this.dossierCourant() === 'inbox' || this.dossierActif()?.cle === 'inbox');
  readonly estSpam = computed(() => this.dossierActif()?.cle === 'junkemail');
  readonly estCorbeille = computed(() => this.dossierActif()?.cle === 'deleteditems');
  readonly dossiersCibles = computed(() => this.dossiers().filter(d => d.id !== this.dossierActif()?.id));
  readonly panneauDossiers = signal(this.lirePreferenceDossiers());
  readonly menuDossier = signal(false);
  readonly menuDeplacer = signal(false);

  // ─── Liste ──────────────────────────────────────────────────
  readonly emails = signal<EmailSummary[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(true);
  readonly chargementPlus = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly recherche = signal('');
  readonly filtreNonLus = signal(false);
  readonly selection = signal<ReadonlySet<string>>(new Set());
  readonly actionEnCours = signal(false);
  private page = 1;
  private requete = 0;
  private timerRecherche?: ReturnType<typeof setTimeout>;

  readonly nbSelection = computed(() => this.selection().size);
  readonly toutCoche = computed(() =>
    this.emails().length > 0 && this.emails().every(e => this.selection().has(e.id)));
  readonly nonLus = computed(() => this.dossierActif()?.nonLus ?? this.emails().filter(e => !e.estLu).length);
  readonly resteACharger = computed(() => this.emails().length < this.total());

  // ─── Panneaux coulissants ──────────────────────────────────
  readonly ouverture = signal<OuvertureEmail | null>(null);
  readonly emailActif = signal<EmailDetail | null>(null);
  readonly ticketPour = signal<EmailDetail | null>(null);
  readonly redaction = signal(false);
  private ticketApresChargement = false;

  // ─── Boîte personnelle (chaque membre connecte la sienne : Gmail / Outlook) ──
  readonly statutBoite = signal<MailboxStatut | null>(null);
  readonly reglagesBoite = signal(false);

  // Agent IA (e-mails → tickets), par utilisateur (admin / collaborateur). État partagé avec le popup.
  readonly agentStatut = this.agentService.etat;
  readonly agentEnCours = signal(false);
  readonly libelleModele = libelleModele;
  /** Vrai une fois l'état de la boîte vérifié au chargement. */
  readonly statutVerifie = signal(false);
  /** Pas de boîte par défaut : si rien n'est connecté, on invite à connecter la sienne. */
  readonly afficherConnexion = computed(() => {
    const s = this.statutBoite();
    return this.statutVerifie() && s != null && !s.connectee;
  });
  readonly indexActif = computed(() => {
    const o = this.ouverture();
    return o ? this.emails().findIndex(e => e.id === o.resume.id) : -1;
  });

  // ─── Glisser-deposer vers un dossier ───────────────────────
  readonly glisse = signal<string[] | null>(null);
  readonly cibleDepot = signal<string | null>(null);
  private panneauOuvertPourGlisse = false;

  constructor() {
    // On ne charge les e-mails QUE si l'utilisateur a connecté sa propre boîte.
    this.chargerStatutBoite();
    // Page figee sous un panneau ouvert, comme dans Divalto.
    effect(() => {
      document.body.style.overflow = this.ouverture() || this.redaction() ? 'hidden' : '';
    });

    // Temps réel : un collègue a transformé un e-mail en ticket → on affiche le badge sans « Actualiser ».
    // allowSignalWrites : l'effet met à jour le signal `emails` (interdit par défaut dans un effect).
    effect(() => {
      const lien = this.notifications.dernierLienEmail();
      if (lien) this.appliquerLienEmail(lien);
    }, { allowSignalWrites: true });
  }

  private chargerStatutAgent() {
    this.agentService.statut().subscribe({ error: () => {} });
  }

  /** Résumé d'activité pour l'infobulle de l'agent. */
  readonly agentInfo = computed(() => {
    const s = this.agentStatut();
    if (!s) return '';
    if (!s.actif) return 'Activer l’agent IA : transformer automatiquement les e-mails reçus en tickets.';
    if (s.blocage?.tousLesModeles) {
      return 'Agent en pause : tous les modèles IA ont atteint leur quota. Il reprendra tout seul dès qu’un modèle se libère.';
    }
    if (s.blocage) {
      return `Agent en pause : le modèle ${s.blocage.modele} ${s.blocage.quota ? 'a atteint son quota' : 'ne répond plus'}. `
           + 'Passez en automatique, choisissez un autre modèle ou désactivez l’agent.';
    }
    const quand = s.derniereExecution ? new Date(s.derniereExecution).toLocaleString('fr-FR') : 'jamais';
    const err = s.derniereErreur ? ` · ⚠ ${s.derniereErreur}` : '';
    return `Agent actif (${libelleModele(s.modele)}). Dernier passage : ${quand} · ${s.ticketsCrees} ticket(s) créé(s), ${s.emailsTraites} e-mail(s) traité(s)${err}. Cliquer pour désactiver.`;
  });

  /** Libellé court pour la barre : fournisseur du modèle (« Gemini », « Groq ») ou « Auto ». */
  readonly modeleCourt = computed(() => {
    const s = this.agentStatut();
    if (!s?.modele) return 'Auto';
    return s.modeles.find(m => m.id === s.modele)?.fournisseur ?? s.modele;
  });

  /** Ouvre la liste des modèles IA (bascule de l'un à l'autre). */
  choisirModele() {
    this.agentService.ouvrirChoix();
  }

  /** Active/désactive l'agent IA sur sa boîte (e-mails reçus → tickets automatiquement). */
  basculerAgent() {
    const s = this.agentStatut();
    if (!s || this.agentEnCours()) return;
    this.majAgent(!s.actif,
      !s.actif ? 'Agent activé' : 'Agent désactivé',
      !s.actif ? 'Les e-mails reçus seront transformés en tickets automatiquement.'
               : 'Les e-mails ne seront plus transformés automatiquement.');
  }

  /** Les tickets de l'agent partent toujours dans la file du produit (plus d'auto-affectation). */
  private majAgent(actif: boolean, titre: string, detail: string) {
    this.agentEnCours.set(true);
    this.agentService.activer(actif, false, this.agentStatut()?.modele ?? null).subscribe({
      next: () => { this.agentEnCours.set(false); this.toast.succes(titre, detail); },
      error: e => { this.agentEnCours.set(false); this.toast.erreur('Action impossible', e.error?.message ?? 'Réessayez.'); }
    });
  }

  /** Marque dans la liste l'e-mail correspondant au lien reçu en direct (Message-ID, fil, ou objet+expéditeur+date). */
  private appliquerLienEmail(lien: LienEmailTicket) {
    this.emails.update(liste => liste.map(e => {
      const parMessage = !!lien.messageId && e.messageIdInternet === lien.messageId;
      const parFil = !!lien.threadId && e.threadIdInternet === lien.threadId;
      const parHeuristique = !!lien.objet && !!lien.expediteur && !!lien.date &&
        this.normaliserObjet(e.objet) === lien.objet &&
        (e.deEmail ?? '').trim().toLowerCase() === lien.expediteur &&
        this.datesProches(e.date, lien.date);
      const correspond = parMessage || parFil || parHeuristique;
      return correspond && e.ticketId !== lien.ticketId ? { ...e, ticketId: lien.ticketId } : e;
    }));
  }

  /** Objet normalisé (sans préfixes RE:/TR:/FW:…, espaces compactés, minuscules) — aligné sur le backend. */
  private normaliserObjet(objet: string | null): string | null {
    if (!objet) return null;
    let s = objet.trim();
    const prefixe = /^\s*(re|ré|tr|fw|fwd|ref)\s*(\[\d+\])?\s*:\s*/i;
    while (prefixe.test(s)) s = s.replace(prefixe, '');
    s = s.replace(/\s+/g, ' ').trim().toLowerCase();
    return s.length ? s : null;
  }

  /** Dates à moins de 15 minutes d'écart (aligné sur la fenêtre du backend). */
  private datesProches(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
    return Number.isFinite(diff) && diff <= 15 * 60 * 1000;
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
    clearTimeout(this.timerRecherche);
  }

  // ═══════════════ Chargement ═══════════════

  chargerStatutBoite() {
    this.emailService.statutBoite().subscribe({
      next: s => {
        this.statutBoite.set(s);
        this.statutVerifie.set(true);
        if (s.connectee) {
          // Boîte connectée : on charge SA boîte + le statut de l'agent IA.
          this.chargerDossiers();
          this.charger();
          this.chargerStatutAgent();
        } else {
          // Aucune boîte : on affiche l'écran de connexion (pas de boîte par défaut).
          this.chargement.set(false);
          this.emails.set([]);
          this.dossiers.set([]);
        }
      },
      error: () => {
        // Statut indisponible (API ?) : on tente quand même le chargement pour afficher l'erreur réelle.
        this.statutVerifie.set(true);
        this.chargerDossiers();
        this.charger();
      }
    });
  }

  /** Après connexion/déconnexion d'une boîte : on recharge selon le nouvel état. */
  surChangementBoite() {
    this.dossierCourant.set('inbox');
    this.emails.set([]);
    this.dossiers.set([]);
    this.chargement.set(true);
    this.chargerStatutBoite();
  }

  chargerDossiers() {
    this.emailService.dossiers().subscribe({
      next: d => this.dossiers.set(d),
      error: () => { /* la liste fonctionne sans : dossier "inbox" par defaut */ }
    });
  }

  charger(ajouter = false) {
    if (!ajouter) {
      this.page = 1;
      this.chargement.set(true);
      this.selection.set(new Set());
    }
    const numero = ++this.requete;
    this.erreur.set(null);

    this.emailService.lister(this.page, TAILLE_PAGE, this.recherche() || undefined,
      this.dossierCourant(), this.filtreNonLus()).subscribe({
      next: page => {
        if (numero !== this.requete) return; // reponse perimee (frappe ou dossier plus recent)
        this.total.set(page.total);
        this.emails.update(prev => ajouter ? [...prev, ...page.items] : page.items);
        this.chargement.set(false);
        this.chargementPlus.set(false);
      },
      error: e => {
        if (numero !== this.requete) return;
        this.chargement.set(false);
        this.chargementPlus.set(false);
        this.erreur.set(messageErreur(e, "Impossible de charger les e-mails. Vérifiez que l'API est démarrée."));
      }
    });
  }

  chargerPlus() {
    this.page++;
    this.chargementPlus.set(true);
    this.charger(true);
  }

  actualiser() {
    this.chargerDossiers();
    this.charger();
  }

  surRecherche(valeur: string) {
    this.recherche.set(valeur);
    clearTimeout(this.timerRecherche);
    this.timerRecherche = setTimeout(() => this.charger(), 350);
  }

  choisirDossier(id: string) {
    this.menuDossier.set(false);
    if (id === this.dossierCourant()) return;
    this.dossierCourant.set(id);
    this.charger();
  }

  basculerNonLus() {
    this.filtreNonLus.update(v => !v);
    this.charger();
  }

  basculerPanneauDossiers() {
    this.panneauDossiers.update(v => !v);
    this.panneauOuvertPourGlisse = false;
    try { localStorage.setItem(CLE_PANNEAU_DOSSIERS, this.panneauDossiers() ? '1' : '0'); } catch { /* stockage indisponible */ }
  }

  private lirePreferenceDossiers(): boolean {
    try { return localStorage.getItem(CLE_PANNEAU_DOSSIERS) === '1'; } catch { return false; }
  }

  // ═══════════════ Selection & actions groupees ═══════════════

  cocher(id: string) {
    this.selection.update(s => {
      const copie = new Set(s);
      if (!copie.delete(id)) copie.add(id);
      return copie;
    });
  }

  toutCocher() {
    this.selection.set(this.toutCoche() ? new Set() : new Set(this.emails().map(e => e.id)));
  }

  viderSelection() { this.selection.set(new Set()); }

  marquerSelection(lu: boolean) {
    const ids = [...this.selection()].filter(id => this.emails().find(e => e.id === id)?.estLu !== lu);
    if (!ids.length) { this.viderSelection(); return; }

    this.actionEnCours.set(true);
    this.traiterLot(ids, id => this.emailService.marquerLu(id, lu)).subscribe(ok => {
      this.actionEnCours.set(false);
      this.appliquerLu(ok, lu);
      this.viderSelection();
      this.signalerEchecs(ids.length - ok.length, 'marqué(s)');
    });
  }

  deplacerSelection(dossierId: string) {
    this.menuDeplacer.set(false);
    this.deplacerIds([...this.selection()], dossierId);
  }

  /** Deplacement (dossier, spam, corbeille) : les e-mails quittent la liste courante. */
  deplacerIds(ids: string[], dossierId: string) {
    if (!ids.length || this.actionEnCours()) return;

    this.actionEnCours.set(true);
    this.traiterLot(ids, id => this.emailService.deplacer(id, dossierId)).subscribe(ok => {
      this.actionEnCours.set(false);
      this.retirer(ok);
      if (ok.length) this.toast.succes(this.libelleDeplacement(dossierId, ok.length));
      this.signalerEchecs(ids.length - ok.length, 'déplacé(s)');
      this.chargerDossiers();
    });
  }

  private traiterLot(ids: string[], action: (id: string) => Observable<void>): Observable<string[]> {
    return forkJoin(ids.map(id => action(id).pipe(map(() => id), catchError(() => of(null)))))
      .pipe(map(resultats => resultats.filter((id): id is string => id !== null)));
  }

  private appliquerLu(ids: string[], lu: boolean) {
    if (!ids.length) return;
    const concernes = new Set(ids);
    this.emails.update(liste => liste.map(e => concernes.has(e.id) ? { ...e, estLu: lu } : e));
    const actif = this.dossierActif();
    if (actif) {
      this.dossiers.update(liste => liste.map(d => d.id === actif.id
        ? { ...d, nonLus: Math.max(0, d.nonLus + (lu ? -ids.length : ids.length)) }
        : d));
    }
  }

  private retirer(ids: string[]) {
    if (!ids.length) return;
    const retires = new Set(ids);
    this.emails.update(liste => liste.filter(e => !retires.has(e.id)));
    this.total.update(t => Math.max(0, t - ids.length));
    this.selection.update(s => new Set([...s].filter(id => !retires.has(id))));
    const ouvert = this.ouverture()?.resume.id;
    if (ouvert && retires.has(ouvert)) this.fermerDetail();
  }

  private libelleDeplacement(dossierId: string, n: number): string {
    const s = n > 1 ? 's' : '';
    const quoi = `${n} e-mail${s}`;
    switch (dossierId) {
      case 'deleteditems': return `${quoi} supprimé${s}`;
      case 'junkemail':    return `${quoi} marqué${s} comme spam`;
      case 'inbox':        return `${quoi} remis dans la boîte de réception`;
      default: {
        const nom = this.dossiers().find(d => d.id === dossierId)?.nom ?? 'le dossier';
        return `${quoi} déplacé${s} vers « ${nom} »`;
      }
    }
  }

  private signalerEchecs(echecs: number, verbe: string) {
    if (echecs > 0) {
      this.toast.erreur('Action incomplète', `${echecs} e-mail(s) n'ont pas pu être ${verbe}. Réessayez.`);
    }
  }

  // ═══════════════ Panneau de lecture ═══════════════

  ouvrir(email: EmailSummary, mode: ModeRedaction | 'ticket' | null = null) {
    this.ouverture.set({ resume: email, mode: mode === 'ticket' ? null : mode });

    // Deja charge (ex. pastille sur l'e-mail ouvert) : pas de nouvel appel.
    const charge = this.emailActif();
    if (charge?.id === email.id) {
      if (mode === 'ticket') this.ticketPour.set(charge);
      return;
    }

    this.emailActif.set(null);
    this.ticketPour.set(null);
    this.ticketApresChargement = mode === 'ticket';

    if (!email.estLu) {
      this.appliquerLu([email.id], true);
      this.emailService.marquerLu(email.id).subscribe({ error: () => { /* reste lu localement */ } });
    }

    const id = email.id;
    this.emailService.parId(id).subscribe({
      next: detail => {
        if (this.ouverture()?.resume.id !== id) return;
        this.emailActif.set(detail);
        if (detail.ticketId !== email.ticketId) this.majTicketListe(id, detail.ticketId);
        if (this.ticketApresChargement) {
          this.ticketApresChargement = false;
          this.ticketPour.set(detail);
        }
      },
      error: e => {
        if (this.ouverture()?.resume.id !== id) return;
        this.toast.erreur('E-mail inaccessible', messageErreur(e, "L'e-mail n'a pas pu être chargé."));
        this.fermerDetail();
      }
    });
  }

  /** Entree sur la ligne elle-meme (pas sur une pastille ou la case, qui gerent leur propre action). */
  surEntree(event: Event, email: EmailSummary) {
    if (event.target === event.currentTarget) this.ouvrir(email);
  }

  naviguer(delta: -1 | 1) {
    const suivant = this.emails()[this.indexActif() + delta];
    if (suivant) this.ouvrir(suivant);
  }

  fermerDetail() {
    this.ouverture.set(null);
    this.emailActif.set(null);
    this.ticketPour.set(null);
    this.ticketApresChargement = false;
  }

  deplacerActif(dossierId: string) {
    const id = this.ouverture()?.resume.id;
    if (id) this.deplacerIds([id], dossierId);
  }

  marquerActifNonLu() {
    const id = this.ouverture()?.resume.id;
    if (!id) return;
    this.emailService.marquerLu(id, false).subscribe({
      next: () => {
        this.appliquerLu([id], false);
        this.fermerDetail();
      },
      error: e => this.toast.erreur('Action impossible', messageErreur(e, "L'e-mail n'a pas pu être marqué comme non lu."))
    });
  }

  surTicketCree(ticket: Ticket) {
    const id = this.ticketPour()?.id;
    this.ticketPour.set(null);
    if (id) {
      this.majTicketListe(id, ticket.id);
      this.emailActif.update(d => d && d.id === id ? { ...d, ticketId: ticket.id } : d);
    }
    this.toast.succes(`Ticket #${ticket.id} créé`,
      `Lié à l'e-mail. Les collaborateurs ${ticket.produit ?? ''} ont été notifiés.`);
  }

  private majTicketListe(id: string, ticketId: number | null) {
    this.emails.update(liste => liste.map(e => e.id === id ? { ...e, ticketId } : e));
  }

  voirTicket(id: number) {
    this.router.navigate(['/tickets', id]);
  }

  /** Fermer l'écran d'intégration de boîte (aucune boîte connectée) → retour aux tickets. */
  voirTickets() {
    this.router.navigate(['/tickets']);
  }

  // ═══════════════ Glisser-deposer ═══════════════

  surDebutGlisse(event: DragEvent, email: EmailSummary) {
    const ids = this.selection().has(email.id) ? [...this.selection()] : [email.id];
    this.glisse.set(ids);
    event.dataTransfer?.setData('text/plain', `${ids.length} e-mail(s)`);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    if (!this.panneauDossiers()) {
      this.panneauDossiers.set(true);
      this.panneauOuvertPourGlisse = true;
    }
  }

  surFinGlisse() {
    this.glisse.set(null);
    this.cibleDepot.set(null);
    if (this.panneauOuvertPourGlisse) {
      this.panneauOuvertPourGlisse = false;
      this.panneauDossiers.set(false);
    }
  }

  surSurvolDossier(event: DragEvent, dossier: EmailDossier) {
    if (!this.glisse() || dossier.id === this.dossierActif()?.id) return;
    event.preventDefault();
    this.cibleDepot.set(dossier.id);
  }

  surDepot(event: DragEvent, dossier: EmailDossier) {
    event.preventDefault();
    const ids = this.glisse();
    this.cibleDepot.set(null);
    if (ids?.length && dossier.id !== this.dossierActif()?.id) this.deplacerIds(ids, dossier.id);
  }

  // ═══════════════ Clavier & clics exterieurs ═══════════════

  @HostListener('document:keydown.escape')
  surEchap() {
    // Le popup de creation de compte (au-dessus du ticket) gere sa propre fermeture.
    if (this.sliderTicket?.contactACreer()) return;
    if (this.reglagesBoite()) { this.reglagesBoite.set(false); return; }
    if (this.redaction()) { this.redaction.set(false); return; }
    if (this.ticketPour()) { this.ticketPour.set(null); return; }
    if (this.ouverture()) { this.fermerDetail(); return; }
    this.menuDossier.set(false);
    this.menuDeplacer.set(false);
  }

  @HostListener('document:click', ['$event'])
  surClicExterieur(event: MouseEvent) {
    const cible = event.target as Node;
    const dans = (selecteur: string) => this.hote.nativeElement.querySelector(selecteur)?.contains(cible);
    if (this.menuDossier() && !dans('.ib-puce-zone')) this.menuDossier.set(false);
    if (this.menuDeplacer() && !dans('.ib-deplacer-zone')) this.menuDeplacer.set(false);
  }
}
