import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';
/* ============================================================
   TYPES
============================================================ */
export type StaffRole =
  | 'MANAGER' | 'CHEF' | 'BARISTA' | 'ROOM_SERVICE' | 'STAFF' | 'GUEST';

export type SystemRole = 'ADMIN' | 'MONITOR';

export interface UserResponse {
  id: number;
  username: string;
  role: string;
}

export interface CreateUserRequest {
  username: string;
  password: string;
  role: StaffRole;
}

export interface UpdateUserRequest {
  username: string;
  password?: string;
  role: StaffRole;
}

export interface PageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PagedModelUserResponse {
  content: UserResponse[];
  page: PageMetadata;
}

export interface TenantResponse {
  id: string;
  name: string;
  schemaName: string;
  timezone: string;
  status: string;
  email: string;
  hpmsAccountUuid: string;
  createdAt: string;
}

export interface CreateTenantRequest {
  id: string;
  name: string;
  email?: string;
  schemaName: string;
  timezone: string;
  hpmsAccountUuid?: string;
  managerUsername: string;
  managerPassword: string;
}

export interface PagedModelTenantResponse {
  content: TenantResponse[];
  page: PageMetadata;
}

export interface CreateSystemUserRequest {
  username: string;
  password: string;
  role: SystemRole;
}

/* ============================================================
   SERVICE
============================================================ */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private http = inject(HttpClient);

  /** Full base, e.g. https://lytc-hotel-backend.onrender.com/api */
  private readonly base = `${environment.apiUrl}/api`;

  /* ---------- Staff Users ---------- */
  getUsers(page: number, size: number): Observable<PagedModelUserResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PagedModelUserResponse>(
      `${this.base}/dashboard/manager/users`, { params }
    );
  }

  createUser(req: CreateUserRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(
      `${this.base}/dashboard/manager/users`, req
    );
  }

  updateUser(id: number, req: UpdateUserRequest): Observable<UserResponse> {
    return this.http.put<UserResponse>(
      `${this.base}/dashboard/manager/users/${id}`, req
    );
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/dashboard/manager/users/${id}`
    );
  }

  /* ---------- Tenants (ADMIN only) ---------- */
  getTenants(page: number, size: number): Observable<PagedModelTenantResponse> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PagedModelTenantResponse>(
      `${this.base}/admin/tenants`, { params }
    );
  }

  createTenant(req: CreateTenantRequest): Observable<TenantResponse> {
    return this.http.post<TenantResponse>(`${this.base}/admin/tenants`, req);
  }

  deleteTenant(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/tenants/${id}`);
  }

  activateTenant(id: string): Observable<TenantResponse> {
    return this.http.patch<TenantResponse>(
      `${this.base}/admin/tenants/${id}/activate`, {}
    );
  }

  deactivateTenant(id: string): Observable<TenantResponse> {
    return this.http.patch<TenantResponse>(
      `${this.base}/admin/tenants/${id}/deactivate`, {}
    );
  }

  /** PUT /api/admin/tenants/{id}/email */
  updateTenantEmail(id: string, email: string): Observable<TenantResponse> {
    return this.http.put<TenantResponse>(
      `${this.base}/admin/tenants/${id}/email`,
      { email }
    );
  }

  /** PATCH /api/admin/tenants/{id}/hpms-account?accountUuid=... */
  updateHpmsAccount(id: string, accountUuid: string): Observable<TenantResponse> {
    const params = new HttpParams().set('accountUuid', accountUuid);
    return this.http.patch<TenantResponse>(
      `${this.base}/admin/tenants/${id}/hpms-account`, {}, { params }
    );
  }

  /* ---------- System Users (ADMIN only) ---------- */
  getSystemUsers(): Observable<UserResponse[]> {
    return this.http.get<UserResponse[]>(`${this.base}/admin/tenants/users`);
  }

  createSystemUser(req: CreateSystemUserRequest): Observable<UserResponse> {
    return this.http.post<UserResponse>(
      `${this.base}/admin/tenants/users`, req
    );
  }

  deleteSystemUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/admin/tenants/users/${id}`);
  }
}