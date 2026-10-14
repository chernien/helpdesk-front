import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { Cloche, Ticket } from '../models/models';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { ConversationApercu, MessageRecu, MessageService } from './message.service';
import { AgentService, BlocageIa } from './agent.service';

/** Lien e-mail ↔ ticket poussé en direct (badge « Ticket #N » dans la boîte mail). */
export interface LienEmailTicket {
  ticketId: number;
  messageId: string | null;
  threadId: string | null;
  expediteur: string | null;
  objet: string | null;
  date: string | null;
}

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
  private messageService = inject(MessageService);
  private agentService = inject(AgentService);
  private connexion?: signalR.HubConnection;

  /** Incremente a chaque evenement : les ecrans s'y abonnent pour se rafraichir. */
  readonly signalRafraichir = signal(0);
  readonly connecte = signal(false);

  readonly nonLues = signal(0);
  readonly cloche = signal<Cloche | null>(null);
  readonly chargementCloche = signal(false);

  // ─── Discussion (Messenger) ────────────────────────────────────────────────
  /** Total des messages de chat non lus (badge Messenger). */
  readonly messagesNonLus = signal(0);
  /** Conversations non lues (menu Messenger). */
  readonly apercuMessages = signal<ConversationApercu[]>([]);
  /** Incremente a chaque message recu (d'un autre) : un fil ouvert s'y abonne. */
  readonly signalMessage = signal(0);
  /** Ticket du dernier message recu : un fil ouvert ne se recharge que si c'est le sien. */
  readonly dernierTicketMessage = signal<number | null>(null);

  // ─── Boîte mail : lien e-mail ↔ ticket en direct ──────────────────────────
  /** Dernier e-mail transformé en ticket (pour afficher le badge « Ticket #N » sans « Actualiser »). */
  readonly dernierLienEmail = signal<LienEmailTicket | null>(null);

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
    this.rafraichirMessages();
    // Agent IA (admin / collaborateur) : modèle en quota pendant l'absence → popup dès l'ouverture.
    if (this.auth.estAdmin() || this.auth.estCollaborateur()) this.agentService.verifier();

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
      if (!this.concerneSocieteActive(ticket.client)) return;
      this.toast.info(`Nouveau ticket #${ticket.id}`, ticket.intitule ?? undefined);
      this.surEvenement();
    });

    this.connexion.on('ticketAssigne', (ticket: Ticket) => {
      if (!this.concerneSocieteActive(ticket.client)) return;
      this.toast.info(`Ticket #${ticket.id} vous est assigné`, ticket.intitule ?? undefined);
      this.surEvenement();
    });

    this.connexion.on('ticketMisAJour', (ticket: Ticket) => {
      if (!this.concerneSocieteActive(ticket.client)) return;
      if (ticket.etat === 'Test interne' && this.auth.estCollaborateur()) {
        this.toast.info(`Ticket #${ticket.id} — développement terminé`, 'À tester en interne avant validation client.');
      } else {
        this.toast.info(`Ticket #${ticket.id} mis à jour`, ticket.etat ?? undefined);
      }
      this.surEvenement();
    });

    // Changement sur un ticket de l'equipe : pas de toast, mais la cloche et les listes se mettent a jour.
    this.connexion.on('ticketRafraichi', () => this.surEvenement());

    // Un e-mail vient d'être transformé en ticket : la boîte mail met son badge à jour en direct.
    this.connexion.on('emailLieTicket', (p: LienEmailTicket) => this.dernierLienEmail.set(p));

    // Nouveau message de discussion (chat).
    this.connexion.on('messageRecu', (m: MessageRecu) => this.surMessage(m));

    // Agent IA : le modèle a atteint son quota (ou ne répond plus) → popup de choix du modèle.
    this.connexion.on('agentBloque', (b: BlocageIa) => this.agentService.signalerBlocage(b));

    // Message supprimé : un fil ouvert se recharge, le badge se met à jour (sans toast).
    this.connexion.on('messageSupprime', (m: { ticketId: number }) => {
      this.dernierTicketMessage.set(m.ticketId);
      this.signalMessage.update(n => n + 1);
      this.rafraichirMessages();
    });

    this.connexion.onreconnected(() => {
      this.connecte.set(true);
      this.chargerCloche(); // evenements manques pendant la coupure
      this.rafraichirMessages();
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

  /**
   * Client multi-sociétés : un événement d'une autre société que celle consultée est ignoré
   * (ni toast, ni rafraîchissement). Pour les autres rôles ou sans société active : toujours vrai.
   */
  private concerneSocieteActive(societe: string | null | undefined): boolean {
    if (!this.auth.estClient()) return true;
    const active = this.auth.societeActive();
    if (!active) return true;
    return (societe ?? '').trim() === active;
  }

  /** Message de chat reçu. On ignore l'écho de ses propres messages (l'UI est déjà à jour). */
  private surMessage(m: MessageRecu) {
    if (m.auteurId === this.auth.user()?.id) return;
    if (!this.concerneSocieteActive(m.societe)) return;
    this.dernierTicketMessage.set(m.ticketId);
    this.signalMessage.update(n => n + 1);
    const de = m.auteurNom ? ` de ${m.auteurNom}` : '';
    this.toast.info(`Nouveau message — Ticket #${m.ticketId}`, `${m.apercu}`.trim() || `Message${de}`);
    this.rafraichirMessages();
  }

  /**
   * Marque une conversation lue côté client (sans requête) : baisse le badge tout de suite
   * quand on ouvre un chat, au lieu d'attendre un rechargement de l'aperçu depuis la base distante.
   */
  marquerConversationLueLocalement(ticketId: number): void {
    const conv = this.apercuMessages().find(c => c.ticketId === ticketId);
    if (!conv || conv.nonLus === 0) return;
    this.messagesNonLus.update(n => Math.max(0, n - conv.nonLus));
    this.apercuMessages.update(liste => liste.map(c => c.ticketId === ticketId ? { ...c, nonLus: 0 } : c));
  }

  /** Recharge l'aperçu Messenger (conversations non lues + total). */
  rafraichirMessages(): void {
    this.messageService.apercu().subscribe({
      next: a => {
        this.apercuMessages.set(a.conversations);
        this.messagesNonLus.set(a.total);
      },
      error: () => { /* le badge reste inchangé */ }
    });
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
    this.messagesNonLus.set(0);
    this.apercuMessages.set([]);
    this.dernierLienEmail.set(null);
    this.messageService.viderCache();
    this.agentService.reinitialiser();
  }
}
