import { Component, DestroyRef, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmailDetail, EmailService } from '../../core/services/email.service';
import { ReferenceService } from '../../core/services/reference.service';
import { TicketService } from '../../core/services/ticket.service';
import { ToastService } from '../../core/services/toast.service';
import {
  ContactClient, IMPORTANCES, MODULES, Produit, SocieteClient, TYPES_TICKET, Ticket, tailleFichier
} from '../../core/models/models';
import { SocieteAutocompleteComponent } from '../../shared/societe-autocomplete.component';
import { CompteContactDialogComponent } from '../../shared/compte-contact-dialog.component';
import { EmailCorpsComponent } from './email-corps.component';
import { couleurAvatar, formatDateLongue, htmlEnTexte, initiales, messageErreur, nettoyerTexteEmail } from './email-utils';

/**
 * Creation d'un ticket a partir d'un e-mail (equivalent du « Créer une tâche » de Divalto / Bitrix24).
 * Pre-rempli depuis l'e-mail : intitule, description, client et contact reconnus par l'adresse de l'expediteur.
 * A la creation, le ticket est lie a l'e-mail (categorie Outlook).
 */
@Component({
  selector: 'hd-email-ticket-slider',
  standalone: true,
  imports: [ReactiveFormsModule, SocieteAutocompleteComponent, CompteContactDialogComponent, EmailCorpsComponent],
  templateUrl: './email-ticket-slider.component.html',
  styleUrl: './email-ticket-slider.component.scss'
})
export class EmailTicketSliderComponent {
  private fb = inject(FormBuilder);
  private ticketService = inject(TicketService);
  private emailService = inject(EmailService);
  private referenceService = inject(ReferenceService);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  @Output() fermer = new EventEmitter<void>();
  @Output() cree = new EventEmitter<Ticket>();

  readonly importances = IMPORTANCES;
  readonly typesTicket = TYPES_TICKET;
  readonly modules = MODULES;
  readonly tailleFichier = tailleFichier;
  readonly couleurAvatar = couleurAvatar;
  readonly initiales = initiales;
  readonly formatDateLongue = formatDateLongue;

  readonly mail = signal<EmailDetail | null>(null);
  readonly produits = signal<Produit[]>([]);
  readonly contacts = signal<ContactClient[]>([]);
  readonly chargementContacts = signal(false);
  readonly societe = signal<SocieteClient | null>(null);
  /** Societe reconnue depuis l'expediteur, affichee dans le champ Client. */
  readonly societeInitiale = signal<SocieteClient | null>(null);
  readonly rechercheExpediteur = signal(false);
  readonly envoi = signal(false);
  readonly erreur = signal<string | null>(null);
  readonly fichier = signal<File | null>(null);
  readonly erreurFichier = signal<string | null>(null);
  /** Contact sans compte pour lequel le popup de creation est ouvert. */
  readonly contactACreer = signal<ContactClient | null>(null);
  private static readonly TAILLE_MAX = 10 * 1024 * 1024;

