import { Component, Input } from '@angular/core';

/**
 * Logo Help Desk Mediasoft (fichier maitre : Figma « Helpdesk Mediasoft — Logo »).
 * Symbole : un ticket d'assistance (encoches, perforation) marque d'une coche « resolu ».
 * Le logotype est du vrai texte en Plus Jakarta Sans, deja chargee par l'application :
 * net a toutes les tailles, sans fichier image a maintenir.
 */
@Component({
  selector: 'hd-logo',
  standalone: true,
  template: `
    <span class="logo" [class.sombre]="variante === 'sombre'" [style.--h.px]="hauteur"
          role="img" aria-label="Help Desk Mediasoft">
      <svg class="symbole" viewBox="4 11 52 38" aria-hidden="true">
        <defs>
          <linearGradient [attr.id]="idDegrade" x1="4" y1="11.5" x2="56" y2="48.5" gradientUnits="userSpaceOnUse">
            <stop stop-color="#5CB6F0" />
            <stop offset="1" stop-color="#1F5FA3" />
          </linearGradient>
        </defs>
        <path [attr.fill]="'url(#' + idDegrade + ')'"
              d="M12 11.5H16.5A4.5 4.5 0 0 0 25.5 11.5H48A8 8 0 0 1 56 19.5V40.5A8 8 0 0 1 48 48.5H25.5A4.5 4.5 0 0 0 16.5 48.5H12A8 8 0 0 1 4 40.5V19.5A8 8 0 0 1 12 11.5Z" />
        <path d="M21 18V42" stroke="#fff" stroke-opacity=".55" stroke-width="1.25" stroke-linecap="round" stroke-dasharray="2 2.5" />
        <path d="M32 30.25L36.5 34.5L45 25.5" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
      <span class="texte" aria-hidden="true">
        <span class="nom">helpdesk</span>
        <span class="signature">SUPPORT MEDIASOFT</span>
      </span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .logo {
      --h: 40px;
      display: inline-flex;
      align-items: center;
      gap: calc(var(--h) * .28);
      line-height: 1;
    }
    .symbole { height: var(--h); width: auto; flex-shrink: 0; overflow: visible; }
    .texte { display: flex; flex-direction: column; gap: calc(var(--h) * .06); }
    .nom {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-weight: 800;
      font-size: calc(var(--h) * .72);
      letter-spacing: -.03em;
      line-height: .95;
      color: #0F172A;
    }
    .signature {
      font-family: 'IBM Plex Mono', ui-monospace, monospace;
      font-weight: 600;
      font-size: calc(var(--h) * .235);
      letter-spacing: .16em;
      color: #2E7DB8;
      white-space: nowrap;
    }
    .sombre .nom { color: #FFFFFF; }
    .sombre .signature { color: #7FB8E6; }
  `]
})
export class LogoComponent {
  /** 'clair' sur fond blanc, 'sombre' sur la sidebar marine. */
  @Input() variante: 'clair' | 'sombre' = 'clair';
  /** Hauteur du symbole en pixels : le logotype suit proportionnellement. */
  @Input() hauteur = 40;

  /** Id unique du degrade : plusieurs logos peuvent coexister sur la page. */
  readonly idDegrade = 'hd-logo-g-' + Math.random().toString(36).slice(2, 8);
}
