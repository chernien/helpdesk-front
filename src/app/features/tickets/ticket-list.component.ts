import { Component, ElementRef, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ReferenceService } from '../../core/services/reference.service';
import { TicketService } from '../../core/services/ticket.service';
import { ToastService } from '../../core/services/toast.service';
import { SupprimerTicketDialogComponent } from '../../shared/supprimer-ticket-dialog.component';
import {
  Equipier, Produit, Ticket, classeEtat, classeImportance, classeProduit
} from '../../core/models/models';

@Component({
  selector: 'hd-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SupprimerTicketDialogComponent],
  templateUrl: './ticket-list.component.html',
  styleUrl: './ticket-list.component.scss'
})
export class TicketListComponent {
  private ticketService = inject(TicketService);
  private referenceService = inject(ReferenceService);
  private notifications = inject(NotificationService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private hote = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly auth = inject(AuthService);

  readonly classeEtat = classeEtat;
  readonly classeImportance = classeImportance;
  readonly classeProduit = classeProduit;

  readonly tickets = signal<Ticket[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly produits = signal<Produit[]>([]);

  /** Totaux réels par état (indépendants de la pagination et des filtres), ex. { "Ouvert": 95, … }. */
  readonly compteurs = signal<Record<string, number>>({});

  /** Cartes du tableau de bord : une par état, dans l'ordre du cycle de vie d'un ticket. */
  readonly kpis = [
    { etat: 'Ouvert',                   libelle: 'Ouverts',                  classe: 't-ouvert',  icone: 'ouvert' },
    { etat: 'En cours',                 libelle: 'En cours',                 classe: 't-cours',   icone: 'cours' },
    { etat: 'En développement',         libelle: 'En développement',         classe: 't-dev',     icone: 'dev' },
    { etat: 'Test interne',             libelle: 'Test interne',             classe: 't-test',    icone: 'test' },
    { etat: 'En attente de validation', libelle: 'En attente de validation', classe: 't-attente', icone: 'attente' },
    { etat: 'Clôturé',                  libelle: 'Clôturés',                 classe: 't-cloture', icone: 'cloture' },
    { etat: 'Annulé',                   libelle: 'Annulés',                  classe: 't-annule',  icone: 'annule' },
  ] as const;

  // Filtres
  readonly filtreEtat = signal('');
  readonly filtreProduit = signal('');
  readonly recherche = signal('');
  /** Admin : nom et/ou prénom d'un membre de l'équipe → tickets traités par lui (responsable ou auteur d'une action). */
  readonly filtreMembre = signal('');
  /** Suggestions du champ « Traités par » : noms des membres de l'équipe, sans doublon. */
  readonly nomsMembres = signal<string[]>([]);

  // ---------- Client administrateur de sa société : les tickets d'un membre de son équipe ----------
  /** Membres de son équipe (vide si le client n'est pas administrateur de sa société). */
  readonly equipe = signal<Equipier[]>([]);
  /** '' = mes tickets (par défaut) ; e-mail d'un membre = ses tickets ; '*' = toute la société (titre de la liste). */
  readonly filtreEquipe = signal('');

  surEquipe(valeur: string) {
    this.filtreEquipe.set(valeur);
    this.page.set(1);
    this.charger();
    this.chargerCompteurs();
  }

  // ---------- À partir d'une année, d'un mois ou d'un jour ----------
  readonly MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
    'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  /** Les 10 dernières années, de la plus récente à la plus ancienne. */
  readonly annees = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
  readonly filtreAnnee = signal<number | null>(null);
  /** 1 = janvier … 12 = décembre. */
  readonly filtreMois = signal<number | null>(null);
  readonly filtreJour = signal<number | null>(null);
  readonly jours = computed(() => {
    const annee = this.filtreAnnee(), mois = this.filtreMois();
    const nb = annee && mois ? new Date(annee, mois, 0).getDate() : 31;
    return Array.from({ length: nb }, (_, i) => i + 1);
  });
  /** Premier jour retenu (yyyy-MM-dd) : 1er janvier de l'année, 1er du mois, ou le jour choisi. */
  readonly depuis = computed(() => {
    const annee = this.filtreAnnee();
    if (!annee) return null;
    const deux = (n: number) => String(n).padStart(2, '0');
    return `${annee}-${deux(this.filtreMois() ?? 1)}-${deux(this.filtreJour() ?? 1)}`;
  });
  readonly libellePeriode = computed(() => {
    const annee = this.filtreAnnee(), mois = this.filtreMois(), jour = this.filtreJour();
    if (!annee) return null;
    if (!mois) return `à partir de ${annee}`;
    if (!jour) return `à partir de ${this.MOIS[mois - 1]} ${annee}`;
    return `à partir du ${jour === 1 ? '1er' : jour} ${this.MOIS[mois - 1]} ${annee}`;
  });

  // ---------- Sélection + export PDF / Excel (équipe : admin, collaborateur, développeur) ----------
  readonly estEquipe = computed(() => !this.auth.estClient());
  /** Tickets cochés : conservés d'une page à l'autre et quand les filtres changent. */
  readonly selection = signal<ReadonlySet<number>>(new Set());
  readonly pageCochee = computed(() => this.tickets().length > 0 && this.tickets().every(t => this.selection().has(t.id)));
  readonly pagePartielle = computed(() => !this.pageCochee() && this.tickets().some(t => this.selection().has(t.id)));
  readonly exportEnCours = signal(false);
  /** Menu « Exporter » ouvert : choix du format (PDF ou Excel). */
  readonly menuExport = signal(false);

  basculerSelection(id: number) {
    this.selection.update(s => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  }

  /** Coche (ou décoche) tous les tickets de la page affichée. */
  basculerPage() {
    const ids = this.tickets().map(t => t.id);
    const cocher = !this.pageCochee();
    this.selection.update(s => {
      const n = new Set(s);
      for (const id of ids) cocher ? n.add(id) : n.delete(id);
      return n;
    });
  }

  viderSelection() {
    this.selection.set(new Set());
  }

  /**
   * Export des tickets cochés, sinon de tous ceux des filtres actuels (toutes pages confondues) :
   * PDF = rapport avec logo et synthèse ; Excel = tableau de données seul.
   */
  exporter(format: 'pdf' | 'excel') {
    this.menuExport.set(false);
    const ids = [...this.selection()];
    this.exportEnCours.set(true);
    this.ticketService.exporter(ids.length ? { format, ids } : {
      format,
      etat: this.filtreEtat() || undefined,
      produit: this.filtreProduit() || undefined,
      search: this.recherche() || undefined,
      membre: this.filtreMembre().trim() || undefined,
      depuis: this.depuis() ?? undefined
    }).subscribe({
      next: fichier => {
        this.exportEnCours.set(false);
        const n = ids.length || this.total();
        const pdf = format === 'pdf';
        telecharger(fichier, `${pdf ? 'rapport-tickets' : 'tickets'}-${horodatage(new Date())}.${pdf ? 'pdf' : 'xlsx'}`);
        this.toast.succes('Export terminé', `${n} ticket${n > 1 ? 's' : ''} dans le fichier ${pdf ? 'PDF' : 'Excel'}.`);
      },
      error: async err => {
        this.exportEnCours.set(false);
        // Réponse binaire attendue : l'erreur { message } arrive donc sous forme de Blob.
        let message = "Le fichier n'a pas pu être généré.";
        try { message = JSON.parse(await (err.error as Blob).text()).message || message; } catch { /* message par défaut */ }
        this.toast.erreur('Export impossible', message);
      }
    });
  }

  @HostListener('document:keydown.escape')
  surEchap() { this.menuExport.set(false); }

  /** Clic en dehors du bouton « Exporter » et de son menu : on le ferme. */
  @HostListener('document:click', ['$event'])
  surClicExterieur(event: MouseEvent) {
    if (this.menuExport() && !this.hote.nativeElement.querySelector('.export-zone')?.contains(event.target as Node))
      this.menuExport.set(false);
  }

  readonly page = signal(1);
  readonly pageSize = 20;

  private timerRecherche?: ReturnType<typeof setTimeout>;
  private timerMembre?: ReturnType<typeof setTimeout>;

  readonly nbPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly filtresActifs = computed(() =>
    !!(this.filtreEtat() || this.filtreProduit() || this.recherche() || this.filtreMembre().trim() || this.depuis()
       || this.filtreEquipe())
  );

  readonly aujourdhui = new Date();

  readonly salutation = computed(() => {
    const heure = new Date().getHours();
    const formule = heure >= 18 ? 'Bonsoir' : 'Bonjour';
    const prenom = this.auth.prenomAffiche();
    return prenom ? `${formule}, ${prenom}` : formule;
  });

  readonly sousTitreAccueil = computed(() => {
    if (this.auth.estClient()) {
      return 'Suivez l\'avancement de vos demandes. Notre équipe vous répond au fil du traitement.';
    }
    if (this.auth.estDev()) {
      return 'Vos développements en cours. Un collaborateur vous assigne les tickets et teste vos livraisons.';
    }
    if (this.auth.estCollaborateur()) {
      const produits = this.auth.user()?.produits?.map(p => p.nom) ?? [];
      const ouverts = this.compteurs()['Ouvert'] ?? 0;
      const debut = ouverts > 0
        ? `${ouverts} ticket${ouverts > 1 ? 's' : ''} ouvert${ouverts > 1 ? 's' : ''} attend${ouverts > 1 ? 'ent' : ''} une prise en charge`
        : 'Aucun ticket en attente de prise en charge';
      return produits.length ? `${debut} sur ${produits.join(', ')}.` : `${debut}.`;
    }
    return 'Vue d\'ensemble des demandes de tous les clients et de tous les produits.';
  });

  readonly titrePage = computed(() => {
    if (this.auth.estClient()) {
      const choix = this.filtreEquipe();
      if (choix === '*') return 'Demandes de la société';
      if (choix) return `Demandes de ${this.equipe().find(m => m.email === choix)?.nom ?? choix}`;
      return 'Mes demandes';
    }
    if (this.auth.estCollaborateur()) return 'Tickets de mes produits';
    return 'Tous les tickets';
  });

  constructor() {
    this.referenceService.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });
    if (this.auth.estAdmin()) {
      this.ticketService.membresEquipe().subscribe({
        next: m => {
          // Un même nom peut exister sous plusieurs comptes (casse différente) : une seule suggestion.
          const vus = new Map<string, string>();
          for (const { nom } of m) if (!vus.has(nom.toLowerCase())) vus.set(nom.toLowerCase(), nom);
          this.nomsMembres.set([...vus.values()]);
        },
        error: () => {}
      });
    }

    // Client administrateur de sa société : son équipe (rechargée quand il change de société consultée).
    effect(() => {
      this.auth.societeActive();
      if (!this.auth.estClient()) return;
      this.filtreEquipe.set('');
      this.ticketService.equipeClient().subscribe({ next: e => this.equipe.set(e), error: () => this.equipe.set([]) });
    }, { allowSignalWrites: true });

    // Rechargement automatique quand SignalR signale un changement ou un changement de société.
    effect(() => {
      this.notifications.signalRafraichir();
      this.auth.societeActive();
      this.charger();
      this.chargerCompteurs();
    }, { allowSignalWrites: true });
  }

  charger() {
    this.chargement.set(true);
    this.erreur.set(null);

    this.ticketService.lister({
      etat: this.filtreEtat() || undefined,
      produit: this.filtreProduit() || undefined,
      search: this.recherche() || undefined,
      membre: this.filtreMembre().trim() || undefined,
      depuis: this.depuis() ?? undefined,
      equipe: this.filtreEquipe() || undefined,
      page: this.page(),
      pageSize: this.pageSize
    }).subscribe({
      next: resultat => {
        this.tickets.set(resultat.items);
        this.total.set(resultat.total);
        this.chargement.set(false);
      },
      error: () => {
        this.chargement.set(false);
        this.erreur.set("Impossible de charger les tickets. Vérifiez que l'API est démarrée.");
      }
    });
  }

  /** Une seule requête : le serveur compte les tickets visibles par état (même membre et même période que la liste). */
  private chargerCompteurs() {
    this.ticketService.compteurs(this.filtreMembre().trim() || undefined, this.depuis() ?? undefined,
      this.filtreEquipe() || undefined).subscribe({
      next: c => this.compteurs.set(c),
      error: () => {}
    });
  }

  /** Saisie du nom / prénom d'un membre : filtre la liste ET les cartes (après une courte pause de frappe). */
  surMembre(valeur: string) {
    this.filtreMembre.set(valeur);
    clearTimeout(this.timerMembre);
    this.timerMembre = setTimeout(() => {
      this.page.set(1);
      this.charger();
      this.chargerCompteurs();
    }, 400);
  }

  /**
   * Choix de la période : l'année d'abord, puis le mois et le jour pour affiner.
   * Sans année, pas de mois ; sans mois, pas de jour. Filtre la liste ET les cartes.
   */
  definirPeriode(annee: number | null, mois: number | null, jour: number | null) {
    if (!annee) mois = null;
    if (!mois) jour = null;
    if (annee && mois && jour) jour = Math.min(jour, new Date(annee, mois, 0).getDate());   // 31 → 28 en février
    this.filtreAnnee.set(annee);
    this.filtreMois.set(mois);
    this.filtreJour.set(jour);
    this.page.set(1);
    this.charger();
    this.chargerCompteurs();
  }

  /** Clic sur une carte KPI : filtre par etat (re-clic = annule). */
  filtrerParCarte(etat: string) {
    this.filtreEtat.set(this.filtreEtat() === etat ? '' : etat);
    this.page.set(1);
    this.charger();
  }

  surRecherche(valeur: string) {
    this.recherche.set(valeur);
    clearTimeout(this.timerRecherche);
    this.timerRecherche = setTimeout(() => {
      this.page.set(1);
      this.charger();
    }, 350);
  }

  surFiltre() {
    this.page.set(1);
    this.charger();
  }

  reinitialiser() {
    this.filtreEtat.set('');
    this.filtreProduit.set('');
    this.recherche.set('');
    const compteursFiltres = !!this.filtreMembre().trim() || !!this.depuis() || !!this.filtreEquipe();
    this.filtreEquipe.set('');
    this.filtreMembre.set('');
    clearTimeout(this.timerMembre);
    this.filtreAnnee.set(null);
    this.filtreMois.set(null);
    this.filtreJour.set(null);
    this.page.set(1);
    this.charger();
    if (compteursFiltres) this.chargerCompteurs();
  }

  changerPage(delta: number) {
    const cible = this.page() + delta;
    if (cible < 1 || cible > this.nbPages()) return;
    this.page.set(cible);
    this.charger();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Ticket dont la suppression est demandée (admin) : ouvre la confirmation. */
  readonly aSupprimer = signal<Ticket | null>(null);

  surSuppression() {
    const supprime = this.aSupprimer()?.id;
    if (supprime != null && this.selection().has(supprime)) this.basculerSelection(supprime);
    this.aSupprimer.set(null);
    // La page courante peut devenir vide : on recule d'une page si besoin.
    if (this.tickets().length === 1 && this.page() > 1) this.page.update(p => p - 1);
    this.charger();
    this.chargerCompteurs();
  }

  ouvrir(ticket: Ticket) {
    this.router.navigate(['/tickets', ticket.id]);
  }
}

/** Propose le fichier au téléchargement (nom choisi côté client). */
function telecharger(fichier: Blob, nom: string) {
  const url = URL.createObjectURL(fichier);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 20261012-1405 */
function horodatage(d: Date): string {
  const deux = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${deux(d.getMonth() + 1)}${deux(d.getDate())}-${deux(d.getHours())}${deux(d.getMinutes())}`;
}
