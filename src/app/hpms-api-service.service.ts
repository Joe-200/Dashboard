import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from './environment';

/* ============================================================
   HPMS API DTOs — mirrors api_docs.html
============================================================ */

export interface HpmsPulseRequest {
  check_in: string;   // "01-01-2026" (DD-MM-YYYY)
  check_out: string;  // "02-02-2026"
}

export interface HpmsPulseSuccess {
  status: 'success';
  code: 200;
  process_uuid: string;
}

export interface HpmsPulseConflict {
  status: 'error';
  code: 409;
  message: string;
  process_uuid: string;
}

export interface HpmsApiError {
  status?: 'error';
  code: number;
  message: string;
  errors?: { [field: string]: string[] };
}

export interface HpmsConfig {
  webhook: string | null;
  interval: number;
  currency: string;
  reduction: number;
  reduction_type: 'percentage' | 'fixed';
  days: number;
  start_day: number;
  interval_requests: boolean;
  pulse_requests: boolean;
}

export interface HpmsConfigResponse {
  status: 'success';
  code: 200;
  config: HpmsConfig;
}

export interface HpmsRoom {
  uuid: string;
  name: string;
  processed_price: number;
  raw_price: number;
  min_price: number;
  active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface HpmsRoomsResponse {
  status: 'success';
  code: 200;
  data: HpmsRoom[];
}

export interface HpmsRoomsDataResponse {
  status: 'success';
  code: 200;
  data: {
    check_in: string;
    check_out: string;
    days: number;
    rooms: HpmsRoom[];
    rooms_count: number;
    config: Partial<HpmsConfig>;
  };
}

export interface HpmsWebhookData {
  status: 'in_progress' | 'completed' | 'failed';
  code: number;
  process_uuid: string;
  type: 'pulse' | 'intraval';
  progress: number;
  date: string;
  rooms: HpmsRoom[];
  rooms_count: number;
  config: HpmsConfig;
}

/* ============================================================
   SERVICE
============================================================ */

@Injectable({ providedIn: 'root' })
export class HpmsApiService {

  // Base URL: /api/v1/{account_uuid}
  // Falls back to environment.apiUrl if a dedicated HPMS base isn't set.
  private readonly root =
    `${(environment as any).hpmsApiBaseUrl || environment.apiUrl}/api/v1`;

  private accountUuid = '';
  private authToken = '';

  constructor(private http: HttpClient) {}

  /** Call this whenever the account UUID / bearer token changes. */
  setCredentials(accountUuid: string, authToken: string): void {
    this.accountUuid = (accountUuid || '').trim();
    // Strip a leading "Bearer " so we can normalize consistently.
    this.authToken = (authToken || '').replace(/^Bearer\s+/i, '').trim();
  }

  getAccountUuid(): string { return this.accountUuid; }

  private headers(): HttpHeaders {
    return new HttpHeaders({
      'Authorization': `Bearer ${this.authToken}`,
      'Content-Type': 'application/json'
    });
  }

  private url(path: string): string {
    if (!this.accountUuid) {
      throw new Error('HPMS account UUID is not set.');
    }
    return `${this.root}/${this.accountUuid}${path}`;
  }

  // ---------- PULSE ----------
  pulse(payload: HpmsPulseRequest): Observable<HpmsPulseSuccess> {
    return this.http.post<HpmsPulseSuccess>(
      this.url('/pulse'),
      payload,
      { headers: this.headers() }
    ).pipe(catchError(this.handle));
  }

  // ---------- CONFIG ----------
  getConfig(): Observable<HpmsConfigResponse> {
    return this.http.get<HpmsConfigResponse>(
      this.url('/config'),
      { headers: this.headers() }
    ).pipe(catchError(this.handle));
  }

  updateConfig(patch: Partial<HpmsConfig>): Observable<HpmsConfigResponse> {
    return this.http.patch<HpmsConfigResponse>(
      this.url('/config'),
      patch,
      { headers: this.headers() }
    ).pipe(catchError(this.handle));
  }

  // ---------- ROOMS ----------
  getRooms(): Observable<HpmsRoomsResponse> {
    return this.http.get<HpmsRoomsResponse>(
      this.url('/rooms'),
      { headers: this.headers() }
    ).pipe(catchError(this.handle));
  }

  updateRoom(roomUuid: string, minPrice: number): Observable<any> {
    return this.http.patch(
      this.url(`/rooms/${roomUuid}`),
      { min_price: minPrice },
      { headers: this.headers() }
    ).pipe(catchError(this.handle));
  }

  /**
   * GET /rooms/data — the docs specify a JSON request body, which
   * Angular supports via http.request('GET', ...).
   */
  getRoomsData(checkIn: string, checkOut: string): Observable<HpmsRoomsDataResponse> {
    return this.http.request<HpmsRoomsDataResponse>(
      'GET',
      this.url('/rooms/data'),
      {
        body: { check_in: checkIn, check_out: checkOut },
        headers: this.headers()
      }
    ).pipe(catchError(this.handle));
  }

  // ---------- ERROR NORMALIZER ----------
  private handle = (error: HttpErrorResponse) => {
    let normalized: HpmsApiError;

    if (error.status === 0) {
      normalized = { code: 0, message: 'Network error — HPMS API unreachable.' };
    } else {
      const body = error.error || {};
      normalized = {
        status: body.status,
        code: body.code ?? error.status,
        message: body.message || error.message || `HTTP ${error.status}`,
        errors: body.errors
      };
    }

    return throwError(() => normalized);
  };
}