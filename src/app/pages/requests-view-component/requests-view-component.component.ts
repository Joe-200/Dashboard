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

/**
 * Local extension so template can access date-change + cancel fields
 * even if the imported interface hasn't been updated yet.
 */
export type ReservationRequestExt = ReservationRequest & {
  proposedCheckInDate?: string;
  proposedCheckOutDate?: string;
  canCancel?: boolean;
  cancellationDeadline?: string;
};

@Component({
  selector: 'app-requests-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './requests-view-component.component.html',
  styleUrl: './requests-view-component.component.css'
})
export class RequestsViewComponent implements OnInit {
  // ============================================================
  // OUTPUT
  // ============================================================
  @Output() dataChanged = new EventEmitter<void>();

  // ============================================================
  // FILTERS & SEARCH
  // ============================================================
  searchTerm = '';
  statusFilter = '';
  dateFrom = '';
  dateTo = '';

  private searchSubject = new Subject<string>();

  // ============================================================
  // DATA & PAGINATION
  // ============================================================
  requests: ReservationRequestExt[] = [];
  loading = false;
  error = '';

  currentPage = 0;
  pageSize = 20;
  totalRequests = 0;
  totalPages = 0;

  todayIso = new Date().toISOString().substring(0, 10);

  // ============================================================
  // FILTERED REQUESTS
  // ============================================================
  get filteredRequests(): ReservationRequestExt[] {
    let result = this.requests;

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      result = result.filter(req =>
        req.guestName?.toLowerCase().includes(term) ||
        req.guestEmail?.toLowerCase().includes(term) ||
        req.guestPhone?.toLowerCase().includes(term)
      );
    }

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
  showDetailsModal = false;
  selectedRequest: ReservationRequestExt | null = null;

  showAcceptModal = false;
  acceptingRequestId: number | null = null;
  availableRooms: RoomResponse[] = [];
  selectedRoomId: number | null = null;
  acceptLoading = false;

  showRejectModal = false;
  rejectingRequestId: number | null = null;
  rejectReason = '';
  rejectLoading = false;

  showDateChangeModal = false;
  dateChangeRequestId: number | null = null;
  dateChangeGuestName = '';
  proposedCheckIn = '';
  proposedCheckOut = '';
  dateChangeLoading = false;
  dateChangeError = '';

  showCancelModal = false;
  cancelingRequestId: number | null = null;
  cancelGuestName = '';
  cancelLoading = false;

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
  // LOAD
  // ============================================================
  loadRequests(): void {
    this.loading = true;
    this.error = '';

    const status = this.statusFilter || undefined;

    this.reservationService
      .getRequests(status, this.currentPage, this.pageSize)
      .subscribe({
        next: (data: PagedModelReservationRequestResponse) => {
          this.requests = data.content as ReservationRequestExt[];
          this.totalRequests = data.page.totalElements;
          this.totalPages = data.page.totalPages;
          this.loading = false;
        },
        error: (err: HttpErrorResponse) => {
          this.error =
            'Failed to load requests: ' +
            (err.error?.message || err.message);
          this.loading = false;
        }
      });
  }

  // ============================================================
  // FILTER / SEARCH
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
  // ACTION AVAILABILITY
  // ============================================================
  canProposeDateChange(req: ReservationRequestExt): boolean {
    return req.status === 'PENDING' || req.status === 'APPROVED';
  }

  canCancel(req: ReservationRequestExt): boolean {
    return (
      req.status === 'PENDING' ||
      req.status === 'APPROVED' ||
      req.status === 'DATE_CHANGE_PENDING'
    );
  }

