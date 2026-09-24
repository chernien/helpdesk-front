import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Role } from '../models/models';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.estConnecte()) return true;

  return router.createUrlTree(['/connexion'], {
    queryParams: { retour: state.url }
  });
};

/** Restreint une route a certains roles. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.estConnecte()) return router.createUrlTree(['/connexion']);
    if (auth.aLeRole(...roles)) return true;

    return router.createUrlTree(['/tickets']);
  };
}
