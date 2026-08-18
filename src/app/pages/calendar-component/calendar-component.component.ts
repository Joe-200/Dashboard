import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';

import {
  CategoryService,
  RoomCategory,
  DailyRateResponse
} from '../../category-service.service';

import { 
  ReservationRequestService,
  ReservationRequest,
  StayDetailsResponse,
  CreateStayRequest // Added import
} from '../../reservation-request-service.service';
import { RoomService, RoomResponse } from '../../room-response.service';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DatePipe
  ],
  templateUrl: './calendar-component.component.html',
  styleUrl: './calendar-component.component.css'
})
export class CalendarComponent implements OnInit {
  // ============================================================
  // EXISTING & NEW VIEW MODE VARIABLES
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

  // ============================================================
  // NEW CREATE STAY MODAL VARIABLES
  // ============================================================
  showCreateStayModal = false;
  selectedRoomForStay: RoomResponse | null = null;
  createStayForm: FormGroup;
  creatingStay = false;

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

  // ============================================================
  // MODAL
  // ============================================================

  showEditModal = false;

  selectedCategoryId: number | null = null;

  selectedDate: string | null = null;

  editForm: FormGroup;

  saving = false;

  // ============================================================
  // DRAG STATE
  // ============================================================

  private isDragging = false;
  private startX = 0;
  private scrollLeft = 0;

  // ============================================================
  // CONSTRUCTOR
  // ============================================================

  constructor(
    private categoryService: CategoryService,
    private fb: FormBuilder,
    private reservationService: ReservationRequestService,
    private roomService: RoomService
  ) {
    this.editForm = this.fb.group({
      price: [null, [Validators.required, Validators.min(0)]]
    });

    // ============================================================
    // Initialize Create Stay Form
    // ============================================================
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

  // ============================================================
  // INIT
  // ============================================================

  ngOnInit(): void {
    this.loadData();
  }

  // ============================================================
  // DRAG SCROLL LOGIC
  // ============================================================

  startDrag(event: MouseEvent, element: HTMLElement): void {
    this.isDragging = true;
    this.startX = event.pageX - element.offsetLeft;
    this.scrollLeft = element.scrollLeft;
    element.classList.add('dragging');
  }

  drag(event: MouseEvent, element: HTMLElement): void {
    if (!this.isDragging) { return; }
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
  // SWITCH VIEW MODE (NEW)
  // ============================================================

  switchView(mode: 'rates' | 'rooms'): void {
    this.viewMode = mode;
    if (mode === 'rooms' && this.rooms.length === 0) {
      this.loadRoomsAndStays();
    }
  }

  // ============================================================
  // LOAD ROOMS & STAYS (NEW)
  // ============================================================

  loadRoomsAndStays(): void {
    this.staysLoading = true;
    // 1. Fetch Rooms
    this.roomService.getRooms({
      pageable: { page: 0, size: 100 },
      status: undefined
    }).subscribe({
      next: (roomData) => {
        this.rooms = roomData.content;
        
        // 2. Fetch RESERVED and ACTIVE stays
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
  // GET STAY FOR ROOM & DATE (NEW)
  // ============================================================

  getStayForRoomAndDate(roomId: number, date: Date): StayDetailsResponse | null {
    const dateStr = this.formatDate(date);
    // Find a stay where the date falls between checkIn and checkOut
    return this.stays.find(stay => 
      stay.roomId === roomId && 
      dateStr >= stay.expectedCheckInDate && 
      dateStr <= stay.expectedCheckOutDate
    ) || null;
  }

  // ============================================================
  // STAY DETAILS MODAL (NEW)
  // ============================================================

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
  // NOTIFICATION MODAL (EXISTING)
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
  // ACCEPT (EXISTING)
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

  // ============================================================
  // REJECT (EXISTING)
  // ============================================================

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
      },
      error: (err) => {
        this.rejectLoading = false;
        this.requestsError = 'Failed to reject: ' + err.message;
      }
    });
  }

  // ============================================================
  // NEW: CREATE STAY MODAL LOGIC
  // ============================================================

  openCreateStayModal(room: RoomResponse): void {
    this.selectedRoomForStay = room;
    
    // Pre-fill dates with today and tomorrow for convenience
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

    // Build the payload based on Swagger's CreateStayRequest
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
        // Immediately add the new stay to the local array so it shows up in the grid
        this.stays = [...this.stays, newStay];
        // Optionally, refresh rooms/stays to update counts
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
  // DYNAMIC GRID COLUMNS (EXISTING)
  // ============================================================

  get calendarGridColumns(): string {
    return `150px repeat(${this.days.length}, 90px)`;
  }

  // ============================================================
  // LOAD DATA (EXISTING)
  // ============================================================

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

  // ============================================================
  // EDIT MODAL (EXISTING)
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
  // MONTH NAVIGATION (EXISTING)
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