  // ============================================================
  // DETAILS MODAL
  // ============================================================
  openDetails(request: ReservationRequestExt): void {
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
  openAccept(requestId: number, categoryId: number | string): void {
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
          this.availableRooms = data.content.filter(
            r => String(r.categoryId) === String(categoryId)
          );
          this.acceptLoading = false;
        },
        error: (err) => {
          this.error =
            'Failed to load rooms: ' +
            (err.error?.message || err.message);
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
    if (this.acceptingRequestId === null || this.selectedRoomId === null) {
      return;
    }
    this.acceptLoading = true;
    this.reservationService
      .approveRequest(this.acceptingRequestId, this.selectedRoomId)
      .subscribe({
        next: () => {
          this.acceptLoading = false;
          this.closeAccept();
          this.dataChanged.emit();
          this.loadRequests();
        },
        error: (err) => {
          this.acceptLoading = false;
          this.error =
            'Failed to accept: ' +
            (err.error?.message || err.message);
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
    if (this.rejectingRequestId === null || !this.rejectReason.trim()) {
      return;
    }
    this.rejectLoading = true;
    this.reservationService
      .rejectRequest(this.rejectingRequestId, this.rejectReason.trim())
      .subscribe({
        next: () => {
          this.rejectLoading = false;
          this.closeReject();
          this.dataChanged.emit();
          this.loadRequests();
        },
        error: (err) => {
          this.rejectLoading = false;
          this.error =
            'Failed to reject: ' +
            (err.error?.message || err.message);
        }
      });
  }

  // ============================================================
  // PROPOSE DATE CHANGE
  // ============================================================
  openDateChange(request: ReservationRequestExt): void {
    this.dateChangeRequestId = request.id;
    this.dateChangeGuestName = request.guestName;
    this.proposedCheckIn = request.checkInDate || '';
    this.proposedCheckOut = request.checkOutDate || '';
    this.dateChangeError = '';
    this.dateChangeLoading = false;
    this.showDateChangeModal = true;
  }

  closeDateChange(): void {
    this.showDateChangeModal = false;
    this.dateChangeRequestId = null;
    this.dateChangeGuestName = '';
    this.proposedCheckIn = '';
    this.proposedCheckOut = '';
    this.dateChangeError = '';
    this.dateChangeLoading = false;
  }

  confirmDateChange(): void {
    if (this.dateChangeRequestId === null) return;

    if (!this.proposedCheckIn || !this.proposedCheckOut) {
      this.dateChangeError = 'Both check-in and check-out dates are required.';
      return;
    }
    if (this.proposedCheckOut <= this.proposedCheckIn) {
      this.dateChangeError = 'Check-out date must be after the check-in date.';
      return;
    }

    this.dateChangeError = '';
    this.dateChangeLoading = true;

    this.reservationService
      .proposeDateChange(
        this.dateChangeRequestId,
        this.proposedCheckIn,
        this.proposedCheckOut
      )
      .subscribe({
        next: () => {
          this.dateChangeLoading = false;
          this.closeDateChange();
          this.dataChanged.emit();
          this.loadRequests();
        },
        error: (err) => {
          this.dateChangeLoading = false;
          this.dateChangeError =
            'Failed to propose new dates: ' +
            (err.error?.message || err.message);
        }
      });
  }

  // ============================================================
  // CANCEL RESERVATION
  // ============================================================
  openCancel(request: ReservationRequestExt): void {
    this.cancelingRequestId = request.id;
    this.cancelGuestName = request.guestName;
    this.cancelLoading = false;
    this.showCancelModal = true;
  }

  closeCancel(): void {
    this.showCancelModal = false;
    this.cancelingRequestId = null;
    this.cancelGuestName = '';
    this.cancelLoading = false;
  }

  confirmCancel(): void {
    if (this.cancelingRequestId === null) return;
    this.cancelLoading = true;

    this.reservationService.cancelRequest(this.cancelingRequestId).subscribe({
      next: () => {
        this.cancelLoading = false;
        this.closeCancel();
        this.dataChanged.emit();
        this.loadRequests();
      },
      error: (err) => {
        this.cancelLoading = false;
        this.error =
          'Failed to cancel reservation: ' +
          (err.error?.message || err.message);
      }
    });
  }
}