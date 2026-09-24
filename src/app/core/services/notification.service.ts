import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { Cloche, Ticket } from '../models/models';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

/**
 * Notifications.
 * - Source de verite : le serveur (evenements persistes + date de lecture par utilisateur),
 *   donc rien n'est perdu si l'utilisateur etait deconnecte ou recharge la page.
 * - SignalR ne sert qu'a prevenir en direct : a chaque evenement, on relit la cloche.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private connexion?: signalR.HubConnection;

  /** Incremente a chaque evenement : les ecrans s'y abonnent pour se rafraichir. */
  readonly signalRafraichir = signal(0);
  readonly connecte = signal(false);

  readonly nonLues = signal(0);
  readonly cloche = signal<Cloche | null>(null);
  readonly chargementCloche = signal(false);

  constructor() {
    // Toute fin de session (bouton, session expiree, compte desactive) coupe le temps reel :
    // sinon l'ancienne connexion, liee a l'ancien jeton, bloquerait la suivante.
    effect(() => {
      if (!this.auth.estConnecte()) untracked(() => this.arreter());
    });
  }

  demarrer(): void {
    if (!this.auth.token) return;
    this.chargerCloche();

    // Une connexion vivante est reutilisee ; une connexion morte est remplacee.
    if (this.connexion && this.connexion.state !== signalR.HubConnectionState.Disconnected) return;
    if (this.connexion) {
      this.connexion.stop();
      this.connexion = undefined;
    }

    this.connexion = new signalR.HubConnectionBuilder()
      .withUrl(environment.hubUrl, { accessTokenFactory: () => this.auth.token ?? '' })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.connexion.on('ticketCree', (ticket: Ticket) => {
      this.toast.info(`Nouveau ticket #${ticket.id}`, ticket.intitule ?? undefined);
      this.surEvenement();
    });

    this.connexion.on('ticketAssigne', (ticket: Ticket) => {
      this.toast.info(`Ticket #${ticket.id} vous est assigné`, ticket.intitule ?? undefined);
      this.surEvenement();
    });

    this.connexion.on('ticketMisAJour', (ticket: Ticket) => {
      if (ticket.etat === 'Test interne' && this.auth.estCollaborateur()) {
        this.toast.info(`Ticket #${ticket.id} — développement terminé`, 'À tester en interne avant validation client.');
      } else {
        this.toast.info(`Ticket #${ticket.id} mis à jour`, ticket.etat ?? undefined);
      }
      this.surEvenement();
    });

    // Changement sur un ticket de l'equipe : pas de toast, mais la cloche et les listes se mettent a jour.
    this.connexion.on('ticketRafraichi', () => this.surEvenement());

    this.connexion.onreconnected(() => {
      this.connecte.set(true);
      this.chargerCloche(); // evenements manques pendant la coupure
    });
    this.connexion.onclose(() => this.connecte.set(false));

    this.connexion.start()
      .then(() => this.connecte.set(true))
      .catch(() => {
        // L'app reste utilisable sans temps reel ; la prochaine connexion retentera.
        this.connecte.set(false);
        this.connexion = undefined;
      });
  }

  private surEvenement() {
    this.signalRafraichir.update(n => n + 1);
    this.chargerCloche();
  }

  chargerCloche(): void {
    this.chargementCloche.set(true);
    this.http.get<Cloche>(`${environment.apiUrl}/notifications/cloche`).subscribe({
      next: c => {
        this.cloche.set(c);
        this.nonLues.set(c.nonLues);
        this.chargementCloche.set(false);
      },
      error: () => this.chargementCloche.set(false)
    });
  }

  /**
   * Ouverture du panneau : on relit d'abord la liste (qui porte l'etat lu / non lu),
   * puis on marque tout comme lu. Les elements restent surlignes pendant cette ouverture.
   */
  ouvrirCloche(): void {
    this.chargementCloche.set(true);
    this.http.get<Cloche>(`${environment.apiUrl}/notifications/cloche`).subscribe({
      next: c => {
        this.cloche.set(c);
        this.chargementCloche.set(false);
        this.nonLues.set(c.nonLues);
        this.marquerLues();
      },
      error: () => this.chargementCloche.set(false)
    });
  }

  /** Tout marquer comme lu. L'affichage garde l'etat "non lu" jusqu'a la prochaine ouverture. */
  marquerLues(): void {
    if (this.nonLues() === 0) return;
    this.nonLues.set(0);
    this.http.post<void>(`${environment.apiUrl}/notifications/marquer-lues`, {}).subscribe({
      error: () => this.chargerCloche()
    });
  }

  arreter(): void {
    this.connexion?.stop();
    this.connexion = undefined;
    this.connecte.set(false);
    this.nonLues.set(0);
    this.cloche.set(null);
  }
}
