import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Modèle IA proposé pour l'agent. */
export interface ModeleIa {
  fournisseur: string;
  id: string;
}

/** IA bloquée : quota atteint (quota = true) ou modèle indisponible. L'agent est en pause. */
export interface BlocageIa {
  /** Modèle bloqué ; null quand tous les modèles sont épuisés (mode automatique). */
  modele: string | null;
  quota: boolean;
  /** Mode automatique : aucun modèle n'a pu répondre. */
  tousLesModeles: boolean;
}

/** Modèle momentanément écarté (quota / indisponible), retenté automatiquement à l'heure de reprise. */
export interface ModeleEnPause {
  id: string;
  quota: boolean;
  reprise: string;
}

export interface AgentStatut {
  /** Fonctionnalité disponible (clé IA configurée côté serveur). */
  disponible: boolean;
  /** Une boîte mail est connectée (requis pour activer l'agent). */
  aBoite: boolean;
  /** L'agent est actif sur la boîte de l'utilisateur. */
  actif: boolean;
  /** Les tickets créés par l'agent sont auto-affectés à l'utilisateur. */
  autoAssign: boolean;
  /** Modèle choisi ; null = automatique (bascule de modèle en modèle). */
  modele: string | null;
  /** Modèles proposés (pour basculer de l'un à l'autre). */
  modeles: ModeleIa[];
  /** IA bloquée (quota / indisponible) : en pause jusqu'au choix de l'utilisateur ou la reprise. */
  blocage: BlocageIa | null;
  /** Modèles écartés pour l'instant, avec leur heure de reprise. */
  modelesEnPause: ModeleEnPause[];
  /** Activité (depuis le démarrage de l'API). */
  derniereExecution: string | null;
  emailsTraites: number;
  ticketsCrees: number;
  derniereErreur: string | null;
}

/** Libellé court d'un modèle (null = mode automatique). */
export function libelleModele(modele: string | null | undefined): string {
  return modele ?? 'Automatique';
}

/**
 * Agent IA e-mail → ticket, par utilisateur (admin / collaborateur).
 * L'état est partagé : barre de la boîte mail, menu profil et popup de choix du modèle.
 */
@Injectable({ providedIn: 'root' })
export class AgentService {
  private http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/agent`;

  /** Dernier statut connu de l'agent de l'utilisateur. */
  readonly etat = signal<AgentStatut | null>(null);
  /** Popup « modèle IA » : ouvert (avec le blocage éventuel à signaler) ou fermé (null). */
  readonly dialogue = signal<{ blocage: BlocageIa | null } | null>(null);

  statut() {
    return this.http.get<AgentStatut>(`${this.url}/statut`).pipe(tap(s => this.etat.set(s)));
  }

  activer(actif: boolean, autoAssign: boolean, modele: string | null) {
    return this.http.post<AgentStatut>(`${this.url}/activer`, { actif, autoAssign, modele })
      .pipe(tap(s => this.etat.set(s)));
  }

  /** À l'ouverture de l'app : si le modèle est bloqué, on prévient tout de suite. */
  verifier(): void {
    this.statut().subscribe({
      next: s => { if (s.blocage) this.dialogue.set({ blocage: s.blocage }); },
      error: () => { /* agent indisponible : rien à signaler */ }
    });
  }

  /** Alerte en direct : le modèle vient d'atteindre son quota (ou ne répond plus). */
  signalerBlocage(blocage: BlocageIa): void {
    this.dialogue.set({ blocage });
    this.statut().subscribe({ error: () => {} });
  }

  /** Ouvre le choix du modèle (depuis la boîte mail ou le menu profil). */
  ouvrirChoix(): void {
    this.dialogue.set({ blocage: this.etat()?.blocage ?? null });
  }

  fermerDialogue(): void {
    this.dialogue.set(null);
  }

  reinitialiser(): void {
    this.etat.set(null);
    this.dialogue.set(null);
  }
}
