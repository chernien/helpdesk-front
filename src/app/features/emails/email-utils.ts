// Utilitaires partages par la boite mail et ses panneaux coulissants.

/** Pastilles d'avatar facon Divalto / Bitrix24 (couleur stable par expediteur). */
const COULEURS = ['#7fb800', '#1fa2d6', '#2fb3a5', '#e5484d', '#e08e00', '#9b6cf0', '#4c9be0', '#8b929a'];

export function initiale(nom: string | null): string {
  return (nom?.trim()[0] ?? '?').toUpperCase();
}

export function initiales(nom: string | null): string {
  if (!nom?.trim()) return '?';
  const mots = nom.trim().split(/\s+/);
  return (mots[0][0] + (mots[1]?.[0] ?? '')).toUpperCase();
}

export function couleurAvatar(nom: string | null): string {
  if (!nom) return COULEURS[COULEURS.length - 1];
  let hash = 0;
  for (let i = 0; i < nom.length; i++) hash = (hash * 31 + nom.charCodeAt(i)) | 0;
  return COULEURS[Math.abs(hash) % COULEURS.length];
}

/** Liste : "10:52" aujourd'hui, "lun." cette semaine, sinon "12 sept.". */
export function formatHeure(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const diffJ = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffJ < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  });
}

/** Detail : "aujourd'hui, 09:48", "hier, 14:02", "29 septembre, 09:57". */
export function formatDateLongue(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const heure = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const hier = new Date(now);
  hier.setDate(now.getDate() - 1);

  if (d.toDateString() === now.toDateString()) return `aujourd'hui, ${heure}`;
  if (d.toDateString() === hier.toDateString()) return `hier, ${heure}`;
  const jour = d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {})
  });
  return `${jour}, ${heure}`;
}

export function formatTaille(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1048576).toFixed(1).replace('.', ',')} Mo`;
}

/** Corps HTML d'un e-mail → texte lisible (description du ticket). Le HTML n'est jamais execute. */
export function htmlEnTexte(html: string | null): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('style, script, head, title').forEach(e => e.remove());
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  doc.querySelectorAll('td, th').forEach(cellule => cellule.append('\t'));
  doc.querySelectorAll('p, div, tr, li, h1, h2, h3, h4, table').forEach(bloc => bloc.append('\n'));
  return (doc.body.textContent ?? '')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Texte d'un e-mail prêt pour la description d'un ticket : sans caractères invisibles (remplissage des
 * aperçus publicitaires, que la base enregistrerait en « ? »), sans « [Image] » ni lignes de séparation.
 * Même règle que NettoyageTexte côté API.
 */
export function nettoyerTexteEmail(texte: string): string {
  return texte
    .replace(/\r\n/g, '\n')
    .replace(/[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/g, '')
    .replace(/\[(?:image|cid:[^\]]*)\]/gi, '')
    .replace(/^[ \t]*[_\-=*─—]{5,}[ \t]*$/gm, '')
    .split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "a@x.fr; b@y.fr, c@z.fr" → ["a@x.fr", "b@y.fr", "c@z.fr"] */
export function adresses(texte: string): string[] {
  return texte.split(/[,;\s]+/).map(a => a.trim()).filter(Boolean);
}

/** Message d'erreur de l'API ({ message }) ou texte par defaut. */
export function messageErreur(e: unknown, defaut: string): string {
  const corps = (e as { error?: { message?: string } })?.error;
  return corps?.message ?? defaut;
}
