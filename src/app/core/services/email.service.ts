import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface EmailSummary {
  id: string;
  de: string | null;
  deEmail: string | null;
  objet: string | null;
  apercu: string | null;
  date: string | null;
  estLu: boolean;
  hasAttachments: boolean;
  ticketId: number | null;
  /** Message-ID RFC (identique pour tous les destinataires To/CC) : lien partagé anti-doublon. */
  messageIdInternet?: string | null;
  /** Fil de discussion (References/In-Reply-To racine, ou conversationId). */
  threadIdInternet?: string | null;
}

export interface EmailContact {
  nom: string | null;
  email: string | null;
}

export interface EmailDetail extends EmailSummary {
  corpsHtml: string | null;
  corpsTexte: string | null;
  piecesJointes: { id: string | null; nom: string | null; typeMime: string | null; taille: number }[];
  a: EmailContact[];
  cc: EmailContact[];
}

export interface EmailPage {
  total: number;
  items: EmailSummary[];
  nextLink: string | null;
}

/** Dossier de la boîte. `cle` : nom Graph des dossiers connus (inbox, junkemail, deleteditems…). */
export interface EmailDossier {
  id: string;
  nom: string;
  cle: string | null;
  nonLus: number;
  total: number;
}

/** État de la boîte personnelle connectée (IMAP/SMTP). */
export interface MailboxStatut {
  connectee: boolean;
  provider?: string | null;
  email?: string | null;
  imapHost?: string | null;
  smtpHost?: string | null;
  depuisLe?: string | null;
}

export interface MailboxConnectRequest {
  provider: string;
  email: string;
  login?: string;
  password: string;
  imapHost?: string;
  imapPort?: number;
  imapSsl?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpStartTls?: boolean;
}

@Injectable({ providedIn: 'root' })
export class EmailService {
  private readonly url = `${environment.apiUrl}/emails`;
  private readonly urlBoite = `${environment.apiUrl}/mailbox`;

  constructor(private http: HttpClient) {}

  // ─── Boîte personnelle (connexion IMAP/SMTP) ───────────────────────────────
  statutBoite(): Observable<MailboxStatut> {
    return this.http.get<MailboxStatut>(this.urlBoite);
  }
  connecterBoite(req: MailboxConnectRequest): Observable<MailboxStatut> {
    return this.http.post<MailboxStatut>(this.urlBoite, req);
  }
  deconnecterBoite(): Observable<void> {
    return this.http.delete<void>(this.urlBoite);
  }
  /** URL Microsoft (OAuth délégué) vers laquelle rediriger pour connecter une boîte Outlook. */
  urlOAuthBoite(): Observable<{ url: string; state: string }> {
    return this.http.get<{ url: string; state: string }>(`${this.urlBoite}/oauth/url`);
  }
  /** Retour Microsoft : envoie le code reçu pour finaliser la connexion de la boîte. */
  connecterOAuthBoite(code: string): Observable<MailboxStatut> {
    return this.http.post<MailboxStatut>(`${this.urlBoite}/oauth/callback`, { code });
  }

  lister(page = 1, pageSize = 25, search?: string, folder = 'inbox', nonLus = false): Observable<EmailPage> {
    let params = new HttpParams()
      .set('page', page)
      .set('pageSize', pageSize)
      .set('folder', folder);
    if (search) params = params.set('search', search);
    if (nonLus) params = params.set('nonLus', true);
    return this.http.get<EmailPage>(this.url, { params });
  }

  dossiers(): Observable<EmailDossier[]> {
    return this.http.get<EmailDossier[]>(`${this.url}/dossiers`);
  }

  parId(id: string): Observable<EmailDetail> {
    return this.http.get<EmailDetail>(`${this.url}/${encodeURIComponent(id)}`);
  }

  /** Contenu d'une pièce jointe d'un e-mail (blob), pour l'afficher ou la télécharger. */
  telechargerPieceJointe(messageId: string, attachmentId: string): Observable<Blob> {
    return this.http.get(
      `${this.url}/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { responseType: 'blob' });
  }

  marquerLu(id: string, lu = true): Observable<void> {
    const params = new HttpParams().set('valeur', lu);
    return this.http.patch<void>(`${this.url}/${encodeURIComponent(id)}/lu`, {}, { params });
  }

  /** Déplace vers un dossier (ID ou nom connu : junkemail = spam, deleteditems = corbeille). */
  deplacer(id: string, dossierId: string): Observable<void> {
    return this.http.post<void>(`${this.url}/${encodeURIComponent(id)}/deplacer`, { dossierId });
  }

  repondre(id: string, message: string, tous: boolean): Observable<void> {
    return this.http.post<void>(`${this.url}/${encodeURIComponent(id)}/repondre`, { message, tous });
  }

  transferer(id: string, destinataires: string[], message: string): Observable<void> {
    return this.http.post<void>(`${this.url}/${encodeURIComponent(id)}/transferer`, { destinataires, message });
  }

  /** Adresses d'expéditeur sélectionnables (« De »). */
  expediteurs(): Observable<string[]> {
    return this.http.get<string[]>(`${this.url}/expediteurs`);
  }

  envoyer(destinataires: string[], cc: string[], objet: string, message: string, from?: string): Observable<void> {
    return this.http.post<void>(`${this.url}/envoyer`, { destinataires, cc, objet, message, from });
  }

  /** Lie l'email au ticket créé à partir de lui (catégorie Outlook). */
  lierTicket(id: string, ticketId: number): Observable<void> {
    return this.http.post<void>(`${this.url}/${encodeURIComponent(id)}/ticket`, { ticketId });
  }
}
