// ============================================================
// Modeles partages avec l'API .NET (DTOs)
// ============================================================

export type Role = 'ROLE_ADMIN' | 'ROLE_USER' | 'ROLE_DEV' | 'ROLE_CLIENT';

export interface User {
  id: number;
  username: string | null;   // = email
  nom: string | null;
  prenom: string | null;
  nomComplet: string;
  role: Role | null;
  enabled: boolean | null;
  clientTiers: string | null;
  societeNom: string | null;
  nombreConnexion: number;
  dateCreation: string | null;
  produits: Produit[];
}

export interface UserPage {
  total: number;
  items: User[];
}

/** Collaborateur proposable pour l'assignation d'un ticket. */
export interface Collaborateur {
  id: number;
  nomComplet: string;
  email: string | null;
  /** ROLE_USER ou ROLE_DEV : pour grouper la liste « Confier à ». */
  role: Role | null;
}

export interface CreateUserRequest {
  role: Role;
  email: string;
  password: string;
  nom: string;
  prenom: string;
  clientTiers?: string | null;
  produitIds: number[];
}

export interface UpdateUserRequest {
  email: string;
  nom: string;
  prenom: string;
  enabled: boolean;
  password?: string | null;
  clientTiers?: string | null;
  produitIds: number[];
}

export const LIBELLES_ROLE: Record<Role, string> = {
  ROLE_ADMIN: 'Administrateur',
  ROLE_USER: 'Collaborateur',
  ROLE_DEV: 'Développeur',
  ROLE_CLIENT: 'Client'
};

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Ticket {
  id: number;
  intitule: string | null;
  description: string | null;
  produit: string | null;
  version: string | null;
  module: string | null;
  typeTicket: string | null;
  importance: string;
  etat: string | null;
  email: string | null;
  client: string | null;
  clientId: number | null;
  collaborateur: string | null;
  collaborateurId: number | null;
  dateDemande: string | null;
  dateEstimee: string | null;
  dateEnattente: string | null;
  reponse: string | null;
  resolution: string | null;
  /** Pièce jointe (null si aucune). */
  fichierNom: string | null;
  fichierType: string | null;
  fichierTaille: number | null;
}

