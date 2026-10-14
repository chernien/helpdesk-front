import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Ajoute le token JWT (+ la société active du client) et deconnecte proprement sur 401. */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.token;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Client multi-sociétés : la société consultée filtre tickets, notifications et discussions.
  const societe = auth.societeActive();
  if (societe) headers['X-Societe'] = encodeURIComponent(societe);

  const requete = Object.keys(headers).length ? req.clone({ setHeaders: headers }) : req;

  return next(requete).pipe(
    catchError((erreur: HttpErrorResponse) => {
      if (erreur.status === 401 && !req.url.includes('/auth/login')) {
        auth.logout('expiree');
      }
      return throwError(() => erreur);
    })
  );
};
