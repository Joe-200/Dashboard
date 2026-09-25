import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { debounceTime, Subject } from 'rxjs';

import {
  fetchEventSource,
  EventSourceMessage
} from '@microsoft/fetch-event-source';

import {
  ReservationRequestService,
  ReservationRequest,
  PagedModelReservationRequestResponse
} from '../../reservation-request-service.service';

import { RoomService, RoomResponse } from '../../room-response.service';

import {
  StayService,
  StayDetailsResponse,
  PagedModelStayDetailsResponse,
  FullStaySummaryResponse,
  ReceiptResponse
} from '../../stay-service.service';

import { AuthService } from '../../auth-service.service';
import { environment } from '../../environment';

export type ReservationRequestExt = ReservationRequest & {
  referenceCode?: string;
  proposedCheckInDate?: string;
  proposedCheckOutDate?: string;
  canCancel?: boolean;
  cancellationDeadline?: string;
};

/** StayDetailsResponse with fields that exist in the API but are missing from the local type. */
export type StayDetailsExt = StayDetailsResponse & {
  referenceCode?: string;
};

export type ViewTab = 'requests' | 'stays';
export type StayQuickFilter = 'ALL' | 'CHECKIN_TODAY' | 'CHECKOUT_TODAY';

@Component({
  selector: 'app-requests-view',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './requests-view-component.component.html',
  styleUrl: './requests-view-component.component.css'
})
export class RequestsViewComponent implements OnInit, OnDestroy {
  @Output() dataChanged = new EventEmitter<void>();

  // ============================================================
  // TAB
  // ============================================================
  activeTab: ViewTab = 'requests';

  setTab(tab: ViewTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    if (tab === 'requests') {
      this.loadRequests();
    } else {
      this.loadStays();
    }
  }

  // ============================================================
  // REQUESTS — FILTERS & SEARCH
  // ============================================================
  searchTerm = '';
  statusFilter = '';
  dateFrom = '';
  dateTo = '';

  private searchSubject = new Subject<string>();

  // ============================================================
  // REQUESTS — DATA & PAGINATION
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
  // LIVE (SSE)
  // ============================================================
  liveConnected = false;

  private abortController: AbortController | null = null;
  private sseReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private static readonly SSE_URL =
    `${environment.apiUrl}/api/dashboard/front-desk/live`;

