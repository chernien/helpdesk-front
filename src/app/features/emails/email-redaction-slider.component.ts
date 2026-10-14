import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { EmailService } from '../../core/services/email.service';
import { ToastService } from '../../core/services/toast.service';
import { adresses, messageErreur } from './email-utils';

/**
 * « Nouveau message » : rédaction et envoi depuis la boîte support.
 * Peut être pré-rempli (destinataire, objet, corps) pour envoyer un e-mail à propos d'un ticket.
 */
@Component({
  selector: 'hd-email-redaction-slider',
  standalone: true,
  template: `
    <div class="bx-voile leger" (click)="fermer.emit()" aria-hidden="true"></div>

    <section class="bx-slider empile rd-slider" role="dialog" aria-modal="true" aria-labelledby="rd-titre">
      <div class="bx-rail">
        <button class="bx-rail-btn" type="button" (click)="fermer.emit()" title="Fermer (Échap)" aria-label="Fermer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" /></svg>
        </button>
      </div>

      <header class="bx-slider-tete">
        <h2 class="bx-titre" id="rd-titre">{{ titre() }}</h2>
        <button type="button" class="bx-btn bx-btn-bleu rd-envoyer" [disabled]="envoi()" (click)="envoyer()">
          @if (envoi()) { <span class="bx-spinner blanc" aria-hidden="true"></span> Envoi… }
          @else {
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12l16-8-6 16-3.5-6.5L4 12z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>
            Envoyer
          }
        </button>
      </header>

      <div class="bx-slider-corps">
        @if (contexte()) {
          <div class="rd-contexte">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9V7a2 2 0 012-2h12a2 2 0 012 2v2a2.5 2.5 0 000 5v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2.5 2.5 0 000-5z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" /></svg>
            {{ contexte() }}
          </div>
        }
        <div class="bx-carte rd-carte">
          @if (expediteurs().length > 0) {
            <label class="rd-ligne">
              <span>De :</span>
              <select class="rd-champ rd-select" [value]="from()" (change)="from.set($any($event.target).value)">
                @for (e of expediteurs(); track e) { <option [value]="e">{{ e }}</option> }
              </select>
            </label>
          }
          <label class="rd-ligne">
            <span>À :</span>
            <input id="rd-a" class="rd-champ" type="text" autocomplete="off" placeholder="adresse@exemple.com, autre@exemple.com"
                   [value]="a()" (input)="a.set($any($event.target).value)" />
            @if (!avecCc()) {
              <button type="button" class="rd-cc" (click)="avecCc.set(true)">Cc</button>
            }
          </label>
          @if (avecCc()) {
            <label class="rd-ligne">
              <span>Cc :</span>
              <input class="rd-champ" type="text" autocomplete="off"
                     [value]="cc()" (input)="cc.set($any($event.target).value)" />
            </label>
          }
          <label class="rd-ligne">
            <span>Objet :</span>
            <input class="rd-champ" type="text" maxlength="255"
                   [value]="objet()" (input)="objet.set($any($event.target).value)" />
          </label>
          <textarea class="rd-texte" rows="14" placeholder="Votre message…" aria-label="Message"
                    [value]="texte()" (input)="texte.set($any($event.target).value)"
                    (keydown)="surClavier($event)"></textarea>
        </div>
      </div>

      <footer class="rd-pied">
        <button type="button" class="bx-btn bx-btn-lien" (click)="fermer.emit()">Annuler</button>
        <small>Envoyé depuis {{ from() || 'la boîte support' }} · Ctrl+Entrée pour envoyer</small>
      </footer>
    </section>
  `,
  styles: [`
    .rd-slider { --bx-largeur: min(640px, calc(100vw - 60px)); }
    .rd-slider .bx-slider-corps { display: flex; flex-direction: column; }
    .rd-envoyer { flex-shrink: 0; height: 34px; padding: 0 18px; }
    .rd-contexte {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 12px; padding: 9px 14px;
      border-radius: 9px;
      background: #eef6ff; border: 1px solid #cfe4fb;
      font-size: 12.5px; font-weight: 600; color: var(--bx-lien);
    }
    .rd-contexte svg { flex-shrink: 0; color: var(--bx-accent); }
    .rd-carte { flex: 1; display: flex; flex-direction: column; min-height: 0; padding: 4px 22px 16px; }
    .rd-ligne {
      display: flex; align-items: center; gap: 10px;
      min-height: 46px; border-bottom: 1px solid var(--bx-ligne);
      font-size: 13px; color: var(--bx-gris);
    }
    .rd-ligne > span { width: 52px; flex-shrink: 0; }
    .rd-champ {
      flex: 1; min-width: 0; height: 34px; padding: 0;
      border: none; background: none;
      font: 13.5px var(--bx-police); color: var(--bx-texte);
    }
    .rd-champ:focus, .rd-texte:focus { outline: none; }
    .rd-select {
      height: 34px; cursor: pointer; color: var(--bx-texte);
      background: none; -webkit-appearance: menulist; appearance: menulist;
    }
    .rd-cc {
      border: none; background: none; cursor: pointer;
      font: 600 12px var(--bx-police); color: var(--bx-lien);
    }
    .rd-texte {
      display: block; width: 100%; flex: 1; min-height: 150px; margin-top: 14px; padding: 0;
      border: none; resize: none;
      font: 13.5px/1.6 var(--bx-police); color: var(--bx-texte);
    }
    .rd-pied {
      flex-shrink: 0; display: flex; align-items: center; gap: 10px;
      padding: 12px 28px; background: #fff; box-shadow: 0 -2px 12px rgba(15, 30, 45, .07);
    }
    .rd-pied small { margin-left: auto; font-size: 12px; color: var(--bx-gris-clair); }
    @media (max-width: 760px) {
      .rd-pied { padding: 10px 12px; }
      .rd-pied small { display: none; }
    }
  `]
})
export class EmailRedactionSliderComponent {
  private emailService = inject(EmailService);
  private toast = inject(ToastService);

