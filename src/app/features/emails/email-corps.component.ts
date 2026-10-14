import { Component, ElementRef, Input, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/** Styles de base injectes dans le document de l'e-mail (liens ouverts dans un nouvel onglet). */
const ENTETE = `<base target="_blank"><style>
  html, body { margin: 0; padding: 0; }
  body { font: 14px/1.6 'Open Sans', 'Helvetica Neue', Arial, sans-serif; color: #333; word-wrap: break-word; overflow-y: hidden; }
  img { max-width: 100%; height: auto; }
  a { color: #2067b0; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; }
</style>`;

/**
 * Corps d'un e-mail. Le HTML vient d'expediteurs externes : il est rendu dans un iframe
 * sandbox SANS allow-scripts (aucun script ni gestionnaire onerror/onload ne s'execute,
 * aucun acces au jeton de session). allow-same-origin sert uniquement a mesurer la
 * hauteur du contenu pour ajuster l'iframe.
 */
@Component({
  selector: 'hd-email-corps',
  standalone: true,
  template: `
    @if (document()) {
      <iframe #cadre class="corps-cadre" title="Contenu de l'e-mail"
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              [srcdoc]="document()" (load)="ajuster()"></iframe>
    } @else {
      <pre class="corps-texte">{{ texte || '(Message vide)' }}</pre>
    }
  `,
  styles: [`
    :host { display: block; }
    .corps-cadre { display: block; width: 100%; min-height: 120px; border: 0; background: #fff; }
    .corps-texte {
      margin: 0; white-space: pre-wrap; word-break: break-word;
      font: 14px/1.6 'Open Sans', 'Helvetica Neue', Arial, sans-serif; color: #333;
    }
  `]
})
export class EmailCorpsComponent implements OnDestroy {
  private sanitizer = inject(DomSanitizer);
  private observateur?: ResizeObserver;

  @ViewChild('cadre') cadre?: ElementRef<HTMLIFrameElement>;

  readonly document = signal<SafeHtml | null>(null);
  @Input() texte: string | null = null;

  @Input() set html(valeur: string | null) {
    this.document.set(valeur ? this.sanitizer.bypassSecurityTrustHtml(ENTETE + valeur) : null);
  }

  /** L'iframe prend la hauteur de son contenu (puis suit ses changements : images, polices…). */
  ajuster() {
    const cadre = this.cadre?.nativeElement;
    const doc = cadre?.contentDocument;
    if (!cadre || !doc?.documentElement) return;

    const mesurer = () => { cadre.style.height = `${doc.documentElement.scrollHeight}px`; };
    mesurer();
    this.observateur?.disconnect();
    try {
      this.observateur = new ResizeObserver(mesurer);
      this.observateur.observe(doc.body);
    } catch { /* ResizeObserver indisponible : hauteur figee au chargement */ }
  }

  ngOnDestroy() {
    this.observateur?.disconnect();
  }
}