  // ============================================================
  // REQUESTS — FILTERED GETTER
  // ============================================================
  get filteredRequests(): ReservationRequestExt[] {
    let result = this.requests;

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      result = result.filter(req =>
        req.guestName?.toLowerCase().includes(term) ||
        req.guestEmail?.toLowerCase().includes(term) ||
        req.guestPhone?.toLowerCase().includes(term) ||
        req.referenceCode?.toLowerCase().includes(term) ||
        String(req.id ?? '').includes(term)
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
  // REQUESTS — MODALS
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
  // STAYS — STATE
  // ============================================================
  stays: StayDetailsExt[] = [];
  staysLoading = false;
  staysError = '';

  staysPage = 0;
  staysPageSize = 20;
  staysTotalElements = 0;
  staysTotalPages = 0;

  stayQuickFilter: StayQuickFilter = 'ALL';
  stayStatusFilter = '';
  staysSearchTerm = '';

  private staysSearchSubject = new Subject<string>();

  // Stays — summary modal
  showStaySummaryModal = false;
  staySummaryLoading = false;
  staySummary: FullStaySummaryResponse | null = null;
  staySummaryError = '';

  // Stays — receipt modal
  showReceiptModal = false;
  receiptLoading = false;
  receipt: ReceiptResponse | null = null;
  receiptError = '';

  // Stays — extend modal
  showExtendModal = false;
  extendStayId: number | null = null;
  extendGuestName = '';
  newCheckOutDate = '';
  extendLoading = false;
  extendError = '';

  // Stays — propose date change modal
  showStayDateChangeModal = false;
  stayDateChangeId: number | null = null;
  stayDateChangeGuestName = '';
  stayProposedCheckIn = '';
  stayProposedCheckOut = '';
  stayDateChangeLoading = false;
  stayDateChangeError = '';

  // Stays — update status modal
  showStayStatusModal = false;
  stayStatusId: number | null = null;
  stayStatusGuestName = '';
  newStayStatus = '';
  stayStatusLoading = false;

  // Stays — per-row busy flag
  stayActionBusy: Record<number, boolean> = {};

  // ============================================================
  // STAYS — FILTERED GETTER (client-side search only)
  // ============================================================
  get filteredStays(): StayDetailsExt[] {
    const term = this.staysSearchTerm.trim().toLowerCase();
    if (!term) return this.stays;
    return this.stays.filter(s =>
      s.guestName?.toLowerCase().includes(term) ||
      s.email?.toLowerCase().includes(term) ||
      s.guestPhone?.toLowerCase().includes(term) ||
      s.roomNumber?.toLowerCase().includes(term) ||
      s.referenceCode?.toLowerCase().includes(term) ||
      String(s.stayId ?? '').includes(term)
    );
  }

  // ============================================================
  // CONSTRUCTOR
  // ============================================================
  constructor(
    private reservationService: ReservationRequestService,
    private roomService: RoomService,
    private stayService: StayService,
    private authService: AuthService
  ) {}

  // ============================================================
  // LIFECYCLE
  // ============================================================
  ngOnInit(): void {
    this.searchSubject.pipe(debounceTime(400)).subscribe(() => {
      this.currentPage = 0;
      this.loadRequests();
    });

    this.staysSearchSubject.pipe(debounceTime(400)).subscribe(() => {
      // client-side filter — no reload
    });

    this.loadRequests();
    this.connectLiveStream();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.disconnectLiveStream();
  }

  // ============================================================
  // REQUESTS — LOAD
  // ============================================================
  loadRequests(silent: boolean = false): void {
    if (!silent) this.loading = true;
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
  // STAYS — LOAD
  // ============================================================
  loadStays(silent: boolean = false): void {
    if (!silent) this.staysLoading = true;
    this.staysError = '';

    const status = this.stayStatusFilter || undefined;
    let req$;

    if (this.stayQuickFilter === 'CHECKIN_TODAY') {
      req$ = this.stayService.getStaysCheckInToday(
        this.staysPage,
        this.staysPageSize
      );
    } else if (this.stayQuickFilter === 'CHECKOUT_TODAY') {
      req$ = this.stayService.getStaysCheckOutToday(
        this.staysPage,
        this.staysPageSize
      );
    } else {
      req$ = this.stayService.getStays(
        status,
        this.staysPage,
        this.staysPageSize
      );
    }

    req$.subscribe({
      next: (data: PagedModelStayDetailsResponse) => {
        this.stays = (data.content || []) as StayDetailsExt[];
        this.staysTotalElements = data.page?.totalElements ?? 0;
        this.staysTotalPages = data.page?.totalPages ?? 0;
        this.staysLoading = false;
      },
      error: (err: HttpErrorResponse) => {
        this.staysError =
          'Failed to load stays: ' +
          (err.error?.message || err.message);
        this.staysLoading = false;
      }
    });
  }

  onStayQuickFilterChange(): void {
    this.staysPage = 0;
    this.loadStays();
  }

  onStayStatusFilterChange(): void {
    this.staysPage = 0;
    this.loadStays();
  }

  onStaysSearchChange(): void {
    this.staysSearchSubject.next(this.staysSearchTerm);
  }

  clearStaysFilters(): void {
    this.staysSearchTerm = '';
    this.stayStatusFilter = '';
    this.stayQuickFilter = 'ALL';
    this.staysPage = 0;
    this.loadStays();
  }

  changeStaysPage(page: number): void {
    if (page < 0 || page >= this.staysTotalPages) return;
    this.staysPage = page;
    this.loadStays();
  }

  // ============================================================
  // LIVE STREAM (SSE)
  // ============================================================
  private connectLiveStream(): void {
    if (this.destroyed || this.abortController) return;

    const token = this.authService.getToken();
    const hotelId = this.authService.getHotelId();

    if (!token) {
      this.liveConnected = false;
      return;
    }

    this.abortController = new AbortController();

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${token}`
    };
    if (hotelId) headers['X-Tenant-ID'] = hotelId;

    fetchEventSource(RequestsViewComponent.SSE_URL, {
      method: 'GET',
      headers,
      credentials: 'omit',
      signal: this.abortController.signal,
      openWhenHidden: true,

      async onopen(response: Response) {
        const contentType = response.headers.get('content-type') || '';
        if (response.ok && contentType.includes('text/event-stream')) return;

        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          throw new Error(
            `SSE fatal: ${response.status} ${response.statusText}`
          );
        }
        throw new Error(`SSE error: ${response.status} ${response.statusText}`);
      },

      onmessage: (event: EventSourceMessage) => {
        this.handleLiveEvent(event);
      },

      onclose: () => {
        this.liveConnected = false;
      },

      onerror: (err: any) => {
        this.liveConnected = false;
        if (
          typeof err?.message === 'string' &&
          err.message.startsWith('SSE fatal')
        ) {
          throw err;
        }
        return 3000;
      }
    })
      .then(() => {
        if (!this.destroyed) this.liveConnected = false;
      })
      .catch(() => {
        this.liveConnected = false;
      });

    this.liveConnected = true;
  }

  private disconnectLiveStream(): void {
    if (this.sseReloadTimer) {
      clearTimeout(this.sseReloadTimer);
      this.sseReloadTimer = null;
    }
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        /* noop */
      }
      this.abortController = null;
    }
    this.liveConnected = false;
  }

  private handleLiveEvent(_event: EventSourceMessage): void {
    if (this.destroyed) return;
    if (this.sseReloadTimer) clearTimeout(this.sseReloadTimer);
    this.sseReloadTimer = setTimeout(() => {
      this.sseReloadTimer = null;
      // Refresh whichever tab is visible.
      if (this.activeTab === 'stays') {
        this.loadStays(true);
      } else {
        this.loadRequests(true);
      }
    }, 300);
  }

  reconnectLive(): void {
    if (this.liveConnected) return;
    this.disconnectLiveStream();
    this.connectLiveStream();
  }

  // ============================================================
  // REQUESTS — FILTERS
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

  changePage(page: number): void {
    if (page < 0 || page >= this.totalPages) return;
    this.currentPage = page;
    this.loadRequests();
  }

  // ============================================================
  // REQUESTS — ACTION AVAILABILITY
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
  // REQUESTS — MODALS
  // ============================================================
  openDetails(request: ReservationRequestExt): void {
    this.selectedRequest = request;
    this.showDetailsModal = true;
  }

  closeDetails(): void {
    this.showDetailsModal = false;
    this.selectedRequest = null;
  }

  openAccept(requestId: number, categoryId: number | string): void {
    this.acceptingRequestId = requestId;
    this.selectedRoomId = null;
    this.availableRooms = [];
    this.acceptLoading = true;
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
    if (this.acceptingRequestId === null || this.selectedRoomId === null) return;
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
            'Failed to accept: ' + (err.error?.message || err.message);
        }
      });
  }

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
          this.dataChanged.emit();
          this.loadRequests();
        },
        error: (err) => {
          this.rejectLoading = false;
          this.error =
            'Failed to reject: ' + (err.error?.message || err.message);
        }
      });
  }

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

  // ============================================================
  // STAYS — SUMMARY MODAL
  // ============================================================
  openStaySummary(stay: StayDetailsResponse): void {
    this.staySummary = null;
    this.staySummaryError = '';
    this.staySummaryLoading = true;
    this.showStaySummaryModal = true;

    this.stayService.getStaySummary(stay.stayId).subscribe({
      next: (data) => {
        this.staySummary = data;
        this.staySummaryLoading = false;
      },
      error: (err) => {
        this.staySummaryError =
          'Failed to load summary: ' +
          (err.error?.message || err.message);
        this.staySummaryLoading = false;
      }
    });
  }

  closeStaySummary(): void {
    this.showStaySummaryModal = false;
    this.staySummary = null;
    this.staySummaryError = '';
    this.staySummaryLoading = false;
  }

  // ============================================================
  // STAYS — RECEIPT MODAL
  // ============================================================
  openReceipt(stay: StayDetailsResponse): void {
    this.receipt = null;
    this.receiptError = '';
    this.receiptLoading = true;
    this.showReceiptModal = true;

    this.stayService.getStayReceipt(stay.stayId).subscribe({
      next: (data) => {
        this.receipt = data;
        this.receiptLoading = false;
      },
      error: (err) => {
        this.receiptError =
          'Failed to load receipt: ' +
          (err.error?.message || err.message);
        this.receiptLoading = false;
      }
    });
  }

  closeReceipt(): void {
    this.showReceiptModal = false;
    this.receipt = null;
    this.receiptError = '';
    this.receiptLoading = false;
  }

  // ============================================================
  // STAYS — CHECK IN / OUT
  // ============================================================
  canCheckIn(stay: StayDetailsResponse): boolean {
    return stay.status === 'RESERVED';
  }

  canCheckOut(stay: StayDetailsResponse): boolean {
    return stay.status === 'ACTIVE';
  }

  canExtend(stay: StayDetailsResponse): boolean {
    return stay.status === 'RESERVED' || stay.status === 'ACTIVE';
  }

  canProposeStayDateChange(stay: StayDetailsResponse): boolean {
    return stay.status === 'RESERVED' || stay.status === 'ACTIVE';
  }

  canViewReceipt(stay: StayDetailsResponse): boolean {
    return stay.status === 'CLOSED';
  }

  checkInStay(stay: StayDetailsResponse): void {
    if (!this.canCheckIn(stay) || this.stayActionBusy[stay.stayId]) return;
    this.stayActionBusy[stay.stayId] = true;
    this.stayService.checkIn(stay.stayId).subscribe({
      next: () => {
        this.stayActionBusy[stay.stayId] = false;
        this.loadStays();
        this.dataChanged.emit();
      },
      error: (err) => {
        this.stayActionBusy[stay.stayId] = false;
        this.staysError =
          'Check-in failed: ' + (err.error?.message || err.message);
      }
    });
  }

  checkOutStay(stay: StayDetailsResponse): void {
    if (!this.canCheckOut(stay) || this.stayActionBusy[stay.stayId]) return;
    this.stayActionBusy[stay.stayId] = true;
    this.stayService.checkOut(stay.stayId).subscribe({
      next: () => {
        this.stayActionBusy[stay.stayId] = false;
        this.loadStays();
        this.dataChanged.emit();
      },
      error: (err) => {
        this.stayActionBusy[stay.stayId] = false;
        this.staysError =
          'Check-out failed: ' + (err.error?.message || err.message);
      }
    });
  }

  // ============================================================
  // STAYS — EXTEND MODAL
  // ============================================================
  openExtend(stay: StayDetailsResponse): void {
    this.extendStayId = stay.stayId;
    this.extendGuestName = stay.guestName;
    this.newCheckOutDate = stay.expectedCheckOutDate || '';
    this.extendError = '';
    this.extendLoading = false;
    this.showExtendModal = true;
  }

  closeExtend(): void {
    this.showExtendModal = false;
    this.extendStayId = null;
    this.extendGuestName = '';
    this.newCheckOutDate = '';
    this.extendError = '';
    this.extendLoading = false;
  }

  confirmExtend(): void {
    if (this.extendStayId === null) return;
    if (!this.newCheckOutDate) {
      this.extendError = 'New check-out date is required.';
      return;
    }
    this.extendError = '';
    this.extendLoading = true;

    this.stayService
      .extendStay(this.extendStayId, this.newCheckOutDate)
      .subscribe({
        next: () => {
          this.extendLoading = false;
          this.closeExtend();
          this.loadStays();
          this.dataChanged.emit();
        },
        error: (err) => {
          this.extendLoading = false;
          this.extendError =
            'Failed to extend stay: ' +
            (err.error?.message || err.message);
        }
      });
  }

  // ============================================================
  // STAYS — PROPOSE DATE CHANGE MODAL
  // ============================================================
  openStayDateChange(stay: StayDetailsResponse): void {
    this.stayDateChangeId = stay.stayId;
    this.stayDateChangeGuestName = stay.guestName;
    this.stayProposedCheckIn = stay.expectedCheckInDate || '';
    this.stayProposedCheckOut = stay.expectedCheckOutDate || '';
    this.stayDateChangeError = '';
    this.stayDateChangeLoading = false;
    this.showStayDateChangeModal = true;
  }

  closeStayDateChange(): void {
    this.showStayDateChangeModal = false;
    this.stayDateChangeId = null;
    this.stayDateChangeGuestName = '';
    this.stayProposedCheckIn = '';
    this.stayProposedCheckOut = '';
    this.stayDateChangeError = '';
    this.stayDateChangeLoading = false;
  }

  confirmStayDateChange(): void {
    if (this.stayDateChangeId === null) return;
    if (!this.stayProposedCheckIn || !this.stayProposedCheckOut) {
      this.stayDateChangeError = 'Both dates are required.';
      return;
    }
    if (this.stayProposedCheckOut <= this.stayProposedCheckIn) {
      this.stayDateChangeError = 'Check-out must be after check-in.';
      return;
    }

    this.stayDateChangeError = '';
    this.stayDateChangeLoading = true;

    this.stayService
      .proposeDateChange(
        this.stayDateChangeId,
        this.stayProposedCheckIn,
        this.stayProposedCheckOut
      )
      .subscribe({
        next: () => {
          this.stayDateChangeLoading = false;
          this.closeStayDateChange();
          this.loadStays();
          this.dataChanged.emit();
        },
        error: (err) => {
          this.stayDateChangeLoading = false;
          this.stayDateChangeError =
            'Failed to propose new dates: ' +
            (err.error?.message || err.message);
        }
      });
  }

  // ============================================================
  // STAYS — UPDATE STATUS MODAL
  // ============================================================
  openStayStatus(stay: StayDetailsResponse): void {
    this.stayStatusId = stay.stayId;
    this.stayStatusGuestName = stay.guestName;
    this.newStayStatus = stay.status || '';
    this.stayStatusLoading = false;
    this.showStayStatusModal = true;
  }

  closeStayStatus(): void {
    this.showStayStatusModal = false;
    this.stayStatusId = null;
    this.stayStatusGuestName = '';
    this.newStayStatus = '';
    this.stayStatusLoading = false;
  }

  confirmStayStatus(): void {
    if (this.stayStatusId === null || !this.newStayStatus) return;
    this.stayStatusLoading = true;

    this.stayService
      .updateStatus(this.stayStatusId, this.newStayStatus)
      .subscribe({
        next: () => {
          this.stayStatusLoading = false;
          this.closeStayStatus();
          this.loadStays();
          this.dataChanged.emit();
        },
        error: (err) => {
          this.stayStatusLoading = false;
          this.staysError =
            'Failed to update status: ' +
            (err.error?.message || err.message);
        }
      });
  }
}