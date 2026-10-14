import { Injectable, signal } from '@angular/core';

/**
 * Discussion (chat) ouverte, partagée par toute l'app.
 * Le panneau est rendu une seule fois par le shell (au niveau racine) : c'est indispensable
 * pour son positionnement flottant, car un ancêtre du détail de ticket applique un filtre CSS
 * qui casserait `position: fixed` s'il y était rendu.
 */
@Injectable({ providedIn: 'root' })
export class ChatOuvertureService {
  readonly ouvert = signal<{ ticketId: number; intitule: string | null } | null>(null);

  ouvrir(ticketId: number, intitule: string | null = null): void {
    this.ouvert.set({ ticketId, intitule });
  }

  fermer(): void {
    this.ouvert.set(null);
  }
}
