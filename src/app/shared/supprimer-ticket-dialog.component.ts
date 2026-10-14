import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { TicketService } from '../core/services/ticket.service';
import { ToastService } from '../core/services/toast.service';

/**
 * Confirmation de suppression d'un ticket (admin), depuis la liste des tickets ou la boîte mail.
 * Le ticket part avec sa discussion et son historique ; l'e-mail d'origine reste dans la boîte.
 */
@Component({
  selector: 'hd-supprimer-ticket-dialog',
  standalone: true,
  template: `
    <div class="voile" (click)="fermer()" aria-hidden="true"></div>
    <div class="dialogue" role="alertdialog" aria-modal="true" aria-labelledby="titre-suppr-ticket" aria-describedby="texte-suppr-ticket">
      <div class="tete">
        <span class="pastille" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"
                  stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <div>
          <h2 id="titre-suppr-ticket">Supprimer le ticket #{{ ticketId }} ?</h2>
          @if (intitule) { <p class="intitule">{{ intitule }}</p> }
        </div>
      </div>
      <p id="texte-suppr-ticket" class="texte">
        Le ticket, sa discussion et son historique seront supprimés définitivement.
        L'e-mail d'origine reste dans la boîte mail.
      </p>
      @if (erreur()) { <div class="erreur" role="alert">{{ erreur() }}</div> }
      <div class="actions">
        <button type="button" class="btn btn-ghost" (click)="fermer()" [disabled]="envoi()">Annuler</button>
        <button type="button" class="btn btn-danger" (click)="supprimer()" [disabled]="envoi()">
          @if (envoi()) { <span class="spinner" aria-hidden="true"></span> }
          Supprimer
        </button>
      </div>
    </div>
  `,
  styles: [`
    .voile { position: fixed; inset: 0; z-index: 90; background: rgba(15, 23, 42, .5); backdrop-filter: blur(3px); }
    .dialogue {
      position: fixed; z-index: 91; top: 50%; left: 50%;
      width: min(440px, calc(100vw - 32px));
      transform: translate(-50%, -50%);
      background: var(--surface); border-radius: var(--r-lg); box-shadow: var(--e4);
      padding: var(--sp-5);
      animation: dialogueIn 240ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes dialogueIn {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)) scale(.97); }
      to   { opacity: 1; transform: translate(-50%, -50%); }
    }
    .tete { display: flex; gap: var(--sp-3); align-items: flex-start; margin-bottom: var(--sp-3); }
    .pastille {
      width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center;
      border-radius: 12px; background: var(--danger-bg); color: var(--danger);
    }
    h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; }
    .intitule { margin: 0; font-size: 13.5px; color: var(--muted); overflow-wrap: anywhere; }
    .texte { margin: 0; font-size: 14px; color: var(--ink-soft); line-height: 1.55; }
    .erreur { margin-top: var(--sp-3); padding: var(--sp-3); border-radius: var(--r-md); background: var(--danger-bg); color: #991b1b; font-size: 14px; }
    .actions {
      display: flex; justify-content: flex-end; gap: var(--sp-2);
      margin-top: var(--sp-4); padding-top: var(--sp-4); border-top: 1px solid var(--border);
    }
    .actions .btn { min-height: 40px; padding: 0 16px; font-size: 14px; }
    .spinner { width: 15px; height: 15px; border: 2.5px solid rgba(255,255,255,.35); border-top-color: #fff; border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 480px) { .actions { flex-direction: column-reverse; } .actions .btn { width: 100%; } }
  `]
})
export class SupprimerTicketDialogComponent implements OnInit, OnDestroy {
  private ticketService = inject(TicketService);
  private toast = inject(ToastService);
  private hote = inject(ElementRef<HTMLElement>);

  @Input({ required: true }) ticketId!: number;
  @Input() intitule: string | null = null;
  @Output() supprime = new EventEmitter<number>();
  @Output() ferme = new EventEmitter<void>();

  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  ngOnInit() {
    // Rattaché au <body> : un parent animé (transform) décalerait sinon le popup.
    document.body.appendChild(this.hote.nativeElement);
  }

  ngOnDestroy() {
    this.hote.nativeElement.remove();
  }

  supprimer() {
    this.envoi.set(true);
    this.erreur.set(null);
    this.ticketService.supprimer(this.ticketId).subscribe({
      next: () => {
        this.toast.succes(`Ticket #${this.ticketId} supprimé`, 'Le ticket et son historique ont été supprimés.');
        this.supprime.emit(this.ticketId);
      },
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.status === 403 ? 'Seul un administrateur peut supprimer un ticket.'
          : e.error?.message ?? 'Suppression impossible. Réessayez.');
      }
    });
  }

  @HostListener('document:keydown.escape')
  fermer() {
    if (!this.envoi()) this.ferme.emit();
  }
}
