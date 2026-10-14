import { Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/services/auth.service';
import { NotificationService } from '../core/services/notification.service';
import { LogoComponent } from '../shared/logo.component';
import { ToastService } from '../core/services/toast.service';
import { NotificationHisto, classeEtat, phraseNotification, tempsRelatif } from '../core/models/models';
import { ConversationApercu } from '../core/services/message.service';
import { TicketChatSliderComponent } from '../features/tickets/ticket-chat-slider.component';
import { ChatOuvertureService } from '../core/services/chat-ouverture.service';
import { AgentService, libelleModele } from '../core/services/agent.service';
import { AgentModeleDialogComponent } from '../shared/agent-modele-dialog.component';

interface LienNav {
  libelle: string;
  route: string;
  icone: string;
  roles?: string[];
}

@Component({
  selector: 'hd-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LogoComponent, TicketChatSliderComponent,
            AgentModeleDialogComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly notifications = inject(NotificationService);
  readonly toastService = inject(ToastService);
  readonly chat = inject(ChatOuvertureService);
  /** Agent IA : popup de choix du modèle (quota atteint ou bascule manuelle). */
  readonly agent = inject(AgentService);
  readonly libelleModele = libelleModele;

  @ViewChild('zoneNotifs') zoneNotifs?: ElementRef<HTMLElement>;
  @ViewChild('zoneProfil') zoneProfil?: ElementRef<HTMLElement>;
  @ViewChild('zoneMessenger') zoneMessenger?: ElementRef<HTMLElement>;
  @ViewChild('zoneSociete') zoneSociete?: ElementRef<HTMLElement>;

  readonly phraseNotification = phraseNotification;
  readonly tempsRelatif = tempsRelatif;
  readonly classeEtat = classeEtat;

  /** Menu Messenger (conversations non lues). Le chat ouvert vit dans ChatOuvertureService. */
  readonly panneauMessenger = signal(false);

  readonly user = this.auth.user;

  /** Titre de la section courante, affiche dans la barre du haut. */
  private readonly urlCourante = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(e => e.urlAfterRedirects),
      startWith(this.router.url)
    ), { initialValue: this.router.url });

  readonly titrePage = computed(() => {
    const url = this.urlCourante().split('?')[0];
    const ticket = url.match(/^\/tickets\/(\d+)/);
    if (ticket) return `Ticket #${ticket[1]}`;
    if (url.startsWith('/tickets/nouveau')) return 'Nouveau ticket';
    if (url.startsWith('/historique')) return 'Historique';
    if (url.startsWith('/emails')) return 'Boîte mail';
    if (url.startsWith('/admin/utilisateurs')) return 'Utilisateurs';
    return 'Tickets';
  });

  /** Boite mail : pleine largeur, sur son fond illustre (facon Divalto). */
  readonly pleinEcran = computed(() => this.urlCourante().startsWith('/emails'));

  /** Date du jour façon billet : "21.09.2026". */
  readonly dateBillet = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).replace(/\//g, '.');

  readonly menuOuvert = signal(false);
  readonly menuProfil = signal(false);
  readonly panneauNotifs = signal(false);
  readonly menuSociete = signal(false);

  // ---------- Client multi-sociétés : sélecteur dans l'en-tête ----------
  readonly societes = this.auth.societesClient;
  readonly societeActive = this.auth.societeActive;
  /** Affiché seulement si le client a plusieurs sociétés. */
  readonly afficherSocietes = computed(() => this.auth.estClient() && this.societes().length > 1);

  private readonly liens: LienNav[] = [
    { libelle: 'Tickets',        route: '/tickets',            icone: 'ticket' },
    { libelle: 'Boîte mail',     route: '/emails',             icone: 'email',  roles: ['ROLE_ADMIN', 'ROLE_USER', 'ROLE_DEV'] },
    // Un developpeur ne cree pas de tickets : il recoit ceux qu'on lui assigne.
    { libelle: 'Nouveau ticket', route: '/tickets/nouveau',     icone: 'plus', roles: ['ROLE_ADMIN', 'ROLE_USER', 'ROLE_CLIENT'] },
    { libelle: 'Historique',     route: '/historique',          icone: 'horloge' },
    { libelle: 'Utilisateurs',   route: '/admin/utilisateurs',  icone: 'users', roles: ['ROLE_ADMIN'] }
  ];

  /** Nouvelles notifications affichees dans le panneau ouvert. */
  readonly nbNouvelles = computed(() =>
    this.notifications.cloche()?.items.filter(i => !i.lue).length ?? 0);

  readonly nomAffiche = computed(() => {
    const u = this.user();
    return u?.nomComplet || u?.nom || u?.username || '';
  });

  readonly liensVisibles = computed(() => {
    const role = this.auth.role();
    return this.liens.filter(l => !l.roles || (role !== null && l.roles.includes(role)));
  });

  readonly libelleRole = computed(() => {
    switch (this.auth.role()) {
      case 'ROLE_ADMIN':  return 'Administrateur';
      case 'ROLE_USER':   return 'Collaborateur';
      case 'ROLE_DEV':    return 'Développeur';
      case 'ROLE_CLIENT': return 'Client';
      default:            return '';
    }
  });

  readonly initiales = computed(() => {
    const u = this.user();
    if (u?.prenom && u?.nom) return `${u.prenom[0]}${u.nom[0]}`.toUpperCase();
    return (this.nomAffiche() || '?').trim().slice(0, 2).toUpperCase();
  });

  /** Choix du modèle IA dans le menu profil : admin / collaborateur ayant une boîte connectée. */
  readonly afficherModeleIa = computed(() => {
    const s = this.agent.etat();
    return (this.auth.estAdmin() || this.auth.estCollaborateur()) && !!s?.disponible && !!s?.aBoite;
  });

  choisirModeleIa() {
    this.menuProfil.set(false);
    this.agent.ouvrirChoix();
  }

  basculerMenu() { this.menuOuvert.update(v => !v); }
  fermerMenu() { this.menuOuvert.set(false); }

  basculerSociete() {
    this.menuProfil.set(false);
    this.panneauNotifs.set(false);
    this.panneauMessenger.set(false);
    this.menuSociete.update(v => !v);
  }

  /** Initiales d'une société pour le badge (ex. « ESPACE FORMATION » → « EF »). */
  initialesSociete(nom: string | null): string {
    const mots = (nom ?? '').trim().split(/\s+/).filter(Boolean);
    if (mots.length === 0) return '—';
    const s = mots.length >= 2 ? mots[0][0] + mots[1][0] : mots[0].slice(0, 2);
    return s.toUpperCase();
  }

  /** Change la société consultée : recharge notifications + discussions, et revient aux tickets. */
  choisirSociete(nom: string) {
    this.menuSociete.set(false);
    if (nom === this.societeActive()) return;
    this.auth.choisirSociete(nom);
    // Les requêtes suivantes portent l'en-tête X-Societe : on relit cloche et messagerie.
    this.notifications.chargerCloche();
    this.notifications.rafraichirMessages();
    this.router.navigate(['/tickets']);
  }

  basculerProfil() {
    this.panneauNotifs.set(false);
    this.menuProfil.update(v => !v);
  }

  basculerNotifs() {
    this.menuProfil.set(false);
    this.panneauMessenger.set(false);
    const ouvrir = !this.panneauNotifs();
    this.panneauNotifs.set(ouvrir);
    if (ouvrir) this.notifications.ouvrirCloche();
  }

  basculerMessenger() {
    this.menuProfil.set(false);
    this.panneauNotifs.set(false);
    const ouvrir = !this.panneauMessenger();
    this.panneauMessenger.set(ouvrir);
    if (ouvrir) this.notifications.rafraichirMessages();
  }

  /** Ouvre la discussion d'une conversation depuis le Messenger. */
  ouvrirChat(conversation: ConversationApercu) {
    this.panneauMessenger.set(false);
    this.chat.ouvrir(conversation.ticketId, conversation.intitule);
  }

  fermerChat() {
    this.chat.fermer();
    this.notifications.rafraichirMessages();
  }

  ouvrirNotification(evt: NotificationHisto) {
    this.panneauNotifs.set(false);
    this.router.navigate(['/tickets', evt.ticketId]);
  }

  voirHistorique() {
    this.panneauNotifs.set(false);
    this.router.navigate(['/historique']);
  }

  @HostListener('document:keydown.escape')
  surEchap() {
    // Le chat coulissant gère sa propre fermeture ; ici on ferme les menus.
    if (this.chat.ouvert()) return;
    this.menuProfil.set(false);
    this.menuOuvert.set(false);
    this.panneauNotifs.set(false);
    this.panneauMessenger.set(false);
    this.menuSociete.set(false);
  }

  @HostListener('document:click', ['$event'])
  surClicExterieur(event: MouseEvent) {
    const cible = event.target as Node;
    if (this.panneauNotifs() && !this.zoneNotifs?.nativeElement.contains(cible)) this.panneauNotifs.set(false);
    if (this.menuProfil() && !this.zoneProfil?.nativeElement.contains(cible)) this.menuProfil.set(false);
    if (this.panneauMessenger() && !this.zoneMessenger?.nativeElement.contains(cible)) this.panneauMessenger.set(false);
    if (this.menuSociete() && !this.zoneSociete?.nativeElement.contains(cible)) this.menuSociete.set(false);
  }

  deconnexion() {
    this.notifications.arreter();
    this.auth.logout();
  }
}
