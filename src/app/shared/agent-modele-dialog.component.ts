import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, computed, inject, signal } from '@angular/core';
import { AgentService, AgentStatut, BlocageIa, ModeleEnPause, ModeleIa, libelleModele } from '../core/services/agent.service';
import { ToastService } from '../core/services/toast.service';

/**
 * Popup « Modèle IA de l'agent ».
 * - Tous les modèles épuisés (mode automatique) : l'agent est en pause et reprendra seul dès
 *   qu'un modèle se libère ; l'utilisateur peut aussi désactiver l'IA.
 * - Modèle choisi en quota (ou indisponible) : l'utilisateur passe en automatique, choisit un
 *   autre modèle ou désactive l'IA.
 * - Ouvert à la demande (boîte mail, menu profil) pour basculer d'un modèle à l'autre.
 */
@Component({
  selector: 'hd-agent-modele-dialog',
  standalone: true,
  template: `
    <div class="voile" (click)="fermer()" aria-hidden="true"></div>
    <div class="dialogue" role="dialog" aria-modal="true" aria-labelledby="titre-modele-ia">
      <div class="tete">
        <span class="pastille" [class.alerte]="blocage" aria-hidden="true">
          @if (blocage) {
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.5L2.8 19.5h18.4L12 3.5z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" />
              <path d="M12 10v4.2M12 17.2h.01" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" />
            </svg>
          } @else {
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="5" y="8" width="14" height="10" rx="2.5" stroke="currentColor" stroke-width="1.9" />
              <path d="M12 8V4M9 13h.01M15 13h.01M3 13v2M21 13v2" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" />
            </svg>
          }
        </span>
        <div>
          @if (blocage?.tousLesModeles) {
            <h2 id="titre-modele-ia">{{ blocage!.quota ? 'Quota atteint sur tous les modèles IA' : 'Aucun modèle IA disponible' }}</h2>
            <p class="sous">
              {{ blocage!.quota ? 'Tous les modèles (' + nomsFournisseurs() + ') ont atteint leur limite' : 'Aucun modèle ne répond' }} :
              votre agent est en pause. Il reprendra tout seul dès qu'un modèle se libère@if (prochaineReprise(); as h) { (prochain essai vers <strong>{{ h }}</strong>)}.
              Les e-mails en attente restent non lus et seront traités à la reprise.
            </p>
          } @else if (blocage) {
            <h2 id="titre-modele-ia">{{ blocage.quota ? 'Quota du modèle IA atteint' : 'Modèle IA indisponible' }}</h2>
            <p class="sous">
              Le modèle <strong class="mono">{{ blocage.modele }}</strong>
              {{ blocage.quota ? 'a atteint son quota' : 'ne répond plus' }} : votre agent est en pause.
              Passez en <strong>Automatique</strong> pour basculer tout seul d'un modèle à l'autre, choisissez
              un autre modèle ou désactivez l'IA. Les e-mails en attente restent non lus et seront traités dès la reprise.
            </p>
          } @else {
            <h2 id="titre-modele-ia">Modèle IA de l'agent</h2>
            <p class="sous">Le modèle qui lit vos e-mails et les transforme en tickets.</p>
          }
        </div>
      </div>

      @if (etat(); as s) {
        @if (blocage?.tousLesModeles) {
          <ul class="etats" aria-label="État des fournisseurs IA">
            @for (f of resumeFournisseurs(); track f.fournisseur) {
              <li>
                <strong>{{ f.fournisseur }}</strong>
                <span class="tag tag-alerte">{{ f.quota ? 'Quota' : 'Indisponible' }} · reprise {{ f.reprise }}</span>
              </li>
            }
          </ul>
        } @else {
          @if (s.modeles.length > 8) {
            <input class="filtre" type="search" placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle"
                   [value]="filtre()" (input)="filtre.set($any($event.target).value)" />
          }
          <div class="liste" role="radiogroup" aria-label="Modèles IA">
            <label class="opt" [class.choisi]="choix() === null">
              <input type="radio" name="modele-ia" [checked]="choix() === null" (change)="choix.set(null)" />
              <span class="dot" aria-hidden="true"></span>
              <span class="opt-txt">
                <strong>Automatique</strong>
                <small>Passe tout seul au modèle suivant quand un quota est atteint</small>
              </span>
              @if (s.modele === null) { <span class="tag">Actuel</span> }
            </label>

            @for (g of groupes(); track g.fournisseur) {
              <div class="groupe">
                {{ g.fournisseur }}
                @if (g.fournisseur === 'OpenRouter' || g.fournisseur === 'NVIDIA') { <span class="groupe-note">modèles gratuits</span> }
              </div>
              @for (m of g.modeles; track m.id) {
                <label class="opt" [class.choisi]="choix() === m.id" [class.bloque]="pauses().has(m.id)">
                  <input type="radio" name="modele-ia" [checked]="choix() === m.id" (change)="choix.set(m.id)" />
                  <span class="dot" aria-hidden="true"></span>
                  <span class="opt-txt">
                    <strong class="mono">{{ m.id }}</strong>
                    @if (m.id === 'openrouter/free') { <small>OpenRouter choisit lui-même un modèle gratuit disponible</small> }
                  </span>
                  @if (pauses().get(m.id); as p) {
                    <span class="tag tag-alerte">{{ p.quota ? 'Quota' : 'Indisponible' }} · {{ heure(p.reprise) }}</span>
                  } @else if (m.id === s.modele) {
                    <span class="tag">Actuel</span>
                  }
                </label>
              }
            }
            @if (filtre() && !groupes().length) {
              <p class="vide">Aucun modèle ne correspond à « {{ filtre() }} ».</p>
            }
          </div>
        }
      } @else {
        <div class="chargement">@for (i of [1, 2, 3]; track i) { <div class="skeleton ligne"></div> }</div>
      }

      @if (erreur()) { <div class="erreur" role="alert">{{ erreur() }}</div> }

      <div class="actions">
        @if (etat()?.actif) {
          <button type="button" class="btn btn-ghost couper" (click)="desactiver()" [disabled]="envoi()">
            Désactiver l'IA
          </button>
        }
        <span class="espace"></span>
        @if (blocage?.tousLesModeles) {
          <button type="button" class="btn btn-primary" (click)="fermer()" [disabled]="envoi()">Compris</button>
        } @else {
          <button type="button" class="btn btn-ghost" (click)="fermer()" [disabled]="envoi()">
            {{ blocage ? 'Plus tard' : 'Annuler' }}
          </button>
          <button type="button" class="btn btn-primary" (click)="appliquer()" [disabled]="envoi() || !changement()">
            @if (envoi()) { <span class="spinner" aria-hidden="true"></span> }
            {{ choix() === null ? 'Passer en automatique' : 'Utiliser ce modèle' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .voile {
      position: fixed; inset: 0; z-index: 90;
      background: rgba(15, 23, 42, .5);
      backdrop-filter: blur(3px);
    }
    .dialogue {
      position: fixed; z-index: 91;
      top: 50%; left: 50%;
      width: min(500px, calc(100vw - 32px));
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
    .pastille.alerte { background: var(--warning-bg); color: var(--warning); }
    h2 { margin: 0 0 4px; font-size: 18px; letter-spacing: -.01em; }
    .sous { margin: 0; font-size: 13.5px; color: var(--muted); line-height: 1.55; }
    .sous strong { color: var(--ink-soft); }
    .mono { font-family: var(--mono); font-size: .95em; }

    .liste {
      display: flex; flex-direction: column; gap: 6px;
      max-height: min(46vh, 430px); overflow-y: auto;
      padding: 3px;   /* place pour le contour de focus */
      margin: -3px;
    }
    .filtre {
      width: 100%; height: 38px;
      margin-bottom: var(--sp-3); padding: 0 12px;
      border: 1px solid var(--border-strong); border-radius: var(--r-md);
      font: inherit; font-size: 14px;
      background: var(--surface); color: var(--ink);
    }
    .filtre:focus { outline: none; border-color: var(--brand-500); box-shadow: 0 0 0 3px rgba(74, 159, 220, .18); }
    .groupe {
      display: flex; align-items: baseline; gap: 8px;
      margin-top: var(--sp-2);
      font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: var(--muted);
    }
    .groupe-note { font-weight: 600; letter-spacing: 0; text-transform: none; font-size: 11.5px; color: var(--success); }
    .vide { margin: var(--sp-2) 0; font-size: 13.5px; color: var(--muted); }
    .opt {
      position: relative;
      display: flex; align-items: center; gap: var(--sp-3);
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      background: var(--surface);
      cursor: pointer;
      transition: border-color var(--t-fast), background var(--t-fast);
    }
    .opt:hover { border-color: var(--border-strong); background: var(--surface-2); }
    .opt.choisi { border-color: var(--brand-500); background: var(--brand-50); }
    .opt.bloque .opt-txt strong { color: var(--muted); text-decoration: line-through; }
    .opt input { position: absolute; opacity: 0; pointer-events: none; }
    .opt:has(input:focus-visible) { outline: 2px solid var(--brand-500); outline-offset: 2px; }
    .dot {
      width: 16px; height: 16px; flex-shrink: 0;
      border: 2px solid var(--border-strong); border-radius: 50%;
      transition: border-color var(--t-fast), box-shadow var(--t-fast);
    }
    .opt.choisi .dot { border-color: var(--brand-600); box-shadow: inset 0 0 0 3px var(--surface), inset 0 0 0 8px var(--brand-600); }
    .opt-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
    .opt-txt strong { font-size: 14px; color: var(--ink); overflow-wrap: anywhere; }
    .opt-txt small { font-size: 12.5px; color: var(--muted); }
    .tag {
      flex-shrink: 0;
      padding: 2px 8px; border-radius: 999px;
      font-size: 11.5px; font-weight: 700;
      background: var(--surface-2); color: var(--ink-soft);
      border: 1px solid var(--border);
    }
    .tag-alerte { background: var(--warning-bg); color: var(--warning); border-color: transparent; }

    /* Tous les modèles épuisés : état de chaque fournisseur (lecture seule) */
    .etats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
    .etats li {
      display: flex; align-items: center; gap: var(--sp-3);
      padding: 10px 12px;
      border: 1px solid var(--border); border-radius: var(--r-md);
      background: var(--surface-2);
    }
    .etats strong { flex: 1; min-width: 0; font-size: 14px; color: var(--ink-soft); }

    .chargement { display: flex; flex-direction: column; gap: 8px; }
    .ligne { height: 44px; border-radius: var(--r-md); }
    .erreur {
      margin-top: var(--sp-3);
      padding: var(--sp-3); border-radius: var(--r-md);
      background: var(--danger-bg); color: #991b1b; font-size: 14px;
    }
    .actions {
      display: flex; align-items: center; gap: var(--sp-2);
      margin-top: var(--sp-4); padding-top: var(--sp-4);
      border-top: 1px solid var(--border);
    }
    .espace { flex: 1; }
    .actions .btn { min-height: 40px; padding: 0 16px; font-size: 14px; }
    .couper { color: var(--danger); }
    .couper:hover:not(:disabled) { border-color: var(--danger); background: var(--danger-bg); }
    .spinner {
      width: 15px; height: 15px;
      border: 2.5px solid rgba(255, 255, 255, .35); border-top-color: #fff;
      border-radius: 50%; animation: spin .7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 480px) {
      .actions { flex-direction: column-reverse; align-items: stretch; }
      .espace { display: none; }
    }
  `]
})
export class AgentModeleDialogComponent implements OnInit, OnDestroy {
  private agent = inject(AgentService);
  private toast = inject(ToastService);
  private hote = inject(ElementRef<HTMLElement>);

