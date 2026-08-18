import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpBackend } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from './environment';

export interface ScrapeRequest {
  url?: string;
  code?: string;
  checkin: string;
  checkout: string;
  lang: string;
  currency: string;
}

export interface ScrapedData {
  success: boolean;
  durationMs: number;
  data: {
    name_hotel: string;
    address: string;
    rating: string;
    rooms_count: number;
    rooms: Array<{
      type_room: string;
      price: string;
      price_before_discount: string;
      tax: string;
    }>;
    scraped_url: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ScrapingService {
private baseUrl = `${environment.apiUrl}/api/v1/scrape`;  private httpWithoutInterceptors: HttpClient;
  // 👇 Hardcoded tenant ID – replace with your dynamic source if needed
  private tenantId = 'hotel1';

  constructor(private http: HttpClient, private httpBackend: HttpBackend) {
    // Create a client without interceptors to prevent JWT injection
    this.httpWithoutInterceptors = new HttpClient(httpBackend);
  }

  scrapeBooking(request: ScrapeRequest): Observable<ScrapedData> {
    // Validate
    if (!request.checkin || !request.checkout) {
      return throwError(() => new Error('Check-in and check-out dates are required.'));
    }
    if (!request.url && !request.code) {
      return throwError(() => new Error('Either URL or code must be provided.'));
    }

    // Use the API key from environment (not JWT) + manually add X-Tenant-ID
    const headers = new HttpHeaders()
      .set('Authorization', `Bearer ${environment.scrapeApiKey}`)
      .set('Content-Type', 'application/json')
      .set('ngrok-skip-browser-warning', 'true')
      .set('X-Tenant-ID', this.tenantId);   // <-- NOW INCLUDED

    console.log('📤 Sending scrape request:', { url: this.baseUrl, body: request });

    return this.httpWithoutInterceptors.post<ScrapedData>(this.baseUrl, request, { headers }).pipe(
      catchError((error) => {
        console.error('❌ Scrape API error:', error);
        const errorMsg = error?.error?.error || error?.error?.message || error?.message || 'Unknown error';
        return throwError(() => new Error(`Scraping failed: ${errorMsg}`));
      })
    );
  }
}