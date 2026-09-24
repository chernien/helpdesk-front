import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ReferenceService } from '../../core/services/reference.service';
import { TicketService } from '../../core/services/ticket.service';
import { ToastService } from '../../core/services/toast.service';
import {
  ContactClient, IMPORTANCES, MODULES, Produit, SocieteClient, TYPES_TICKET,
  classeImportance, classeProduit, tailleFichier
} from '../../core/models/models';
import { SocieteAutocompleteComponent } from '../../shared/societe-autocomplete.component';
import { CompteContactDialogComponent } from '../../shared/compte-contact-dialog.component';

@Component({
  selector: 'hd-ticket-create',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, SocieteAutocompleteComponent, CompteContactDialogComponent],
  templateUrl: './ticket-create.component.html',
  styleUrl: './ticket-form.scss'
})
export class TicketCreateComponent {
  private fb = inject(FormBuilder);
  private ticketService = inject(TicketService);
  private referenceService = inject(ReferenceService);
  private toast = inject(ToastService);
  private router = inject(Router);
  readonly auth = inject(AuthService);

  readonly importances = IMPORTANCES;
  readonly typesTicket = TYPES_TICKET;
  readonly modules = MODULES;

  readonly produits = signal<Produit[]>([]);
  readonly contacts = signal<ContactClient[]>([]);
  readonly chargementContacts = signal(false);
  readonly societe = signal<SocieteClient | null>(null);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);

  /** Contacts separes selon qu'ils ont deja un compte Helpdesk ou non. */
  readonly contactsAvecCompte = computed(() => this.contacts().filter(c => c.aCompte));
  readonly contactsSansCompte = computed(() => this.contacts().filter(c => !c.aCompte));
  /** Contact sans compte pour lequel le popup de creation est ouvert. */
  readonly contactACreer = signal<ContactClient | null>(null);
  private readonly destroyRef = inject(DestroyRef);

  /** Piece jointe optionnelle (tous roles), envoyee juste apres la creation. */
  readonly fichier = signal<File | null>(null);
  readonly erreurFichier = signal<string | null>(null);
  readonly tailleFichier = tailleFichier;
  private static readonly TAILLE_MAX = 10 * 1024 * 1024;

  readonly form = this.fb.nonNullable.group({
    clientTiers: [''],
    contactEmail: [''],
    intitule: ['', [Validators.required, Validators.maxLength(200)]],
    produit: ['', Validators.required],
    version: ['', Validators.required],
    module: ['', Validators.required],
    typeTicket: ['', Validators.required],
    importance: ['', Validators.required],
    dateEstimee: ['', Validators.required],
    description: ['', Validators.required]
  });

  get f() { return this.form.controls; }

  readonly classeProduit = classeProduit;
  readonly classeImportance = classeImportance;

  /** Valeurs du formulaire en direct, pour l'apercu du ticket. */
  readonly apercu = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() });

  /** Part des champs obligatoires remplis (barre de progression sous l'apercu). */
  readonly completion = computed(() => {
    this.apercu();
    const controles = Object.values(this.form.controls).filter(c => c.hasValidator(Validators.required));
    if (!controles.length) return 0;
    const remplis = controles.filter(c => c.valid).length;
    return Math.round((remplis / controles.length) * 100);
  });

  constructor() {
    this.referenceService.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });

    // Contact choisi sans compte : on propose tout de suite de lui creer son acces.
    this.form.controls.contactEmail.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(email => {
        const contact = this.contacts().find(c => c.email === email);
        if (contact && !contact.aCompte) this.contactACreer.set(contact);
      });

    // Admin / collaborateur : il choisit la societe et le contact pour le client.
    if (!this.auth.estClient()) {
      this.form.controls.clientTiers.addValidators(Validators.required);
      this.form.controls.contactEmail.addValidators(Validators.required);
    }
  }

  surSociete(societe: SocieteClient | null) {
    this.societe.set(societe);
    this.form.controls.clientTiers.setValue(societe?.tiers ?? '');
    this.form.controls.clientTiers.markAsTouched();
    this.form.controls.contactEmail.setValue('');
    this.contacts.set([]);

    if (!societe) return;

    this.chargementContacts.set(true);
    this.referenceService.contacts(societe.tiers).subscribe({
      next: contacts => {
        this.contacts.set(contacts);
        this.chargementContacts.set(false);
        // Un seul contact : on le preselectionne.
        if (contacts.length === 1) {
          this.form.controls.contactEmail.setValue(contacts[0].email);
        }
      },
      error: () => this.chargementContacts.set(false)
    });
  }

  /** Contact actuellement selectionne dans la liste. */
  contactChoisi(): ContactClient | undefined {
    const email = this.form.controls.contactEmail.value;
    return this.contacts().find(c => c.email === email);
  }

  ouvrirCreationCompte() {
    const contact = this.contactChoisi();
    if (contact && !contact.aCompte) this.contactACreer.set(contact);
  }

  /** Compte cree : le contact passe dans le groupe « avec compte ». */
  surCompteCree() {
    const cree = this.contactACreer();
    this.contactACreer.set(null);
    if (!cree) return;
    this.contacts.update(liste => liste.map(c => c.email === cree.email ? { ...c, aCompte: true } : c));
    this.toast.succes('Compte client créé', `${cree.email} peut désormais se connecter et suivre ses tickets.`);
  }

  libelleContact(contact: ContactClient): string {
    const nom = [contact.prenom, contact.nom].filter(Boolean).join(' ');
    return nom ? `${contact.email} — ${nom}` : contact.email;
  }

  /** Choix visuels (type, importance) : on ecrit dans le meme contrôle que la liste d'origine. */
  choisirType(type: string) {
    this.form.controls.typeTicket.setValue(type);
    this.form.controls.typeTicket.markAsTouched();
  }

  choisirImportance(importance: string) {
    this.form.controls.importance.setValue(importance);
    this.form.controls.importance.markAsTouched();
  }

  surFichier(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const choisi = entree.files?.[0] ?? null;
    entree.value = ''; // permet de re-choisir le meme fichier apres retrait

    this.erreurFichier.set(null);
    if (!choisi) return;
    if (choisi.size > TicketCreateComponent.TAILLE_MAX) {
      this.erreurFichier.set(`« ${choisi.name} » dépasse 10 Mo (${tailleFichier(choisi.size)}).`);
      return;
    }
    this.fichier.set(choisi);
  }

  retirerFichier() {
    this.fichier.set(null);
    this.erreurFichier.set(null);
  }

  invalide(nom: keyof typeof this.form.controls): boolean {
    const controle = this.form.controls[nom];
    return controle.touched && controle.invalid;
  }

  soumettre() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      // L'erreur peut etre hors de l'ecran (client / contact en haut) : on y amene l'utilisateur.
      queueMicrotask(() => {
        const champ = document.querySelector<HTMLElement>('.creation-form .is-invalid, .creation-form [aria-invalid="true"]');
        champ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        champ?.focus({ preventScroll: true });
      });
      this.toast.erreur('Formulaire incomplet', 'Complétez les champs signalés en rouge.');
      return;
    }

    this.envoi.set(true);
    this.erreur.set(null);
    const v = this.form.getRawValue();

    this.ticketService.creer({
      intitule: v.intitule,
      description: v.description,
      produit: v.produit,
      version: v.version,
      module: v.module,
      typeTicket: v.typeTicket,
      importance: v.importance,
      clientTiers: v.clientTiers || null,
      contactEmail: v.contactEmail || null,
      dateEstimee: v.dateEstimee || null
    }).subscribe({
      next: ticket => this.joindrePuisOuvrir(ticket.id, ticket.produit),
      error: e => {
        this.envoi.set(false);
        this.erreur.set(e.error?.message ?? "La création a échoué. Réessayez dans un instant.");
      }
    });
  }

  /** Le ticket est cree ; on envoie la piece jointe eventuelle puis on ouvre le ticket. */
  private joindrePuisOuvrir(id: number, produit: string | null) {
    const fichier = this.fichier();
    const succes = () => {
      this.toast.succes(`Ticket #${id} créé`, `Les collaborateurs ${produit} ont été notifiés.`);
      this.router.navigate(['/tickets', id]);
    };
    if (!fichier) { succes(); return; }

    this.ticketService.joindreFichier(id, fichier).subscribe({
      next: succes,
      error: e => {
        // Le ticket existe : on n'echoue pas la creation pour la piece jointe.
        this.toast.erreur('Pièce jointe non envoyée',
          e.error?.message ?? `Le ticket #${id} est créé, mais « ${fichier.name} » n'a pas pu être joint.`);
        this.router.navigate(['/tickets', id]);
      }
    });
  }
}