/** "870 o", "540 Ko", "2,3 Mo" */
export function tailleFichier(octets: number | null): string {
  if (octets == null) return '';
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

export interface TicketPage {
  total: number;
  items: Ticket[];
}

export interface CreateTicketRequest {
  intitule: string;
  description?: string | null;
  produit?: string | null;
  version?: string | null;
  module?: string | null;
  typeTicket?: string | null;
  importance: string;
  clientTiers?: string | null;
  contactEmail?: string | null;
  dateEstimee?: string | null;
}

export interface UpdateTicketRequest {
  intitule?: string | null;
  description?: string | null;
  produit?: string | null;
  version?: string | null;
  module?: string | null;
  typeTicket?: string | null;
  importance?: string | null;
  etat?: string | null;
  collaborateurId?: number | null;
  dateEstimee?: string | null;
  reponse?: string | null;
  resolution?: string | null;
  /** Commentaire destine au client, joint a cette action. */
  commentaire?: string | null;
  /** Admin : correction du client et de son contact (toujours ensemble). */
  clientTiers?: string | null;
  contactEmail?: string | null;
}

/** Societe cliente (Divalto CLI). */
export interface SocieteClient {
  tiers: string;
  nom: string;
}

/** Contact d'une societe (Divalto T2). */
export interface ContactClient {
  email: string;
  nom: string | null;
  prenom: string | null;
  /** Le contact a deja un compte Helpdesk (il recevra ses tickets). */
  aCompte: boolean;
}

export interface CreerCompteContactRequest {
  clientTiers: string;
  email: string;
  nom: string;
  prenom: string;
  password: string;
}

export interface Produit {
  productId: number;
  nom: string;
}

export interface Affectation {
  userId: number;
  userNom: string | null;
  productId: number;
  produitNom: string | null;
}

export interface NotificationHisto {
  id: number;
  ticketId: number;
  typeEvent: 'CREATION' | 'ETAT' | 'ASSIGNATION' | 'ASSIGNATION_ETAT' | 'COMMENTAIRE'
    | 'MISE_A_JOUR' | 'VALIDATION_CLIENT' | 'ANNULATION_CLIENT';
  etat: string | null;
  clientId: number | null;
  clientNom: string | null;
  clientEmail: string | null;
  collaborateurId: number | null;
  parId: number | null;
  parNom: string | null;
  produit: string | null;
  /** Commentaire destine au client, joint a l'action. */
  commentaire: string | null;
  /** Responsable du ticket au moment de l'evenement. */
  collaborateurNom: string | null;
  /** Capture jointe a l'action (phase de test interne). */
  fichierNom: string | null;
  fichierType: string | null;
  dateEvent: string;
}

/** Ordre d'avancement d'un ticket (Annulé est une action a part). */
export const ORDRE_ETATS = ['Ouvert', 'En cours', 'En développement', 'Test interne', 'En attente de validation', 'Clôturé'];

export interface NotificationPage {
  total: number;
  items: NotificationHisto[];
}

export interface Cloche {
  nonLues: number;
  items: { evenement: NotificationHisto; lue: boolean }[];
}

/** Phrase d'un evenement, comme dans l'application d'origine. */
export function phraseNotification(e: NotificationHisto): string {
  const client = e.clientNom || e.clientEmail || 'inconnu';
  const par = e.parNom ? ` par ${e.parNom}` : '';
  switch (e.typeEvent) {
    case 'CREATION':
      return `Le Ticket N°${e.ticketId} du client ${client} a été créé${par}.`;
    case 'ASSIGNATION':
      return e.collaborateurNom && e.collaborateurNom !== e.parNom
        ? `Le Ticket N°${e.ticketId} du client ${client} a été confié à ${e.collaborateurNom}${par}.`
        : `Le Ticket N°${e.ticketId} du client ${client} a été pris en charge${par}.`;
    case 'ASSIGNATION_ETAT':
      return e.collaborateurNom && e.collaborateurNom !== e.parNom
        ? `Le Ticket N°${e.ticketId} du client ${client} a été confié à ${e.collaborateurNom} et est maintenant ${e.etat}${par}.`
        : `Le Ticket N°${e.ticketId} du client ${client} a été pris en charge et est maintenant ${e.etat}${par}.`;
    case 'VALIDATION_CLIENT':
      return `Le Ticket N°${e.ticketId} a été validé et clôturé par le client ${client}.`;
    case 'ANNULATION_CLIENT':
      return `Le Ticket N°${e.ticketId} a été annulé par le client ${client}.`;
    case 'COMMENTAIRE':
      return `Le Ticket N°${e.ticketId} du client ${client} a reçu une réponse${par}.`;
    case 'MISE_A_JOUR':
      return `Le Ticket N°${e.ticketId} du client ${client} a été mis à jour${par}.`;
    default:
      return `Le Ticket N°${e.ticketId} du client ${client} est maintenant ${e.etat ?? 'mis à jour'}${par}.`;
  }
}

/** "à l'instant", "il y a 5 min", "il y a 2 h", "hier", puis la date. */
export function tempsRelatif(dateIso: string): string {
  const diff = (Date.now() - new Date(dateIso).getTime()) / 1000;
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  if (diff < 172800) return 'hier';
  return new Date(dateIso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface TicketFilters {
  etat?: string;
  produit?: string;
  search?: string;
  page: number;
  pageSize: number;
}

// --- Valeurs metier (alignees sur l'application en production) ---
export const IMPORTANCES = ['Mineur', 'Grave', 'Bloquante'] as const;
export const TYPES_TICKET = ['Erreur', 'Evolution', 'Question', 'Assistance'] as const;

export const MODULES = [
  'Affaire',
  'Administration',
  'Règlement',
  'Comptabilité',
  'ERP',
  'CRM',
  'Paie',
  'Gestion'
] as const;

/** Classe CSS du badge selon l'etat renvoye par l'API. */
export function classeEtat(etat: string | null): string {
  switch (etat) {
    case 'Ouvert':                   return 'badge badge-ouvert';
    case 'En cours':                 return 'badge badge-cours';
    case 'En développement':         return 'badge badge-dev';
    case 'Test interne':             return 'badge badge-test';
    case 'En attente de validation': return 'badge badge-attente';
    case 'Clôturé':                  return 'badge badge-cloture';
    case 'Annulé':                   return 'badge badge-annule';
    default:                         return 'badge badge-neutre';
  }
}

/** Pastille de couleur stable par produit (hash simple sur le nom). */
export function classeProduit(nom: string | null): string {
  if (!nom) return 'pp pp-0';
  let hash = 0;
  for (let i = 0; i < nom.length; i++) hash = (hash * 31 + nom.charCodeAt(i)) | 0;
  return `pp pp-${Math.abs(hash) % 6}`;
}

/** Classe CSS de l'importance : Mineur < Grave < Bloquante. */
export function classeImportance(importance: string | null): string {
  switch (importance) {
    case 'Bloquante': return 'prio prio-bloquante';
    case 'Grave':     return 'prio prio-grave';
    default:          return 'prio prio-mineur';
  }
}
