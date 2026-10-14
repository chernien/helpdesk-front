import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ReferenceService } from '../../../core/services/reference.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import {
  ContactClient, LIBELLES_ROLE, ModuleItem, Produit, Role, SocieteClient, User
} from '../../../core/models/models';
import { SocieteAutocompleteComponent } from '../../../shared/societe-autocomplete.component';

interface ChoixRole {
  role: Role;
  titre: string;
  description: string;
}

const LONGUEUR_MIN_MDP = 8;

@Component({
  selector: 'hd-utilisateur-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, SocieteAutocompleteComponent],
  templateUrl: './utilisateur-form.component.html',
  styleUrl: './utilisateur-form.component.scss'
})
export class UtilisateurFormComponent {
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private userAdmin = inject(UserAdminService);
  private referenceService = inject(ReferenceService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  readonly libellesRole = LIBELLES_ROLE;
  readonly longueurMin = LONGUEUR_MIN_MDP;

  readonly choixRoles: ChoixRole[] = [
    { role: 'ROLE_CLIENT', titre: 'Client', description: "Contact d'une société cliente. Crée et suit ses propres tickets." },
    { role: 'ROLE_USER', titre: 'Collaborateur', description: 'Fonctionnel Mediasoft. Reçoit les tickets de ses produits ERP.' },
    { role: 'ROLE_DEV', titre: 'Développeur', description: 'Reçoit les tickets assignés, développe puis envoie au test interne.' },
    { role: 'ROLE_ADMIN', titre: 'Administrateur', description: 'Accès complet : tous les tickets et la gestion des comptes.' }
  ];

  /** null = creation. */
  readonly userId = signal<number | null>(null);
  readonly compte = signal<User | null>(null);
  readonly chargement = signal(false);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly motDePasseVisible = signal(false);

  readonly role = signal<Role | null>(null);
  readonly produits = signal<Produit[]>([]);
  readonly produitsChoisis = signal<Set<number>>(new Set());
  /** Client : une ou plusieurs sociétés rattachées (la 1re = principale). */
  readonly societes = signal<SocieteClient[]>([]);
  /** Société dont les contacts servent au pré-remplissage (la dernière ajoutée). */
  readonly societeContact = signal<SocieteClient | null>(null);
  @ViewChild(SocieteAutocompleteComponent) private autocompleteSociete?: SocieteAutocompleteComponent;
  readonly contacts = signal<ContactClient[]>([]);
  readonly chargementContacts = signal(false);
  /** Client administrateur de sa société : il voit les tickets de tous les membres (sinon, seulement les siens). */
  readonly adminSociete = signal(false);
  /** « Profil Admin helpdesk » coché sur son contact dans Divalto (T2.U_FLAG_ADMIN = 2), pour l'une de ses sociétés. */
  readonly adminDivalto = signal(false);

  // Client : produits + modules affectés (niveau client) + ajout inline.
  readonly modules = signal<ModuleItem[]>([]);
  readonly modulesClient = signal<string[]>([]);
  readonly nouveauModule = signal('');
  readonly ajoutModuleOuvert = signal(false);

  readonly produitsClient = signal<string[]>([]);
  readonly nouveauProduit = signal('');
  readonly ajoutProduitOuvert = signal(false);

  readonly modeEdition = computed(() => this.userId() !== null);
  readonly estMoi = computed(() => this.userId() === this.auth.user()?.id);
  readonly produitsInvalides = signal(false);
  readonly societeInvalide = signal(false);

  readonly form = this.fb.nonNullable.group({
    prenom: ['', [Validators.required, Validators.maxLength(100)]],
    nom: ['', [Validators.required, Validators.maxLength(200)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: ['', [Validators.minLength(LONGUEUR_MIN_MDP)]],
    enabled: [true]
  });

  get f() { return this.form.controls; }

  /** Email du compte en cours (suivi en direct pour filtrer les contacts). */
  private readonly emailCourant = toSignal(
    this.form.controls.email.valueChanges.pipe(startWith(this.form.controls.email.value)),
    { initialValue: this.form.controls.email.value });

  /**
   * Contacts proposés pour le pré-remplissage. Tant qu'aucun email n'est choisi, toute la liste
   * de la société. Dès qu'un contact est retenu (email fixé), on ne propose plus que cette même
   * adresse dans les autres sociétés — c'est la même personne, rattachée à plusieurs sociétés.
   */
  readonly contactsAffiches = computed(() => {
    const email = (this.emailCourant() ?? '').trim().toLowerCase();
    const tous = this.contacts();
    if (!email) return tous;
    const memePersonne = tous.filter(c => c.email.trim().toLowerCase() === email);
    return memePersonne.length ? memePersonne : tous;
  });

  constructor() {
    this.referenceService.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });
    this.referenceService.modules().subscribe({ next: m => this.modules.set(m), error: () => {} });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.userId.set(Number(id));
      this.chargerCompte(Number(id));
    } else {
      this.form.controls.password.addValidators(Validators.required);
    }
  }

