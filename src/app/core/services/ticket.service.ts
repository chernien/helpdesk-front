import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateTicketRequest, NotificationHisto, NotificationPage, Ticket, TicketFilters, TicketPage, UpdateTicketRequest
} from '../models/models';

@Injectable({ providedIn: 'root' })
export class TicketService {
  private readonly url = `${environment.apiUrl}/tickets`;

  constructor(private http: HttpClient) {}

  lister(filtres: TicketFilters) {
    let params = new HttpParams()
      .set('page', filtres.page)
      .set('pageSize', filtres.pageSize);

    if (filtres.etat) params = params.set('etat', filtres.etat);
    if (filtres.produit) params = params.set('produit', filtres.produit);
    if (filtres.search) params = params.set('search', filtres.search);

    return this.http.get<TicketPage>(this.url, { params });
  }

  etats() {
    return this.http.get<string[]>(`${this.url}/etats`);
  }

  parId(id: number) {
    return this.http.get<Ticket>(`${this.url}/${id}`);
  }

  creer(request: CreateTicketRequest) {
    return this.http.post<Ticket>(this.url, request);
  }

  modifier(id: number, request: UpdateTicketRequest) {
    return this.http.put<Ticket>(`${this.url}/${id}`, request);
  }

  /** Joint un fichier au ticket (une seule pièce, 10 Mo max). */
  joindreFichier(id: number, fichier: File) {
    const donnees = new FormData();
    donnees.append('fichier', fichier, fichier.name);
    return this.http.post<Ticket>(`${this.url}/${id}/fichier`, donnees);
  }

  /** Contenu de la pièce jointe (blob), pour l'afficher ou la télécharger. */
  fichier(id: number) {
    return this.http.get(`${this.url}/${id}/fichier`, { responseType: 'blob' });
  }

  /** Joint une capture à la dernière action de l'utilisateur dans le suivi (phase de test). */
  joindreCaptureSuivi(id: number, fichier: File) {
    const donnees = new FormData();
    donnees.append('fichier', fichier, fichier.name);
    return this.http.post<void>(`${this.url}/${id}/suivi/fichier`, donnees);
  }

  /** Capture jointe à un événement du suivi (blob). */
  captureSuivi(id: number, evenementId: number) {
    return this.http.get(`${this.url}/${id}/suivi/${evenementId}/fichier`, { responseType: 'blob' });
  }

  /** Décision du client sur un ticket en attente de validation : valider (clôture) ou annuler. */
  validationClient(id: number, valider: boolean, commentaire: string | null) {
    return this.http.post<Ticket>(`${this.url}/${id}/validation`, { valider, commentaire });
  }

  /** Fil de suivi : toutes les evolutions du ticket. */
  suivi(id: number) {
    return this.http.get<NotificationHisto[]>(`${this.url}/${id}/suivi`);
  }

  supprimer(id: number) {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  /** Historique des notifications (timeline des evenements de tickets). */
  historique(search: string | undefined, page: number, pageSize: number) {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<NotificationPage>(`${environment.apiUrl}/notifications`, { params });
  }
}