  readonly form = this.fb.nonNullable.group({
    clientTiers: ['', Validators.required],
    contactEmail: ['', Validators.required],
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

  private readonly contactEmailCourant = signal('');
  readonly contactChoisi = computed(() =>
    this.contacts().find(c => c.email === this.contactEmailCourant()));
  readonly contactsAvecCompte = computed(() => this.contacts().filter(c => c.aCompte));
  readonly contactsSansCompte = computed(() => this.contacts().filter(c => !c.aCompte));

  @Input({ required: true }) set email(e: EmailDetail) {
    this.mail.set(e);
    this.form.patchValue({
      intitule: (e.objet ?? '').trim().slice(0, 200),
      description: this.texteEmail(e)
    });
    if (e.deEmail) this.reconnaitreExpediteur(e.deEmail);
  }

  constructor() {
    this.referenceService.produits().subscribe({ next: p => this.produits.set(p), error: () => {} });
    this.form.controls.contactEmail.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(email => this.contactEmailCourant.set(email));
  }

  /** L'expediteur est un contact Divalto : on pre-selectionne sa societe et son adresse. */
  private reconnaitreExpediteur(adresse: string) {
    this.rechercheExpediteur.set(true);
    this.referenceService.societeParEmail(adresse).subscribe({
      next: societe => {
        this.rechercheExpediteur.set(false);
        if (!societe || this.societe()) return;
        this.societeInitiale.set(societe);
        this.surSociete(societe, adresse);
      },
      error: () => this.rechercheExpediteur.set(false)
    });
  }

  surSociete(societe: SocieteClient | null, emailAPreselectionner?: string) {
    this.societe.set(societe);
    this.form.controls.clientTiers.setValue(societe?.tiers ?? '');
    this.form.controls.contactEmail.setValue('');
    this.contacts.set([]);
    if (!societe) return;

    this.chargementContacts.set(true);
    this.referenceService.contacts(societe.tiers).subscribe({
      next: contacts => {
        this.contacts.set(contacts);
        this.chargementContacts.set(false);
        const cible = emailAPreselectionner?.toLowerCase();
        const trouve = contacts.find(c => c.email.toLowerCase() === cible)
          ?? (contacts.length === 1 ? contacts[0] : undefined);
        if (trouve) this.form.controls.contactEmail.setValue(trouve.email);
      },
      error: () => this.chargementContacts.set(false)
    });
  }

  libelleContact(contact: ContactClient): string {
    const nom = [contact.prenom, contact.nom].filter(Boolean).join(' ');
    return nom ? `${contact.email} — ${nom}` : contact.email;
  }

  ouvrirCreationCompte() {
    const contact = this.contactChoisi();
    if (contact && !contact.aCompte) this.contactACreer.set(contact);
  }

  surCompteCree() {
    const cree = this.contactACreer();
    this.contactACreer.set(null);
    if (!cree) return;
    this.contacts.update(liste => liste.map(c => c.email === cree.email ? { ...c, aCompte: true } : c));
    this.toast.succes('Compte client créé', `${cree.email} peut désormais se connecter et suivre ses tickets.`);
  }

  choisir(champ: 'typeTicket' | 'importance', valeur: string) {
    this.form.controls[champ].setValue(valeur);
    this.form.controls[champ].markAsTouched();
  }

  reprendreTexteEmail() {
    const e = this.mail();
    if (e) this.form.controls.description.setValue(this.texteEmail(e));
  }

  private texteEmail(e: EmailDetail): string {
    return nettoyerTexteEmail(e.corpsHtml ? htmlEnTexte(e.corpsHtml) : e.corpsTexte ?? '');
  }

  surFichier(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const choisi = entree.files?.[0] ?? null;
    entree.value = '';
    this.erreurFichier.set(null);
    if (!choisi) return;
    if (choisi.size > EmailTicketSliderComponent.TAILLE_MAX) {
      this.erreurFichier.set(`« ${choisi.name} » dépasse 10 Mo (${tailleFichier(choisi.size)}).`);
      return;
    }
    this.fichier.set(choisi);
  }

  invalide(nom: keyof typeof this.form.controls): boolean {
    const controle = this.form.controls[nom];
    return controle.touched && controle.invalid;
  }

  soumettre() {
    const e = this.mail();
    if (!e || this.envoi()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.erreur('Formulaire incomplet', 'Complétez les champs signalés en rouge.');
      return;
    }

    this.envoi.set(true);
    this.erreur.set(null);
    const v = this.form.getRawValue();

    this.ticketService.creer({
      intitule: v.intitule.trim(),
      description: v.description,
      produit: v.produit,
      version: v.version,
      module: v.module,
      typeTicket: v.typeTicket,
      importance: v.importance,
      clientTiers: v.clientTiers,
      contactEmail: v.contactEmail,
      emailMessageId: e.messageIdInternet ?? null,
      emailThreadId: e.threadIdInternet ?? null,
      emailExpediteur: e.deEmail ?? null,
      emailObjet: e.objet ?? null,
      emailDate: e.date ?? null,
      dateEstimee: v.dateEstimee
    }).subscribe({
      next: ticket => this.finaliser(e, ticket),
      error: err => {
        this.envoi.set(false);
        this.erreur.set(messageErreur(err, 'La création a échoué. Réessayez dans un instant.'));
      }
    });
  }

  /** Ticket cree : piece jointe eventuelle puis lien avec l'e-mail. Aucun des deux n'annule la creation. */
  private finaliser(e: EmailDetail, ticket: Ticket) {
    const lier = () => this.emailService.lierTicket(e.id, ticket.id).subscribe({
      next: () => this.cree.emit(ticket),
      error: () => {
        this.toast.info('Lien avec l\'e-mail non enregistré',
          `Le ticket #${ticket.id} est créé, mais l'e-mail n'a pas pu être marqué dans Outlook.`);
        this.cree.emit(ticket);
      }
    });

    const fichier = this.fichier();
    if (!fichier) { lier(); return; }
    this.ticketService.joindreFichier(ticket.id, fichier).subscribe({
      next: lier,
      error: err => {
        this.toast.erreur('Pièce jointe non envoyée',
          messageErreur(err, `Le ticket #${ticket.id} est créé, mais « ${fichier.name} » n'a pas pu être joint.`));
        lier();
      }
    });
  }
}
