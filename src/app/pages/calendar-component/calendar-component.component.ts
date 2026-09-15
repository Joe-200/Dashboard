import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { HttpClient, HttpBackend, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { forkJoin, of } from 'rxjs';

import {
  CategoryService,
  RoomCategory,
  DailyRateResponse,
  BulkSetRatesItemRequest,
  BulkSetRatesResponse,
  BulkUpdateInventoryItemRequest,
  BulkUpdateInventoryResponse
} from '../../category-service.service';

import {
  ReservationRequestService,
  ReservationRequest,
  StayDetailsResponse,
  CreateStayRequest
} from '../../reservation-request-service.service';

import { RoomService, RoomResponse } from '../../room-response.service';

// ============================================================
// SCRAPE TYPES
// ============================================================
interface ScrapedRoom {
  id: string;
  name: string;
  price: string;
}

interface ScrapedData {
  status: boolean;
  data: {
    hotel_name: string;
    rooms: ScrapedRoom[];
    rooms_count: number;
  };
  success?: boolean;
  durationMs?: number;
}

// Field selector for bulk inventory inputs
type InventoryField = 'totalRooms' | 'bookedRooms' | 'availableRooms';

// Field selector for the bulk range tool
type RangeField = 'price' | InventoryField;

// Reset modal types
type ResetTarget = 'all' | 'category';
type ResetDataType = 'rates' | 'inventory' | 'both';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './calendar-component.component.html',
  styleUrl: './calendar-component.component.css'
})
export class CalendarComponent implements OnInit {
  // ============================================================
  // VIEW MODE
  // ============================================================
  viewMode: 'rates' | 'rooms' = 'rates';
  rooms: RoomResponse[] = [];
  stays: StayDetailsResponse[] = [];
  staysLoading = false;

  // Notification / Reservation Requests
  showNotificationModal = false;
  pendingRequests: ReservationRequest[] = [];
  requestsLoading = false;
  requestsError = '';

  // Accept sub-modal
  showAcceptModal = false;
  acceptingRequestId: number | null = null;
  availableRooms: RoomResponse[] = [];
  selectedRoomId: number | null = null;
  acceptLoading = false;

  // Reject sub-modal
  showRejectModal = false;
  rejectingRequestId: number | null = null;
  rejectReason = '';
  rejectLoading = false;

  // Stay Details Modal
  showStayModal = false;
  selectedStay: StayDetailsResponse | null = null;

  // Create Stay Modal
  showCreateStayModal = false;
  selectedRoomForStay: RoomResponse | null = null;
  createStayForm: FormGroup;
  creatingStay = false;

  // ============================================================
  // RATE MATCH MODAL (inside Rate View)
  // ============================================================
  showRateMatchModal = false;
  rateMatchForm: FormGroup;
  rateMatchLoading = false;
  rateMatchError = '';
  rateMatchSuccess = '';

  // Category selection for rate match
  selectedCategoriesForMatch: Set<number> = new Set();

  private readonly SCRAPE_API_URL = 'https://smartly-alabaster-quicksand.ngrok-free.dev/api/v2/scrape';
  private readonly SCRAPE_API_KEY = 'Bearer kLGSgEYGaO3vGteVvPJ1FABcwY2kKPOq9pd5X1pjzmrXDV5VeVBsWk2qwB8AZicg';
  public readonly DEFAULT_HOTEL_URL = 'https://www.booking.com/hotel/sa/rohaff-makaah-aparthotel.html?aid=1263239;label=PShare-Pulse-Kgffmz@1786821758&chal_t=1787406661363&force_referer=';
  private readonly DEFAULT_LANG = 'ar';
  private readonly DEFAULT_CURRENCY = 'SAR';

  hotelUrl = this.DEFAULT_HOTEL_URL;
  checkin = '';
  checkout = '';
  lang = this.DEFAULT_LANG;
  currency = this.DEFAULT_CURRENCY;
  isSending = false;

  // ============================================================
  // CALENDAR DATA
  // ============================================================
  categories: RoomCategory[] = [];
  ratesMap: {
    [categoryId: number]: {
      [date: string]: DailyRateResponse
    }
  } = {};
  days: Date[] = [];
  currentMonth = new Date().getMonth();
  currentYear = new Date().getFullYear();
  monthName = '';
  loading = false;
  error = '';

