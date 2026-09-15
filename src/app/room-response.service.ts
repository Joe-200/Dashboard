import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';

// === DTOs (based on OpenAPI spec) ===

// ============================================================
// IMAGE DTO
// (Swagger: ImageDto — used for room & category galleries)
// ============================================================

export interface ImageDto {
  id: number;
  imageUrl: string;
  isPrimary: boolean;
  displayOrder: number;
  createdAt: string;
}

// ============================================================
// ROOM
// ============================================================

export interface RoomResponse {
  id: number;
  roomNumber: string;
  status: string;
  floor: number;
  viewType: string; // "CITY" | "PANORAMIC" | "SEA" | ...
  description: string;
  imageUrl: string;
  images?: ImageDto[];
  categoryId: number;
  categoryName: string;
  price: number;
  maxAdults: number;
  maxKids: number;
  numBeds: number;
  bedType: string; // "TWIN" | "DOUBLE" | ...
  hasWifi: boolean;
  numTvs: number;
}

export interface CreateRoomRequest {
  roomNumber: string;
  categoryId: number;
  floor: number;
  viewType: string;
  description?: string;
}

export interface UpdateRoomRequest {
  roomNumber: string;
  categoryId: number;
  floor: number;
  viewType: string;
  description?: string;
  status: string; // "AVAILABLE" | "OCCUPIED" | "CLEANING" | "MAINTENANCE"
}

export interface PatchRoomRequest {
  roomNumber?: string;
  categoryId?: number;
  floor?: number;
  viewType?: string;
  description?: string;
  status?: string;
}

export interface PagedModelRoomResponse {
  content: RoomResponse[];
  page: {
    size: number;
    number: number;
    totalElements: number;
    totalPages: number;
  };
}

export interface Pageable {
  page?: number;
  size?: number;
  sort?: string[];
}

// ============================================================
// GALLERY HELPERS
// ============================================================

export interface ReorderImagesRequest {
  imageIds: number[];
}

@Injectable({ providedIn: 'root' })
export class RoomService {

  private baseUrl =
    `${environment.apiUrl}/api/dashboard/front-desk/rooms`;

  constructor(private http: HttpClient) {}

  // ==========================================================
  // GET ROOMS (paginated + filters)
  // ==========================================================

  getRooms(params: {
    pageable: Pageable;
    status?: string;
    floor?: number;
  }): Observable<PagedModelRoomResponse> {
    let httpParams = new HttpParams()
      .set('page', params.pageable.page?.toString() || '0')
      .set('size', params.pageable.size?.toString() || '10');

    if (params.pageable.sort?.length) {
      params.pageable.sort.forEach(s => {
        httpParams = httpParams.append('sort', s);
      });
    }
    if (params.status) {
      httpParams = httpParams.set('status', params.status);
    }
    if (params.floor !== undefined && params.floor !== null) {
      httpParams = httpParams.set('floor', params.floor.toString());
    }

    return this.http.get<PagedModelRoomResponse>(
      this.baseUrl,
      { params: httpParams }
    );
  }

  // ==========================================================
  // CREATE ROOM
  // ==========================================================

  createRoom(data: CreateRoomRequest): Observable<RoomResponse> {
    return this.http.post<RoomResponse>(this.baseUrl, data);
  }

  // ==========================================================
  // UPDATE ROOM (full update)
  // ==========================================================

  updateRoom(id: number, data: UpdateRoomRequest): Observable<RoomResponse> {
    return this.http.put<RoomResponse>(`${this.baseUrl}/${id}`, data);
  }

  // ==========================================================
  // PATCH ROOM (partial update)
  // ==========================================================

  patchRoom(id: number, data: PatchRoomRequest): Observable<RoomResponse> {
    return this.http.patch<RoomResponse>(`${this.baseUrl}/${id}`, data);
  }

  // ==========================================================
  // UPLOAD SINGLE ROOM IMAGE
  // (legacy primary image endpoint)
  // ==========================================================

  uploadImage(id: number, file: File): Observable<RoomResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<RoomResponse>(
      `${this.baseUrl}/${id}/image`,
      formData
    );
  }

  // ==========================================================
  // GALLERY — UPLOAD IMAGE
  // POST /rooms/{id}/images?isPrimary=...&displayOrder=...
  // ==========================================================

  uploadRoomGalleryImage(
    id: number,
    file: File,
    isPrimary: boolean = false,
    displayOrder?: number
  ): Observable<RoomResponse> {
    const formData = new FormData();
    formData.append('file', file);

    let params = new HttpParams().set('isPrimary', String(isPrimary));
    if (displayOrder !== undefined && displayOrder !== null) {
      params = params.set('displayOrder', String(displayOrder));
    }

    return this.http.post<RoomResponse>(
      `${this.baseUrl}/${id}/images`,
      formData,
      { params }
    );
  }

  // ==========================================================
  // GALLERY — SET PRIMARY
  // PUT /rooms/{id}/images/{imageId}/primary
  // ==========================================================

  setRoomPrimaryImage(
    id: number,
    imageId: number
  ): Observable<RoomResponse> {
    return this.http.put<RoomResponse>(
      `${this.baseUrl}/${id}/images/${imageId}/primary`,
      {}
    );
  }

  // ==========================================================
  // GALLERY — REORDER
  // PUT /rooms/{id}/images/reorder
  // ==========================================================

  reorderRoomImages(
    id: number,
    imageIds: number[]
  ): Observable<RoomResponse> {
    const body: ReorderImagesRequest = { imageIds };
    return this.http.put<RoomResponse>(
      `${this.baseUrl}/${id}/images/reorder`,
      body
    );
  }

  // ==========================================================
  // GALLERY — DELETE IMAGE
  // DELETE /rooms/{id}/images/{imageId}
  // ==========================================================

  deleteRoomImage(
    id: number,
    imageId: number
  ): Observable<RoomResponse> {
    return this.http.delete<RoomResponse>(
      `${this.baseUrl}/${id}/images/${imageId}`
    );
  }
}