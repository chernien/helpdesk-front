import {
  Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, effect, inject, signal
} from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { MessageChat, MessageService } from '../../core/services/message.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { couleurAvatar, formatDateLongue, formatHeure, formatTaille, initiales, messageErreur } from '../emails/email-utils';

/**
 * Discussion (chat) d'un ticket : panneau coulissant façon Divalto / Bitrix24.
 * Bulles gauche (autres) / droite (moi), temps réel via NotificationService.signalMessage.
 */
@Component({
  selector: 'hd-ticket-chat-slider',
  standalone: true,
  templateUrl: './ticket-chat-slider.component.html',
  styleUrl: './ticket-chat-slider.component.scss'
})
export class TicketChatSliderComponent implements OnInit {
  private messageService = inject(MessageService);
  private notifications = inject(NotificationService);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  @ViewChild('fil') fil?: ElementRef<HTMLElement>;
  @ViewChild('zone') zone?: ElementRef<HTMLTextAreaElement>;

  @Input({ required: true }) ticketId!: number;
  /** Intitulé du ticket, pour l'en-tête (facultatif). */
  @Input() intitule: string | null = null;
  @Output() fermer = new EventEmitter<void>();

  readonly couleurAvatar = couleurAvatar;
  readonly initiales = initiales;
  readonly formatHeure = formatHeure;
  readonly formatDateLongue = formatDateLongue;
  readonly formatTaille = formatTaille;

  readonly messages = signal<MessageChat[]>([]);
  readonly chargement = signal(true);
  readonly erreur = signal<string | null>(null);
  readonly texte = signal('');
  readonly envoi = signal(false);
  /** Pièce jointe sélectionnée, à envoyer avec le prochain message. */
  readonly fichier = signal<File | null>(null);
  readonly erreurFichier = signal<string | null>(null);
  private static readonly TAILLE_MAX = 10 * 1024 * 1024;
  /** Id du message dont la suppression est en attente de confirmation. */
  readonly confirmId = signal<number | null>(null);

  constructor() {
    // Un message arrive en temps réel : on ne recharge le fil que s'il concerne CE ticket.
    let dernier = this.notifications.signalMessage();
    effect(() => {
      const v = this.notifications.signalMessage();
      if (v === dernier) return;
      dernier = v;
      if (this.notifications.dernierTicketMessage() === this.ticketId) this.charger(false);
    });
  }

  ngOnInit() {
    // Réouverture instantanée : si on a déjà chargé ce fil, on l'affiche tout de suite,
    // puis on rafraîchit en arrière-plan (sans spinner). La base étant distante, ça évite l'attente.
    const cache = this.messageService.cache(this.ticketId);
    if (cache?.length) {
      this.messages.set(cache);
      this.chargement.set(false);
      this.defilerEnBas();
      this.charger(false);
    } else {
      this.charger(true);
    }
  }

  private charger(avecSpinner: boolean) {
    if (avecSpinner) this.chargement.set(true);
    this.messageService.fil(this.ticketId).subscribe({
      next: liste => {
        const avant = this.messages().length;
        this.messages.set(liste);
        this.chargement.set(false);
        this.erreur.set(null);
        if (liste.length !== avant || avecSpinner) this.defilerEnBas();
        this.marquerLu();
      },
      error: e => {
        this.chargement.set(false);
        if (!this.messages().length) this.erreur.set(messageErreur(e, "La discussion n'a pas pu être chargée."));
      }
    });
  }

  /** Marque la conversation lue : repère serveur (sans bloquer) + mise à jour immédiate du badge. */
  private marquerLu() {
    this.notifications.marquerConversationLueLocalement(this.ticketId);
    this.messageService.marquerLu(this.ticketId).subscribe({ error: () => { /* sans effet visible */ } });
  }

  surFichier(evenement: Event) {
    const entree = evenement.target as HTMLInputElement;
    const choisi = entree.files?.[0] ?? null;
    entree.value = '';
    this.erreurFichier.set(null);
    if (!choisi) return;
    if (choisi.size > TicketChatSliderComponent.TAILLE_MAX) {
      this.erreurFichier.set(`« ${choisi.name} » dépasse 10 Mo (${formatTaille(choisi.size)}).`);
      return;
    }
    this.fichier.set(choisi);
  }

  retirerFichier() {
    this.fichier.set(null);
    this.erreurFichier.set(null);
  }