  private chargerCompte(id: number) {
    this.chargement.set(true);
    this.userAdmin.parId(id).subscribe({
      next: user => {
        this.compte.set(user);
        this.role.set(user.role);
        this.form.patchValue({
          prenom: user.prenom ?? '',
          nom: user.nom ?? '',
          email: user.username ?? '',
          enabled: user.enabled !== false
        });
        this.produitsChoisis.set(new Set(user.produits.map(p => p.productId)));
        this.modulesClient.set([...(user.modules ?? [])]);
        this.produitsClient.set((user.perimetre ?? []).map(l => l.produit));
        const societes = (user.societes && user.societes.length)
          ? user.societes
          : (user.clientTiers ? [{ tiers: user.clientTiers, nom: user.societeNom ?? user.clientTiers }] : []);
        this.societes.set(societes);
        this.adminSociete.set(!!user.adminSociete);
        if (user.role === 'ROLE_CLIENT' && user.username) this.lireAdminDivalto(user.username, false);
        if (societes.length) {
          this.societeContact.set(societes[0]);
          this.chargerContacts(societes[0].tiers);
        }
        this.chargement.set(false);
      },
      error: () => {
        this.chargement.set(false);
        this.erreur.set('Ce compte est introuvable.');
      }
    });
  }

  choisirRole(role: Role) {
    this.role.set(role);
    this.erreur.set(null);
    queueMicrotask(() => document.getElementById(role === 'ROLE_CLIENT' ? 'societe' : 'prenom')?.focus());
  }

  // ---------- Client : societe et contact Divalto ----------

  /** Ajoute une société à la liste du client (sélection via l'autocomplétion). */
  surSociete(societe: SocieteClient | null) {
    if (!societe) return;
    if (this.societes().every(s => s.tiers !== societe.tiers))
      this.societes.update(liste => [...liste, societe]);
    this.societeInvalide.set(false);
    // Les contacts affichés pour le pré-remplissage suivent la dernière société ajoutée.
    this.societeContact.set(societe);
    this.contacts.set([]);
    this.chargerContacts(societe.tiers);
    // Vide le champ pour pouvoir enchaîner une autre société.
    queueMicrotask(() => this.autocompleteSociete?.vider());
  }

  retirerSociete(tiers: string) {
    this.societes.update(liste => liste.filter(s => s.tiers !== tiers));
    if (this.societeContact()?.tiers === tiers) {
      const premiere = this.societes()[0] ?? null;
      this.societeContact.set(premiere);
      this.contacts.set([]);
      if (premiere) this.chargerContacts(premiere.tiers);
    }
  }

  private chargerContacts(tiers: string) {
    this.chargementContacts.set(true);
    this.referenceService.contacts(tiers).subscribe({
      next: c => { this.contacts.set(c); this.chargementContacts.set(false); },
      error: () => this.chargementContacts.set(false)
    });
  }

  /** Pre-remplit prenom / nom / email depuis le contact Divalto (tout reste modifiable). */
  surContact(email: string) {
    const contact = this.contacts().find(c => c.email === email);
    if (!contact) return;
    this.form.patchValue({
      email: contact.email,
      prenom: contact.prenom ?? this.form.value.prenom ?? '',
      nom: contact.nom ?? this.form.value.nom ?? ''
    });
    this.form.controls.email.markAsTouched();
    // Nouveau compte : case pré-cochée si « Profil Admin helpdesk » est coché sur ce contact dans Divalto.
    this.lireAdminDivalto(contact.email, !this.modeEdition());
  }

  /** Lit « Profil Admin helpdesk » dans Divalto pour ces sociétés ; précoche la case si demandé (nouveau compte). */
  private lireAdminDivalto(email: string, precocher: boolean) {
    this.referenceService.societesAdmin(email).subscribe({
      next: tiers => {
        const admin = this.societes().some(s => tiers.includes(s.tiers));
        this.adminDivalto.set(admin);
        if (precocher) this.adminSociete.set(admin);
      },
      error: () => {}
    });
  }

  libelleContact(c: ContactClient): string {
    const nom = [c.prenom, c.nom].filter(Boolean).join(' ');
    return nom ? `${nom} — ${c.email}` : c.email;
  }

  // ---------- Collaborateur : produits ----------

  basculerProduit(id: number) {
    const set = new Set(this.produitsChoisis());
    set.has(id) ? set.delete(id) : set.add(id);
    this.produitsChoisis.set(set);
    this.produitsInvalides.set(false);
  }

  // ---------- Client : modules affectés (niveau client, sélection multiple) ----------

  /** Coche/décoche un module pour ce client. */
  basculerModuleClient(nom: string) {
    this.modulesClient.update(mods =>
      mods.includes(nom) ? mods.filter(m => m !== nom) : [...mods, nom]);
  }
  moduleClientCoche(nom: string): boolean {
    return this.modulesClient().includes(nom);
  }

  fermerAjoutModule() {
    this.ajoutModuleOuvert.set(false);
    this.nouveauModule.set('');
  }