  @Output() fermer = new EventEmitter<void>();

  readonly a = signal('');
  readonly cc = signal('');
  readonly avecCc = signal(false);
  readonly objet = signal('');
  readonly texte = signal('');
  readonly envoi = signal(false);
  readonly titre = signal('Nouveau message');
  /** Expéditeurs sélectionnables (« De ») et celui choisi. */
  readonly expediteurs = signal<string[]>([]);
  readonly from = signal('');
  /** Bandeau contextuel (ex. « En rapport avec le Ticket #N »). */
  readonly contexte = signal<string | null>(null);

  /** Pré-remplissage (ex. e-mail à propos d'un ticket). Reste modifiable. */
  @Input() set destinataires(valeur: string | null) { if (valeur) this.a.set(valeur); }
  @Input() set sujet(valeur: string | null) { if (valeur) this.objet.set(valeur); }
  @Input() set corps(valeur: string | null) { if (valeur) this.texte.set(valeur); }
  @Input() set intitule(valeur: string | null) { if (valeur) this.titre.set(valeur); }
  @Input() set rappel(valeur: string | null) { this.contexte.set(valeur || null); }

  constructor() {
    setTimeout(() => document.getElementById('rd-a')?.focus());

    // Boîte connectée de l'utilisateur : proposée en premier et sélectionnée par défaut comme « De ».
    this.emailService.statutBoite().subscribe({
      next: s => { if (s.connectee && s.email) this.ajouterExpediteur(s.email, true); },
      error: () => {}
    });

    // Adresses d'expéditeur configurées (notifications), ajoutées en plus de la boîte connectée.
    this.emailService.expediteurs().subscribe({
      next: liste => {
        for (const e of liste) this.ajouterExpediteur(e, false);
        if (!this.from() && this.expediteurs().length) this.from.set(this.expediteurs()[0]);
      },
      error: () => { /* liste indisponible : envoi depuis la boîte connectée par défaut */ }
    });
  }

  /** Ajoute une adresse au « De » (sans doublon). defaut = la place en tête et la présélectionne. */
  private ajouterExpediteur(email: string, defaut: boolean) {
    const e = email.trim();
    if (!e) return;
    const dejaLa = this.expediteurs().some(x => x.toLowerCase() === e.toLowerCase());
    if (defaut) {
      this.expediteurs.update(l => [e, ...l.filter(x => x.toLowerCase() !== e.toLowerCase())]);
      this.from.set(e);
    } else if (!dejaLa) {
      this.expediteurs.update(l => [...l, e]);
    }
  }

  surClavier(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      this.envoyer();
    }
  }

  envoyer() {
    if (this.envoi()) return;
    const destinataires = adresses(this.a());
    if (!destinataires.length) { this.toast.erreur('Destinataire manquant', 'Indiquez au moins une adresse e-mail.'); return; }
    if (!this.texte().trim()) { this.toast.erreur('Message vide', 'Écrivez votre message avant de l\'envoyer.'); return; }

    this.envoi.set(true);
    this.emailService.envoyer(destinataires, adresses(this.cc()), this.objet().trim(), this.texte(), this.from() || undefined).subscribe({
      next: () => {
        this.toast.succes('Message envoyé', `À ${destinataires.join(', ')}`);
        this.fermer.emit();
      },
      error: e => {
        this.envoi.set(false);
        this.toast.erreur('Envoi impossible', messageErreur(e, 'Le message n\'a pas pu être envoyé.'));
      }
    });
  }
}
