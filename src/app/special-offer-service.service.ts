import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';
export interface SpecialOfferResponse {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
}

export interface CreateSpecialOfferRequest {
  title: string;
  description?: string;
}

export interface UpdateSpecialOfferRequest {
  title: string;
  description?: string;
}

export interface PatchSpecialOfferRequest {
  title?: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class SpecialOfferService {
  private baseUrl = `${environment.apiUrl}/api/dashboard/front-desk/special-offers`;
  private landingUrl = `${environment.apiUrl}/api/landing/special-offers`;

  constructor(private http: HttpClient) {}

  getSpecialOffers(): Observable<SpecialOfferResponse[]> {
    return this.http.get<SpecialOfferResponse[]>(this.landingUrl);
  }

  createSpecialOffer(data: CreateSpecialOfferRequest): Observable<SpecialOfferResponse> {
    return this.http.post<SpecialOfferResponse>(this.baseUrl, data);
  }

  updateSpecialOffer(id: number, data: UpdateSpecialOfferRequest): Observable<SpecialOfferResponse> {
    return this.http.put<SpecialOfferResponse>(`${this.baseUrl}/${id}`, data);
  }

  patchSpecialOffer(id: number, data: PatchSpecialOfferRequest): Observable<SpecialOfferResponse> {
    return this.http.patch<SpecialOfferResponse>(`${this.baseUrl}/${id}`, data);
  }

  uploadImage(id: number, file: File): Observable<SpecialOfferResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<SpecialOfferResponse>(`${this.baseUrl}/${id}/image`, formData);
  }
}