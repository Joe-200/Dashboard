import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  OnDestroy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { forkJoin, of, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import {
  CategoryService,
  RoomCategory,
  DailyRateResponse,
  BulkSetRatesItemRequest,
  BulkSetRatesResponse,
} from '../../category-service.service';

import {
  ReservationRequestService,
  ReservationRequest,
  StayDetailsResponse,
  CreateStayRequest
} from '../../reservation-request-service.service';
import { RoomService, RoomResponse } from '../../room-response.service';
import { environment } from '../../environment';

type InventoryField = 'totalRooms' | 'bookedRooms' | 'availableRooms';
type RangeField = 'price' | InventoryField;
type ResetTarget = 'all' | 'category';
type ResetDataType = 'rates' | 'inventory' | 'both';
type ResetRangePreset = 'week' | 'month' | 'all';

interface BelowBasePriceWarningItem {
  categoryName: string;
  date: string;
  basePrice: number;
  newPrice: number;
}

interface HpmsConfigResponse {
  enabled: boolean;
  webhook: string;
  interval: number;
  currency: string;
  reduction: number;
  reductionType: string;
  days: number;
  startDay: number;
  intervalRequests: boolean;
  pulseRequests: boolean;
}
interface HpmsUpdateConfigRequest {
  enabled?: boolean; interval?: number; reduction?: number; reductionType?: string;
  currency?: string; days?: number; startDay?: number; webhook?: string;
}
interface HpmsPulseResponse {
  status: string; code: number; message: string; process_uuid: string;
}
interface MatchedCategoryRateDto {
  categoryId: string; categoryName: string;
  previousPrice: number; newPrice: number;
  hpmsProcessedPrice: number; hpmsRawPrice: number;
}
interface MatchRatesResponse {
  date: string; updatedCount: number; unmatchedCount: number;
  matchedRates: MatchedCategoryRateDto[]; unmatchedHpmsRooms: string[];
}
interface HpmsRoomSummary { id: string; name: string; }
interface SelectiveMatchRatesRequest { categoryIds: string[]; targetDate?: string; }
interface SelectiveMatchRatesResponse {
  targetDate?: string; matchedCategories?: string[];
  unmatchedCategoryIds?: string[]; message?: string;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './calendar-component.component.html',
  styleUrl: './calendar-component.component.css'
})
export class CalendarComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('calendarScroll') calendarScroll?: ElementRef<HTMLElement>;

  private readonly destroy$ = new Subject<void>();
  private readonly DAY_CELL_WIDTH = 80;
  private readonly STICKY_COL_WIDTH = 240;

  private readonly API_BASE = environment.apiUrl;
  private readonly HPMS_BASE = `${this.API_BASE}/api/dashboard/front-desk/hpms`;
  private readonly MATCH_RATES_URL =
    `${this.API_BASE}/api/dashboard/front-desk/room-categories/rates/match`;
  private readonly SELECTIVE_MATCH_URL =
    `${this.API_BASE}/api/dashboard/front-desk/hpms/match-rates/selective`;

  private readonly TEXT_HEADERS = new HttpHeaders({
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
  });

  viewMode: 'rates' | 'rooms' = 'rates';
  rooms: RoomResponse[] = [];
  stays: StayDetailsResponse[] = [];
  staysLoading = false;

  showNotificationModal = false;
  pendingRequests: ReservationRequest[] = [];
  requestsLoading = false;
  requestsError = '';

  showAcceptModal = false;
  acceptingRequestId: number | null = null;
  availableRooms: RoomResponse[] = [];
  selectedRoomId: number | null = null;
  acceptLoading = false;

  showRejectModal = false;
  rejectingRequestId: number | null = null;
  rejectReason = '';
  rejectLoading = false;

  showStayModal = false;
  selectedStay: StayDetailsResponse | null = null;

  showCreateStayModal = false;
  selectedRoomForStay: RoomResponse | null = null;
  createStayForm: FormGroup;
  creatingStay = false;

  showRateMatchModal = false;
  rateMatchError = '';
  rateMatchSuccess = '';
  hpmsConfig: HpmsConfigResponse | null = null;
  hpmsConfigLoading = false;
  hpmsConfigEditing = false;
  hpmsConfigSaving = false;
  hpmsConfigError = '';
  hpmsConfigSuccess = '';
  hpmsConfigDraft: Partial<HpmsUpdateConfigRequest> = {};
  hpmsPulseLoading = false;
  hpmsPulseError = '';
  hpmsPulseSuccess = '';
  hpmsProcessUuid = '';
  hpmsMatchLoading = false;
  hpmsMatchError = '';
  hpmsMatchSuccess = '';
  hpmsMatchResult: MatchRatesResponse | null = null;
  hpmsRooms: HpmsRoomSummary[] = [];
  hpmsRoomsLoading = false;
  hpmsRoomsLoaded = false;
  hpmsRoomsError = '';
  selectedHpmsRoomIds: string[] = [];
  selectiveMatchDate = '';
  selectiveMatchLoading = false;
  selectiveMatchError = '';
  selectiveMatchSuccess = '';
  selectiveMatchResult: SelectiveMatchRatesResponse | null = null;

  categories: RoomCategory[] = [];
  ratesMap: { [categoryId: number]: { [date: string]: DailyRateResponse } } = {};
  days: Date[] = [];
  currentMonth = new Date().getMonth();
  currentYear = new Date().getFullYear();
  monthName = '';
  loading = false;
  error = '';

  showEditModal = false;
  selectedCategoryId: number | null = null;
  selectedDate: string | null = null;
  editForm: FormGroup;
  saving = false;

  showBelowBaseWarning = false;
  belowBaseWarningItems: BelowBasePriceWarningItem[] = [];
  private belowBaseProceedAction: (() => void) | null = null;

  bulkEditMode = false;
  bulkSaving = false;
  bulkPriceChanges: { [categoryId: number]: { [date: string]: number } } = {};
  private originalBulkPrices: { [categoryId: number]: { [date: string]: number } } = {};
  bulkInventoryChanges: {
    [categoryId: number]: {
      [date: string]: { totalRooms?: number; bookedRooms?: number; availableRooms?: number; };
    };
  } = {};
  private originalBulkInventory: {
    [categoryId: number]: {
      [date: string]: { totalRooms: number; bookedRooms: number; availableRooms: number; };
    };
  } = {};

  rangeCategoryId: number | null = null;
  rangeField: RangeField = 'price';
  rangeStart = '';
  rangeEnd = '';
  rangeValue = 0;

  showResetModal = false;
  resetLoading = false;
  resetError = '';
  resetSuccess = '';
  resetTarget: ResetTarget = 'all';
  resetCategoryId: number | null = null;
  resetDataType: ResetDataType = 'both';
  resetFrom = '';
  resetTo = '';
  resetConfirmText = '';

  private isDragging = false;
  private startX = 0;
  private scrollLeft = 0;

  constructor(
    private categoryService: CategoryService,
    private fb: FormBuilder,
    private reservationService: ReservationRequestService,
    private roomService: RoomService,
    private http: HttpClient
  ) {
    this.editForm = this.fb.group({
      price: [null, [Validators.required, Validators.min(0)]]
    });
    this.createStayForm = this.fb.group({
      guestName: ['', Validators.required],
      phone: ['', Validators.required],
      email: ['', Validators.email],
      nationality: [''],
      identification: [''],
      numAdults: [1, [Validators.required, Validators.min(1)]],
      numKids: [0, [Validators.required, Validators.min(0)]],
      checkInDate: ['', Validators.required],
      checkOutDate: ['', Validators.required]
    });
  }

  ngOnInit(): void { this.loadData(); }
  ngAfterViewInit(): void { this.scrollToToday(); }
  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  startDrag(event: MouseEvent, element: HTMLElement): void {
    const target = event.target as HTMLElement;
    if (target.closest('input, select, button, textarea, a, label')) return;
    this.isDragging = true;
    this.startX = event.pageX - element.offsetLeft;
    this.scrollLeft = element.scrollLeft;
    element.classList.add('dragging');
  }
  drag(event: MouseEvent, element: HTMLElement): void {
    if (!this.isDragging) return;
    event.preventDefault();
    const x = event.pageX - element.offsetLeft;
    const walk = (x - this.startX) * 1.5;
    element.scrollLeft = this.scrollLeft - walk;
  }
  stopDrag(element: HTMLElement): void {
    this.isDragging = false;
    element.classList.remove('dragging');
  }

  switchView(mode: 'rates' | 'rooms'): void {
    this.viewMode = mode;
    if (mode === 'rooms' && this.rooms.length === 0) this.loadRoomsAndStays();
    setTimeout(() => this.scrollToToday(), 0);
  }

  loadRoomsAndStays(): void {
    this.staysLoading = true;
    this.roomService.getRooms({
      pageable: { page: 0, size: 100 }, status: undefined
    }).subscribe({
      next: (roomData) => {
        this.rooms = roomData.content;
        this.reservationService.getStays(['RESERVED', 'ACTIVE'], 0, 100).subscribe({
          next: (stayData) => { this.stays = stayData.content; this.staysLoading = false; },
          error: (err) => { console.error('Failed to load stays:', err); this.staysLoading = false; }
        });
      },
      error: (err) => { console.error('Failed to load rooms:', err); this.staysLoading = false; }
    });
  }

  getStayForRoomAndDate(roomId: number, date: Date): StayDetailsResponse | null {
    const dateStr = this.formatDate(date);
    return this.stays.find(stay =>
      stay.roomId === roomId &&
      dateStr >= stay.expectedCheckInDate &&
      dateStr <= stay.expectedCheckOutDate
    ) || null;
  }

  openStayDetails(stay: StayDetailsResponse | null): void {
    if (!stay) return;
    this.selectedStay = stay;
    this.showStayModal = true;
  }
  closeStayModal(): void { this.showStayModal = false; this.selectedStay = null; }

  openNotificationModal(): void { this.showNotificationModal = true; this.loadPendingRequests(); }
  closeNotificationModal(): void {
    this.showNotificationModal = false; this.pendingRequests = []; this.requestsError = '';
  }
  loadPendingRequests(): void {
    this.requestsLoading = true;
    this.requestsError = '';
    this.reservationService.getPendingRequests(0, 50).subscribe({
      next: (data) => {
        this.pendingRequests = data.content.filter(r => r.status === 'PENDING');
        this.requestsLoading = false;
      },
      error: (err) => { this.requestsError = 'Failed to load requests: ' + err.message; this.requestsLoading = false; }
    });
  }

  openAcceptModal(requestId: number, categoryId: number | string): void {
    this.acceptingRequestId = requestId;
    this.selectedRoomId = null;
    this.availableRooms = [];
    this.acceptLoading = false;
    this.showAcceptModal = true;
    this.roomService.getRooms({
      pageable: { page: 0, size: 100 }, status: 'AVAILABLE',
    }).subscribe({
      next: (data) => {
        this.availableRooms = data.content.filter(r => String(r.categoryId) === String(categoryId));
        this.acceptLoading = false;
      },
      error: (err) => { this.requestsError = 'Failed to load rooms: ' + err.message; this.acceptLoading = false; }
    });
  }
  closeAcceptModal(): void {
    this.showAcceptModal = false; this.acceptingRequestId = null;
    this.selectedRoomId = null; this.availableRooms = [];
  }
  confirmAccept(): void {
    if (this.acceptingRequestId === null || this.selectedRoomId === null) return;
    this.acceptLoading = true;
    this.reservationService.approveRequest(this.acceptingRequestId, this.selectedRoomId).subscribe({
      next: () => {
        this.acceptLoading = false; this.closeAcceptModal();
        this.pendingRequests = this.pendingRequests.filter(r => r.id !== this.acceptingRequestId);
        this.loadData();
      },
      error: (err) => { this.acceptLoading = false; this.requestsError = 'Failed to accept: ' + err.message; }
    });
  }
  openRejectModal(requestId: number): void {
    this.rejectingRequestId = requestId; this.rejectReason = '';
    this.rejectLoading = false; this.showRejectModal = true;
  }
  closeRejectModal(): void {
    this.showRejectModal = false; this.rejectingRequestId = null; this.rejectReason = '';
  }
  confirmReject(): void {
    if (this.rejectingRequestId === null || !this.rejectReason.trim()) return;
    this.rejectLoading = true;
    this.reservationService.rejectRequest(this.rejectingRequestId, this.rejectReason.trim()).subscribe({
      next: () => {
        this.rejectLoading = false; this.closeRejectModal();
        this.pendingRequests = this.pendingRequests.filter(r => r.id !== this.rejectingRequestId);
        this.loadData();
      },
      error: (err) => { this.rejectLoading = false; this.requestsError = 'Failed to reject: ' + err.message; }
    });
  }

  openCreateStayModal(room: RoomResponse): void {
    this.selectedRoomForStay = room;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.createStayForm.patchValue({
      checkInDate: this.formatDate(today),
      checkOutDate: this.formatDate(tomorrow),
      numAdults: 1, numKids: 0
    });
    this.showCreateStayModal = true;
  }
  closeCreateStayModal(): void {
    this.showCreateStayModal = false; this.selectedRoomForStay = null;
    this.createStayForm.reset(); this.creatingStay = false;
  }
  confirmCreateStay(): void {
    if (this.createStayForm.invalid || !this.selectedRoomForStay) {
      this.createStayForm.markAllAsTouched(); return;
    }
    this.creatingStay = true;
    const v = this.createStayForm.value;
    const payload: CreateStayRequest = {
      guestName: v.guestName, phone: v.phone,
      email: v.email || undefined, nationality: v.nationality || undefined,
      identification: v.identification || undefined,
      roomNumber: this.selectedRoomForStay.roomNumber,
      numAdults: v.numAdults, numKids: v.numKids,
      expectedCheckInDate: v.checkInDate, expectedCheckOutDate: v.checkOutDate
    };
    this.reservationService.createStay(payload).subscribe({
      next: (newStay) => {
        this.creatingStay = false; this.closeCreateStayModal();
        this.stays = [...this.stays, newStay]; this.loadRoomsAndStays();
      },
      error: (err) => {
        this.creatingStay = false;
        this.error = 'Failed to create reservation: ' + (err?.error?.message || err?.message || 'Unknown error');
        console.error(err);
      }
    });
  }

  openRateMatchModal(): void {
    this.rateMatchError = ''; this.rateMatchSuccess = '';
    this.hpmsPulseError = ''; this.hpmsPulseSuccess = '';
    this.hpmsProcessUuid = ''; this.hpmsMatchError = ''; this.hpmsMatchSuccess = '';
    this.hpmsMatchResult = null; this.hpmsRoomsError = '';
    this.hpmsConfigError = ''; this.hpmsConfigSuccess = '';
    this.hpmsConfigEditing = false;
    this.selectedHpmsRoomIds = [];
    this.selectiveMatchError = ''; this.selectiveMatchSuccess = '';
    this.selectiveMatchResult = null; this.selectiveMatchLoading = false;
    this.selectiveMatchDate = this.formatDate(new Date());
    this.showRateMatchModal = true;
    this.loadHpmsConfig();
    this.loadHpmsRooms();
  }
  closeRateMatchModal(): void {
    this.showRateMatchModal = false; this.hpmsConfigEditing = false;
    this.hpmsPulseLoading = false; this.hpmsMatchLoading = false;
    this.selectiveMatchLoading = false;
  }

  loadHpmsConfig(): void {
    this.hpmsConfigLoading = true;
    this.hpmsConfigError = ''; this.hpmsConfigSuccess = '';
    this.http.get(`${this.HPMS_BASE}/config`, {
      headers: this.TEXT_HEADERS, responseType: 'text'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (raw) => {
        this.hpmsConfigLoading = false;
        const parsed = this.safeParse<HpmsConfigResponse>(raw);
        if (!parsed) { this.hpmsConfigError = 'Server returned an empty or non-JSON response.'; return; }
        this.hpmsConfig = parsed;
      },
      error: (err: HttpErrorResponse) => {
        this.hpmsConfigLoading = false; this.hpmsConfigError = this.fmtError(err);
      }
    });
  }
  startEditHpmsConfig(): void {
    if (!this.hpmsConfig) return;
    this.hpmsConfigDraft = {
      enabled: this.hpmsConfig.enabled, webhook: this.hpmsConfig.webhook,
      currency: this.hpmsConfig.currency, reduction: this.hpmsConfig.reduction,
      reductionType: this.hpmsConfig.reductionType, days: this.hpmsConfig.days,
      startDay: this.hpmsConfig.startDay, interval: this.hpmsConfig.interval
    };
    this.hpmsConfigEditing = true;
    this.hpmsConfigError = ''; this.hpmsConfigSuccess = '';
  }
  cancelEditHpmsConfig(): void {
    this.hpmsConfigEditing = false; this.hpmsConfigDraft = {}; this.hpmsConfigError = '';
  }
  saveHpmsConfig(): void {
    const d = this.hpmsConfigDraft;
    const patch: HpmsUpdateConfigRequest = {};
    if (d.webhook !== undefined) patch.webhook = d.webhook;
    if (d.currency !== undefined) patch.currency = d.currency;
    if (d.reduction !== undefined) patch.reduction = Number(d.reduction);
    if (d.reductionType !== undefined) patch.reductionType = d.reductionType;
    if (d.days !== undefined) patch.days = Number(d.days);
    if (d.startDay !== undefined) patch.startDay = Number(d.startDay);
    if (d.interval !== undefined) patch.interval = Number(d.interval);
    if (d.enabled !== undefined) patch.enabled = d.enabled;
    this.hpmsConfigSaving = true;
    this.hpmsConfigError = ''; this.hpmsConfigSuccess = '';
    this.http.patch(`${this.HPMS_BASE}/config`, patch, {
      headers: this.TEXT_HEADERS, responseType: 'text'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (raw) => {
        this.hpmsConfigSaving = false;
        const parsed = this.safeParse<HpmsConfigResponse>(raw);
        if (parsed) this.hpmsConfig = parsed;
        this.hpmsConfigEditing = false; this.hpmsConfigDraft = {};
        this.hpmsConfigSuccess = 'Configuration updated.';
      },
      error: (err: HttpErrorResponse) => {
        this.hpmsConfigSaving = false; this.hpmsConfigError = this.fmtError(err);
      }
    });
  }

  triggerHpmsPulse(): void {
    this.hpmsPulseLoading = true;
    this.hpmsPulseError = ''; this.hpmsPulseSuccess = ''; this.hpmsProcessUuid = '';
    this.http.post(`${this.HPMS_BASE}/pulse`, {}, {
      headers: this.TEXT_HEADERS, responseType: 'text'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (raw) => {
        this.hpmsPulseLoading = false;
        const res = this.safeParse<HpmsPulseResponse>(raw);
        this.hpmsProcessUuid = res?.process_uuid || '';
        this.hpmsPulseSuccess = res?.message ? `${res.message}` : 'Pulse accepted.';
      },
      error: (err: HttpErrorResponse) => {
        this.hpmsPulseLoading = false; this.hpmsPulseError = this.fmtError(err);
      }
    });
  }

  matchRates(): void {
    this.hpmsMatchLoading = true;
    this.hpmsMatchError = ''; this.hpmsMatchSuccess = ''; this.hpmsMatchResult = null;
    this.http.post(this.MATCH_RATES_URL, {}, {
      headers: this.TEXT_HEADERS, responseType: 'text'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (raw) => {
        this.hpmsMatchLoading = false;
        const res = this.safeParse<MatchRatesResponse>(raw);
        if (!res) { this.hpmsMatchError = 'Server returned an empty or non-JSON response.'; return; }
        this.hpmsMatchResult = res;
        const updated = res.updatedCount ?? 0;
        const unmatched = res.unmatchedCount ?? 0;
        this.hpmsMatchSuccess = `Matched ${updated} categor${updated === 1 ? 'y' : 'ies'}` +
          (unmatched ? ` · ${unmatched} unmatched` : '');
        this.loadData();
      },
      error: (err: HttpErrorResponse) => {
        this.hpmsMatchLoading = false; this.hpmsMatchError = this.fmtError(err);
      }
    });
  }

  matchRatesSelective(): void {
    if (this.selectedHpmsRoomIds.length === 0) {
      this.selectiveMatchError = 'Please select at least one HPMS category.'; return;
    }
    this.selectiveMatchLoading = true;
    this.selectiveMatchError = ''; this.selectiveMatchSuccess = ''; this.selectiveMatchResult = null;
    const payload: SelectiveMatchRatesRequest = { categoryIds: [...this.selectedHpmsRoomIds] };
    if (this.selectiveMatchDate) payload.targetDate = this.selectiveMatchDate;
    this.http.post(this.SELECTIVE_MATCH_URL, payload, {
      headers: this.TEXT_HEADERS, responseType: 'text'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (raw) => {
        this.selectiveMatchLoading = false;
        const res = this.safeParse<SelectiveMatchRatesResponse>(raw);
        if (!res) { this.selectiveMatchError = 'Server returned an empty or non-JSON response.'; return; }
        this.selectiveMatchResult = res;
        const matched = res.matchedCategories?.length ?? 0;
        const unmatched = res.unmatchedCategoryIds?.length ?? 0;
        const dateNote = res.targetDate ? ` (${res.targetDate})` : '';
        this.selectiveMatchSuccess =
          `Matched ${matched} categor${matched === 1 ? 'y' : 'ies'}${dateNote}` +
          (unmatched ? ` · ${unmatched} unmatched` : '');
        this.loadData();
      },
      error: (err: HttpErrorResponse) => {
        this.selectiveMatchLoading = false; this.selectiveMatchError = this.fmtError(err);
      }
    });
  }

  isHpmsRoomSelected(id: string): boolean { return this.selectedHpmsRoomIds.includes(id); }
  toggleHpmsRoomSelection(id: string): void {
    const idx = this.selectedHpmsRoomIds.indexOf(id);
    if (idx >= 0) this.selectedHpmsRoomIds = this.selectedHpmsRoomIds.filter(x => x !== id);
    else this.selectedHpmsRoomIds = [...this.selectedHpmsRoomIds, id];
    this.selectiveMatchSuccess = ''; this.selectiveMatchError = ''; this.selectiveMatchResult = null;
  }
  selectAllHpmsRooms(): void {
    this.selectedHpmsRoomIds = this.hpmsRooms.map(r => r.id);
    this.selectiveMatchSuccess = ''; this.selectiveMatchError = ''; this.selectiveMatchResult = null;
  }
  clearHpmsRoomSelection(): void {
    this.selectedHpmsRoomIds = [];
    this.selectiveMatchSuccess = ''; this.selectiveMatchError = ''; this.selectiveMatchResult = null;
  }
  get allHpmsRoomsSelected(): boolean {
    return this.hpmsRooms.length > 0 && this.selectedHpmsRoomIds.length === this.hpmsRooms.length;
  }
  loadHpmsRooms(): void {
    this.hpmsRoomsLoading = true; this.hpmsRoomsError = ''; this.hpmsRooms = [];
    this.http.get(`${this.HPMS_BASE}/rooms`, {
      headers: this.TEXT_HEADERS, responseType: 'text'
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: (raw) => {
        this.hpmsRoomsLoading = false; this.hpmsRoomsLoaded = true;
        const parsed = this.safeParse<HpmsRoomSummary[]>(raw);
        this.hpmsRooms = parsed || [];
        const validIds = new Set(this.hpmsRooms.map(r => r.id));
        this.selectedHpmsRoomIds = this.selectedHpmsRoomIds.filter(id => validIds.has(id));
      },
      error: (err: HttpErrorResponse) => {
        this.hpmsRoomsLoading = false; this.hpmsRoomsLoaded = true;
        this.hpmsRoomsError = this.fmtError(err);
      }
    });
  }

  private safeParse<T>(raw: string | null | undefined): T | null {
    if (raw === null || raw === undefined) return null;
    const trimmed = String(raw).trim();
    if (!trimmed || trimmed === 'null' || trimmed.startsWith('<')) return null;
    try { return JSON.parse(trimmed) as T; } catch { return null; }
  }
  private fmtError(err: HttpErrorResponse): string {
    if (!err) return 'Unknown error';
    const body = err.error;
    let message = err.message || 'Request failed';
    if (typeof body === 'string' && body.trim()) {
      const parsed = this.safeParse<any>(body);
      if (parsed?.message) message = parsed.message;
      else if (!body.trim().startsWith('<')) message = body.trim().slice(0, 300);
      else message = 'Server returned an HTML page (check auth / route).';
    } else if (body && typeof body === 'object' && (body as any).message) {
      message = (body as any).message;
    }
    return `HTTP ${err.status}: ${message}`;
  }

  isToday(date: Date): boolean {
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }

  get calendarGridColumns(): string {
    return `${this.STICKY_COL_WIDTH}px repeat(${this.days.length}, ${this.DAY_CELL_WIDTH}px)`;
  }

  private buildRatesMap(rates: any): void {
    this.ratesMap = {};
    if (rates && typeof rates === 'object' && !Array.isArray(rates)) {
      for (const catName in rates) {
        const category = this.categories.find(c => c.name === catName);
        if (!category) continue;
        const catId = category.id;
        this.ratesMap[catId] = {};
        const categoryRates = rates[catName];
        if (Array.isArray(categoryRates)) {
          categoryRates.forEach((rate: any) => {
            const dateKey = String(rate.date).substring(0, 10);
            this.ratesMap[catId][dateKey] = { ...rate, date: dateKey };
          });
        }
      }
    } else if (Array.isArray(rates) && this.categories.length > 0) {
      const firstCatId = this.categories[0].id;
      this.ratesMap[firstCatId] = {};
      rates.forEach((rate: any) => {
        const dateKey = String(rate.date).substring(0, 10);
        this.ratesMap[firstCatId][dateKey] = { ...rate, date: dateKey };
      });
    }
  }
  private generateDays(from: Date, to: Date): void {
    this.days = [];
    const current = new Date(from);
    while (current <= to) {
      this.days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    this.monthName = from.toLocaleString('default', { month: 'long', year: 'numeric' });
  }
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  getDateKey(date: Date): string { return this.formatDate(date); }
  getRate(categoryId: number, date: Date): DailyRateResponse | null {
    const dateKey = this.getDateKey(date);
    return this.ratesMap[categoryId]?.[dateKey] ?? null;
  }
  getDefaultPrice(categoryId: number): number {
    return this.categories.find(c => c.id === categoryId)?.price ?? 0;
  }
  getBasePriceForCategory(id: number | null): number {
    if (id === null) return 0;
    return this.getDefaultPrice(id);
  }
  getCategoryName(id: number | null): string {
    if (id === null) return '';
    return this.categories.find(c => c.id === id)?.name ?? '';
  }
  isCustomRate(rate: DailyRateResponse | null): boolean { return rate?.customRate === true; }
  getTotalRooms(category: RoomCategory, day: Date): number {
    const rate = this.getRate(category.id, day);
    return rate?.totalRooms ?? (category as any).numBeds ?? 0;
  }
  getBookedRooms(category: RoomCategory, day: Date): number {
    return this.getRate(category.id, day)?.bookedRooms ?? 0;
  }
  getAvailableRooms(category: RoomCategory, day: Date): number {
    const rate = this.getRate(category.id, day);
    if (rate?.availableRooms !== undefined && rate?.availableRooms !== null) {
      return rate.availableRooms;
    }
    return Math.max(0, this.getTotalRooms(category, day) - this.getBookedRooms(category, day));
  }
  isOverbooked(category: RoomCategory, day: Date): boolean {
    const booked = this.getBookedRooms(category, day);
    const total = this.getTotalRooms(category, day);
    return total > 0 && booked > total;
  }

  isBelowBasePrice(categoryId: number, price: number | null | undefined): boolean {
    if (price === null || price === undefined) return false;
    const base = this.getDefaultPrice(categoryId);
    return base > 0 && Number(price) < base;
  }
  get editPriceBelowBase(): boolean {
    if (this.selectedCategoryId === null) return false;
    const price = Number(this.editForm?.value?.price);
    if (!isFinite(price)) return false;
    return this.isBelowBasePrice(this.selectedCategoryId, price);
  }
  isCellPriceBelowBase(category: RoomCategory, day: Date): boolean {
    const base = this.getDefaultPrice(category.id);
    if (base <= 0) return false;
    const rate = this.getRate(category.id, day);
    const price = rate?.price ?? base;
    return price < base;
  }
  getBulkPriceValue(category: RoomCategory, day: Date): number {
    const dateKey = this.getDateKey(day);
    const draft = this.bulkPriceChanges[category.id]?.[dateKey];
    if (draft !== undefined && draft !== null) return draft;
    const rate = this.getRate(category.id, day);
    return rate?.price ?? this.getDefaultPrice(category.id);
  }
  isBulkPriceBelowBase(category: RoomCategory, day: Date): boolean {
    const base = this.getDefaultPrice(category.id);
    if (base <= 0) return false;
    return this.getBulkPriceValue(category, day) < base;
  }
  isBulkPriceChanged(category: RoomCategory, day: Date): boolean {
    const dateKey = this.getDateKey(day);
    const current = this.bulkPriceChanges[category.id]?.[dateKey];
    const original = this.originalBulkPrices[category.id]?.[dateKey];
    return current !== undefined && original !== undefined && current !== original;
  }
  isBulkInventoryChanged(category: RoomCategory, day: Date, field: InventoryField): boolean {
    const dateKey = this.getDateKey(day);
    const current = this.bulkInventoryChanges[category.id]?.[dateKey]?.[field];
    const original = this.originalBulkInventory[category.id]?.[dateKey]?.[field];
    return current !== undefined && original !== undefined && current !== original;
  }

  private requestBelowBaseConfirmation(items: BelowBasePriceWarningItem[], onProceed: () => void): void {
    this.belowBaseWarningItems = items;
    this.belowBaseProceedAction = onProceed;
    this.showBelowBaseWarning = true;
  }
  confirmBelowBaseWarning(): void {
    const action = this.belowBaseProceedAction;
    this.showBelowBaseWarning = false;
    this.belowBaseWarningItems = [];
    this.belowBaseProceedAction = null;
    if (action) action();
  }
  cancelBelowBaseWarning(): void {
    this.showBelowBaseWarning = false;
    this.belowBaseWarningItems = [];
    this.belowBaseProceedAction = null;
  }

  openEditModal(categoryId: number, date: Date): void {
    this.selectedCategoryId = categoryId;
    this.selectedDate = this.getDateKey(date);
    const existingRate = this.getRate(categoryId, date);
    const currentPrice = existingRate?.price ?? this.getDefaultPrice(categoryId);
    this.editForm.patchValue({ price: currentPrice });
    this.showEditModal = true;
  }
  closeModal(): void {
    this.showEditModal = false; this.selectedCategoryId = null;
    this.selectedDate = null; this.editForm.reset(); this.saving = false;
  }
  savePrice(): void {
    if (this.editForm.invalid || this.selectedCategoryId === null || this.selectedDate === null) {
      this.editForm.markAllAsTouched(); return;
    }
    const categoryId = this.selectedCategoryId;
    const date = this.selectedDate;
    const price = Number(this.editForm.value.price);
    if (this.isBelowBasePrice(categoryId, price)) {
      this.requestBelowBaseConfirmation([{
        categoryName: this.getCategoryName(categoryId),
        date, basePrice: this.getDefaultPrice(categoryId), newPrice: price
      }], () => this.performSavePrice(categoryId, date, price));
      return;
    }
    this.performSavePrice(categoryId, date, price);
  }
  private performSavePrice(categoryId: number, date: string, price: number): void {
    this.saving = true; this.error = '';
    this.categoryService.setRates(categoryId, date, date, price).subscribe({
      next: () => {
        if (!this.ratesMap[categoryId]) this.ratesMap[categoryId] = {};
        const existingRate = this.ratesMap[categoryId][date];
        const totalRooms = existingRate?.totalRooms ?? 0;
        const bookedRooms = existingRate?.bookedRooms ?? 0;
        this.ratesMap[categoryId][date] = {
          ...existingRate, date, price, totalRooms, bookedRooms,
          availableRooms: existingRate?.availableRooms ?? (totalRooms - bookedRooms),
          customRate: true
        };
        this.saving = false; this.closeModal();
      },
      error: (err) => {
        this.saving = false;
        this.error = 'Failed to set price: ' + (err?.error?.message || err?.message || 'Unknown error');
      }
    });
  }

  toggleBulkEdit(): void {
    if (this.bulkEditMode) {
      this.bulkPriceChanges = {}; this.originalBulkPrices = {};
      this.bulkInventoryChanges = {}; this.originalBulkInventory = {};
      this.bulkEditMode = false;
      return;
    }
    this.bulkPriceChanges = {}; this.originalBulkPrices = {};
    this.bulkInventoryChanges = {}; this.originalBulkInventory = {};
    for (const category of this.categories) {
      const catId = category.id;
      this.bulkPriceChanges[catId] = {};
      this.originalBulkPrices[catId] = {};
      this.bulkInventoryChanges[catId] = {};
      this.originalBulkInventory[catId] = {};
      for (const day of this.days) {
        const dateKey = this.getDateKey(day);
        const rate = this.getRate(catId, day);
        const currentPrice = rate?.price ?? this.getDefaultPrice(catId);
        this.bulkPriceChanges[catId][dateKey] = currentPrice;
        this.originalBulkPrices[catId][dateKey] = currentPrice;
        const totalRooms = rate?.totalRooms ?? this.getTotalRooms(category, day);
        const bookedRooms = rate?.bookedRooms ?? 0;
        const availableRooms =
          rate?.availableRooms !== undefined && rate?.availableRooms !== null
            ? rate.availableRooms
            : Math.max(0, totalRooms - bookedRooms);
        this.bulkInventoryChanges[catId][dateKey] = { totalRooms, bookedRooms, availableRooms };
        this.originalBulkInventory[catId][dateKey] = { totalRooms, bookedRooms, availableRooms };
      }
    }
    this.bulkEditMode = true;
  }

  undoBulkChanges(): void {
    for (const catIdStr in this.bulkPriceChanges) {
      const catId = Number(catIdStr);
      const originals = this.originalBulkPrices[catId] || {};
      const drafts = this.bulkPriceChanges[catId];
      for (const dateKey in drafts) if (dateKey in originals) drafts[dateKey] = originals[dateKey];
    }
    for (const catIdStr in this.bulkInventoryChanges) {
      const catId = Number(catIdStr);
      const originals = this.originalBulkInventory[catId] || {};
      const drafts = this.bulkInventoryChanges[catId];
      for (const dateKey in drafts) if (dateKey in originals) drafts[dateKey] = { ...originals[dateKey] };
    }
    this.error = '';
  }

  onBulkPriceChange(categoryId: number, day: Date, newValue: string): void {
    const dateKey = this.getDateKey(day);
    const num = parseFloat(newValue);
    if (!isNaN(num) && num >= 0) {
      if (!this.bulkPriceChanges[categoryId]) this.bulkPriceChanges[categoryId] = {};
      this.bulkPriceChanges[categoryId][dateKey] = num;
    }
  }
  onBulkInventoryChange(categoryId: number, day: Date, field: InventoryField, newValue: string): void {
    const dateKey = this.getDateKey(day);
    const num = parseInt(newValue, 10);
    if (isNaN(num) || num < 0) return;
    if (!this.bulkInventoryChanges[categoryId]) this.bulkInventoryChanges[categoryId] = {};
    if (!this.bulkInventoryChanges[categoryId][dateKey]) this.bulkInventoryChanges[categoryId][dateKey] = {};
    this.bulkInventoryChanges[categoryId][dateKey][field] = num;
  }
  getBulkInventoryValue(category: RoomCategory, day: Date, field: InventoryField): number {
    const dateKey = this.getDateKey(day);
    const override = this.bulkInventoryChanges[category.id]?.[dateKey]?.[field];
    if (override !== undefined && override !== null) return override;
    const rate = this.getRate(category.id, day);
    if (field === 'totalRooms') return rate?.totalRooms ?? this.getTotalRooms(category, day);
    if (field === 'bookedRooms') return rate?.bookedRooms ?? 0;
    if (rate?.availableRooms !== undefined && rate?.availableRooms !== null) return rate.availableRooms;
    return Math.max(0, this.getTotalRooms(category, day) - (rate?.bookedRooms ?? 0));
  }

  get bulkRangeValid(): boolean {
    return this.rangeCategoryId !== null && !!this.rangeStart && !!this.rangeEnd
      && this.rangeValue >= 0 && this.rangeStart <= this.rangeEnd;
  }
  applyRangeToBulk(): void {
    if (!this.bulkRangeValid) return;
    const start = new Date(this.rangeStart);
    const end = new Date(this.rangeEnd);
    if (start > end) { this.error = 'Start date must be before end date.'; return; }
    const catId = this.rangeCategoryId!;
    const field = this.rangeField;
    if (field === 'price') {
      if (!this.bulkPriceChanges[catId]) this.bulkPriceChanges[catId] = {};
    } else {
      if (!this.bulkInventoryChanges[catId]) this.bulkInventoryChanges[catId] = {};
    }
    const current = new Date(start);
    while (current <= end) {
      const dateKey = this.formatDate(current);
      if (field === 'price') this.bulkPriceChanges[catId][dateKey] = this.rangeValue;
      else {
        if (!this.bulkInventoryChanges[catId][dateKey]) this.bulkInventoryChanges[catId][dateKey] = {};
        this.bulkInventoryChanges[catId][dateKey][field] = this.rangeValue;
      }
      current.setDate(current.getDate() + 1);
    }
    this.rangeCategoryId = null; this.rangeField = 'price';
    this.rangeStart = ''; this.rangeEnd = ''; this.rangeValue = 0; this.error = '';
  }

  saveAllBulkChanges(bypassBelowBaseCheck: boolean = false): void {
    const changedRateItems: BulkSetRatesItemRequest[] = [];
    const changedInventoryItems: any[] = [];
    const belowBaseViolations: BelowBasePriceWarningItem[] = [];
    for (const category of this.categories) {
      const catId = category.id;
      const priceChanges = this.bulkPriceChanges[catId];
      const originalPrices = this.originalBulkPrices[catId];
      if (priceChanges) {
        for (const dateKey of Object.keys(priceChanges)) {
          const newPrice = priceChanges[dateKey];
          const originalPrice = originalPrices?.[dateKey];
          if (newPrice !== originalPrice) {
            changedRateItems.push({
              category: category.name, startDate: dateKey, endDate: dateKey, price: newPrice
            });
            if (this.isBelowBasePrice(catId, newPrice)) {
              belowBaseViolations.push({
                categoryName: category.name, date: dateKey,
                basePrice: this.getDefaultPrice(catId), newPrice
              });
            }
          }
        }
      }
      const invChanges = this.bulkInventoryChanges[catId];
      const originalInv = this.originalBulkInventory[catId];
      if (invChanges && originalInv) {
        for (const dateKey of Object.keys(invChanges)) {
          const change = invChanges[dateKey] || {};
          const original = originalInv[dateKey];
          if (!original) continue;
          const totalRooms = change.totalRooms ?? original.totalRooms;
          const bookedRooms = change.bookedRooms ?? original.bookedRooms;
          const availableRooms = change.availableRooms ?? original.availableRooms;
          const changed = totalRooms !== original.totalRooms
            || bookedRooms !== original.bookedRooms
            || availableRooms !== original.availableRooms;
          if (changed) changedInventoryItems.push({
            category: category.name, startDate: dateKey, endDate: dateKey,
            totalRooms, bookedRooms, availableRooms
          });
        }
      }
    }
    if (changedRateItems.length === 0 && changedInventoryItems.length === 0) {
      this.error = 'No changes to save.'; return;
    }
    if (!bypassBelowBaseCheck && belowBaseViolations.length > 0) {
      this.requestBelowBaseConfirmation(belowBaseViolations, () => this.saveAllBulkChanges(true));
      return;
    }
    this.bulkSaving = true; this.error = '';
    const rates$ = changedRateItems.length > 0
      ? this.categoryService.setAllRates(changedRateItems)
      : of<BulkSetRatesResponse | null>(null);
    const inventory$ = changedInventoryItems.length > 0
      ? this.categoryService.updateInventoryBulk(changedInventoryItems)
      : of<any | null>(null);
    forkJoin([rates$, inventory$]).subscribe({
      next: ([rateResult, invResult]) => {
        this.bulkSaving = false;
        const ratesMsg = rateResult ? `${rateResult.totalDaysUpdated} rate day(s)` : '0 rate day(s)';
        const invMsg = invResult ? `${invResult.totalDaysUpdated} inventory day(s)` : '0 inventory day(s)';
        console.log(`Bulk save complete: ${ratesMsg}, ${invMsg}.`);
        this.loadData(); this.toggleBulkEdit();
      },
      error: (err: HttpErrorResponse) => {
        this.bulkSaving = false;
        this.error = `Bulk save failed: ${err.error?.message || err.message}`;
      }
    });
  }

  openResetModal(): void {
    const from = new Date(this.currentYear, this.currentMonth, 1);
    const to = new Date(this.currentYear, this.currentMonth + 1, 0);
    this.resetTarget = 'all'; this.resetCategoryId = null;
    this.resetDataType = 'both';
    this.resetFrom = this.formatDate(from); this.resetTo = this.formatDate(to);
    this.resetConfirmText = ''; this.resetError = ''; this.resetSuccess = '';
    this.resetLoading = false; this.showResetModal = true;
  }
  closeResetModal(): void {
    this.showResetModal = false; this.resetLoading = false;
    this.resetError = ''; this.resetSuccess = ''; this.resetConfirmText = '';
  }
  get resetConfirmed(): boolean {
    return this.resetConfirmText.trim().toUpperCase() === 'RESET';
  }
  setResetRange(preset: ResetRangePreset): void {
    if (preset === 'all') { this.resetFrom = ''; this.resetTo = ''; return; }
    const now = new Date();
    if (preset === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      this.resetFrom = this.formatDate(from); this.resetTo = this.formatDate(to);
    } else if (preset === 'week') {
      const dow = now.getDay();
      const diff = dow === 0 ? 6 : dow - 1;
      const from = new Date(now); from.setDate(from.getDate() - diff);
      const to = new Date(from); to.setDate(to.getDate() + 6);
      this.resetFrom = this.formatDate(from); this.resetTo = this.formatDate(to);
    }
  }
  async executeReset(): Promise<void> {
    if (this.resetTarget === 'category' && !this.resetCategoryId) {
      this.resetError = 'Please select a category to reset.'; return;
    }
    if (this.resetFrom && this.resetTo && this.resetFrom > this.resetTo) {
      this.resetError = '"From" date must be before "To" date.'; return;
    }
    if (!this.resetConfirmed) { this.resetError = 'Please type RESET to confirm.'; return; }
    this.resetLoading = true; this.resetError = ''; this.resetSuccess = '';
    const from = this.resetFrom || undefined;
    const to = this.resetTo || undefined;
    const rateFrom = from || '2000-01-01';
    const rateTo = to || '2099-12-31';
    const tasks: any[] = [];
    try {
      if (this.resetTarget === 'all') {
        if (this.resetDataType === 'inventory' || this.resetDataType === 'both') {
          tasks.push(this.categoryService.resetAllInventory(from, to));
        }
        if (this.resetDataType === 'rates' || this.resetDataType === 'both') {
          for (const cat of this.categories) {
            tasks.push(this.categoryService.clearRates(cat.id, rateFrom, rateTo));
          }
        }
      } else {
        const catId = this.resetCategoryId!;
        if (this.resetDataType === 'inventory' || this.resetDataType === 'both') {
          tasks.push(this.categoryService.resetCategoryInventory(catId, from, to));
        }
        if (this.resetDataType === 'rates' || this.resetDataType === 'both') {
          tasks.push(this.categoryService.clearRates(catId, rateFrom, rateTo));
        }
      }
      if (tasks.length === 0) {
        this.resetError = 'Nothing to reset with the current options.';
        this.resetLoading = false; return;
      }
      await forkJoin(tasks).toPromise();
      this.resetSuccess = 'Reset completed successfully.';
      this.resetLoading = false; this.loadData();
      setTimeout(() => { if (this.showResetModal) this.closeResetModal(); }, 2000);
    } catch (err: any) {
      this.resetLoading = false;
      this.resetError = `Reset failed: ${err?.error?.message || err?.message || 'Unknown error'}`;
    }
  }

  previousMonth(): void {
    if (this.currentMonth === 0) { this.currentMonth = 11; this.currentYear--; }
    else this.currentMonth--;
    this.loadData();
  }
  nextMonth(): void {
    if (this.currentMonth === 11) { this.currentMonth = 0; this.currentYear++; }
    else this.currentMonth++;
    this.loadData();
  }
  today(): void {
    const now = new Date();
    this.currentMonth = now.getMonth();
    this.currentYear = now.getFullYear();
    this.loadData();
  }

  loadData(): void {
    this.loading = true; this.error = '';
    const from = new Date(this.currentYear, this.currentMonth, 1);
    const to = new Date(this.currentYear, this.currentMonth + 1, 0);
    const fromStr = this.formatDate(from);
    const toStr = this.formatDate(to);
    this.categoryService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.categoryService.getAllRates(fromStr, toStr).subscribe({
          next: (rates) => {
            this.buildRatesMap(rates);
            this.generateDays(from, to);
            this.loading = false;
            this.scrollToToday();
          },
          error: (err) => {
            this.error = 'Failed to load rates: ' + (err?.error?.message || err?.message || 'Unknown error');
            this.loading = false;
          }
        });
      },
      error: (err) => {
        this.error = 'Failed to load categories: ' + (err?.error?.message || err?.message || 'Unknown error');
        this.loading = false;
      }
    });
  }

  private scrollToToday(): void {
    setTimeout(() => {
      const el = this.calendarScroll?.nativeElement;
      if (!el) return;
      const todayIndex = this.days.findIndex(d => this.isToday(d));
      if (todayIndex < 0) { el.scrollLeft = 0; return; }
      const target = todayIndex * this.DAY_CELL_WIDTH;
      el.scrollTo({ left: target, behavior: 'auto' });
    }, 0);
  }
}