import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReferenceService } from '../../core/services/reference.service';
import { TicketService } from '../../core/services/ticket.service';
import {
  ContactClient, IMPORTANCES, MODULES, Produit, SocieteClient, TYPES_TICKET, Ticket, UpdateTicketRequest, tailleFichier
} from '../../core/models/models';
import { SocieteAutocompleteComponent } from '../../shared/societe-autocomplete.component';

/**
 * Correction d'un ticket par l'administrateur : tout ce qui a ete mal saisi
 * a la creation (intitule, produit, module, type, importance, dates, client...).
 * Seuls les champs reellement modifies sont envoyes ; le suivi du ticket
 * indique ensuite ce qui a ete corrige.
 */
@Component({
  selector: 'hd-ticket-edition-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, SocieteAutocompleteComponent],
  template: `
    <div class="voile" (click)="fermer()" aria-hidden="true"></div>
    <div class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-edition">
      <div class="tete">
        <span class="pastille" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <div>
          <h2 id="titre-edition">Modifier le ticket #{{ ticket.id }}</h2>
          <p class="sous">Corrigez ce qui a été mal saisi. Le suivi du ticket gardera la trace des corrections.</p>
        </div>
      </div>

      <form [formGroup]="form" (ngSubmit)="enregistrer()" novalidate>
        <div class="champ">
          <label class="label" for="ed-intitule">Intitulé <span class="req">*</span></label>
          <input id="ed-intitule" class="input" formControlName="intitule" [class.is-invalid]="invalide('intitule')" />
          @if (invalide('intitule')) { <p class="error" role="alert">L'intitulé est requis (200 caractères max).</p> }
        </div>

        <div class="grille">
          <div class="champ">
            <label class="label" for="ed-produit">Produit</label>
            <select id="ed-produit" class="select" formControlName="produit">
              @for (p of produits(); track p.productId) { <option [value]="p.nom">{{ p.nom }}</option> }
            </select>
          </div>
          <div class="champ">
            <label class="label" for="ed-version">Version <span class="req">*</span></label>
            <input id="ed-version" class="input" formControlName="version" [class.is-invalid]="invalide('version')" />
          </div>
          <div class="champ">
            <label class="label" for="ed-module">Module</label>
            <select id="ed-module" class="select" formControlName="module">
              @for (m of modules; track m) { <option [value]="m">{{ m }}</option> }
            </select>
          </div>
          <div class="champ">
            <label class="label" for="ed-type">Type de ticket</label>
            <select id="ed-type" class="select" formControlName="typeTicket">
              @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
            </select>
          </div>
          <div class="champ">
            <label class="label" for="ed-importance">Importance</label>
            <select id="ed-importance" class="select" formControlName="importance">
              @for (i of importances; track i) { <option [value]="i">{{ i }}</option> }
            </select>
          </div>
          <div class="champ">
            <label class="label" for="ed-date">Date estimée</label>
            <input id="ed-date" type="date" class="input" formControlName="dateEstimee" />
          </div>
        </div>

        <div class="champ">
          <label class="label" for="ed-description">Description</label>
          <textarea id="ed-description" class="textarea" formControlName="description" rows="4"></textarea>
        </div>

        <!-- Pièce jointe : ajouter ou remplacer le fichier du ticket -->
        <div class="champ">
          <label class="label">Pièce jointe</label>
          @if (ticket.fichierNom && !fichier()) {
            <div class="pj-actuelle">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7L10 16.9a1.7 1.7 0 01-2.4-2.4l7.1-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <span class="pj-nom">{{ ticket.fichierNom }}</span>
              @if (ticket.fichierTaille) { <small>{{ tailleFichier(ticket.fichierTaille) }}</small> }
              <span class="pj-actuel-tag">actuel</span>
            </div>
          }
          @if (fichier(); as f) {
            <div class="pj-choisie">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7L10 16.9a1.7 1.7 0 01-2.4-2.4l7.1-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <span class="pj-nom">{{ f.name }}</span>
              <small>{{ tailleFichier(f.size) }}</small>
              <button type="button" class="pj-x" (click)="retirerFichier()" aria-label="Retirer le fichier">✕</button>
            </div>
          } @else {
            <label class="pj-zone" for="ed-fichier">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11.5l-7.8 7.8a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7L10 16.9a1.7 1.7 0 01-2.4-2.4l7.1-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
              {{ ticket.fichierNom ? 'Remplacer le fichier…' : 'Joindre un fichier…' }} <small>10 Mo max</small>
            </label>
            <input id="ed-fichier" type="file" class="sr-only" (change)="surFichier($event)" />
          }
          @if (erreurFichier()) { <p class="error" role="alert">{{ erreurFichier() }}</p> }
        </div>

        <!-- Client : section optionnelle, le ticket ne stocke pas le code tiers -->
        <div class="client-bloc">
          <div class="client-actuel">
            <span class="label-mini">Client actuel</span>
            <strong>{{ ticket.client || '—' }}</strong>
            <span class="email">{{ ticket.email }}</span>
            <button type="button" class="lien" (click)="basculerClient()">
              {{ changerClient() ? 'Garder ce client' : 'Changer le client' }}
            </button>
          </div>
          @if (changerClient()) {
            <div class="grille">
              <div class="champ">
                <label class="label" for="ed-societe">Nouvelle société</label>
                <hd-societe-autocomplete inputId="ed-societe" (choisie)="surSociete($event)" />
              </div>
              <div class="champ">
                <label class="label" for="ed-contact">Contact</label>
                <select id="ed-contact" class="select" formControlName="contactEmail"
                        [attr.disabled]="!societe() ? true : null">
                  <option value="">{{ societe() ? '— Sélectionner —' : "Choisissez d'abord une société" }}</option>
                  @for (c of contacts(); track c.email) {
                    <option [value]="c.email">{{ c.email }}{{ c.aCompte ? ' ✓' : '' }}</option>
                  }
                </select>
              </div>
            </div>
          }
        </div>

        @if (erreur()) { <div class="alerte" role="alert">{{ erreur() }}</div> }

        <div class="actions">
          <button type="button" class="btn btn-ghost" (click)="fermer()">Annuler</button>
          <button type="submit" class="btn btn-primary" [disabled]="envoi()">
            @if (envoi()) { <span class="spinner" aria-hidden="true"></span> }
            Enregistrer les corrections
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .voile {
      position: fixed; inset: 0; z-index: 80;
      background: rgba(15, 23, 42, .5); backdrop-filter: blur(3px);
      animation: pageIn 200ms var(--ease-out) both;
    }
    .dialogue {
      position: fixed; z-index: 81; top: 50%; left: 50%;
      width: min(640px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto;
      transform: translate(-50%, -50%);
      background: var(--surface); border-radius: var(--r-lg); box-shadow: var(--e4);
      padding: var(--sp-5);
      animation: dialogueIn 260ms cubic-bezier(0.16, 1, 0.3, 1) both;
    }
    @keyframes dialogueIn {
      from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)) scale(.97); }
      to   { opacity: 1; transform: translate(-50%, -50%); }
    }
    .tete { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); }
    .pastille {
      width: 42px; height: 42px; flex-shrink: 0; display: grid; place-items: center;
      border-radius: 12px; background: var(--brand-50); color: var(--brand-600);
    }
    h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; }
    .sous { margin: 0; font-size: 13.5px; color: var(--muted); }
    form { display: flex; flex-direction: column; gap: var(--sp-3); }
    .champ { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .grille { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); }
    .client-bloc {
      display: flex; flex-direction: column; gap: var(--sp-3);
      padding: var(--sp-3); border: 1.5px dashed var(--border-strong); border-radius: var(--r-md);
      background: var(--surface-2);
    }
    .client-actuel { display: flex; align-items: baseline; gap: var(--sp-2); flex-wrap: wrap; font-size: 14px; }
    .label-mini { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .email { color: var(--muted); font-size: 13px; }
    .lien {
      margin-left: auto; border: 0; background: none; padding: 0;
      color: var(--brand-600); font: inherit; font-size: 13px; font-weight: 700;
      text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
    }
    .alerte { padding: var(--sp-3); border-radius: var(--r-md); background: var(--danger-bg); color: #991b1b; font-size: 14px; }
    .pj-actuelle, .pj-choisie {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: var(--r-md); font-size: 13px;
    }
    .pj-actuelle { background: var(--surface-2); border: 1px solid var(--border); color: var(--ink-soft); }
    .pj-choisie { background: var(--brand-50); border: 1px solid var(--brand-100); color: var(--brand-700); }
    .pj-actuelle svg, .pj-choisie svg { flex-shrink: 0; color: var(--muted); }
    .pj-choisie svg { color: var(--brand-600); }
    .pj-nom { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
    .pj-actuelle small, .pj-choisie small { color: var(--muted); }
    .pj-actuel-tag { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    .pj-x { flex-shrink: 0; width: 22px; height: 22px; border: none; border-radius: 50%; background: rgba(15, 23, 42, .06); color: var(--muted); cursor: pointer; }
    .pj-x:hover { background: var(--danger-bg); color: var(--danger); }
    .pj-zone {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 12px; border: 1.5px dashed var(--border-strong); border-radius: var(--r-md);
      background: var(--surface); color: var(--ink-soft); font-size: 13.5px; font-weight: 600; cursor: pointer;
      transition: border-color var(--t-fast), background var(--t-fast);
    }
    .pj-zone:hover { border-color: var(--brand-500); background: var(--brand-50); color: var(--brand-700); }
    .pj-zone small { font-weight: 500; color: var(--muted); }
    .actions {
      display: flex; justify-content: flex-end; gap: var(--sp-2);
      margin-top: var(--sp-2); padding-top: var(--sp-4); border-top: 1px solid var(--border);
    }
    .spinner {
      width: 15px; height: 15px; border: 2.5px solid rgba(255, 255, 255, .35); border-top-color: #fff;
      border-radius: 50%; animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 560px) { .grille { grid-template-columns: 1fr; } }
  `]
})
export class TicketEditionDialogComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private hote = inject(ElementRef<HTMLElement>);
  private reference = inject(ReferenceService);
  private ticketService = inject(TicketService);

  @Input({ required: true }) ticket!: Ticket;
  @Output() enregistre = new EventEmitter<Ticket>();
  @Output() ferme = new EventEmitter<void>();

  readonly modules = MODULES;
  readonly types = TYPES_TICKET;
  readonly importances = IMPORTANCES;

  readonly produits = signal<Produit[]>([]);
  readonly changerClient = signal(false);
  readonly societe = signal<SocieteClient | null>(null);
  readonly contacts = signal<ContactClient[]>([]);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);
  /** Pièce jointe à ajouter / remplacer sur le ticket. */
  readonly fichier = signal<File | null>(null);
  readonly erreurFichier = signal<string | null>(null);
  readonly tailleFichier = tailleFichier;
  private static readonly TAILLE_MAX = 10 * 1024 * 1024;

  readonly form = this.fb.nonNullable.group({
    intitule: ['', [Validators.required, Validators.maxLength(200)]],
    produit: [''],
    version: ['', Validators.required],
    module: [''],
    typeTicket: [''],
    importance: [''],
    dateEstimee: [''],
    description: [''],
    contactEmail: ['']
  });

  /** Valeurs de depart : seul ce qui en differe sera envoye. */
  private initial!: ReturnType<typeof this.form.getRawValue>;

  ngOnInit() {
    // Rattache au <body> : un parent anime (transform) decentrerait le popup.
    document.body.appendChild(this.hote.nativeElement);

    const t = this.ticket;
    this.form.setValue({
      intitule: t.intitule ?? '',
      produit: t.produit ?? '',
      version: t.version ?? '',
      module: t.module ?? '',
      typeTicket: t.typeTicket ?? '',
      importance: t.importance ?? '',
      dateEstimee: t.dateEstimee ? t.dateEstimee.slice(0, 10) : '',
      description: t.description ?? '',
      contactEmail: ''
    });
    this.initial = this.form.getRawValue();
    this.reference.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });
    queueMicrotask(() => document.getElementById('ed-intitule')?.focus());
  }

  ngOnDestroy() {
    this.hote.nativeElement.remove();
  }

  invalide(nom: 'intitule' | 'version'): boolean {
    const c = this.form.controls[nom];
    return c.touched && c.invalid;
  }

  surFichier(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const choisi = entree.files?.[0] ?? null;
    entree.value = '';
    this.erreurFichier.set(null);
    if (!choisi) return;
    if (choisi.size > TicketEditionDialogComponent.TAILLE_MAX) {
      this.erreurFichier.set(`« ${choisi.name} » dépasse 10 Mo (${tailleFichier(choisi.size)}).`);
      return;
    }
    this.fichier.set(choisi);
  }

  retirerFichier() {
    this.fichier.set(null);
    this.erreurFichier.set(null);
  }

  basculerClient() {
    this.changerClient.update(v => !v);
    this.societe.set(null);
    this.contacts.set([]);
    this.form.controls.contactEmail.setValue('');
  }

  surSociete(societe: SocieteClient | null) {
    this.societe.set(societe);
    this.contacts.set([]);
    this.form.controls.contactEmail.setValue('');
    if (!societe) return;
    this.reference.contacts(societe.tiers).subscribe({
      next: c => {
        this.contacts.set(c);
        if (c.length === 1) this.form.controls.contactEmail.setValue(c[0].email);
      },
      error: () => {}
    });
  }

  enregistrer() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const i = this.initial;
    const requete: UpdateTicketRequest = {};
    if (v.intitule.trim() !== i.intitule) requete.intitule = v.intitule.trim();
    if (v.produit !== i.produit) requete.produit = v.produit;
    if (v.version.trim() !== i.version) requete.version = v.version.trim();
    if (v.module !== i.module) requete.module = v.module;
    if (v.typeTicket !== i.typeTicket) requete.typeTicket = v.typeTicket;
    if (v.importance !== i.importance) requete.importance = v.importance;
    if (v.dateEstimee !== i.dateEstimee && v.dateEstimee) requete.dateEstimee = v.dateEstimee;
    if (v.description !== i.description) requete.description = v.description;

    if (this.changerClient()) {
      if (!this.societe() || !v.contactEmail) {
        this.erreur.set('Choisissez la nouvelle société et son contact, ou cliquez sur « Garder ce client ».');
        return;
      }
      requete.clientTiers = this.societe()!.tiers;
      requete.contactEmail = v.contactEmail;
    }

    const fichier = this.fichier();
    if (Object.keys(requete).length === 0 && !fichier) { this.ferme.emit(); return; }

    this.envoi.set(true);
    this.erreur.set(null);

    // Les corrections de champs partent d'abord, puis la pièce jointe éventuelle.
    const joindrePuisEmettre = (maj: Ticket) => {
      if (!fichier) { this.enregistre.emit(maj); return; }
      this.ticketService.joindreFichier(this.ticket.id, fichier).subscribe({
        next: avecFichier => this.enregistre.emit(avecFichier),
        error: e => {
          this.envoi.set(false);
          this.erreur.set('Corrections enregistrées, mais la pièce jointe n\'a pas pu être envoyée : '
            + (e.error?.message ?? 'réessayez.'));
        }
      });
    };

    if (Object.keys(requete).length === 0) {
      joindrePuisEmettre(this.ticket); // uniquement une pièce jointe, aucun champ modifié
      return;
    }
    this.ticketService.modifier(this.ticket.id, requete).subscribe({
      next: joindrePuisEmettre,
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.error?.message ?? "Les corrections n'ont pas pu être enregistrées.");
      }
    });
  }

  @HostListener('document:keydown.escape')
  fermer() {
    if (!this.envoi()) this.ferme.emit();
  }
}
