import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from './environment';

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
// ROOM CATEGORY
// ============================================================

export interface RoomCategory {
  id: number;
  name: string;
  description: string;
  price: number;
  numBeds: number;
  bedType: string;
  maxAdults: number;
  maxKids: number;
  hasWifi: boolean;
  numTvs: number;
  imageUrl: string;
  images?: ImageDto[];
  viewType?: string;
}

// ============================================================
// CREATE CATEGORY
// ============================================================

export interface CreateCategoryRequest {
  id: number;
  name: string;
  description?: string;
  price: number;
  numBeds: number;
  bedType: string;
  maxAdults: number;
  maxKids: number;
  hasWifi: boolean;
  numTvs: number;
  viewType: string;
}

// ============================================================
// UPDATE CATEGORY
// ============================================================

export interface UpdateCategoryRequest {
  id: number;
  name: string;
  description?: string;
  price: number;
  numBeds: number;
  bedType: string;
  maxAdults: number;
  maxKids: number;
  hasWifi: boolean;
  numTvs: number;
  viewType: string;
}

// ============================================================
// DAILY RATE
// ============================================================

export interface DailyRateResponse {
  date: string;
  price: number;
  totalRooms: number;
  bookedRooms: number;
  availableRooms: number;
  customRate: boolean;
}

// ============================================================
// BULK SET RATES
// ============================================================

export interface BulkSetRatesItemRequest {
  category: string;
  startDate: string;
  endDate: string;
  price: number;
}

export interface BulkSetRatesResponse {
  totalDaysUpdated: number;
  categoriesUpdated: number;
  itemsProcessed: number;
  globalStartDate: string;
  globalEndDate: string;
  categoryDaysBreakdown: { [category: string]: number };
}

// ============================================================
// BULK UPDATE INVENTORY
// (Swagger: BulkUpdateInventoryItemRequest / Response)
// POST /api/dashboard/front-desk/room-categories/inventory/all
// ============================================================

export interface BulkUpdateInventoryItemRequest {
  category: string;
  startDate: string;
  endDate?: string;
  totalRooms?: number;
  bookedRooms?: number;
  availableRooms?: number;
}

export interface BulkUpdateInventoryResponse {
  totalDaysUpdated: number;
  categoriesUpdated: number;
  itemsProcessed: number;
  globalStartDate?: string;
  globalEndDate?: string;
  categoryDaysBreakdown?: { [category: string]: number };
}

// ============================================================
// RESET INVENTORY
// (Swagger: ResetInventoryRequest)
// ============================================================

export interface ResetInventoryRequest {
  startDate?: string;
  endDate?: string;
}

// ============================================================
// REORDER IMAGES
// (Swagger: ReorderImagesRequest)
// ============================================================

export interface ReorderImagesRequest {
  imageIds: number[];
}

// ============================================================
// SERVICE
// ============================================================

@Injectable({
  providedIn: 'root'
})
export class CategoryService {

  private baseUrl =
    `${environment.apiUrl}/api/dashboard/front-desk/room-categories`;

  constructor(
    private http: HttpClient
  ) {}

  // ==========================================================
  // GET CATEGORIES
  // ==========================================================

  getCategories(): Observable<RoomCategory[]> {
    return this.http.get<RoomCategory[]>(this.baseUrl);
  }

  // ==========================================================
  // CREATE CATEGORY
  // ==========================================================

  createCategory(data: CreateCategoryRequest): Observable<RoomCategory> {
    return this.http.post<RoomCategory>(this.baseUrl, data);
  }

  // ==========================================================
  // UPDATE CATEGORY
  // ==========================================================

  updateCategory(id: number, data: UpdateCategoryRequest): Observable<RoomCategory> {
    return this.http.put<RoomCategory>(`${this.baseUrl}/${id}`, data);
  }

  // ==========================================================
  // DELETE CATEGORY
  // ==========================================================

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ==========================================================
  // UPLOAD CATEGORY IMAGE (legacy single-image endpoint)
  // ==========================================================

