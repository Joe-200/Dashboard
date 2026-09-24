import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';
// ============================================================
// MODELS
// ============================================================

export interface StayDetailsResponse {
  stayId: number;
  expectedCheckInDate: string;
  checkInTime: string;
  expectedCheckOutDate: string;
  checkOutTime: string;
  status: string; // RESERVED | ACTIVE | CLOSED | CANCELLED | NO_SHOW | DATE_CHANGE_PENDING
  stars: number;
  notes: string;
  roomCharge: number;
  totalCharge: number;
  guestId: number;
  guestName: string;
  guestPhone: string;
  email: string;
  nationality: string;
  identification: string;
  roomId: number;
  roomNumber: string;
  categoryId: string;
  categoryName: string;
  floor: number;
  description: string;
  maxAdults: number;
  maxKids: number;
  numAdults: number;
  numKids: number;
}

export interface PageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PagedModelStayDetailsResponse {
  content: StayDetailsResponse[];
  page: PageMetadata;
}

export interface FinancialSummary {
  roomCharge: number;
  regularOrdersTotal: number;
  specialOrdersTotal: number;
  grandTotal: number;
}

export interface FullStaySummaryResponse {
  stayDetails: StayDetailsResponse;
  financialSummary: FinancialSummary;
  // orders + specialOrders exist on the response but we don't render them.
  orders?: any[];
  specialOrders?: any[];
}

export interface ReceiptItem {
  description: string;
  amount: number;
  date: string;
}

export interface ReceiptResponse {
  stayId: number;
  guestName: string;
  checkInTime: string;
  checkOutTime: string;
  roomNumber: string;
  roomCharge: number;
  menuOrders: ReceiptItem[];
  specialOrders: ReceiptItem[];
  totalCharge: number;
}

// ============================================================
// SERVICE
// ============================================================

@Injectable({ providedIn: 'root' })
export class StayService {
  private readonly apiUrl = environment.apiUrl;
  private readonly base = `${this.apiUrl}/api/dashboard/front-desk/stays`;

  constructor(private http: HttpClient) {}

  // ----------------------------------------------------------
  // LISTING
  // ----------------------------------------------------------
  getStays(
    status?: string,
    page = 0,
    size = 20
  ): Observable<PagedModelStayDetailsResponse> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status) params = params.set('status', status);
    return this.http.get<PagedModelStayDetailsResponse>(this.base, { params });
  }

  getStaysCheckInToday(
    page = 0,
    size = 20
  ): Observable<PagedModelStayDetailsResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PagedModelStayDetailsResponse>(
      `${this.base}/checkin-today`,
      { params }
    );
  }

  getStaysCheckOutToday(
    page = 0,
    size = 20
  ): Observable<PagedModelStayDetailsResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PagedModelStayDetailsResponse>(
      `${this.base}/checkout-today`,
      { params }
    );
  }

  // ----------------------------------------------------------
  // DETAILS
  // ----------------------------------------------------------
  getStaySummary(stayId: number): Observable<FullStaySummaryResponse> {
    return this.http.get<FullStaySummaryResponse>(
      `${this.base}/${stayId}/summary`
    );
  }

  getStayReceipt(stayId: number): Observable<ReceiptResponse> {
    return this.http.get<ReceiptResponse>(`${this.base}/${stayId}/receipt`);
  }

  // ----------------------------------------------------------
  // LIFECYCLE ACTIONS
  // ----------------------------------------------------------
  checkIn(stayId: number): Observable<StayDetailsResponse> {
    return this.http.post<StayDetailsResponse>(
      `${this.base}/${stayId}/checkin`,
      {}
    );
  }

  checkOut(stayId: number): Observable<StayDetailsResponse> {
    return this.http.post<StayDetailsResponse>(
      `${this.base}/${stayId}/checkout`,
      {}
    );
  }

  extendStay(
    stayId: number,
    newCheckOutDate: string
  ): Observable<StayDetailsResponse> {
    return this.http.post<StayDetailsResponse>(
      `${this.base}/${stayId}/extend`,
      { newCheckOutDate }
    );
  }

  proposeDateChange(
    stayId: number,
    proposedCheckIn: string,
    proposedCheckOut: string
  ): Observable<void> {
    return this.http.post<void>(
      `${this.base}/${stayId}/propose-date-change`,
      { proposedCheckIn, proposedCheckOut }
    );
  }

  updateStatus(
    stayId: number,
    status: string
  ): Observable<StayDetailsResponse> {
    return this.http.patch<StayDetailsResponse>(
      `${this.base}/${stayId}/status`,
      { status }
    );
  }
}