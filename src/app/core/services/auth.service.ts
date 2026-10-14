import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, Role, SocieteClient, User } from '../models/models';
import { ToastService } from './toast.service';

const CLE_TOKEN = 'hd_token';
const CLE_USER = 'hd_user';
const CLE_SOCIETE = 'hd_societe';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.lireUserStocke());
  /** Client multi-sociétés : nom de la société actuellement consultée. */
  private readonly _societeActive = signal<string | null>(localStorage.getItem(CLE_SOCIETE));

  readonly user = this._user.asReadonly();
  readonly estConnecte = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.role ?? null);
  readonly estAdmin = computed(() => this.role() === 'ROLE_ADMIN');
  readonly estCollaborateur = computed(() => this.role() === 'ROLE_USER');
  readonly estDev = computed(() => this.role() === 'ROLE_DEV');
  readonly estClient = computed(() => this.role() === 'ROLE_CLIENT');

  /** Sociétés rattachées au client connecté (vide pour les autres rôles). */
  readonly societesClient = computed<SocieteClient[]>(() => this._user()?.societes ?? []);
  readonly societeActive = this._societeActive.asReadonly();

  constructor(private http: HttpClient, private router: Router, private toast: ToastService) {
    // Au démarrage (session restaurée), on s'assure que la société active est valide.
    this.normaliserSocieteActive();
  }

  login(request: LoginRequest) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, request).pipe(
      tap(reponse => {
        localStorage.setItem(CLE_TOKEN, reponse.token);
        localStorage.setItem(CLE_USER, JSON.stringify(reponse.user));
        this._user.set(reponse.user);
        this.normaliserSocieteActive();
      })
    );
  }

  /** Change la société consultée par le client (persistée pour la session). */
  choisirSociete(nom: string): void {
    const existe = this.societesClient().some(s => s.nom === nom);
    const valeur = existe ? nom : (this.societesClient()[0]?.nom ?? null);
    this._societeActive.set(valeur);
    if (valeur) localStorage.setItem(CLE_SOCIETE, valeur);
    else localStorage.removeItem(CLE_SOCIETE);
  }

  /** Cale la société active sur la liste du client : garde le choix s'il est valide, sinon la 1re. */
  private normaliserSocieteActive(): void {
    const societes = this.societesClient();
    if (societes.length === 0) { this._societeActive.set(null); localStorage.removeItem(CLE_SOCIETE); return; }
    const courante = this._societeActive();
    this.choisirSociete(courante && societes.some(s => s.nom === courante) ? courante : societes[0].nom);
  }

  /**
   * @param motif 'volontaire' (bouton Se deconnecter) ou 'expiree' (jeton refuse par l'API :
   *              session expiree, compte desactive ou supprime).
   */
  logout(motif: 'volontaire' | 'expiree' = 'volontaire'): void {
    const etaitConnecte = this._user() !== null;
    localStorage.removeItem(CLE_TOKEN);
    localStorage.removeItem(CLE_USER);
    localStorage.removeItem(CLE_SOCIETE);
    this._user.set(null);
    this._societeActive.set(null);
    this.router.navigate(['/connexion']);

    if (!etaitConnecte) return;
    if (motif === 'volontaire') {
      this.toast.succes('Vous êtes déconnecté', 'À bientôt sur votre espace support.');
    } else {
      this.toast.erreur('Session expirée', 'Reconnectez-vous pour continuer.');
    }
  }

  /** Prenom si disponible, sinon nom complet (message d'accueil). */
  prenomAffiche(): string {
    const u = this._user();
    return u?.prenom || u?.nomComplet || u?.nom || '';
  }

  get token(): string | null {
    return localStorage.getItem(CLE_TOKEN);
  }

  aLeRole(...roles: Role[]): boolean {
    const role = this.role();
    return role !== null && roles.includes(role);
  }

  private lireUserStocke(): User | null {
    const brut = localStorage.getItem(CLE_USER);
    if (!brut) return null;
    try {
      return JSON.parse(brut) as User;
    } catch {
      return null;
    }
  }
}
