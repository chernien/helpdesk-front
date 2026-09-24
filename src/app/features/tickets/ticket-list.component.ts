import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';
import { ReferenceService } from '../../core/services/reference.service';
import { TicketService } from '../../core/services/ticket.service';
import {
  Produit, Ticket, classeEtat, classeImportance, classeProduit
} from '../../core/models/models';

@Component({
  selector: 'hd-ticket-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './ticket-list.component.html',
  styleUrl: './ticket-list.component.scss'
})
export class TicketListComponent {
  private ticketService = inject(TicketService);
  private referenceService = inject(ReferenceService);
  private notifications = inject(NotificationService);
  private router = inject(Router);
  readonly auth = inject(AuthService);

  readonly classeEtat = classeEtat;
  readonly classeImportance = classeImportance;
  readonly classeProduit = classeProduit;

  readonly tickets = signal<Ticket[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly etats = signal<string[]>([]);
  readonly produits = signal<Produit[]>([]);

  /** Totaux reels par etat (independants de la pagination). */
  readonly compteurs = signal({ ouvert: 0, cours: 0, dev: 0 });

  // Filtres
  readonly filtreEtat = signal('');
  readonly filtreProduit = signal('');
  readonly recherche = signal('');
  readonly page = signal(1);
  readonly pageSize = 20;

  private timerRecherche?: ReturnType<typeof setTimeout>;

  readonly nbPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));
  readonly filtresActifs = computed(() =>
    !!(this.filtreEtat() || this.filtreProduit() || this.recherche())
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
      const ouverts = this.compteurs().ouvert;
      const debut = ouverts > 0
        ? `${ouverts} ticket${ouverts > 1 ? 's' : ''} ouvert${ouverts > 1 ? 's' : ''} attend${ouverts > 1 ? 'ent' : ''} une prise en charge`
        : 'Aucun ticket en attente de prise en charge';
      return produits.length ? `${debut} sur ${produits.join(', ')}.` : `${debut}.`;
    }
    return 'Vue d\'ensemble des demandes de tous les clients et de tous les produits.';
  });

  readonly titrePage = computed(() => {
    if (this.auth.estClient()) return 'Mes demandes';
    if (this.auth.estCollaborateur()) return 'Tickets de mes produits';
    return 'Tous les tickets';
  });

  constructor() {
    this.ticketService.etats().subscribe({ next: e => this.etats.set(e), error: () => {} });
    this.referenceService.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });

    // Rechargement automatique quand SignalR signale un changement
    effect(() => {
      this.notifications.signalRafraichir();
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

  /** Trois requetes legeres (pageSize 1) : seuls les totaux nous interessent. */
  private chargerCompteurs() {
    const compte = (etat: string) =>
      this.ticketService.lister({ etat, page: 1, pageSize: 1 });

    forkJoin({
      ouvert: compte('Ouvert'),
      cours: compte('En cours'),
      dev: compte('En développement')
    }).subscribe({
      next: r => this.compteurs.set({
        ouvert: r.ouvert.total,
        cours: r.cours.total,
        dev: r.dev.total
      }),
      error: () => {}
    });
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
    this.page.set(1);
    this.charger();
  }

  changerPage(delta: number) {
    const cible = this.page() + delta;
    if (cible < 1 || cible > this.nbPages()) return;
    this.page.set(cible);
    this.charger();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  ouvrir(ticket: Ticket) {
    this.router.navigate(['/tickets', ticket.id]);
  }
}
