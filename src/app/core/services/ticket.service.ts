import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import {
  CreateTicketRequest, DoublonTicket, Equipier, ExportTickets, MembreEquipe, NotificationHisto, NotificationPage, Ticket, TicketFilters, TicketPage,
  UpdateTicketRequest
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
    if (filtres.membre) params = params.set('membre', filtres.membre);
    if (filtres.depuis) params = params.set('depuis', filtres.depuis);
    if (filtres.equipe) params = params.set('equipe', filtres.equipe);

    return this.http.get<TicketPage>(this.url, { params });
  }

  etats() {
    return this.http.get<string[]>(`${this.url}/etats`);
  }

  /** Tableau de bord : nombre de tickets visibles par état (« Ouvert » → 95, …), traités par un membre / depuis une date si précisés. */
  compteurs(membre?: string, depuis?: string, equipe?: string) {
    let params = new HttpParams();
    if (membre) params = params.set('membre', membre);
    if (depuis) params = params.set('depuis', depuis);
    if (equipe) params = params.set('equipe', equipe);
    return this.http.get<Record<string, number>>(`${this.url}/compteurs`, { params });
  }

  /** Export PDF (rapport) ou Excel (tableau de données) : les tickets cochés, sinon tous ceux des filtres. */
  exporter(demande: ExportTickets) {
    return this.http.post(`${this.url}/export`, demande, { responseType: 'blob' });
  }

  /** Client administrateur de sa société : les membres de son équipe (vide pour les autres). */
  equipeClient() {
    return this.http.get<Equipier[]>(`${this.url}/equipe`);
  }

  /** Admin : membres de l'équipe (suggestions du filtre « traités par »). */
  membresEquipe() {
    return this.http.get<MembreEquipe[]>(`${this.url}/membres`);
  }

  parId(id: number) {
    return this.http.get<Ticket>(`${this.url}/${id}`);
  }

  creer(request: CreateTicketRequest) {
    return this.http.post<Ticket>(this.url, request);
  }

  /** Avertissement de doublon : tickets récents du même client « proches » (intitulé + description + produit). */
  verifierDoublon(request: {
    clientTiers?: string | null; contactEmail?: string | null; societe?: string | null;
    intitule: string; produit?: string | null; description?: string | null;
  }) {
    return this.http.post<DoublonTicket[]>(`${this.url}/verifier-doublon`, request);
  }

  modifier(id: number, request: UpdateTicketRequest) {
    return this.http.put<Ticket>(`${this.url}/${id}`, request);
  }

  /** Fusionne le ticket source dans la cible (admin) : bascule suivi + discussion, clôture la source. */
  fusionner(sourceId: number, cibleId: number) {
    return this.http.post<Ticket>(`${this.url}/${sourceId}/fusionner`, { cibleId });
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
