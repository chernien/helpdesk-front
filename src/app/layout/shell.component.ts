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

interface LienNav {
  libelle: string;
  route: string;
  icone: string;
  roles?: string[];
}

@Component({
  selector: 'hd-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LogoComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  readonly notifications = inject(NotificationService);
  readonly toastService = inject(ToastService);

  @ViewChild('zoneNotifs') zoneNotifs?: ElementRef<HTMLElement>;
  @ViewChild('zoneProfil') zoneProfil?: ElementRef<HTMLElement>;

  readonly phraseNotification = phraseNotification;
  readonly tempsRelatif = tempsRelatif;
  readonly classeEtat = classeEtat;

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
    if (url.startsWith('/admin/utilisateurs')) return 'Utilisateurs';
    return 'Tickets';
  });

  /** Date du jour façon billet : "21.09.2026". */
  readonly dateBillet = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).replace(/\//g, '.');

  readonly menuOuvert = signal(false);
  readonly menuProfil = signal(false);
  readonly panneauNotifs = signal(false);

  private readonly liens: LienNav[] = [
    { libelle: 'Tickets',        route: '/tickets',            icone: 'ticket' },
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

  basculerMenu() { this.menuOuvert.update(v => !v); }
  fermerMenu() { this.menuOuvert.set(false); }

  basculerProfil() {
    this.panneauNotifs.set(false);
    this.menuProfil.update(v => !v);
  }

  basculerNotifs() {
    this.menuProfil.set(false);
    const ouvrir = !this.panneauNotifs();
    this.panneauNotifs.set(ouvrir);
    if (ouvrir) this.notifications.ouvrirCloche();
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
    this.menuProfil.set(false);
    this.menuOuvert.set(false);
    this.panneauNotifs.set(false);
  }

  @HostListener('document:click', ['$event'])
  surClicExterieur(event: MouseEvent) {
    const cible = event.target as Node;
    if (this.panneauNotifs() && !this.zoneNotifs?.nativeElement.contains(cible)) this.panneauNotifs.set(false);
    if (this.menuProfil() && !this.zoneProfil?.nativeElement.contains(cible)) this.menuProfil.set(false);
  }

  deconnexion() {
    this.notifications.arreter();
    this.auth.logout();
  }
}