  // Edit price modal (single day)
  showEditModal = false;
  selectedCategoryId: number | null = null;
  selectedDate: string | null = null;
  editForm: FormGroup;
  saving = false;

  // ============================================================
  // BULK EDIT
  // ============================================================
  bulkEditMode = false;
  bulkSaving = false;

  bulkPriceChanges: { [categoryId: number]: { [date: string]: number } } = {};
  private originalBulkPrices: { [categoryId: number]: { [date: string]: number } } = {};

  bulkInventoryChanges: {
    [categoryId: number]: {
      [date: string]: {
        totalRooms?: number;
        bookedRooms?: number;
        availableRooms?: number;
      }
    }
  } = {};

  private originalBulkInventory: {
    [categoryId: number]: {
      [date: string]: {
        totalRooms: number;
        bookedRooms: number;
        availableRooms: number;
      }
    }
  } = {};

  // ============================================================
  // BULK RANGE TOOL (price OR total/booked/available)
  // ============================================================
  rangeCategoryId: number | null = null;
  rangeField: RangeField = 'price';
  rangeStart: string = '';
  rangeEnd: string = '';
  rangeValue: number = 0;

  // ============================================================
  // RESET DATA MODAL (new)
  // ============================================================
  showResetModal = false;
  resetLoading = false;
  resetError = '';
  resetSuccess = '';
  resetTarget: ResetTarget = 'all';
  resetCategoryId: number | null = null;
  resetDataType: ResetDataType = 'both';
  resetFrom = '';
  resetTo = '';

  // Drag state
  private isDragging = false;
  private startX = 0;
  private scrollLeft = 0;

  // HTTP client that bypasses interceptors
  private noInterceptorHttp: HttpClient;

  // ============================================================
  // CONSTRUCTOR
  // ============================================================
  constructor(
    private categoryService: CategoryService,
    private fb: FormBuilder,
    private reservationService: ReservationRequestService,
    private roomService: RoomService,
    private http: HttpClient,
    private httpBackend: HttpBackend
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

    this.rateMatchForm = this.fb.group({
      checkin: ['', Validators.required],
      checkout: ['', Validators.required],
      url: [this.DEFAULT_HOTEL_URL],
      lang: [this.DEFAULT_LANG],
      currency: [this.DEFAULT_CURRENCY]
    });

    this.noInterceptorHttp = new HttpClient(httpBackend);
  }

  // ============================================================
  // LIFECYCLE
  // ============================================================
  ngOnInit(): void {
    this.hotelUrl = this.DEFAULT_HOTEL_URL;
    this.lang = this.DEFAULT_LANG;
    this.currency = this.DEFAULT_CURRENCY;
    this.loadData();
  }

  // ============================================================
  // SELECT / DESELECT ALL CATEGORIES
  // ============================================================
  selectAllCategories(): void {
    this.categories.forEach(cat => this.selectedCategoriesForMatch.add(cat.id));
  }

  deselectAllCategories(): void {
    this.selectedCategoriesForMatch.clear();
  }

