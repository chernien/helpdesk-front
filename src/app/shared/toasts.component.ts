import { Component, inject } from '@angular/core';
import { ToastService } from '../core/services/toast.service';

/** Pile de toasts globale : place a la racine de l'application (visible aussi sur la connexion). */
@Component({
  selector: 'hd-toasts',
  standalone: true,
  template: `
    <div class="pile" aria-live="polite" aria-atomic="false">
      @for (t of toastService.toasts(); track t.id) {
        <div class="toast" [attr.data-type]="t.type" [class.en-pause]="t.enPause"
             [attr.role]="t.type === 'erreur' ? 'alert' : 'status'"
             (mouseenter)="toastService.pause(t.id)" (mouseleave)="toastService.reprendre(t.id)"
             (focusin)="toastService.pause(t.id)" (focusout)="toastService.reprendre(t.id)">
          <span class="ico" aria-hidden="true">
            @switch (t.type) {
              @case ('succes') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
              }
              @case ('erreur') {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 7v6.5M12 17v.3" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" /></svg>
              }
              @default {
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M18 8.5a6 6 0 10-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5zM10.3 19a2 2 0 003.4 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
              }
            }
          </span>
          <div class="txt">
            <strong>{{ t.titre }}</strong>
            @if (t.message) { <p>{{ t.message }}</p> }
          </div>
          <button type="button" class="fermer" (click)="toastService.fermer(t.id)" aria-label="Fermer la notification">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </button>
          <span class="progression" [style.animation-duration.ms]="t.duree" aria-hidden="true"></span>
        </div>
      }
    </div>
  `,
  styles: [`
    /* Sous la barre du haut : la cloche et le profil restent accessibles. */
    .pile {
      position: fixed;
      top: calc(var(--header-h) + 12px);
      right: 20px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(380px, calc(100vw - 32px));
      pointer-events: none;
    }
    .toast {
      --c: var(--brand-600);
      --bg: var(--brand-100);
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 12px 16px 14px;
      background: rgba(255, 255, 255, .97);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: var(--e4);
      overflow: hidden;
      pointer-events: auto;
      animation: entree 420ms var(--ease-spring) both;
    }
    .toast[data-type='succes'] { --c: var(--success); --bg: var(--success-bg); }
    .toast[data-type='erreur'] { --c: var(--danger);  --bg: var(--danger-bg); }

    @keyframes entree {
      from { opacity: 0; transform: translateX(28px) scale(.97); }
      to   { opacity: 1; transform: translateX(0) scale(1); }
    }

    .ico {
      width: 34px;
      height: 34px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--bg);
      color: var(--c);
    }
    .txt { flex: 1; min-width: 0; padding-top: 1px; }
    .txt strong { display: block; font-size: 14.5px; color: var(--ink); line-height: 1.35; }
    .txt p { margin: 3px 0 0; font-size: 13.5px; color: var(--muted); line-height: 1.45; }

    .fermer {
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: grid;
      place-items: center;
      background: none;
      border: none;
      border-radius: 8px;
      color: var(--muted-soft);
      cursor: pointer;
      transition: background var(--t-fast), color var(--t-fast);
    }
    .fermer:hover { background: var(--surface-2); color: var(--ink); }

    /* Temps restant avant fermeture ; se fige au survol. */
    .progression {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      background: var(--c);
      opacity: .55;
      transform-origin: left;
      animation-name: decompte;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
    }
    .en-pause .progression { animation-play-state: paused; }
    @keyframes decompte { from { transform: scaleX(1); } to { transform: scaleX(0); } }

    @media (max-width: 640px) {
      .pile { top: auto; bottom: 16px; right: 16px; left: 16px; width: auto; }
    }
  `]
})
export class ToastsComponent {
  readonly toastService = inject(ToastService);
}
