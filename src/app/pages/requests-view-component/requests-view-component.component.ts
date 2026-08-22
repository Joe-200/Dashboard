import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, Subject } from 'rxjs';

import {
  ReservationRequestService,
  ReservationRequest,
  PagedModelReservationRequestResponse
} from '../../reservation-request-service.service';

import { RoomService, RoomResponse } from '../../room-response.service';

@Component({
  selector: 'app-requests-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
 templateUrl: './requests-view-component.component.html',
  styleUrl: './requests-view-component.component.css'
})
export class RequestsViewComponent implements OnInit {
  // ============================================================
  // OUTPUT – notify parent when data changes
  // ============================================================
  @Output() dataChanged = new EventEmitter<void>();

  // ============================================================
  // FILTERS & SEARCH
  // ============================================================
  searchTerm = '';
  statusFilter = '';
  dateFrom = '';
  dateTo = '';

  // Debounced search
  private searchSubject = new Subject<string>();

  // ============================================================
  // DATA & PAGINATION (server-side based on status only)
  // ============================================================
  requests: ReservationRequest[] = [];
  loading = false;
  error = '';

  currentPage = 0;
  pageSize = 20;
  totalRequests = 0;
  totalPages = 0;

  // ============================================================
  // CLIENT-SIDE FILTERED REQUESTS
  // ============================================================
  get filteredRequests(): ReservationRequest[] {
    let result = this.requests;

    // Filter by search term (guest name, email, phone)
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      result = result.filter(req =>
        req.guestName?.toLowerCase().includes(term) ||
        req.guestEmail?.toLowerCase().includes(term) ||
        req.guestPhone?.toLowerCase().includes(term)
      );
    }

    // Filter by date range (check-in date)
    if (this.dateFrom) {
      result = result.filter(req => req.checkInDate >= this.dateFrom);
    }
    if (this.dateTo) {
      result = result.filter(req => req.checkInDate <= this.dateTo);
    }

    return result;
  }

  // ============================================================
  // MODALS
  // ============================================================
  // Details
  showDetailsModal = false;
  selectedRequest: ReservationRequest | null = null;

  // Accept
  showAcceptModal = false;
  acceptingRequestId: number | null = null;
  availableRooms: RoomResponse[] = [];
  selectedRoomId: number | null = null;
  acceptLoading = false;

  // Reject
  showRejectModal = false;
  rejectingRequestId: number | null = null;
  rejectReason = '';
  rejectLoading = false;

  // ============================================================
  // CONSTRUCTOR
  // ============================================================
  constructor(
    private reservationService: ReservationRequestService,
    private roomService: RoomService
  ) {}

  // ============================================================
  // LIFECYCLE
  // ============================================================
  ngOnInit(): void {
    this.searchSubject.pipe(debounceTime(400)).subscribe(() => {
      this.currentPage = 0;
      this.loadRequests();
    });
    this.loadRequests();
  }

  // ============================================================
  // LOAD REQUESTS (server-side – only status, page, size)
  // ============================================================
  loadRequests(): void {
    this.loading = true;
    this.error = '';

    const status = this.statusFilter || undefined;

    this.reservationService
      .getRequests(status, this.currentPage, this.pageSize)
      .subscribe({
        next: (data: PagedModelReservationRequestResponse) => {
          this.requests = data.content;
          this.totalRequests = data.page.totalElements;
          this.totalPages = data.page.totalPages;
          this.loading = false;
        },
        error: (err: HttpErrorResponse) => {
          this.error = 'Failed to load requests: ' + (err.error?.message || err.message);
          this.loading = false;
        }
      });
  }

  // ============================================================
  // FILTER / SEARCH HANDLERS
  // ============================================================
  onSearchChange(): void {
    this.searchSubject.next(this.searchTerm);
  }

  clearSearch(): void {
    this.searchTerm = '';
    this.currentPage = 0;
    this.loadRequests();
  }

  onFilterChange(): void {
    this.currentPage = 0;
    this.loadRequests();
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.statusFilter = '';
    this.dateFrom = '';
    this.dateTo = '';
    this.currentPage = 0;
    this.loadRequests();
  }

  // ============================================================
  // PAGINATION
  // ============================================================
  changePage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.loadRequests();
  }

  // ============================================================
  // DETAILS MODAL
  // ============================================================
  openDetails(request: ReservationRequest): void {
    this.selectedRequest = request;
    this.showDetailsModal = true;
  }

  closeDetails(): void {
    this.showDetailsModal = false;
    this.selectedRequest = null;
  }

  // ============================================================
  // ACCEPT MODAL
  // ============================================================
  openAccept(requestId: number, categoryId: number): void {
    this.acceptingRequestId = requestId;
    this.selectedRoomId = null;
    this.availableRooms = [];
    this.acceptLoading = false;
    this.showAcceptModal = true;

    this.roomService
      .getRooms({
        pageable: { page: 0, size: 100 },
        status: 'AVAILABLE'
      })
      .subscribe({
        next: (data) => {
          this.availableRooms = data.content.filter(r => r.categoryId === categoryId);
          this.acceptLoading = false;
        },
        error: (err) => {
          this.error = 'Failed to load rooms: ' + (err.error?.message || err.message);
          this.acceptLoading = false;
        }
      });
  }

  closeAccept(): void {
    this.showAcceptModal = false;
    this.acceptingRequestId = null;
    this.selectedRoomId = null;
    this.availableRooms = [];
  }

  confirmAccept(): void {
    if (this.acceptingRequestId === null || this.selectedRoomId === null) return;
    this.acceptLoading = true;
    this.reservationService
      .approveRequest(this.acceptingRequestId, this.selectedRoomId)
      .subscribe({
        next: () => {
          this.acceptLoading = false;
          this.closeAccept();
          this.requests = this.requests.filter(r => r.id !== this.acceptingRequestId);
          this.totalRequests--;
          this.dataChanged.emit();
          this.loadRequests(); // reload to sync pagination
        },
        error: (err) => {
          this.acceptLoading = false;
          this.error = 'Failed to accept: ' + (err.error?.message || err.message);
        }
      });
  }

  // ============================================================
  // REJECT MODAL
  // ============================================================
  openReject(requestId: number): void {
    this.rejectingRequestId = requestId;
    this.rejectReason = '';
    this.rejectLoading = false;
    this.showRejectModal = true;
  }

  closeReject(): void {
    this.showRejectModal = false;
    this.rejectingRequestId = null;
    this.rejectReason = '';
  }

  confirmReject(): void {
    if (this.rejectingRequestId === null || !this.rejectReason.trim()) return;
    this.rejectLoading = true;
    this.reservationService
      .rejectRequest(this.rejectingRequestId, this.rejectReason.trim())
      .subscribe({
        next: () => {
          this.rejectLoading = false;
          this.closeReject();
          this.requests = this.requests.filter(r => r.id !== this.rejectingRequestId);
          this.totalRequests--;
          this.dataChanged.emit();
          this.loadRequests();
        },
        error: (err) => {
          this.rejectLoading = false;
          this.error = 'Failed to reject: ' + (err.error?.message || err.message);
        }
      });
  }
}