  // ============================================================
  // DRAG SCROLL
  // ============================================================
  startDrag(event: MouseEvent, element: HTMLElement): void {
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

  // ============================================================
  // SWITCH VIEW MODE
  // ============================================================
  switchView(mode: 'rates' | 'rooms'): void {
    this.viewMode = mode;
    if (mode === 'rooms' && this.rooms.length === 0) {
      this.loadRoomsAndStays();
    }
  }

  // ============================================================
  // LOAD ROOMS & STAYS
  // ============================================================
  loadRoomsAndStays(): void {
    this.staysLoading = true;
    this.roomService.getRooms({
      pageable: { page: 0, size: 100 },
      status: undefined
    }).subscribe({
      next: (roomData) => {
        this.rooms = roomData.content;
        this.reservationService.getStays(['RESERVED', 'ACTIVE'], 0, 100).subscribe({
          next: (stayData) => {
            this.stays = stayData.content;
            this.staysLoading = false;
          },
          error: (err) => {
            console.error('Failed to load stays:', err);
            this.staysLoading = false;
          }
        });
      },
      error: (err) => {
        console.error('Failed to load rooms:', err);
        this.staysLoading = false;
      }
    });
  }

  // ============================================================
  // STAY HELPERS
  // ============================================================
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

  closeStayModal(): void {
    this.showStayModal = false;
    this.selectedStay = null;
  }

  // ============================================================
  // NOTIFICATION MODAL
  // ============================================================
  openNotificationModal(): void {
    this.showNotificationModal = true;
    this.loadPendingRequests();
  }

  closeNotificationModal(): void {
    this.showNotificationModal = false;
    this.pendingRequests = [];
    this.requestsError = '';
  }

  loadPendingRequests(): void {
    this.requestsLoading = true;
    this.requestsError = '';
    this.reservationService.getPendingRequests(0, 50).subscribe({
      next: (data) => {
        this.pendingRequests = data.content.filter(r => r.status === 'PENDING');
        this.requestsLoading = false;
      },
      error: (err) => {
        this.requestsError = 'Failed to load requests: ' + err.message;
        this.requestsLoading = false;
      }
    });
  }

  // ============================================================
  // ACCEPT / REJECT
  // ============================================================
  openAcceptModal(requestId: number, categoryId: number): void {
    this.acceptingRequestId = requestId;
    this.selectedRoomId = null;
    this.availableRooms = [];
    this.acceptLoading = false;
    this.showAcceptModal = true;

    this.roomService.getRooms({
      pageable: { page: 0, size: 100 },
      status: 'AVAILABLE',
    }).subscribe({
      next: (data) => {
        this.availableRooms = data.content.filter(r => r.categoryId === categoryId);
        this.acceptLoading = false;
      },
      error: (err) => {
        this.requestsError = 'Failed to load rooms: ' + err.message;
        this.acceptLoading = false;
      }
    });
  }

  closeAcceptModal(): void {
    this.showAcceptModal = false;
    this.acceptingRequestId = null;
    this.selectedRoomId = null;
    this.availableRooms = [];
  }

  confirmAccept(): void {
    if (this.acceptingRequestId === null || this.selectedRoomId === null) return;
    this.acceptLoading = true;
    this.reservationService.approveRequest(this.acceptingRequestId, this.selectedRoomId).subscribe({
      next: () => {
        this.acceptLoading = false;
        this.closeAcceptModal();
        this.pendingRequests = this.pendingRequests.filter(r => r.id !== this.acceptingRequestId);
        this.loadData();
      },
      error: (err) => {
        this.acceptLoading = false;
        this.requestsError = 'Failed to accept: ' + err.message;
      }
    });
  }

  openRejectModal(requestId: number): void {
    this.rejectingRequestId = requestId;
    this.rejectReason = '';
    this.rejectLoading = false;
    this.showRejectModal = true;
  }

  closeRejectModal(): void {
    this.showRejectModal = false;
    this.rejectingRequestId = null;
    this.rejectReason = '';
  }

  confirmReject(): void {
    if (this.rejectingRequestId === null || !this.rejectReason.trim()) return;
    this.rejectLoading = true;
    this.reservationService.rejectRequest(this.rejectingRequestId, this.rejectReason.trim()).subscribe({
      next: () => {
        this.rejectLoading = false;
        this.closeRejectModal();
        this.pendingRequests = this.pendingRequests.filter(r => r.id !== this.rejectingRequestId);
        this.loadData();
      },
      error: (err) => {
        this.rejectLoading = false;
        this.requestsError = 'Failed to reject: ' + err.message;
      }
    });
  }

  // ============================================================
  // CREATE STAY
  // ============================================================
  openCreateStayModal(room: RoomResponse): void {
    this.selectedRoomForStay = room;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    this.createStayForm.patchValue({
      checkInDate: this.formatDate(today),
      checkOutDate: this.formatDate(tomorrow),
      numAdults: 1,
      numKids: 0
    });

    this.showCreateStayModal = true;
  }

  closeCreateStayModal(): void {
    this.showCreateStayModal = false;
    this.selectedRoomForStay = null;
    this.createStayForm.reset();
    this.creatingStay = false;
  }

  confirmCreateStay(): void {
    if (this.createStayForm.invalid || !this.selectedRoomForStay) {
      this.createStayForm.markAllAsTouched();
      return;
    }

    this.creatingStay = true;
    const formVal = this.createStayForm.value;

    const payload: CreateStayRequest = {
      guestName: formVal.guestName,
      phone: formVal.phone,
      email: formVal.email || undefined,
      nationality: formVal.nationality || undefined,
      identification: formVal.identification || undefined,
      roomNumber: this.selectedRoomForStay.roomNumber,
      numAdults: formVal.numAdults,
      numKids: formVal.numKids,
      expectedCheckInDate: formVal.checkInDate,
      expectedCheckOutDate: formVal.checkOutDate
    };

    this.reservationService.createStay(payload).subscribe({
      next: (newStay) => {
        this.creatingStay = false;
        this.closeCreateStayModal();
        this.stays = [...this.stays, newStay];
        this.loadRoomsAndStays();
      },
      error: (err) => {
        this.creatingStay = false;
        this.error = 'Failed to create reservation: ' + (err?.error?.message || err?.message || 'Unknown error');
        console.error(err);
      }
    });
  }

  // ============================================================
  // RATE MATCH: Open modal
  // ============================================================
  openRateMatchModal(): void {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    this.rateMatchForm.patchValue({
      checkin: this.formatDate(today),
      checkout: this.formatDate(tomorrow),
      url: this.DEFAULT_HOTEL_URL,
      lang: this.DEFAULT_LANG,
      currency: this.DEFAULT_CURRENCY
    });

    this.selectedCategoriesForMatch = new Set(this.categories.map(c => c.id));

    this.rateMatchError = '';
    this.rateMatchSuccess = '';
    this.showRateMatchModal = true;
  }

  closeRateMatchModal(): void {
    this.showRateMatchModal = false;
    this.rateMatchLoading = false;
    this.rateMatchError = '';
    this.rateMatchSuccess = '';
  }

  toggleCategoryForMatch(categoryId: number, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedCategoriesForMatch.add(categoryId);
    } else {
      this.selectedCategoriesForMatch.delete(categoryId);
    }
  }

