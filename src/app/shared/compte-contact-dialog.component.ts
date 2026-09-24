import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReferenceService } from '../core/services/reference.service';
import { ContactClient, SocieteClient, User } from '../core/models/models';

/**
 * Popup de creation du compte Helpdesk d'un contact Divalto.
 * Ouvert depuis le formulaire de ticket quand le contact choisi n'a pas encore de compte :
 * sans compte, il ne verrait ni ses tickets ni leurs notifications.
 * L'email vient de Divalto (T2) et n'est pas modifiable ; le mot de passe est
 * saisi ou genere, puis transmis au client par le collaborateur.
 */
@Component({
  selector: 'hd-compte-contact-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="voile" (click)="fermer()" aria-hidden="true"></div>
    <div class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-compte">
      <div class="tete">
        <span class="pastille" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="10" cy="8" r="3.6" stroke="currentColor" stroke-width="1.9" />
            <path d="M3.5 20a6.5 6.5 0 0113 0M19 8v6M16 11h6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
          </svg>
        </span>
        <div>
          <h2 id="titre-compte">Créer l'accès Helpdesk du client</h2>
          <p class="sous">
            <strong>{{ contact.email }}</strong> n'a pas encore de compte : sans accès, il ne verra
            ni ce ticket ni ses notifications.
          </p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="enregistrer()" novalidate>
        <div class="societe">
          <span class="label-mini">Société</span>
          <strong>{{ societe.nom }}</strong>
          <span class="tiers">{{ societe.tiers }}</span>
        </div>

        <div class="champ">
          <label class="label" for="cc-email">Email (identifiant de connexion)</label>
          <input id="cc-email" class="input" [value]="contact.email" readonly />
          <p class="hint">Repris de la fiche contact Divalto.</p>
        </div>

        <div class="grille">
          <div class="champ">
            <label class="label" for="cc-prenom">Prénom <span class="req">*</span></label>
            <input id="cc-prenom" class="input" formControlName="prenom" autocomplete="off"
                   [class.is-invalid]="invalide('prenom')" />
            @if (invalide('prenom')) { <p class="error" role="alert">Le prénom est requis.</p> }
          </div>
          <div class="champ">
            <label class="label" for="cc-nom">Nom <span class="req">*</span></label>
            <input id="cc-nom" class="input" formControlName="nom" autocomplete="off"
                   [class.is-invalid]="invalide('nom')" />
            @if (invalide('nom')) { <p class="error" role="alert">Le nom est requis.</p> }
          </div>
        </div>

        <div class="champ">
          <label class="label" for="cc-mdp">Mot de passe <span class="req">*</span></label>
          <div class="mdp">
            <input id="cc-mdp" class="input" formControlName="password" autocomplete="new-password"
                   [type]="mdpVisible() ? 'text' : 'password'" [class.is-invalid]="invalide('password')" />
            <button type="button" class="btn btn-ghost btn-sm" (click)="genererMotDePasse()">Générer</button>
          </div>
          @if (invalide('password')) {
            <p class="error" role="alert">8 caractères minimum.</p>
          } @else {
            <p class="hint">Communiquez-le au client : il pourra se connecter immédiatement.</p>
          }
        </div>

        @if (erreur()) { <div class="alerte" role="alert">{{ erreur() }}</div> }

        <div class="actions">
          <button type="button" class="btn btn-ghost" (click)="fermer()">Plus tard</button>
          <button type="submit" class="btn btn-primary" [disabled]="envoi()">
            @if (envoi()) { <span class="spinner" aria-hidden="true"></span> }
            Créer le compte
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .voile {
      position: fixed; inset: 0; z-index: 80;
      background: rgba(15, 23, 42, .5);
      backdrop-filter: blur(3px);
      animation: pageIn 200ms var(--ease-out) both;
    }
    .dialogue {
      position: fixed; z-index: 81;
      top: 50%; left: 50%;
      width: min(520px, calc(100vw - 32px));
      max-height: calc(100dvh - 32px);
      overflow-y: auto;
      transform: translate(-50%, -50%);
      background: var(--surface);
      border-radius: var(--r-lg);
      box-shadow: var(--e4);
      padding: var(--sp-5);
      animation: dialogueIn 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes dialogueIn {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)) scale(.97); }
      to   { opacity: 1; transform: translate(-50%, -50%); }
    }
    .tete { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); }
    .pastille {
      width: 44px; height: 44px; flex-shrink: 0;
      display: grid; place-items: center;
      border-radius: 12px;
      background: var(--brand-50); color: var(--brand-600);
    }
    h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; }
    .sous { margin: 0; font-size: 13.5px; color: var(--muted); line-height: 1.5; }
    .sous strong { color: var(--ink-soft); word-break: break-all; }

    form { display: flex; flex-direction: column; gap: var(--sp-3); }
    .societe {
      display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap;
      padding: var(--sp-3);
      border: 1.5px dashed var(--border-strong);
      border-radius: var(--r-md);
      background: var(--surface-2);
      font-size: 14px;
    }
    .label-mini { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .tiers { font-family: var(--mono); font-size: 12px; color: var(--muted); }
    .champ { display: flex; flex-direction: column; gap: 6px; }
    .grille { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
    .input[readonly] { background: var(--surface-2); color: var(--ink-soft); }
    .mdp { display: flex; gap: var(--sp-2); }
    .mdp .input { flex: 1; min-width: 0; }
    .alerte {
      padding: var(--sp-3); border-radius: var(--r-md);
      background: var(--danger-bg); color: #991b1b; font-size: 14px;
    }
    .actions {
      display: flex; justify-content: flex-end; gap: var(--sp-2);
      margin-top: var(--sp-2); padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }
    .spinner {
      width: 15px; height: 15px;
      border: 2.5px solid rgba(255, 255, 255, .35); border-top-color: #fff;
      border-radius: 50%; animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 480px) { .grille { grid-template-columns: 1fr; } }
  `]
})
export class CompteContactDialogComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private hote = inject(ElementRef<HTMLElement>);
  private reference = inject(ReferenceService);

  @Input({ required: true }) societe!: SocieteClient;
  @Input({ required: true }) contact!: ContactClient;
  @Output() cree = new EventEmitter<User>();
  @Output() ferme = new EventEmitter<void>();

  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly mdpVisible = signal(false);

  readonly form = this.fb.nonNullable.group({
    prenom: ['', Validators.required],
    nom: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]]
  });

  ngOnInit() {
    // Rattache au <body> : un parent anime (transform) deciderait sinon du positionnement
    // du popup, qui ne serait plus centre ni au-dessus de la sidebar.
    document.body.appendChild(this.hote.nativeElement);
    // Pre-rempli depuis la fiche contact Divalto quand elle est renseignee.
    this.form.patchValue({ prenom: this.contact.prenom ?? '', nom: this.contact.nom ?? '' });
    queueMicrotask(() => document.getElementById(this.contact.prenom ? 'cc-mdp' : 'cc-prenom')?.focus());
  }

  ngOnDestroy() {
    this.hote.nativeElement.remove();
  }

  invalide(nom: 'prenom' | 'nom' | 'password'): boolean {
    const c = this.form.controls[nom];
    return c.touched && c.invalid;
  }

  genererMotDePasse() {
    // Sans caracteres ambigus (0/O, 1/l/I) pour une transmission orale ou ecrite.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*?';
    const valeurs = crypto.getRandomValues(new Uint32Array(12));
    this.form.controls.password.setValue(Array.from(valeurs, v => alphabet[v % alphabet.length]).join(''));
    this.form.controls.password.markAsTouched();
    this.mdpVisible.set(true);
  }

  enregistrer() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.envoi.set(true);
    this.erreur.set(null);
    const v = this.form.getRawValue();
    this.reference.creerCompteContact({
      clientTiers: this.societe.tiers,
      email: this.contact.email,
      prenom: v.prenom.trim(),
      nom: v.nom.trim(),
      password: v.password
    }).subscribe({
      next: user => this.cree.emit(user),
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.error?.message ?? 'La création du compte a échoué. Réessayez.');
      }
    });
  }

  @HostListener('document:keydown.escape')
  fermer() {
    if (!this.envoi()) this.ferme.emit();
  }
}
