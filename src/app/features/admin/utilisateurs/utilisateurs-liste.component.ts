import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { UserAdminService } from '../../../core/services/user-admin.service';
import { LIBELLES_ROLE, Role, User, classeProduit } from '../../../core/models/models';

interface OngletRole {
  role: Role | '';
  libelle: string;
}

@Component({
  selector: 'hd-utilisateurs-liste',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './utilisateurs-liste.component.html',
  styleUrl: './utilisateurs-liste.component.scss'
})
export class UtilisateursListeComponent {
  private userAdmin = inject(UserAdminService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  @ViewChild('boutonAnnuler') boutonAnnuler?: ElementRef<HTMLButtonElement>;

  readonly libellesRole = LIBELLES_ROLE;
  readonly classeProduit = classeProduit;

  readonly onglets: OngletRole[] = [
    { role: '', libelle: 'Tous' },
    { role: 'ROLE_ADMIN', libelle: 'Administrateurs' },
    { role: 'ROLE_USER', libelle: 'Collaborateurs' },
    { role: 'ROLE_DEV', libelle: 'Développeurs' },
    { role: 'ROLE_CLIENT', libelle: 'Clients' }
  ];

  readonly utilisateurs = signal<User[]>([]);
  readonly total = signal(0);
  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);

  readonly role = signal<Role | ''>('');
  readonly recherche = signal('');
  readonly page = signal(1);
  readonly pageSize = 20;

  readonly nbPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  // ---------- Selection (conservee d'une page a l'autre) ----------
  readonly selection = signal<Map<number, User>>(new Map());
  readonly nbSelectionnes = computed(() => this.selection().size);
  readonly monId = computed(() => this.auth.user()?.id ?? null);

  /** Lignes de la page qu'il est possible de cocher (pas son propre compte). */
  private readonly selectionnablesPage = computed(() =>
    this.utilisateurs().filter(u => u.id !== this.monId()));

  readonly toutePageCochee = computed(() => {
    const lignes = this.selectionnablesPage();
    return lignes.length > 0 && lignes.every(u => this.selection().has(u.id));
  });
  readonly pagePartielle = computed(() =>
    !this.toutePageCochee() && this.selectionnablesPage().some(u => this.selection().has(u.id)));

  // ---------- Confirmation ----------
  readonly confirmationOuverte = signal(false);
  readonly suppressionEnCours = signal(false);
  readonly erreurSuppression = signal<string | null>(null);
  readonly selectionListe = computed(() => [...this.selection().values()]);
  readonly nbCollaborateursSelectionnes = computed(() =>
    this.selectionListe().filter(u => u.role === 'ROLE_USER').length);

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.charger();
  }

  charger() {
    this.chargement.set(true);
    this.erreur.set(null);
    this.userAdmin.rechercher(this.role(), this.recherche().trim(), this.page(), this.pageSize).subscribe({
      next: resultat => {
        this.utilisateurs.set(resultat.items);
        this.total.set(resultat.total);
        this.chargement.set(false);
      },
      error: () => {
        this.chargement.set(false);
        this.erreur.set("Impossible de charger les utilisateurs. Vérifiez que l'API est démarrée.");
      }
    });
  }

  choisirOnglet(role: Role | '') {
    if (this.role() === role) return;
    this.role.set(role);
    this.page.set(1);
    this.charger();
  }

  surRecherche(valeur: string) {
    this.recherche.set(valeur);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.page.set(1);
      this.charger();
    }, 300);
  }

  changerPage(delta: number) {
    const cible = this.page() + delta;
    if (cible < 1 || cible > this.nbPages()) return;
    this.page.set(cible);
    this.charger();
  }

  ouvrir(user: User) {
    this.router.navigate(['/admin/utilisateurs', user.id]);
  }

  // ---------- Cochage ----------

  estCoche(user: User): boolean {
    return this.selection().has(user.id);
  }

  basculer(user: User, event: Event) {
    event.stopPropagation();
    if (user.id === this.monId()) return;
    const map = new Map(this.selection());
    map.has(user.id) ? map.delete(user.id) : map.set(user.id, user);
    this.selection.set(map);
  }

  basculerPage() {
    const map = new Map(this.selection());
    const cocher = !this.toutePageCochee();
    for (const user of this.selectionnablesPage()) {
      cocher ? map.set(user.id, user) : map.delete(user.id);
    }
    this.selection.set(map);
  }

  viderSelection() {
    this.selection.set(new Map());
  }

  // ---------- Suppression ----------

  demanderSuppression() {
    if (this.nbSelectionnes() === 0) return;
    this.erreurSuppression.set(null);
    this.confirmationOuverte.set(true);
    // Focus sur "Annuler" : l'action sure par defaut, jamais la destructive.
    setTimeout(() => this.boutonAnnuler?.nativeElement.focus());
  }

  fermerConfirmation() {
    if (this.suppressionEnCours()) return;
    this.confirmationOuverte.set(false);
  }

  @HostListener('document:keydown.escape')
  surEchap() {
    if (this.confirmationOuverte()) this.fermerConfirmation();
  }

  confirmerSuppression() {
    const ids = [...this.selection().keys()];
    this.suppressionEnCours.set(true);
    this.erreurSuppression.set(null);

    this.userAdmin.supprimer(ids).subscribe({
      next: resultat => {
        this.suppressionEnCours.set(false);
        this.confirmationOuverte.set(false);
        this.viderSelection();

        const pluriel = resultat.comptesSupprimes > 1;
        const detail = resultat.ticketsRemisEnFile > 0
          ? `${resultat.ticketsRemisEnFile} ticket${resultat.ticketsRemisEnFile > 1 ? 's' : ''} remis dans la file de leur produit.`
          : undefined;
        this.toast.succes(
          `${resultat.comptesSupprimes} compte${pluriel ? 's' : ''} supprimé${pluriel ? 's' : ''}`, detail);

        // Si la page courante est vide apres suppression, on recule d'une page.
        if (this.page() > 1 && ids.length >= this.utilisateurs().length) this.page.update(p => p - 1);
        this.charger();
      },
      error: e => {
        this.suppressionEnCours.set(false);
        this.erreurSuppression.set(e.error?.message ?? 'La suppression a échoué. Aucun compte n\'a été supprimé.');
      }
    });
  }

  // ---------- Affichage ----------

  initiales(user: User): string {
    const source = (user.prenom && user.nom)
      ? `${user.prenom[0]}${user.nom[0]}`
      : (user.nomComplet || user.username || '?').trim().slice(0, 2);
    return source.toUpperCase();
  }

  libelle(user: User): string {
    return user.nomComplet || user.username || `Compte n°${user.id}`;
  }

  classeRole(role: Role | null): string {
    switch (role) {
      case 'ROLE_ADMIN': return 'role role-admin';
      case 'ROLE_USER':  return 'role role-user';
      case 'ROLE_DEV':   return 'role role-dev';
      default:           return 'role role-client';
    }
  }
}
