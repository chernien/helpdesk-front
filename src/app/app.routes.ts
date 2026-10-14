import { Routes } from '@angular/router';
import { authGuard, roleGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'connexion',
    title: 'Connexion — Help Desk Mediasoft',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'oauth/callback',
    title: 'Connexion Microsoft — Help Desk Mediasoft',
    loadComponent: () =>
      import('./features/emails/oauth-callback.component').then(m => m.OAuthCallbackComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layout/shell.component').then(m => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tickets' },
      {
        path: 'tickets',
        title: 'Tickets — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/tickets/ticket-list.component').then(m => m.TicketListComponent)
      },
      {
        path: 'emails',
        title: 'Boîte mail — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/emails/email-inbox.component').then(m => m.EmailInboxComponent)
      },
      {
        path: 'tickets/nouveau',
        title: 'Nouveau ticket — Help Desk Mediasoft',
        canActivate: [roleGuard('ROLE_ADMIN', 'ROLE_USER', 'ROLE_CLIENT')],
        loadComponent: () =>
          import('./features/tickets/ticket-create.component').then(m => m.TicketCreateComponent)
      },
      {
        path: 'admin/utilisateurs',
        canActivate: [roleGuard('ROLE_ADMIN')],
        title: 'Utilisateurs — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/admin/utilisateurs/utilisateurs-liste.component').then(m => m.UtilisateursListeComponent)
      },
      {
        path: 'admin/utilisateurs/nouveau',
        canActivate: [roleGuard('ROLE_ADMIN')],
        title: 'Nouvel utilisateur — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/admin/utilisateurs/utilisateur-form.component').then(m => m.UtilisateurFormComponent)
      },
      {
        path: 'admin/utilisateurs/:id',
        canActivate: [roleGuard('ROLE_ADMIN')],
        title: 'Modifier un utilisateur — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/admin/utilisateurs/utilisateur-form.component').then(m => m.UtilisateurFormComponent)
      },
      {
        path: 'historique',
        title: 'Historique — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/historique/historique.component').then(m => m.HistoriqueComponent)
      },
      {
        path: 'tickets/:id',
        title: 'Détail du ticket — Help Desk Mediasoft',
        loadComponent: () =>
          import('./features/tickets/ticket-detail.component').then(m => m.TicketDetailComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
