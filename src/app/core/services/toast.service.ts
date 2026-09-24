import { Injectable, signal } from '@angular/core';

export type TypeToast = 'info' | 'succes' | 'erreur';

export interface Toast {
  id: number;
  titre: string;
  message?: string;
  type: TypeToast;
  /** Duree totale d'affichage (ms). */
  duree: number;
  /** Vrai quand le survol met le decompte en pause (anime la barre de progression). */
  enPause: boolean;
}

interface Minuteur {
  handle: ReturnType<typeof setTimeout>;
  debut: number;
  restant: number;
}

const DUREES: Record<TypeToast, number> = { info: 5000, succes: 4000, erreur: 7000 };
const MAX_TOASTS = 4;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private compteur = 0;
  private minuteurs = new Map<number, Minuteur>();
  readonly toasts = signal<Toast[]>([]);

  info(titre: string, message?: string) { this.ajouter(titre, message, 'info'); }
  succes(titre: string, message?: string) { this.ajouter(titre, message, 'succes'); }
  erreur(titre: string, message?: string) { this.ajouter(titre, message, 'erreur'); }

  fermer(id: number) {
    const m = this.minuteurs.get(id);
    if (m) clearTimeout(m.handle);
    this.minuteurs.delete(id);
    this.toasts.update(liste => liste.filter(t => t.id !== id));
  }

  /** Survol : on laisse le temps de lire. */
  pause(id: number) {
    const m = this.minuteurs.get(id);
    if (!m) return;
    clearTimeout(m.handle);
    m.restant -= Date.now() - m.debut;
    this.majPause(id, true);
  }

  reprendre(id: number) {
    const m = this.minuteurs.get(id);
    if (!m) return;
    m.debut = Date.now();
    m.handle = setTimeout(() => this.fermer(id), Math.max(m.restant, 800));
    this.majPause(id, false);
  }

  private ajouter(titre: string, message: string | undefined, type: TypeToast) {
    const id = ++this.compteur;
    const duree = DUREES[type];

    // Au-dela de MAX_TOASTS, le plus ancien laisse sa place.
    const liste = this.toasts();
    if (liste.length >= MAX_TOASTS) this.fermer(liste[0].id);

    this.toasts.update(l => [...l, { id, titre, message, type, duree, enPause: false }]);
    this.minuteurs.set(id, {
      handle: setTimeout(() => this.fermer(id), duree),
      debut: Date.now(),
      restant: duree
    });
  }

  private majPause(id: number, enPause: boolean) {
    this.toasts.update(l => l.map(t => (t.id === id ? { ...t, enPause } : t)));
  }
}
