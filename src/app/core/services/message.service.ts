import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MessageChat {
  id: number;
  ticketId: number;
  auteurId: number;
  auteurNom: string | null;
  auteurRole: string | null;
  /** L'utilisateur courant est l'auteur (bulle à droite). */
  deMoi: boolean;
  /** L'auteur est un client (sinon : équipe). */
  duClient: boolean;
  contenu: string;
  dateEnvoi: string;
  /** Pièce jointe (null si aucune). */
  fichierNom?: string | null;
  fichierType?: string | null;
  fichierTaille?: number | null;
  /** Vrai tant que l'envoi optimiste n'est pas confirmé par le serveur (bulle atténuée). */
  enCours?: boolean;
}

/** Une conversation non lue (menu Messenger). */
export interface ConversationApercu {
  ticketId: number;
  intitule: string | null;
  dernierMessage: string | null;
  dernierAuteur: string | null;
  derniereDate: string;
  nonLus: number;
}

export interface MessagesApercu {
  total: number;
  conversations: ConversationApercu[];
}

/** Événement SignalR poussé à la réception d'un message (voir NotificationService). */
export interface MessageRecu {
  ticketId: number;
  auteurId: number;
  auteurNom: string | null;
  duClient: boolean;
  /** Société du ticket : permet au client multi-sociétés d'ignorer les autres sociétés. */
  societe?: string | null;
  apercu: string;
  date: string;
}

@Injectable({ providedIn: 'root' })
export class MessageService {
  private http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  /** Dernier fil chargé par ticket : réouvrir un chat l'affiche tout de suite, puis on rafraîchit. */
  private readonly cacheFil = new Map<number, MessageChat[]>();

  /** Messages déjà en cache pour ce ticket (affichage immédiat sans spinner), sinon undefined. */
  cache(ticketId: number): MessageChat[] | undefined {
    return this.cacheFil.get(ticketId);
  }

  fil(ticketId: number): Observable<MessageChat[]> {
    return this.http.get<MessageChat[]>(`${this.base}/tickets/${ticketId}/messages`)
      .pipe(tap(liste => this.cacheFil.set(ticketId, liste)));
  }

  /** Met à jour le cache après un envoi (pour une réouverture immédiate et à jour). */
  majCache(ticketId: number, liste: MessageChat[]): void {
    this.cacheFil.set(ticketId, liste);
  }

  /** Vide le cache (ex. à la déconnexion, pour ne pas montrer les messages d'un autre compte). */
  viderCache(): void {
    this.cacheFil.clear();
  }

  envoyer(ticketId: number, contenu: string): Observable<MessageChat> {
    return this.http.post<MessageChat>(`${this.base}/tickets/${ticketId}/messages`, { contenu });
  }

  /** Envoie un message avec une pièce jointe (texte facultatif). */
  envoyerAvecFichier(ticketId: number, contenu: string, fichier: File): Observable<MessageChat> {
    const donnees = new FormData();
    if (contenu) donnees.append('contenu', contenu);
    donnees.append('fichier', fichier, fichier.name);
    return this.http.post<MessageChat>(`${this.base}/tickets/${ticketId}/messages/fichier`, donnees);
  }

  /** Contenu de la pièce jointe d'un message (blob), pour l'afficher ou la télécharger. */
  telechargerFichier(messageId: number): Observable<Blob> {
    return this.http.get(`${this.base}/messages/${messageId}/fichier`, { responseType: 'blob' });
  }

  marquerLu(ticketId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/tickets/${ticketId}/messages/lu`, {});
  }

  /** Supprime un message (son auteur, ou un administrateur). */
  supprimer(messageId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/messages/${messageId}`);
  }

  apercu(): Observable<MessagesApercu> {
    return this.http.get<MessagesApercu>(`${this.base}/messages/apercu`);
  }
}
