import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { TicketService } from '../../core/services/ticket.service';
import { NotificationHisto, classeEtat, phraseNotification } from '../../core/models/models';

@Component({
  selector: 'hd-historique',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './historique.component.html',
  styleUrl: './historique.component.scss'
})
export class HistoriqueComponent {
  private ticketService = inject(TicketService);
  private notifications = inject(NotificationService);

  readonly classeEtat = classeEtat;

  readonly evenements = signal<NotificationHisto[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(true);
  readonly chargementPlus = signal(false);
  readonly erreur = signal<string | null>(null);

  readonly recherche = signal('');
  readonly page = signal(1);
  readonly pageSize = 15;

  readonly resteACharger = computed(() => this.evenements().length < this.total());

  private timerRecherche?: ReturnType<typeof setTimeout>;

  constructor() {
    // Rechargement quand un evenement temps reel arrive
    effect(() => {
      this.notifications.signalRafraichir();
      this.page.set(1);
      this.charger(false);
    }, { allowSignalWrites: true });
  }

  charger(ajouter: boolean) {
    if (ajouter) this.chargementPlus.set(true);
    else this.chargement.set(true);
    this.erreur.set(null);

    this.ticketService.historique(this.recherche() || undefined, this.page(), this.pageSize)
      .subscribe({
        next: resultat => {
          this.evenements.set(ajouter ? [...this.evenements(), ...resultat.items] : resultat.items);
          this.total.set(resultat.total);
          this.chargement.set(false);
          this.chargementPlus.set(false);
        },
        error: () => {
          this.chargement.set(false);
          this.chargementPlus.set(false);
          this.erreur.set("Impossible de charger l'historique. Vérifiez que l'API est démarrée.");
        }
      });
  }

  surRecherche(valeur: string) {
    this.recherche.set(valeur);
    clearTimeout(this.timerRecherche);
    this.timerRecherche = setTimeout(() => {
      this.page.set(1);
      this.charger(false);
    }, 350);
  }

  chargerPlus() {
    this.page.update(p => p + 1);
    this.charger(true);
  }

  readonly phrase = phraseNotification;

  /** Couleur du noeud de la timeline selon le type d'evenement. */
  classeNoeud(e: NotificationHisto): string {
    switch (e.typeEvent) {
      case 'CREATION':    return 'noeud n-creation';
      case 'ASSIGNATION':
      case 'ASSIGNATION_ETAT': return 'noeud n-assignation';
      case 'COMMENTAIRE': return 'noeud n-commentaire';
      case 'MISE_A_JOUR': return 'noeud n-maj';
      case 'VALIDATION_CLIENT': return 'noeud n-validation';
      case 'ANNULATION_CLIENT': return 'noeud n-annulation';
      default:            return 'noeud n-etat';
    }
  }
}
