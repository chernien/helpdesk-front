import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, LoginResponse, Role, User } from '../models/models';
import { ToastService } from './toast.service';

const CLE_TOKEN = 'hd_token';
const CLE_USER = 'hd_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _user = signal<User | null>(this.lireUserStocke());

  readonly user = this._user.asReadonly();
  readonly estConnecte = computed(() => this._user() !== null);
  readonly role = computed(() => this._user()?.role ?? null);
  readonly estAdmin = computed(() => this.role() === 'ROLE_ADMIN');
  readonly estCollaborateur = computed(() => this.role() === 'ROLE_USER');
  readonly estDev = computed(() => this.role() === 'ROLE_DEV');
  readonly estClient = computed(() => this.role() === 'ROLE_CLIENT');

  constructor(private http: HttpClient, private router: Router, private toast: ToastService) {}

  login(request: LoginRequest) {
    return this.http.post<LoginResponse>(`${environment.apiUrl}/auth/login`, request).pipe(
      tap(reponse => {
        localStorage.setItem(CLE_TOKEN, reponse.token);
        localStorage.setItem(CLE_USER, JSON.stringify(reponse.user));
        this._user.set(reponse.user);
      })
    );
  }

  /**
   * @param motif 'volontaire' (bouton Se deconnecter) ou 'expiree' (jeton refuse par l'API :
   *              session expiree, compte desactive ou supprime).
   */
  logout(motif: 'volontaire' | 'expiree' = 'volontaire'): void {
    const etaitConnecte = this._user() !== null;
    localStorage.removeItem(CLE_TOKEN);
    localStorage.removeItem(CLE_USER);
    this._user.set(null);
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
