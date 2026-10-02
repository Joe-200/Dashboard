import { Component, OnInit, OnDestroy, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse, HttpClient } from '@angular/common/http';
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
};

export type StayDetailsExt = StayDetailsResponse & {
  referenceCode?: string;
};

export type ViewTab = 'requests' | 'stays';
export type StayQuickFilter = 'ALL' | 'CHECKIN_TODAY' | 'CHECKOUT_TODAY';

// ============================================================
// MODULE-SCOPED SSE SINGLETON
// ------------------------------------------------------------
// Lives at module scope so it outlives any single component
// instance. Navigating away from this route will NOT close the
// connection — the next mount simply re-subscribes to the same
// underlying stream.
// ============================================================
type LiveEvent = EventSourceMessage;
type EventListener = (msg: LiveEvent) => void;
type StateListener = (connected: boolean) => void;

interface LiveConnection {
  abortController: AbortController | null;
  lastToken: string | null;
  lastHotelId: string | null;
  connected: boolean;
  eventListeners: Set<EventListener>;
  stateListeners: Set<StateListener>;
  url: string;
  fetchAuth: (() => { token: string | null; hotelId: string | null }) | null;
}

const liveConnection: LiveConnection = {
  abortController: null,
  lastToken: null,
  lastHotelId: null,
  connected: false,
  eventListeners: new Set(),
  stateListeners: new Set(),
  url: `${environment.apiUrl}/api/dashboard/front-desk/live`,
  fetchAuth: null
};

function setLiveConnected(value: boolean): void {
  if (liveConnection.connected === value) return;
  liveConnection.connected = value;
  liveConnection.stateListeners.forEach(fn => {
    try { fn(value); } catch { /* noop */ }
  });
}

