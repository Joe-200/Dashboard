import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';

/* =========================================================
   MODELS (match Swagger /api-docs 18)
========================================================= */

export interface PageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PagedModelSpecialOfferResponse {
  content: SpecialOfferResponse[];
  page: PageMetadata;
}

export interface ImageDto {
  id: number;
  imageUrl: string;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface SpecialOfferResponse {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  images?: ImageDto[];
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

export interface ReorderImagesRequest {
  imageIds: number[];
}

/* =========================================================
   SERVICE
========================================================= */

@Injectable({ providedIn: 'root' })
export class SpecialOfferService {

  private baseUrl =
    `${environment.apiUrl}/api/dashboard/front-desk/special-offers`;

  private landingUrl =
    `${environment.apiUrl}/api/landing/special-offers`;

  constructor(private http: HttpClient) {}

  /* ---------------------------------------------------------
     LIST (paged)
     GET /api/dashboard/front-desk/special-offers?page=&size=
  --------------------------------------------------------- */
  getSpecialOffers(
    page: number = 0,
    size: number = 100
  ): Observable<PagedModelSpecialOfferResponse> {
    const params = new HttpParams()
      .set('page', String(page))
      .set('size', String(size));

    return this.http.get<PagedModelSpecialOfferResponse>(
      this.baseUrl,
      { params }
    );
  }

  /* ---------------------------------------------------------
     PUBLIC LANDING LIST (array, no paging)
  --------------------------------------------------------- */
  getLandingSpecialOffers(): Observable<SpecialOfferResponse[]> {
    return this.http.get<SpecialOfferResponse[]>(this.landingUrl);
  }

  /* ---------------------------------------------------------
     GET ONE
  --------------------------------------------------------- */
  getSpecialOffer(id: number): Observable<SpecialOfferResponse> {
    return this.http.get<SpecialOfferResponse>(
      `${this.baseUrl}/${id}`
    );
  }

  /* ---------------------------------------------------------
     CREATE
  --------------------------------------------------------- */
  createSpecialOffer(
    data: CreateSpecialOfferRequest
  ): Observable<SpecialOfferResponse> {
    return this.http.post<SpecialOfferResponse>(
      this.baseUrl,
      data
    );
  }

  /* ---------------------------------------------------------
     UPDATE (PUT)
  --------------------------------------------------------- */
  updateSpecialOffer(
    id: number,
    data: UpdateSpecialOfferRequest
  ): Observable<SpecialOfferResponse> {
    return this.http.put<SpecialOfferResponse>(
      `${this.baseUrl}/${id}`,
      data
    );
  }

  /* ---------------------------------------------------------
     PATCH
  --------------------------------------------------------- */
  patchSpecialOffer(
    id: number,
    data: PatchSpecialOfferRequest
  ): Observable<SpecialOfferResponse> {
    return this.http.patch<SpecialOfferResponse>(
      `${this.baseUrl}/${id}`,
      data
    );
  }

  /* ---------------------------------------------------------
     UPLOAD GALLERY IMAGE
     POST /{id}/images?isPrimary=&displayOrder=
     multipart/form-data: file
  --------------------------------------------------------- */
  uploadImage(
    id: number,
    file: File,
    isPrimary: boolean = false,
    displayOrder?: number
  ): Observable<SpecialOfferResponse> {

    const formData = new FormData();
    formData.append('file', file);

    let params = new HttpParams()
      .set('isPrimary', String(isPrimary));

    if (displayOrder !== undefined && displayOrder !== null) {
      params = params.set('displayOrder', String(displayOrder));
    }

    return this.http.post<SpecialOfferResponse>(
      `${this.baseUrl}/${id}/images`,
      formData,
      { params }
    );
  }

  /* ---------------------------------------------------------
     SET PRIMARY IMAGE
  --------------------------------------------------------- */
  setPrimaryImage(
    id: number,
    imageId: number
  ): Observable<SpecialOfferResponse> {
    return this.http.put<SpecialOfferResponse>(
      `${this.baseUrl}/${id}/images/${imageId}/primary`,
      {}
    );
  }

  /* ---------------------------------------------------------
     REORDER IMAGES
  --------------------------------------------------------- */
  reorderImages(
    id: number,
    data: ReorderImagesRequest
  ): Observable<SpecialOfferResponse> {
    return this.http.put<SpecialOfferResponse>(
      `${this.baseUrl}/${id}/images/reorder`,
      data
    );
  }

  /* ---------------------------------------------------------
     DELETE IMAGE
  --------------------------------------------------------- */
  deleteImage(
    id: number,
    imageId: number
  ): Observable<SpecialOfferResponse> {
    return this.http.delete<SpecialOfferResponse>(
      `${this.baseUrl}/${id}/images/${imageId}`
    );
  }
}