  /** Crée un module (liste globale), l'affecte aussitôt à ce client et referme la saisie. */
  ajouterModule() {
    const nom = this.nouveauModule().trim();
    if (!nom) return;
    this.referenceService.ajouterModule(nom).subscribe({
      next: m => {
        if (!this.modules().some(x => x.id === m.id))
          this.modules.update(list => [...list, m].sort((a, b) => a.nom.localeCompare(b.nom)));
        if (!this.modulesClient().includes(m.nom)) this.basculerModuleClient(m.nom);
        this.fermerAjoutModule();
      },
      error: e => this.toast.erreur('Module non ajouté', e.error?.message ?? 'Réessayez.')
    });
  }

  // ---------- Client : produits affectés (niveau client, sélection multiple) ----------

  /** Coche/décoche un produit pour ce client. */
  basculerProduitClient(nom: string) {
    this.produitsClient.update(prods =>
      prods.includes(nom) ? prods.filter(p => p !== nom) : [...prods, nom]);
  }
  produitClientCoche(nom: string): boolean {
    return this.produitsClient().includes(nom);
  }

  fermerAjoutProduit() {
    this.ajoutProduitOuvert.set(false);
    this.nouveauProduit.set('');
  }

  /** Crée un produit (catalogue ERP), l'affecte aussitôt à ce client et referme la saisie. */
  ajouterProduit() {
    const nom = this.nouveauProduit().trim();
    if (!nom) return;
    this.referenceService.ajouterProduit(nom).subscribe({
      next: p => {
        if (!this.produits().some(x => x.productId === p.productId))
          this.produits.update(list => [...list, p].sort((a, b) => a.nom.localeCompare(b.nom)));
        if (!this.produitsClient().includes(p.nom)) this.basculerProduitClient(p.nom);
        this.fermerAjoutProduit();
      },
      error: e => this.toast.erreur('Produit non ajouté', e.error?.message ?? 'Réessayez.')
    });
  }

  /** Supprime un produit du catalogue (interdit s'il est affecté à des utilisateurs). */
  supprimerProduit(p: Produit) {
    this.referenceService.supprimerProduit(p.productId).subscribe({
      next: () => {
        this.produits.update(list => list.filter(x => x.productId !== p.productId));
        this.produitsClient.update(prods => prods.filter(n => n !== p.nom));
      },
      error: e => this.toast.erreur('Suppression impossible', e.error?.message ?? 'Réessayez.')
    });
  }

  // ---------- Mot de passe ----------

  basculerVisibilite() {
    this.motDePasseVisible.update(v => !v);
  }

  genererMotDePasse() {
    // Sans caracteres ambigus (0/O, 1/l/I) pour une transmission orale ou ecrite.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%*?';
    const valeurs = crypto.getRandomValues(new Uint32Array(14));
    const mdp = Array.from(valeurs, v => alphabet[v % alphabet.length]).join('');
    this.form.controls.password.setValue(mdp);
    this.form.controls.password.markAsTouched();
    this.motDePasseVisible.set(true);
  }

  invalide(nom: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[nom];
    return c.touched && c.invalid;
  }

  // ---------- Enregistrement ----------

  enregistrer() {
    const role = this.role();
    if (!role) return;

    this.form.markAllAsTouched();
    const produitsOk = (role !== 'ROLE_USER' && role !== 'ROLE_DEV') || this.produitsChoisis().size > 0;
    const societeOk = role !== 'ROLE_CLIENT' || this.societes().length > 0;
    this.produitsInvalides.set(!produitsOk);
    this.societeInvalide.set(!societeOk);

    if (this.form.invalid || !produitsOk || !societeOk) {
      this.erreur.set('Certains champs sont à compléter : ils sont signalés en rouge.');
      return;
    }

    this.envoi.set(true);
    this.erreur.set(null);
    const v = this.form.getRawValue();

    const commun = {
      email: v.email.trim(),
      prenom: v.prenom.trim(),
      nom: v.nom.trim(),
      clientTiers: role === 'ROLE_CLIENT' ? (this.societes()[0]?.tiers ?? null) : null,
      societesTiers: role === 'ROLE_CLIENT' ? this.societes().map(s => s.tiers) : [],
      adminSociete: role === 'ROLE_CLIENT' && this.adminSociete(),
      produitIds: role === 'ROLE_USER' || role === 'ROLE_DEV' ? [...this.produitsChoisis()] : [],
      perimetre: role === 'ROLE_CLIENT' ? this.produitsClient().map(nom => ({ produit: nom, version: null })) : [],
      modules: role === 'ROLE_CLIENT' ? this.modulesClient() : []
    };

    const requete = this.modeEdition()
      ? this.userAdmin.modifier(this.userId()!, { ...commun, role, enabled: v.enabled, password: v.password || null })
      : this.userAdmin.creer({ ...commun, role, password: v.password });

    requete.subscribe({
      next: user => {
        this.toast.succes(
          this.modeEdition() ? 'Compte mis à jour' : 'Compte créé',
          `${user.nomComplet} — ${LIBELLES_ROLE[user.role!]}`);
        this.router.navigate(['/admin/utilisateurs']);
      },
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.error?.message ?? "L'enregistrement a échoué. Réessayez dans un instant.");
      }
    });
  }
}