  envoyer() {
    const contenu = this.texte().trim();
    const fichier = this.fichier();
    if ((!contenu && !fichier) || this.envoi()) return;

    // Affichage optimiste : la bulle apparaît tout de suite, sans attendre le serveur.
    const moi = this.auth.user();
    const tempId = -Date.now();
    const provisoire: MessageChat = {
      id: tempId, ticketId: this.ticketId, auteurId: moi?.id ?? 0,
      auteurNom: moi?.nomComplet || moi?.username || null, auteurRole: moi?.role ?? null,
      deMoi: true, duClient: moi?.role === 'ROLE_CLIENT',
      contenu, dateEnvoi: new Date().toISOString(), enCours: true,
      fichierNom: fichier?.name ?? null, fichierType: fichier?.type ?? null, fichierTaille: fichier?.size ?? null
    };
    this.messages.update(liste => [...liste, provisoire]);
    this.texte.set('');
    this.fichier.set(null);
    this.reinitialiserHauteur();
    this.defilerEnBas();
    this.envoi.set(true);

    const requete = fichier
      ? this.messageService.envoyerAvecFichier(this.ticketId, contenu, fichier)
      : this.messageService.envoyer(this.ticketId, contenu);

    requete.subscribe({
      next: message => {
        this.messages.update(liste => liste.map(m => m.id === tempId ? message : m));
        this.messageService.majCache(this.ticketId, this.messages());
        this.envoi.set(false);
      },
      error: e => {
        // Échec : on retire la bulle provisoire et on restaure la saisie.
        this.messages.update(liste => liste.filter(m => m.id !== tempId));
        this.texte.set(contenu);
        if (fichier) this.fichier.set(fichier);
        this.envoi.set(false);
        this.toast.erreur('Message non envoyé', messageErreur(e, 'Réessayez dans un instant.'));
      }
    });
  }

  /** Télécharge la pièce jointe d'un message (lien authentifié). */
  telecharger(m: MessageChat) {
    if (m.id < 0 || !m.fichierNom) return; // bulle provisoire : pas encore sur le serveur
    this.messageService.telechargerFichier(m.id).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = m.fichierNom!;
        lien.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.erreur('Pièce jointe indisponible', "Le fichier n'a pas pu être récupéré.")
    });
  }

  estImage(m: MessageChat): boolean {
    return !!m.fichierType?.startsWith('image/');
  }

  /** On peut supprimer ses propres messages (et un admin, n'importe lequel). */
  peutSupprimer(m: MessageChat): boolean {
    return m.id > 0 && !m.enCours && (m.deMoi || this.auth.estAdmin());
  }

  demanderSuppression(m: MessageChat) { this.confirmId.set(m.id); }
  annulerSuppression() { this.confirmId.set(null); }

  supprimer(m: MessageChat) {
    this.confirmId.set(null);
    const sauvegarde = this.messages();
    // Retrait optimiste.
    this.messages.update(liste => liste.filter(x => x.id !== m.id));
    this.messageService.majCache(this.ticketId, this.messages());

    this.messageService.supprimer(m.id).subscribe({
      next: () => this.notifications.rafraichirMessages(),
      error: e => {
        // Échec : on remet le message.
        this.messages.set(sauvegarde);
        this.messageService.majCache(this.ticketId, sauvegarde);
        this.toast.erreur('Suppression impossible', messageErreur(e, 'Réessayez dans un instant.'));
      }
    });
  }

  /** Entrée = envoyer ; Maj+Entrée = nouvelle ligne. */
  surClavier(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.envoyer();
    }
  }

  /** Le champ grandit avec le texte (jusqu'à une hauteur max, gérée en CSS). */
  surSaisie(event: Event) {
    const el = event.target as HTMLTextAreaElement;
    this.texte.set(el.value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

  private reinitialiserHauteur() {
    const el = this.zone?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  /** Sépare la date quand le jour change entre deux messages. */
  jourSepare(index: number): boolean {
    const liste = this.messages();
    if (index === 0) return true;
    return new Date(liste[index].dateEnvoi).toDateString() !== new Date(liste[index - 1].dateEnvoi).toDateString();
  }

  libelleRole(role: string | null): string {
    switch (role) {
      case 'ROLE_CLIENT': return 'Client';
      case 'ROLE_ADMIN':  return 'Administrateur';
      case 'ROLE_DEV':    return 'Développeur';
      case 'ROLE_USER':   return 'Collaborateur';
      default:            return '';
    }
  }

  private defilerEnBas() {
    setTimeout(() => {
      const el = this.fil?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
