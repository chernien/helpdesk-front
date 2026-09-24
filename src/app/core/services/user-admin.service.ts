import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CreateUserRequest, Role, UpdateUserRequest, User, UserPage } from '../models/models';

/** Gestion des comptes (reservee aux administrateurs). */
@Injectable({ providedIn: 'root' })
export class UserAdminService {
  private readonly url = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  rechercher(role: Role | '', recherche: string, page: number, pageSize: number) {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (role) params = params.set('role', role);
    if (recherche) params = params.set('recherche', recherche);
    return this.http.get<UserPage>(this.url, { params });
  }

  parId(id: number) {
    return this.http.get<User>(`${this.url}/${id}`);
  }

  creer(request: CreateUserRequest) {
    return this.http.post<User>(this.url, request);
  }

  modifier(id: number, request: UpdateUserRequest) {
    return this.http.put<User>(`${this.url}/${id}`, request);
  }

  /** Suppression definitive (tout ou rien). */
  supprimer(ids: number[]) {
    return this.http.post<{ comptesSupprimes: number; ticketsRemisEnFile: number }>(
      `${this.url}/suppression`, { ids });
  }
}
