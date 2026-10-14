import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Collaborateur, ContactClient, CreerCompteContactRequest, ModuleItem, PerimetreClientReponse, Produit, SocieteClient, User } from '../models/models';

/** Donnees de reference : produits, societes / contacts Divalto, collaborateurs. */
@Injectable({ providedIn: 'root' })
export class ReferenceService {
  constructor(private http: HttpClient) {}

  produits() {
    return this.http.get<Produit[]>(`${environment.apiUrl}/produits`);
  }
  ajouterProduit(nom: string) {
    return this.http.post<Produit>(`${environment.apiUrl}/produits`, { nom });
  }
  supprimerProduit(id: number) {
    return this.http.delete<void>(`${environment.apiUrl}/produits/${id}`);
  }

  /** Societes clientes Divalto (recherche par nom ou code tiers). */
  societes(recherche: string) {
    const params = new HttpParams().set('recherche', recherche);
    return this.http.get<SocieteClient[]>(`${environment.apiUrl}/clients/societes`, { params });
  }

  /** Societe dont un contact porte cet email (null si inconnu dans Divalto). */
  societeParEmail(email: string) {
    const params = new HttpParams().set('email', email);
    return this.http.get<SocieteClient | null>(`${environment.apiUrl}/clients/societes/par-email`, { params });
  }

  /** Contacts (emails) d'une societe. */
  /** Sociétés (codes tiers) où ce contact a « Profil Admin helpdesk » coché dans Divalto (T2.U_FLAG_ADMIN = 2). */
  societesAdmin(email: string) {
    return this.http.get<string[]>(`${environment.apiUrl}/clients/admin`, { params: { email } });
  }

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

  // ---------- Modules (gérés par l'admin) ----------
  modules() {
    return this.http.get<ModuleItem[]>(`${environment.apiUrl}/modules`);
  }
  ajouterModule(nom: string) {
    return this.http.post<ModuleItem>(`${environment.apiUrl}/modules`, { nom });
  }
  supprimerModule(id: number) {
    return this.http.delete<void>(`${environment.apiUrl}/modules/${id}`);
  }

  /**
   * Périmètre (produits + modules) à proposer dans le formulaire de ticket.
   * Sans email : le périmètre du client connecté. Avec email (admin/collab) : celui du client ciblé.
   */
  perimetreCreation(email?: string) {
    let params = new HttpParams();
    if (email) params = params.set('email', email);
    return this.http.get<PerimetreClientReponse>(`${environment.apiUrl}/tickets/perimetre-creation`, { params });
  }
}
