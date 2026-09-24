import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ReferenceService } from '../../../core/services/reference.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import {
  ContactClient, LIBELLES_ROLE, Produit, Role, SocieteClient, User
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
  readonly societe = signal<SocieteClient | null>(null);
  readonly contacts = signal<ContactClient[]>([]);
  readonly chargementContacts = signal(false);

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

  constructor() {
    this.referenceService.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });

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
        if (user.clientTiers) {
          const societe = { tiers: user.clientTiers, nom: user.societeNom ?? user.clientTiers };
          this.societe.set(societe);
          this.chargerContacts(societe.tiers);
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

  surSociete(societe: SocieteClient | null) {
    this.societe.set(societe);
    this.societeInvalide.set(false);
    this.contacts.set([]);
    if (societe) this.chargerContacts(societe.tiers);
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
    const societeOk = role !== 'ROLE_CLIENT' || this.societe() !== null;
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
      clientTiers: role === 'ROLE_CLIENT' ? this.societe()!.tiers : null,
      produitIds: role === 'ROLE_USER' || role === 'ROLE_DEV' ? [...this.produitsChoisis()] : []
    };

    const requete = this.modeEdition()
      ? this.userAdmin.modifier(this.userId()!, { ...commun, enabled: v.enabled, password: v.password || null })
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