  /** IA bloquée à signaler (null = simple choix du modèle). */
  @Input() blocage: BlocageIa | null = null;
  @Output() ferme = new EventEmitter<void>();

  readonly etat = this.agent.etat;
  /** Modèle sélectionné dans la liste ; null = automatique. */
  readonly choix = signal<string | null>(null);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);
  /** Recherche dans la liste (utile avec les nombreux modèles gratuits d'OpenRouter). */
  readonly filtre = signal('');

  readonly groupes = computed(() => {
    const f = this.filtre().trim().toLowerCase();
    const parFournisseur = new Map<string, ModeleIa[]>();
    for (const m of this.etat()?.modeles ?? []) {
      if (f && !m.id.toLowerCase().includes(f) && !m.fournisseur.toLowerCase().includes(f)) continue;
      parFournisseur.set(m.fournisseur, [...(parFournisseur.get(m.fournisseur) ?? []), m]);
    }
    return [...parFournisseur].map(([fournisseur, modeles]) => ({ fournisseur, modeles }));
  });

  /** « Gemini, Groq et OpenRouter » : fournisseurs configurés. */
  readonly nomsFournisseurs = computed(() => {
    const noms = [...new Set((this.etat()?.modeles ?? []).map(m => m.fournisseur))];
    return noms.length > 1 ? `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}` : (noms[0] ?? '');
  });

  /** Modèles écartés (quota / indisponibles), par identifiant. */
  readonly pauses = computed(() => new Map((this.etat()?.modelesEnPause ?? []).map(p => [p.id, p])));

  /** Tous épuisés : par fournisseur, la cause et l'heure où un de ses modèles se libère. */
  readonly resumeFournisseurs = computed(() => {
    const modeles = this.etat()?.modeles ?? [];
    const pauses = this.pauses();
    return [...new Set(modeles.map(m => m.fournisseur))].flatMap(fournisseur => {
      const enPause = modeles.filter(m => m.fournisseur === fournisseur)
        .map(m => pauses.get(m.id)).filter((p): p is ModeleEnPause => !!p);
      if (!enPause.length) return [];
      const prochaine = enPause.reduce((a, b) => new Date(a.reprise) <= new Date(b.reprise) ? a : b);
      return [{ fournisseur, quota: enPause.some(p => p.quota), reprise: this.heure(prochaine.reprise) }];
    });
  });

  /** Heure du prochain essai automatique (le modèle qui se libère le plus tôt). */
  readonly prochaineReprise = computed(() => {
    const reprises = (this.etat()?.modelesEnPause ?? []).map(p => new Date(p.reprise).getTime());
    return reprises.length ? this.heure(new Date(Math.min(...reprises)).toISOString()) : null;
  });

  readonly changement = computed(() => this.etat() !== null && this.choix() !== (this.etat()!.modele ?? null));

  ngOnInit() {
    // Rattaché au <body> : un parent animé (transform) décalerait sinon le popup.
    document.body.appendChild(this.hote.nativeElement);
    const s = this.etat();
    if (s) {
      this.preselectionner(s);
    } else {
      this.agent.statut().subscribe({
        next: x => this.preselectionner(x),
        error: () => this.erreur.set('Statut de l’agent indisponible. Réessayez.')
      });
    }
  }

  ngOnDestroy() {
    this.hote.nativeElement.remove();
  }

  /** « 15:48 », « demain 02:00 » ou « 12/10 09:30 » (le quota du jour d'OpenRouter peut reprendre le lendemain). */
  heure(iso: string): string {
    const d = new Date(iso);
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    if (d.toDateString() === new Date().toDateString()) return hm;
    if (d.toDateString() === demain.toDateString()) return `demain ${hm}`;
    return `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${hm}`;
  }

  /** Modèle choisi bloqué : on propose le mode automatique (bascule de modèle en modèle). */
  private preselectionner(s: AgentStatut) {
    this.choix.set(this.blocage && !this.blocage.tousLesModeles ? null : s.modele);
  }

  appliquer() {
    const s = this.etat();
    if (!s || !this.changement()) return;
    this.envoi.set(true);
    this.erreur.set(null);
    const modele = this.choix();
    this.agent.activer(s.actif, s.autoAssign, modele).subscribe({
      next: () => {
        const detail = modele === null
          ? 'Votre agent passera tout seul d’un modèle à l’autre quand un quota est atteint.'
          : s.actif ? `Votre agent utilise maintenant « ${libelleModele(modele)} ».`
                    : `« ${libelleModele(modele)} » sera utilisé à l’activation de l’agent.`;
        this.toast.succes(modele === null ? 'Mode automatique activé' : 'Modèle IA changé', detail);
        this.ferme.emit();
      },
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.error?.message ?? 'Changement impossible. Réessayez.');
      }
    });
  }

  desactiver() {
    const s = this.etat();
    if (!s) return;
    this.envoi.set(true);
    this.erreur.set(null);
    this.agent.activer(false, s.autoAssign, s.modele).subscribe({
      next: () => {
        this.toast.info('IA désactivée', 'Les e-mails reçus ne sont plus transformés automatiquement en tickets.');
        this.ferme.emit();
      },
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.error?.message ?? 'Désactivation impossible. Réessayez.');
      }
    });
  }

  @HostListener('document:keydown.escape')
  fermer() {
    if (!this.envoi()) this.ferme.emit();
  }
}