function openLiveConnection(token: string, hotelId: string | null): void {
  // Tear down any previous connection first
  closeLiveConnection();

  liveConnection.abortController = new AbortController();
  liveConnection.lastToken = token;
  liveConnection.lastHotelId = hotelId;

  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${token}`
  };
  if (hotelId) headers['X-Tenant-ID'] = hotelId;

  fetchEventSource(liveConnection.url, {
    method: 'GET',
    headers,
    credentials: 'omit',
    signal: liveConnection.abortController.signal,
    openWhenHidden: true,

    onopen: async (response: Response) => {
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('text/event-stream')) {
        setLiveConnected(true);
        return;
      }
      if ([401, 403, 404].includes(response.status)) {
        throw new Error(
          `SSE fatal: ${response.status} ${response.statusText}`
        );
      }
      throw new Error(`SSE error: ${response.status} ${response.statusText}`);
    },

    onmessage: (event: EventSourceMessage) => {
      liveConnection.eventListeners.forEach(fn => {
        try { fn(event); } catch { /* noop */ }
      });
    },

    onclose: () => {
      setLiveConnected(false);
    },

    onerror: (err: any) => {
      setLiveConnected(false);
      if (
        typeof err?.message === 'string' &&
        err.message.startsWith('SSE fatal')
      ) {
        throw err; // stops retries — auth is broken
      }
      return 3000; // otherwise retry in 3s
    }
  })
    .then(() => setLiveConnected(false))
    .catch(() => setLiveConnected(false));
}

function closeLiveConnection(): void {
  if (liveConnection.abortController) {
    try {
      liveConnection.abortController.abort();
    } catch { /* noop */ }
    liveConnection.abortController = null;
  }
  liveConnection.lastToken = null;
  liveConnection.lastHotelId = null;
  setLiveConnected(false);
}

/**
 * Idempotent — only opens a new connection if none exists or if
 * the auth token has changed (login / refresh).
 */
function ensureLiveConnection(auth: AuthService): void {
  const token = auth.getToken();
  const hotelId = auth.getHotelId();

  if (!token) {
    if (liveConnection.abortController) closeLiveConnection();
    return;
  }

  if (
    liveConnection.abortController &&
    liveConnection.lastToken === token &&
    liveConnection.lastHotelId === hotelId
  ) {
    return; // already connected with the same identity
  }

  openLiveConnection(token, hotelId);
}

function forceReconnectLive(auth: AuthService): void {
  closeLiveConnection();
  ensureLiveConnection(auth);
}

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
  // LIVE (SSE) — binds to the module-scoped singleton above
  // ============================================================
  liveConnected = false;

  private liveEventListener: EventListener = () => { /* replaced in bind */ };
  private liveStateListener: StateListener = () => { /* replaced in bind */ };

  private sseReloadTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

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
  // CANCEL CONFIGURATION
  // ============================================================
  showCancelConfigModal = false;
  cancelConfigLoading = false;
  cancelConfigError = '';
  cancellationWindowHours: number | null = null;

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

  showStaySummaryModal = false;
  staySummaryLoading = false;
  staySummary: FullStaySummaryResponse | null = null;
  staySummaryError = '';

  showReceiptModal = false;
  receiptLoading = false;
  receipt: ReceiptResponse | null = null;
  receiptError = '';

  showExtendModal = false;
  extendStayId: number | null = null;
  extendGuestName = '';
  newCheckOutDate = '';
  extendLoading = false;
  extendError = '';

  showStayDateChangeModal = false;
  stayDateChangeId: number | null = null;
  stayDateChangeGuestName = '';
  stayProposedCheckIn = '';
  stayProposedCheckOut = '';
  stayDateChangeLoading = false;
  stayDateChangeError = '';

  showStayStatusModal = false;
  stayStatusId: number | null = null;
  stayStatusGuestName = '';
  newStayStatus = '';
  stayStatusLoading = false;

  stayActionBusy: Record<number, boolean> = {};

  // ============================================================
  // STAYS — FILTERED GETTER
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
  // TRACKBY
  // ============================================================
  trackByRequestId(_index: number, req: ReservationRequestExt): number {
    return req.id;
  }
  trackByStayId(_index: number, stay: StayDetailsExt): number {
    return stay.stayId;
  }
  trackByIndex(index: number): number {
    return index;
  }

  // ============================================================
  // CONSTRUCTOR
  // ============================================================
  constructor(
    private reservationService: ReservationRequestService,
    private roomService: RoomService,
    private stayService: StayService,
    private authService: AuthService,
    private http: HttpClient
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
    this.bindLiveStream();
  }

  ngOnDestroy(): void {
    this.destroyed = true;

    if (this.sseReloadTimer) {
      clearTimeout(this.sseReloadTimer);
      this.sseReloadTimer = null;
    }

    // Detach our listeners — the underlying connection stays open.
    liveConnection.eventListeners.delete(this.liveEventListener);
    liveConnection.stateListeners.delete(this.liveStateListener);
  }

  // ============================================================
  // LIVE STREAM — attaches to module-level singleton
  // ============================================================
  private bindLiveStream(): void {
    this.liveEventListener = (event: LiveEvent) =>
      this.handleLiveEvent(event);

    this.liveStateListener = (connected: boolean) => {
      this.liveConnected = connected;
    };

    liveConnection.eventListeners.add(this.liveEventListener);
    liveConnection.stateListeners.add(this.liveStateListener);

    // Reflect current state immediately (in case it's already open)
    this.liveConnected = liveConnection.connected;

    // Opens only if not already open with the same token.
    ensureLiveConnection(this.authService);
  }

  private handleLiveEvent(_event: LiveEvent): void {
    if (this.destroyed) return;
    if (this.sseReloadTimer) clearTimeout(this.sseReloadTimer);
    this.sseReloadTimer = setTimeout(() => {
      this.sseReloadTimer = null;
      if (this.activeTab === 'stays') {
        this.loadStays(true);
      } else {
        this.loadRequests(true);
      }
    }, 300);
  }

  reconnectLive(): void {
    if (this.liveConnected) return;
    forceReconnectLive(this.authService);
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
  // CANCEL CONFIGURATION
  // ============================================================
  openCancelConfig(): void {
    this.showCancelConfigModal = true;
    this.cancelConfigLoading = true;
    this.cancelConfigError = '';

    this.http
      .get<any>(
        `${environment.apiUrl}/api/dashboard/front-desk/policy/cancellation`
      )
      .subscribe({
        next: (data) => {
          this.cancellationWindowHours = data.cancellationWindowHours ?? 0;
          this.cancelConfigLoading = false;
        },
        error: (err: HttpErrorResponse) => {
          this.cancelConfigError =
            'Failed to load cancellation policy: ' +
            (err.error?.message || err.message);
          this.cancelConfigLoading = false;
        }
      });
  }

  closeCancelConfig(): void {
    this.showCancelConfigModal = false;
    this.cancellationWindowHours = null;
    this.cancelConfigError = '';
  }

  saveCancelConfig(): void {
    if (
      this.cancellationWindowHours === null ||
      this.cancellationWindowHours < 0
    )
      return;

    this.cancelConfigLoading = true;
    this.cancelConfigError = '';

    this.http
      .put<any>(
        `${environment.apiUrl}/api/dashboard/front-desk/policy/cancellation`,
        { cancellationWindowHours: this.cancellationWindowHours }
      )
      .subscribe({
        next: () => {
          this.cancelConfigLoading = false;
          this.closeCancelConfig();
        },
        error: (err: HttpErrorResponse) => {
          this.cancelConfigError =
            'Failed to save cancellation policy: ' +
            (err.error?.message || err.message);
          this.cancelConfigLoading = false;
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