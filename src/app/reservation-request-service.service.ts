import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';

export interface ReservationRequest {
  id: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  nationality: string;
  identification: string;
  categoryId: number;
  categoryName: string;
  checkInDate: string;
  checkOutDate: string;
  numAdults: number;
  numKids: number;
  quotedTotalCharge: number;
  status: string;
  notes: string;
  rejectionReason: string;
  processedByUserId: number;
  processedAt: string;
  createdAt: string;
}

export interface StayDetailsResponse {
  stayId: number;
  expectedCheckInDate: string;
  expectedCheckOutDate: string;
  status: 'RESERVED' | 'ACTIVE' | 'CLOSED' | 'CANCELLED' | 'NO_SHOW';
  guestName: string;
  guestPhone: string;
  email: string;
  roomId: number;
  roomNumber: string;
  numAdults: number;
  numKids: number;
  totalCharge: number;
}

export interface CreateStayRequest {
  guestName: string;
  phone: string;
  email?: string;
  nationality?: string;
  identification?: string;
  roomNumber: string;
  numAdults: number;
  numKids: number;
  expectedCheckInDate: string;
  expectedCheckOutDate: string;
  dateRangeValid?: boolean;
}

// Paged response for requests
export interface PagedModelReservationRequestResponse {
  content: ReservationRequest[];
  page: {
    size: number;
    number: number;
    totalElements: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class ReservationRequestService {
  private baseUrl = `${environment.apiUrl}/api/dashboard/front-desk/reservation-requests`;
  private staysUrl = `${environment.apiUrl}/api/dashboard/front-desk/stays`;

  constructor(private http: HttpClient) {}

  // Existing: get pending requests
  getPendingRequests(page: number = 0, size: number = 20): Observable<PagedModelReservationRequestResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    return this.http.get<PagedModelReservationRequestResponse>(this.baseUrl, { params });
  }

  // NEW: get requests with optional status filter and pagination
  getRequests(status?: string, page: number = 0, size: number = 20): Observable<PagedModelReservationRequestResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<PagedModelReservationRequestResponse>(this.baseUrl, { params });
  }

  approveRequest(id: number, roomId: number): Observable<ReservationRequest> {
    return this.http.post<ReservationRequest>(`${this.baseUrl}/${id}/approve`, { roomId });
  }

  rejectRequest(id: number, reason: string): Observable<ReservationRequest> {
    return this.http.post<ReservationRequest>(`${this.baseUrl}/${id}/reject`, { reason });
  }

  getStays(statuses: string[], page: number, size: number): Observable<{ content: StayDetailsResponse[] }> {
    let params = `page=${page}&size=${size}`;
    if (statuses && statuses.length > 0) {
      params += `&${statuses.map(s => `status=${s}`).join('&')}`;
    }
    return this.http.get<{ content: StayDetailsResponse[] }>(`${this.staysUrl}?${params}`);
  }

  createStay(data: CreateStayRequest): Observable<StayDetailsResponse> {
    const payload = { ...data, dateRangeValid: true };
    return this.http.post<StayDetailsResponse>(this.staysUrl, payload);
  }
}