import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Collaborateur, ContactClient, CreerCompteContactRequest, Produit, SocieteClient, User } from '../models/models';

/** Donnees de reference : produits, societes / contacts Divalto, collaborateurs. */
@Injectable({ providedIn: 'root' })
export class ReferenceService {
  constructor(private http: HttpClient) {}

  produits() {
    return this.http.get<Produit[]>(`${environment.apiUrl}/produits`);
  }

  /** Societes clientes Divalto (recherche par nom ou code tiers). */
  societes(recherche: string) {
    const params = new HttpParams().set('recherche', recherche);
    return this.http.get<SocieteClient[]>(`${environment.apiUrl}/clients/societes`, { params });
  }

  /** Contacts (emails) d'une societe. */
  contacts(tiers: string) {
    return this.http.get<ContactClient[]>(
      `${environment.apiUrl}/clients/societes/${encodeURIComponent(tiers)}/contacts`);
  }

  /** Cree le compte Helpdesk d'un contact Divalto qui n'en a pas encore. */
  creerCompteContact(requete: CreerCompteContactRequest) {
    return this.http.post<User>(`${environment.apiUrl}/clients/comptes`, requete);
  }

  /** Collaborateurs actifs affectes a un produit. */
  collaborateurs(produit: string) {
    const params = new HttpParams().set('produit', produit);
    return this.http.get<Collaborateur[]>(`${environment.apiUrl}/users/collaborateurs`, { params });
  }
}