  uploadCategoryImage(id: number, file: File): Observable<RoomCategory> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<RoomCategory>(`${this.baseUrl}/${id}/image`, formData);
  }

  // ==========================================================
  // GALLERY — UPLOAD IMAGE
  // POST /room-categories/{id}/images?isPrimary=...&displayOrder=...
  // ==========================================================

  uploadRoomCategoryGalleryImage(
    id: number,
    file: File,
    isPrimary: boolean = false,
    displayOrder?: number
  ): Observable<RoomCategory> {
    const formData = new FormData();
    formData.append('file', file);

    let params = new HttpParams().set('isPrimary', String(isPrimary));
    if (displayOrder !== undefined && displayOrder !== null) {
      params = params.set('displayOrder', String(displayOrder));
    }

    return this.http.post<RoomCategory>(
      `${this.baseUrl}/${id}/images`,
      formData,
      { params }
    );
  }

  // ==========================================================
  // GALLERY — SET PRIMARY
  // PUT /room-categories/{id}/images/{imageId}/primary
  // ==========================================================

  setRoomCategoryPrimaryImage(
    id: number,
    imageId: number
  ): Observable<RoomCategory> {
    return this.http.put<RoomCategory>(
      `${this.baseUrl}/${id}/images/${imageId}/primary`,
      {}
    );
  }

  // ==========================================================
  // GALLERY — REORDER
  // PUT /room-categories/{id}/images/reorder
  // ==========================================================

  reorderRoomCategoryImages(
    id: number,
    imageIds: number[]
  ): Observable<RoomCategory> {
    const body: ReorderImagesRequest = { imageIds };
    return this.http.put<RoomCategory>(
      `${this.baseUrl}/${id}/images/reorder`,
      body
    );
  }

  // ==========================================================
  // GALLERY — DELETE IMAGE
  // DELETE /room-categories/{id}/images/{imageId}
  // ==========================================================

  deleteRoomCategoryImage(
    id: number,
    imageId: number
  ): Observable<RoomCategory> {
    return this.http.delete<RoomCategory>(
      `${this.baseUrl}/${id}/images/${imageId}`
    );
  }

  // ==========================================================
  // GET ALL RATES
  // ==========================================================

  getAllRates(from: string, to: string): Observable<{
    [categoryId: string]: DailyRateResponse[]
  }> {
    return this.http.get<{
      [categoryId: string]: DailyRateResponse[]
    }>(`${this.baseUrl}/rates/all`, {
      params: { from, to }
    });
  }

  // ==========================================================
  // GET RATES FOR ONE CATEGORY
  // ==========================================================

  getRates(categoryId: number, from: string, to: string): Observable<DailyRateResponse[]> {
    return this.http.get<DailyRateResponse[]>(
      `${this.baseUrl}/${categoryId}/rates`,
      { params: { from, to } }
    );
  }

  // ==========================================================
  // SET RATES (single category, date range)
  // ==========================================================

  setRates(categoryId: number, startDate: string, endDate: string, price: number): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/${categoryId}/rates`,
      { startDate, endDate, price }
    );
  }

  // ==========================================================
  // CLEAR RATES (single category, date range — required)
  // DELETE /{id}/rates?from=...&to=...
  // ==========================================================

  clearRates(categoryId: number, from: string, to: string): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/${categoryId}/rates`,
      { params: { from, to } }
    );
  }

  // ==========================================================
  // BULK SET RATES (multiple categories / date ranges)
  // POST /room-categories/rates/all
  // ==========================================================

  setAllRates(items: BulkSetRatesItemRequest[]): Observable<BulkSetRatesResponse> {
    return this.http.post<BulkSetRatesResponse>(
      `${this.baseUrl}/rates/all`,
      items
    );
  }

  // ==========================================================
  // BULK UPDATE INVENTORY
  // POST /room-categories/inventory/all
  // ==========================================================

  updateInventoryBulk(
    items: BulkUpdateInventoryItemRequest[]
  ): Observable<BulkUpdateInventoryResponse> {
    return this.http.post<BulkUpdateInventoryResponse>(
      `${this.baseUrl}/inventory/all`,
      items
    );
  }

  // ==========================================================
  // RESET CATEGORY INVENTORY
  // POST /{id}/inventory/reset
  // ==========================================================

  resetCategoryInventory(
    id: number,
    startDate?: string,
    endDate?: string
  ): Observable<any> {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const body: ResetInventoryRequest = {};
    if (startDate) body.startDate = startDate;
    if (endDate) body.endDate = endDate;

    return this.http.post(
      `${this.baseUrl}/${id}/inventory/reset`,
      body,
      { params }
    );
  }

  // ==========================================================
  // RESET ALL INVENTORY
  // POST /inventory/reset-all
  // ==========================================================

  resetAllInventory(startDate?: string, endDate?: string): Observable<any> {
    const params: any = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    return this.http.post(
      `${this.baseUrl}/inventory/reset-all`,
      null,
      { params }
    );
  }
}