  // ============================================================
  // RATE MATCH: Execute
  // ============================================================
  async executeRateMatch(): Promise<void> {
    if (this.rateMatchForm.invalid) {
      this.rateMatchForm.markAllAsTouched();
      return;
    }

    if (this.selectedCategoriesForMatch.size === 0) {
      this.rateMatchError = 'Please select at least one category to match.';
      return;
    }

    const formVal = this.rateMatchForm.value;
    this.checkin = formVal.checkin;
    this.checkout = formVal.checkout;
    this.hotelUrl = formVal.url || this.DEFAULT_HOTEL_URL;
    this.lang = formVal.lang || this.DEFAULT_LANG;
    this.currency = formVal.currency || this.DEFAULT_CURRENCY;

    this.rateMatchLoading = true;
    this.rateMatchError = '';
    this.rateMatchSuccess = '';
    this.isSending = true;

    try {
      await this.sendRequestInternal();
    } catch (err: any) {
      this.rateMatchError = err?.message || 'Rate match failed.';
    } finally {
      this.rateMatchLoading = false;
      this.isSending = false;
    }
  }

  private async sendRequestInternal(): Promise<void> {
    const hotelUrl = this.hotelUrl?.trim();
    const checkin = this.checkin;
    const checkout = this.checkout;
    const lang = this.lang || 'ar';
    const currency = this.currency || 'SAR';

    if (!hotelUrl) {
      this.rateMatchError = 'Please provide a Booking.com URL.';
      return;
    }
    if (!checkin || !checkout) {
      this.rateMatchError = 'Please select both check‑in and check‑out dates.';
      return;
    }

    const requestPayload: any = { checkin, checkout, lang, currency, url: hotelUrl };

    const headers = new HttpHeaders({
      'Authorization': this.SCRAPE_API_KEY,
      'Content-Type': 'application/json',
      'ngrok-skip-browser-warning': 'true'
    });

    try {
      const response: any = await this.noInterceptorHttp
        .post<ScrapedData>(this.SCRAPE_API_URL, requestPayload, { headers, observe: 'response' })
        .toPromise();

      const body = response.body;

      if (response.ok && (body?.status === true || body?.success === true)) {
        this.rateMatchSuccess = `Scrape successful! Found ${body?.data?.rooms?.length || 0} rooms. Applying prices...`;
        if (body?.data?.rooms?.length) {
          await this.applyRateMatchPricesBulk(body);
        } else {
          this.rateMatchError = 'No rooms found in the response.';
        }
      } else {
        const errMsg = body?.error || body?.message || 'Unknown error';
        this.rateMatchError = `Scrape failed: ${errMsg}`;
      }
    } catch (error: any) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 429) {
          this.rateMatchError = 'Rate limit exceeded (max 8 requests/min).';
        } else {
          this.rateMatchError = `Request failed. HTTP ${error.status}`;
        }
      } else {
        this.rateMatchError = error?.message || 'Network error';
      }
    }
  }

  private parsePrice(priceStr: string): number {
    const numeric = priceStr.replace(/[^0-9.]/g, '');
    return parseFloat(numeric) || 0;
  }

  private async applyRateMatchPricesBulk(scrapeResult: ScrapedData): Promise<void> {
    const today = new Date();
    const todayStr = this.formatDate(today);

    const categoryMap = new Map<number, RoomCategory>();
    this.categories.forEach(cat => categoryMap.set(cat.id, cat));

    const bulkItems: BulkSetRatesItemRequest[] = [];
    const unmatched: string[] = [];

    for (const room of scrapeResult.data.rooms) {
      const roomIdStr = room.id.trim();
      const price = this.parsePrice(room.price);
      if (price <= 0) {
        console.warn(`Skipping room "${roomIdStr}" – invalid price: ${room.price}`);
        continue;
      }

      const categoryId = Number(roomIdStr);
      if (!isNaN(categoryId) && categoryMap.has(categoryId) && this.selectedCategoriesForMatch.has(categoryId)) {
        const category = categoryMap.get(categoryId)!;
        bulkItems.push({
          category: category.name,
          startDate: todayStr,
          endDate: todayStr,
          price: price
        });
      } else {
        unmatched.push(roomIdStr);
      }
    }

    if (unmatched.length > 0) {
      console.warn('Unmatched or unselected room IDs:', unmatched);
    }

    if (bulkItems.length === 0) {
      this.rateMatchError = 'No matching categories selected or found.';
      this.rateMatchSuccess = '';
      return;
    }

    this.rateMatchLoading = true;
    try {
      const result = await this.categoryService.setAllRates(bulkItems).toPromise();
      this.rateMatchSuccess = `✅ Successfully updated ${result?.totalDaysUpdated || 0} days across ${result?.categoriesUpdated || 0} categories.`;
      this.loadData();
      setTimeout(() => {
        if (this.showRateMatchModal) this.closeRateMatchModal();
      }, 2000);
    } catch (err: any) {
      this.rateMatchError = `Bulk update failed: ${err.error?.message || err.message}`;
    } finally {
      this.rateMatchLoading = false;
    }
  }

  // ============================================================
  // CALENDAR HELPERS
  // ============================================================
  get calendarGridColumns(): string {
    return `150px repeat(${this.days.length}, 90px)`;
  }

  private buildRatesMap(rates: any): void {
    console.log('🔨 Building rates map from:', rates);
    this.ratesMap = {};

    if (typeof rates === 'object' && !Array.isArray(rates)) {
      for (const catName in rates) {
        const category = this.categories.find(c => c.name === catName);
        if (!category) {
          console.warn(`⚠️ Category not found for name: "${catName}"`);
          continue;
        }
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
      console.log('✅ Rates map (by category name):', this.ratesMap);
    } else if (Array.isArray(rates)) {
      console.warn('⚠️ Rates is an array. Attempting to map to categories.');
      if (this.categories.length > 0) {
        const firstCatId = this.categories[0].id;
        this.ratesMap[firstCatId] = {};
        rates.forEach((rate: any) => {
          const dateKey = String(rate.date).substring(0, 10);
          this.ratesMap[firstCatId][dateKey] = { ...rate, date: dateKey };
        });
        console.warn(`⚠️ Mapped array rates to first category (ID: ${firstCatId}).`);
      }
    } else {
      console.error('❌ Unknown rates format:', rates);
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

  getDateKey(date: Date): string {
    return this.formatDate(date);
  }

  getRate(categoryId: number, date: Date): DailyRateResponse | null {
    const dateKey = this.getDateKey(date);
    return this.ratesMap[categoryId]?.[dateKey] ?? null;
  }

  getDefaultPrice(categoryId: number): number {
    const category = this.categories.find(c => c.id === categoryId);
    return category?.price ?? 0;
  }

  getCategoryName(id: number | null): string {
    if (id === null) return '';
    const category = this.categories.find(c => c.id === id);
    return category?.name ?? '';
  }

  isCustomRate(rate: DailyRateResponse | null): boolean {
    return rate?.customRate === true;
  }

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

  // ============================================================
  // EDIT MODAL (single day)
  // ============================================================
  openEditModal(categoryId: number, date: Date): void {
    this.selectedCategoryId = categoryId;
    this.selectedDate = this.getDateKey(date);
    const existingRate = this.getRate(categoryId, date);
    const currentPrice = existingRate?.price ?? this.getDefaultPrice(categoryId);
    this.editForm.patchValue({ price: currentPrice });
    this.showEditModal = true;
  }

  closeModal(): void {
    this.showEditModal = false;
    this.selectedCategoryId = null;
    this.selectedDate = null;
    this.editForm.reset();
    this.saving = false;
  }

  savePrice(): void {
    if (this.editForm.invalid || this.selectedCategoryId === null || this.selectedDate === null) {
      this.editForm.markAllAsTouched();
      return;
    }

    const categoryId = this.selectedCategoryId;
    const date = this.selectedDate;
    const price = Number(this.editForm.value.price);

    this.saving = true;
    this.error = '';

    this.categoryService.setRates(categoryId, date, date, price).subscribe({
      next: (response) => {
        console.log('Price updated successfully:', response);
        if (!this.ratesMap[categoryId]) {
          this.ratesMap[categoryId] = {};
        }
        const existingRate = this.ratesMap[categoryId][date];
        const totalRooms = existingRate?.totalRooms ?? 0;
        const bookedRooms = existingRate?.bookedRooms ?? 0;

        this.ratesMap[categoryId][date] = {
          ...existingRate,
          date: date,
          price: price,
          totalRooms: totalRooms,
          bookedRooms: bookedRooms,
          availableRooms: existingRate?.availableRooms ?? (totalRooms - bookedRooms),
          customRate: true
        };

        this.saving = false;
        this.closeModal();
      },
      error: (err) => {
        console.error('Failed to save price:', err);
        this.saving = false;
        this.error = 'Failed to set price: ' + (err?.error?.message || err?.message || 'Unknown error');
      }
    });
  }

  // ============================================================
  // BULK EDIT — TOGGLE / SNAPSHOT
  // ============================================================
  toggleBulkEdit(): void {
    if (this.bulkEditMode) {
      this.bulkPriceChanges = {};
      this.originalBulkPrices = {};
      this.bulkInventoryChanges = {};
      this.originalBulkInventory = {};
      this.bulkEditMode = false;
      return;
    }

    this.bulkPriceChanges = {};
    this.originalBulkPrices = {};
    this.bulkInventoryChanges = {};
    this.originalBulkInventory = {};

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

        this.bulkInventoryChanges[catId][dateKey] = {
          totalRooms,
          bookedRooms,
          availableRooms
        };
        this.originalBulkInventory[catId][dateKey] = {
          totalRooms,
          bookedRooms,
          availableRooms
        };
      }
    }

    this.bulkEditMode = true;
  }

  // ============================================================
  // BULK EDIT — PRICE HANDLER
  // ============================================================
  onBulkPriceChange(categoryId: number, day: Date, newValue: string): void {
    const dateKey = this.getDateKey(day);
    const num = parseFloat(newValue);
    if (!isNaN(num) && num >= 0) {
      if (!this.bulkPriceChanges[categoryId]) {
        this.bulkPriceChanges[categoryId] = {};
      }
      this.bulkPriceChanges[categoryId][dateKey] = num;
    }
  }

  // ============================================================
  // BULK EDIT — INVENTORY HANDLER
  // ============================================================
  onBulkInventoryChange(
    categoryId: number,
    day: Date,
    field: InventoryField,
    newValue: string
  ): void {
    const dateKey = this.getDateKey(day);
    const num = parseInt(newValue, 10);
    if (isNaN(num) || num < 0) return;

    if (!this.bulkInventoryChanges[categoryId]) {
      this.bulkInventoryChanges[categoryId] = {};
    }
    if (!this.bulkInventoryChanges[categoryId][dateKey]) {
      this.bulkInventoryChanges[categoryId][dateKey] = {};
    }
    this.bulkInventoryChanges[categoryId][dateKey][field] = num;
  }

  getBulkInventoryValue(
    category: RoomCategory,
    day: Date,
    field: InventoryField
  ): number {
    const dateKey = this.getDateKey(day);
    const override = this.bulkInventoryChanges[category.id]?.[dateKey]?.[field];
    if (override !== undefined && override !== null) return override;

    const rate = this.getRate(category.id, day);
    if (field === 'totalRooms') {
      return rate?.totalRooms ?? this.getTotalRooms(category, day);
    }
    if (field === 'bookedRooms') {
      return rate?.bookedRooms ?? 0;
    }
    if (rate?.availableRooms !== undefined && rate?.availableRooms !== null) {
      return rate.availableRooms;
    }
    return Math.max(0, this.getTotalRooms(category, day) - (rate?.bookedRooms ?? 0));
  }

  // ============================================================
  // BULK RANGE TOOL (price OR total/booked/available)
  // ============================================================
  applyRangeToBulk(): void {
    if (
      this.rangeCategoryId === null ||
      !this.rangeStart ||
      !this.rangeEnd ||
      this.rangeValue < 0
    ) {
      return;
    }

    const start = new Date(this.rangeStart);
    const end = new Date(this.rangeEnd);
    if (start > end) {
      this.error = 'Start date must be before end date.';
      return;
    }

    const catId = this.rangeCategoryId;
    const field = this.rangeField;

    if (field === 'price') {
      if (!this.bulkPriceChanges[catId]) {
        this.bulkPriceChanges[catId] = {};
      }
    } else {
      if (!this.bulkInventoryChanges[catId]) {
        this.bulkInventoryChanges[catId] = {};
      }
    }

    let current = new Date(start);
    while (current <= end) {
      const dateKey = this.formatDate(current);

      if (field === 'price') {
        this.bulkPriceChanges[catId][dateKey] = this.rangeValue;
      } else {
        if (!this.bulkInventoryChanges[catId][dateKey]) {
          this.bulkInventoryChanges[catId][dateKey] = {};
        }
        this.bulkInventoryChanges[catId][dateKey][field] = this.rangeValue;
      }

      current.setDate(current.getDate() + 1);
    }

    this.rangeCategoryId = null;
    this.rangeField = 'price';
    this.rangeStart = '';
    this.rangeEnd = '';
    this.rangeValue = 0;
    this.error = '';
  }

  // ============================================================
  // BULK SAVE — rates + inventory
  // ============================================================
  saveAllBulkChanges(): void {
    const changedRateItems: BulkSetRatesItemRequest[] = [];
    const changedInventoryItems: BulkUpdateInventoryItemRequest[] = [];

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
              category: category.name,
              startDate: dateKey,
              endDate: dateKey,
              price: newPrice
            });
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

          const changed =
            totalRooms !== original.totalRooms ||
            bookedRooms !== original.bookedRooms ||
            availableRooms !== original.availableRooms;

          if (changed) {
            changedInventoryItems.push({
              category: category.name,
              startDate: dateKey,
              endDate: dateKey,
              totalRooms,
              bookedRooms,
              availableRooms
            });
          }
        }
      }
    }

    if (changedRateItems.length === 0 && changedInventoryItems.length === 0) {
      this.error = 'No changes to save.';
      return;
    }

    this.bulkSaving = true;
    this.error = '';

    const rates$ = changedRateItems.length > 0
      ? this.categoryService.setAllRates(changedRateItems)
      : of<BulkSetRatesResponse | null>(null);

    const inventory$ = changedInventoryItems.length > 0
      ? this.categoryService.updateInventoryBulk(changedInventoryItems)
      : of<BulkUpdateInventoryResponse | null>(null);

    forkJoin([rates$, inventory$]).subscribe({
      next: ([rateResult, invResult]) => {
        this.bulkSaving = false;
        const ratesMsg = rateResult
          ? `${rateResult.totalDaysUpdated} rate day(s)`
          : '0 rate day(s)';
        const invMsg = invResult
          ? `${invResult.totalDaysUpdated} inventory day(s)`
          : '0 inventory day(s)';
        console.log(`Bulk save complete: ${ratesMsg}, ${invMsg}.`);
        this.loadData();
        this.toggleBulkEdit();
      },
      error: (err: HttpErrorResponse) => {
        this.bulkSaving = false;
        this.error = `Bulk save failed: ${err.error?.message || err.message}`;
      }
    });
  }

  // ============================================================
  // RESET DATA — open / close
  // ============================================================
  openResetModal(): void {
    // Default: reset ALL inventory for the currently visible month
    const from = new Date(this.currentYear, this.currentMonth, 1);
    const to = new Date(this.currentYear, this.currentMonth + 1, 0);

    this.resetTarget = 'all';
    this.resetCategoryId = null;
    this.resetDataType = 'both';
    this.resetFrom = this.formatDate(from);
    this.resetTo = this.formatDate(to);
    this.resetError = '';
    this.resetSuccess = '';
    this.resetLoading = false;
    this.showResetModal = true;
  }

  closeResetModal(): void {
    this.showResetModal = false;
    this.resetLoading = false;
    this.resetError = '';
    this.resetSuccess = '';
  }

  /**
   * Fires the reset calls according to target + data type.
   *
   * Rules:
   *  - Target 'category' → uses /{id}/inventory/reset and /{id}/rates (DELETE)
   *  - Target 'all'      → uses /inventory/reset-all and loops /{id}/rates (DELETE)
   *                        per category, because there is no bulk rate-reset endpoint.
   *  - Dates are optional for inventory (empty = reset all dates).
   *  - Dates are required for rates; if left empty we fall back to a very wide
   *    range (2000-01-01 → 2099-12-31) so "reset everything" still works.
   */
  async executeReset(): Promise<void> {
    // ---------- Validation ----------
    if (this.resetTarget === 'category' && !this.resetCategoryId) {
      this.resetError = 'Please select a category to reset.';
      return;
    }

    if (
      this.resetFrom &&
      this.resetTo &&
      this.resetFrom > this.resetTo
    ) {
      this.resetError = '"From" date must be before "To" date.';
      return;
    }

    this.resetLoading = true;
    this.resetError = '';
    this.resetSuccess = '';

    const from = this.resetFrom || undefined;
    const to = this.resetTo || undefined;

    // Wide-range fallbacks for rate clearing when dates are blank
    const rateFrom = from || '2000-01-01';
    const rateTo = to || '2099-12-31';

    const tasks: any[] = [];

    try {
      if (this.resetTarget === 'all') {
        // -------- ALL CATEGORIES --------
        if (this.resetDataType === 'inventory' || this.resetDataType === 'both') {
          tasks.push(this.categoryService.resetAllInventory(from, to));
        }
        if (this.resetDataType === 'rates' || this.resetDataType === 'both') {
          for (const cat of this.categories) {
            tasks.push(this.categoryService.clearRates(cat.id, rateFrom, rateTo));
          }
        }
      } else {
        // -------- SPECIFIC CATEGORY --------
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
        this.resetLoading = false;
        return;
      }

      await forkJoin(tasks).toPromise();

      this.resetSuccess = '✅ Reset completed successfully.';
      this.resetLoading = false;
      this.loadData();

      setTimeout(() => {
        if (this.showResetModal) this.closeResetModal();
      }, 2000);
    } catch (err: any) {
      console.error('Reset failed:', err);
      this.resetLoading = false;
      this.resetError = `Reset failed: ${err?.error?.message || err?.message || 'Unknown error'}`;
    }
  }

  // ============================================================
  // MONTH NAVIGATION
  // ============================================================
  previousMonth(): void {
    if (this.currentMonth === 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else {
      this.currentMonth--;
    }
    this.loadData();
  }

  nextMonth(): void {
    if (this.currentMonth === 11) {
      this.currentMonth = 0;
      this.currentYear++;
    } else {
      this.currentMonth++;
    }
    this.loadData();
  }

  today(): void {
    const now = new Date();
    this.currentMonth = now.getMonth();
    this.currentYear = now.getFullYear();
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.error = '';

    const from = new Date(this.currentYear, this.currentMonth, 1);
    const to = new Date(this.currentYear, this.currentMonth + 1, 0);
    const fromStr = this.formatDate(from);
    const toStr = this.formatDate(to);

    this.categoryService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.categoryService.getAllRates(fromStr, toStr).subscribe({
          next: (rates) => {
            console.log('📥 Raw rates response:', rates);
            this.buildRatesMap(rates);
            this.generateDays(from, to);
            this.loading = false;
          },
          error: (err) => {
            console.error('Failed to load rates:', err);
            this.error = 'Failed to load rates: ' + (err?.error?.message || err?.message || 'Unknown error');
            this.loading = false;
          }
        });
      },
      error: (err) => {
        console.error('Failed to load categories:', err);
        this.error = 'Failed to load categories: ' + (err?.error?.message || err?.message || 'Unknown error');
        this.loading = false;
      }
    });
  }
}