import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpParams } from '@angular/common/http';
import {
  Subject,
  debounceTime,
  distinctUntilChanged,
  finalize,
  takeUntil
} from 'rxjs';

import { environment } from '../../environment';

/* =========================================================
   API MODELS
========================================================= */
export interface GuestSummaryResponse {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  emailVerified: boolean;
  createdAt: string;          // date-time
  totalStays: number;
}

export interface PageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PagedModelGuestSummaryResponse {
  content: GuestSummaryResponse[];
  page: PageMetadata;
}

@Component({
  selector: 'app-guests',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './guests.component.html',
  styleUrl: './guests.component.css'
})
export class GuestsComponent implements OnInit, OnDestroy {

  private readonly apiUrl =
    `${environment.apiUrl}/api/dashboard/manager/guests`;

  private readonly destroy$ = new Subject<void>();
  private readonly search$ = new Subject<string>();

  /* ---------- state ---------- */
  guests: GuestSummaryResponse[] = [];
  loading = false;
  errorMessage = '';

  /* ---------- query / pagination ---------- */
  searchQuery = '';
  page = 0;
  size = 12;
  totalElements = 0;
  totalPages = 0;

  readonly pageSizeOptions: readonly number[] = [6, 12, 24, 48];

  constructor(private readonly http: HttpClient) {}

  /* =========================================================
     LIFECYCLE
  ========================================================= */
  ngOnInit(): void {
    this.search$
      .pipe(
        debounceTime(350),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(query => {
        this.searchQuery = query;
        this.page = 0;
        this.loadGuests();
      });

    this.loadGuests();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /* =========================================================
     DATA
  ========================================================= */
  loadGuests(): void {
    this.loading = true;
    this.errorMessage = '';

    let params = new HttpParams()
      .set('page', this.page)
      .set('size', this.size)
      .set('sort', 'createdAt,desc');

    const query = this.searchQuery.trim();
    if (query) params = params.set('query', query);

    this.http
      .get<PagedModelGuestSummaryResponse>(this.apiUrl, { params })
      .pipe(
        finalize(() => (this.loading = false)),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (res) => {
          this.guests = res?.content ?? [];
          this.totalElements = res?.page?.totalElements ?? 0;
          this.totalPages = res?.page?.totalPages ?? 0;

          if (this.page > 0 && this.page >= this.totalPages) {
            this.page = Math.max(0, this.totalPages - 1);
            this.loadGuests();
          }
        },
        error: (err) => {
          this.guests = [];
          this.totalElements = 0;
          this.totalPages = 0;
          this.errorMessage =
            err?.error?.message ??
            err?.message ??
            'Failed to load guests. Please try again.';
        }
      });
  }

  /* =========================================================
     SEARCH
  ========================================================= */
  onSearchInput(value: string): void {
    this.searchQuery = value ?? '';
    this.search$.next(this.searchQuery);
  }

  clearSearch(): void {
    if (!this.searchQuery) return;
    this.searchQuery = '';
    this.search$.next('');
  }

  clearAllFilters(): void {
    this.clearSearch();
  }

  changeSize(size: number | string): void {
    const parsed = Number(size);
    if (!parsed || parsed === this.size) return;

    this.size = parsed;
    this.page = 0;
    this.loadGuests();
  }

  refresh(): void {
    this.loadGuests();
  }

  /* =========================================================
     PAGINATION
  ========================================================= */
  get visiblePages(): number[] {
    const total = this.totalPages;
    if (total <= 7) return Array.from({ length: total }, (_, i) => i);

    const windowSize = 5;
    const start = Math.max(0, Math.min(this.page - 2, total - windowSize));
    return Array.from({ length: windowSize }, (_, i) => start + i);
  }

  get rangeStart(): number {
    return this.totalElements === 0 ? 0 : this.page * this.size + 1;
  }

  get rangeEnd(): number {
    return Math.min((this.page + 1) * this.size, this.totalElements);
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages || page === this.page) return;
    this.page = page;
    this.loadGuests();
  }

  previousPage(): void { this.goToPage(this.page - 1); }
  nextPage(): void { this.goToPage(this.page + 1); }

  /* =========================================================
     TEMPLATE HELPERS
  ========================================================= */
  trackByGuestId(_index: number, guest: GuestSummaryResponse): number {
    return guest.id;
  }

  fullName(guest: GuestSummaryResponse): string {
    const name = `${guest?.firstName ?? ''} ${guest?.lastName ?? ''}`.trim();
    return name || 'Unnamed guest';
  }

  initials(guest: GuestSummaryResponse): string {
    const first = (guest?.firstName ?? '').trim().charAt(0);
    const last  = (guest?.lastName  ?? '').trim().charAt(0);
    const value = `${first}${last}`.trim();
    return value ? value.toUpperCase() : 'G';
  }

  hasValue(value?: string | null): boolean {
    return !!value && value.trim().length > 0;
  }
}