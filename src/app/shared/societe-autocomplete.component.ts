import {
  Component, ElementRef, EventEmitter, HostListener, Input, Output, inject, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReferenceService } from '../core/services/reference.service';
import { SocieteClient } from '../core/models/models';

/**
 * Champ "tapez le nom du client" avec suggestions (pattern ARIA combobox).
 * Clavier : fleches pour naviguer, Entree pour choisir, Echap pour fermer.
 */
@Component({
  selector: 'hd-societe-autocomplete',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './societe-autocomplete.component.html',
  styleUrl: './societe-autocomplete.component.scss'
})
export class SocieteAutocompleteComponent {
  private referenceService = inject(ReferenceService);
  private hote = inject(ElementRef<HTMLElement>);

  @Input() inputId = 'societe';
  @Input() invalide = false;
  @Output() choisie = new EventEmitter<SocieteClient | null>();

  /** Societe deja choisie (modification d'un compte existant). */
  @Input() set valeurInitiale(societe: SocieteClient | null) {
    if (!societe) return;
    this.selection.set(societe);
    this.texte.set(societe.nom);
  }

  readonly texte = signal('');
  readonly resultats = signal<SocieteClient[]>([]);
  readonly ouvert = signal(false);
  readonly chargement = signal(false);
  readonly actif = signal(-1);
  readonly selection = signal<SocieteClient | null>(null);

  private timer?: ReturnType<typeof setTimeout>;
  private requeteCourante = 0;

  get listeId() { return `${this.inputId}-liste`; }

  surSaisie(valeur: string) {
    this.texte.set(valeur);

    // Le texte ne correspond plus a la societe choisie : on l'annule.
    if (this.selection() && valeur !== this.selection()!.nom) {
      this.selection.set(null);
      this.choisie.emit(null);
    }

    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.rechercher(valeur), 250);
  }

  surFocus() {
    if (!this.selection()) this.rechercher(this.texte());
  }

  private rechercher(valeur: string) {
    const numero = ++this.requeteCourante;
    this.chargement.set(true);
    this.ouvert.set(true);

    this.referenceService.societes(valeur.trim()).subscribe({
      next: societes => {
        // Ignore les reponses arrivees apres une frappe plus recente.
        if (numero !== this.requeteCourante) return;
        this.resultats.set(societes);
        this.actif.set(societes.length ? 0 : -1);
        this.chargement.set(false);
      },
      error: () => {
        if (numero !== this.requeteCourante) return;
        this.resultats.set([]);
        this.chargement.set(false);
      }
    });
  }

  choisir(societe: SocieteClient) {
    this.selection.set(societe);
    this.texte.set(societe.nom);
    this.ouvert.set(false);
    this.choisie.emit(societe);
  }

  /** Vide le champ (utilisé par le parent pour enchaîner plusieurs sociétés). */
  vider() {
    this.selection.set(null);
    this.texte.set('');
    this.resultats.set([]);
    this.ouvert.set(false);
    this.actif.set(-1);
  }

  effacer(champ: HTMLInputElement) {
    this.selection.set(null);
    this.texte.set('');
    this.choisie.emit(null);
    champ.focus();
    this.rechercher('');
  }

  surClavier(event: KeyboardEvent) {
    const liste = this.resultats();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this.ouvert()) { this.rechercher(this.texte()); return; }
        this.actif.set(Math.min(this.actif() + 1, liste.length - 1));
        this.defilerVersActif();
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.actif.set(Math.max(this.actif() - 1, 0));
        this.defilerVersActif();
        break;
      case 'Enter':
        if (this.ouvert() && this.actif() >= 0 && liste[this.actif()]) {
          event.preventDefault();
          this.choisir(liste[this.actif()]);
        }
        break;
      case 'Escape':
        this.ouvert.set(false);
        break;
    }
  }

  private defilerVersActif() {
    queueMicrotask(() => {
      const element = this.hote.nativeElement.querySelector(`#${this.inputId}-opt-${this.actif()}`);
      element?.scrollIntoView({ block: 'nearest' });
    });
  }

  @HostListener('document:click', ['$event'])
  surClicExterieur(event: MouseEvent) {
    if (!this.hote.nativeElement.contains(event.target as Node)) {
      this.ouvert.set(false);
    }
  }
}
