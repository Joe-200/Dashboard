import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from './environment';


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
  viewType?: string;
}


// ============================================================
// CREATE CATEGORY
// ============================================================

export interface CreateCategoryRequest {
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

    return this.http.get<RoomCategory[]>(
      this.baseUrl
    );

  }


  // ==========================================================
  // CREATE CATEGORY
  // ==========================================================

  createCategory(
    data: CreateCategoryRequest
  ): Observable<RoomCategory> {

    return this.http.post<RoomCategory>(
      this.baseUrl,
      data
    );

  }


  // ==========================================================
  // UPDATE CATEGORY
  // ==========================================================

  updateCategory(
    id: number,
    data: UpdateCategoryRequest
  ): Observable<RoomCategory> {

    return this.http.put<RoomCategory>(
      `${this.baseUrl}/${id}`,
      data
    );

  }


  // ==========================================================
  // DELETE CATEGORY
  // ==========================================================

  deleteCategory(
    id: number
  ): Observable<void> {

    return this.http.delete<void>(
      `${this.baseUrl}/${id}`
    );

  }


  // ==========================================================
  // UPLOAD CATEGORY IMAGE
  // ==========================================================

  uploadCategoryImage(
    id: number,
    file: File
  ): Observable<RoomCategory> {

    const formData =
      new FormData();

    formData.append(
      'file',
      file
    );

    return this.http.post<RoomCategory>(
      `${this.baseUrl}/${id}/image`,
      formData
    );

  }


  // ==========================================================
  // GET ALL RATES
  //
  // GET:
  // /room-categories/rates/all
  // ==========================================================

  getAllRates(
    from: string,
    to: string
  ): Observable<{
    [categoryId: string]: DailyRateResponse[]
  }> {

    return this.http.get<{
      [categoryId: string]: DailyRateResponse[]
    }>(
      `${this.baseUrl}/rates/all`,
      {
        params: {
          from,
          to
        }
      }
    );

  }


  // ==========================================================
  // GET RATES FOR ONE CATEGORY
  //
  // GET:
  // /room-categories/{categoryId}/rates
  //
  // This is used after saving a price so that the
  // frontend gets the actual persisted value from
  // the backend.
  // ==========================================================

  getRates(
    categoryId: number,
    from: string,
    to: string
  ): Observable<DailyRateResponse[]> {

    return this.http.get<DailyRateResponse[]>(
      `${this.baseUrl}/${categoryId}/rates`,
      {
        params: {
          from,
          to
        }
      }
    );

  }


  // ==========================================================
  // SET RATES
  //
  // POST:
  // /room-categories/{categoryId}/rates
  //
  // Swagger request:
  //
  // {
  //   "startDate": "2026-08-23",
  //   "endDate": "2026-08-23",
  //   "price": 123
  // }
  // ==========================================================

  setRates(
    categoryId: number,
    startDate: string,
    endDate: string,
    price: number
  ): Observable<any> {

    return this.http.post(
      `${this.baseUrl}/${categoryId}/rates`,
      {
        startDate,
        endDate,
        price
      }
    );

  }


  // ==========================================================
  // CLEAR RATES
  //
  // DELETE:
  // /room-categories/{categoryId}/rates
  // ==========================================================

  clearRates(
    categoryId: number,
    from: string,
    to: string
  ): Observable<any> {

    return this.http.delete(
      `${this.baseUrl}/${categoryId}/rates`,
      {
        params: {
          from,
          to
        }
      }
    );

  }

}