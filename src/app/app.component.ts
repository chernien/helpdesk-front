import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';
import { NotificationService } from './core/services/notification.service';
import { ToastsComponent } from './shared/toasts.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastsComponent],
  template: '<router-outlet /><hd-toasts />'
})
export class AppComponent {
  private auth = inject(AuthService);
  private notifications = inject(NotificationService);

  constructor() {
    // Reprise de session : on relance SignalR si un token est deja present.
    if (this.auth.estConnecte()) {
      this.notifications.demarrer();
    }
  }
}
