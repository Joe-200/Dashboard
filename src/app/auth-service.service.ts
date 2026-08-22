import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from './environment';
export interface LoginRequest {
  username: string;
  password: string;
  hotelId?: string;   // optional for now, but we'll make it required
}

export interface LoginResponse {
  token: string;
  role: string;
  userId: number;
  username: string;
  tokenType: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}
login(credentials: LoginRequest): Observable<LoginResponse> {
  let headers = new HttpHeaders();   // change const → let
  if (credentials.hotelId) {
    headers = headers.set('X-Tenant-ID', credentials.hotelId);
  }

  const { hotelId, ...body } = credentials;

  return this.http.post<LoginResponse>(
    `${this.apiUrl}/api/auth/login`,
    body,
    { headers }
  ).pipe(
    tap(response => {
        console.log('Login response:', response);   // <-- add this
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify({
        username: response.username,
        role: response.role,
        userId: response.userId
      }));
      if (hotelId) {
        localStorage.setItem('hotelId', hotelId);
      }
    })
  );
}

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('hotelId');
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getHotelId(): string | null {
    return localStorage.getItem('hotelId');
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  getUser(): any {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  }
}