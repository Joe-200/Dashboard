import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { RouterModule } from '@angular/router';
import { environment } from '../../environment';


import {
  RoomService,
  CreateRoomRequest,
  UpdateRoomRequest,
  Pageable,
  RoomResponse,
  ImageDto
} from '../../room-response.service';

import {
  CategoryService,
  CreateCategoryRequest,
  RoomCategory,
  UpdateCategoryRequest
} from '../../category-service.service';

/* =========================================================
   GALLERY IMAGE
========================================================= */
interface GalleryImage {
  id?: number;
  file?: File;
  previewUrl: string;
  isPrimary: boolean;
  isNew: boolean;
  markedForDeletion?: boolean;
}

/* =========================================================
   HPMS ROOM / CATEGORY SUMMARY
========================================================= */
interface HpmsRoomSummary {
  id: string;
  name: string;
}

@Component({
  selector: 'app-rooms',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule
  ],
  templateUrl: './rooms-component.component.html',
  styleUrl: './rooms-component.component.css'
})
export class RoomsComponent implements OnInit {

  /* =========================================================
     ROOMS
  ========================================================= */

  rooms: RoomResponse[] = [];
  totalElements = 0;
  currentPage = 0;
  pageSize = 10;
  totalPages = 0;
  filterStatus = '';
  filterFloor: number | null = null;
  searchTerm = '';
  loading = false;
  error = '';

  /* =========================================================
     ROOM MODAL
  ========================================================= */

  showRoomModal = false;
  isEditRoom = false;
  selectedRoomId: number | null = null;
  roomForm: FormGroup;
  roomGallery: GalleryImage[] = [];
  imageProcessing = false;

  /* =========================================================
     CATEGORIES
  ========================================================= */

  categories: RoomCategory[] = [];
  categoriesLoading = false;
  categoriesError = '';

  /* =========================================================
     CATEGORY MODAL
  ========================================================= */

  showCategoryModal = false;
  isEditCategory = false;
  selectedCategoryId: string | null = null; // now string
  categoryForm: FormGroup;
  categoryGallery: GalleryImage[] = [];

  /* =========================================================
     HPMS CATEGORIES (read-only reference)
  ========================================================= */

  hpmsCategories: HpmsRoomSummary[] = [];
  hpmsCategoriesLoading = false;
  hpmsCategoriesError = '';
  hpmsCategoriesLoaded = false;

  private readonly hpmsRoomsUrl =
    `${environment.apiUrl}/api/dashboard/front-desk/hpms/rooms`;

  constructor(
    private fb: FormBuilder,
    private roomService: RoomService,
    private categoryService: CategoryService,
    private http: HttpClient
  ) {

    /* ROOM FORM */
    this.roomForm = this.fb.group({
      roomNumber: ['', Validators.required],
      categoryId: [null, [Validators.required, Validators.min(1)]],
      floor: [1, [Validators.required, Validators.min(1)]],
      viewType: ['', Validators.required],
      description: [''],
      status: ['AVAILABLE']
    });

    /* CATEGORY FORM — ID is now string */
    this.categoryForm = this.fb.group({
      id: ['', Validators.required],
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: [''],
      price: [0, [Validators.required, Validators.min(0)]],
      numBeds: [1, [Validators.required, Validators.min(1)]],
      bedType: ['', Validators.required],
      maxAdults: [1, [Validators.required, Validators.min(1)]],
      maxKids: [0, [Validators.required, Validators.min(0)]],
      hasWifi: [false],
      numTvs: [0, [Validators.required, Validators.min(0)]],
      viewType: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadRooms();
    this.loadCategories();
  }

  /* =========================================================
     SEARCH / FILTER
  ========================================================= */

  get filteredRooms(): RoomResponse[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.rooms;

    return this.rooms.filter(room => {
      return (
        (room.roomNumber || '').toLowerCase().includes(term) ||
        (room.categoryName || '').toLowerCase().includes(term) ||
        (room.description || '').toLowerCase().includes(term) ||
        (room.status || '').toLowerCase().includes(term) ||
        (room.viewType || '').toLowerCase().includes(term) ||
        String(room.id).includes(term) ||
        String(room.floor).includes(term)
      );
    });
  }

  onSearchChange(): void {
    // Client-side filtering; nothing to reload
  }

  clearSearch(): void {
    this.searchTerm = '';
  }

  /* =========================================================
     ROOMS LOAD / PAGINATION
  ========================================================= */

  loadRooms(): void {
    this.loading = true;
    this.error = '';

    const pageable: Pageable = {
      page: this.currentPage,
      size: this.pageSize
    };

    this.roomService
      .getRooms({
        pageable,
        status: this.filterStatus || undefined,
        floor: this.filterFloor || undefined
      })
      .subscribe({
        next: (data) => {
          this.rooms = data.content || [];
          this.totalElements = data.page.totalElements;
          this.totalPages = data.page.totalPages;
          this.loading = false;
        },
        error: (err) => {
          this.error =
            'Failed to load rooms: ' +
            (err?.error?.message || err?.message || 'Unknown error');
          this.loading = false;
        }
      });
  }

  onFilterChange(): void {
    this.currentPage = 0;
    this.loadRooms();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadRooms();
  }

  /* =========================================================
     CREATE ROOM
  ========================================================= */

  openCreateRoomModal(): void {
    this.isEditRoom = false;
    this.selectedRoomId = null;

    this.roomForm.reset({
      roomNumber: '',
      categoryId: null,
      floor: 1,
      viewType: '',
      description: '',
      status: 'AVAILABLE'
    });

    this.clearRoomGallery();
    this.showRoomModal = true;
  }

  /* =========================================================
     EDIT ROOM
  ========================================================= */

  openEditRoomModal(room: RoomResponse): void {
    this.isEditRoom = true;
    this.selectedRoomId = room.id;

    this.roomForm.patchValue({
      roomNumber: room.roomNumber,
      categoryId: room.categoryId,
      floor: room.floor,
      viewType: room.viewType || '',
      description: room.description || '',
      status: room.status
    });

    this.clearRoomGallery();

    if (room.images && room.images.length > 0) {
      const sorted = [...room.images].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
      );
      this.roomGallery = sorted.map(img => ({
        id: img.id,
        previewUrl: img.imageUrl,
        isPrimary: img.isPrimary,
        isNew: false
      }));
    } else if (room.imageUrl) {
      this.roomGallery = [{
        previewUrl: room.imageUrl,
        isPrimary: true,
        isNew: false
      }];
    }

    this.showRoomModal = true;
  }

  closeRoomModal(): void {
    this.showRoomModal = false;
    this.clearRoomGallery();
  }

  /* =========================================================
     SAVE ROOM
  ========================================================= */

  async saveRoom(): Promise<void> {
    if (this.roomForm.invalid) {
      this.roomForm.markAllAsTouched();
      return;
    }

    const formValue = this.roomForm.value;

    this.loading = true;
    this.error = '';

    try {
      let roomId: number;

      if (this.isEditRoom && this.selectedRoomId) {
        roomId = this.selectedRoomId;

        const updateData: UpdateRoomRequest = {
          roomNumber: formValue.roomNumber,
          categoryId: formValue.categoryId,
          floor: formValue.floor,
          viewType: formValue.viewType,
          description: formValue.description,
          status: formValue.status
        };

        await this.roomService.updateRoom(roomId, updateData).toPromise();
      } else {
        const createData: CreateRoomRequest = {
          roomNumber: formValue.roomNumber,
          categoryId: formValue.categoryId,
          floor: formValue.floor,
          viewType: formValue.viewType,
          description: formValue.description
        };

        const created = await this.roomService
          .createRoom(createData)
          .toPromise();

        if (!created) {
          throw new Error('Room creation returned no data.');
        }

        roomId = created.id;
      }

      await this.syncRoomGallery(roomId);

      this.loading = false;
      this.closeRoomModal();
      this.loadRooms();
    } catch (err: any) {
      this.loading = false;
      this.error =
        'Save failed: ' +
        (err?.error?.message || err?.message || 'Unknown error');
    }
  }

  /* =========================================================
     SYNC ROOM GALLERY
  ========================================================= */

  private async syncRoomGallery(roomId: number): Promise<void> {
    const gallery = this.roomGallery;
    const finalList = gallery.filter(img => !img.markedForDeletion);

    for (const img of gallery) {
      if (img.markedForDeletion && img.id) {
        try {
          await this.roomService.deleteRoomImage(roomId, img.id).toPromise();
        } catch (err) {
          console.warn('Failed to delete image', img.id, err);
        }
      }
    }

    const knownIds = new Set(
      finalList
        .filter(i => !i.isNew && i.id)
        .map(i => i.id as number)
    );

    for (const img of finalList) {
      if (img.isNew && img.file) {
        try {
          const resp = await this.roomService
            .uploadRoomGalleryImage(roomId, img.file)
            .toPromise();

          if (resp?.images) {
            const newImg = resp.images.find(i => !knownIds.has(i.id));
            if (newImg) {
              img.id = newImg.id;
              knownIds.add(newImg.id);
            }
          }
        } catch (err) {
          console.warn('Failed to upload image', img.file.name, err);
        }
      }
    }

    const orderedIds = finalList
      .map(i => i.id)
      .filter((id): id is number => id !== undefined && id !== null);

    if (orderedIds.length > 1) {
      try {
        await this.roomService
          .reorderRoomImages(roomId, orderedIds)
          .toPromise();
      } catch (err) {
        console.warn('Failed to reorder images', err);
      }
    }

    const primary = finalList.find(i => i.isPrimary);
    if (primary?.id) {
      try {
        await this.roomService
          .setRoomPrimaryImage(roomId, primary.id)
          .toPromise();
      } catch (err) {
        console.warn('Failed to set primary image', err);
      }
    }
  }

  /* =========================================================
     ROOM GALLERY – FILE PICKER
  ========================================================= */

  async onRoomFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.imageProcessing = true;
    this.error = '';

    try {
      for (const file of files) {
        const compressed = await this.compressToWebP(file, 1600, 1200, 0.82);
        const previewUrl = URL.createObjectURL(compressed);

        this.roomGallery.push({
          file: compressed,
          previewUrl,
          isPrimary: this.roomGallery.length === 0,
          isNew: true
        });
      }
    } catch (err) {
      console.error('Room image processing failed:', err);
      this.error = 'Could not process one or more images.';
    } finally {
      this.imageProcessing = false;
      input.value = '';
    }
  }

  /* =========================================================
     ROOM GALLERY – ACTIONS
  ========================================================= */

  setPrimaryRoomImage(index: number): void {
    this.roomGallery = this.roomGallery.map((img, i) => ({
      ...img,
      isPrimary: i === index
    }));
  }

  moveRoomImageLeft(index: number): void {
    if (index <= 0) return;
    const arr = [...this.roomGallery];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    this.roomGallery = arr;
  }

  moveRoomImageRight(index: number): void {
    if (index >= this.roomGallery.length - 1) return;
    const arr = [...this.roomGallery];
    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
    this.roomGallery = arr;
  }

  removeRoomImage(index: number): void {
    const img = this.roomGallery[index];
    if (!img) return;

    if (img.isNew && img.previewUrl) {
      URL.revokeObjectURL(img.previewUrl);
      const arr = [...this.roomGallery];
      arr.splice(index, 1);
      if (img.isPrimary && arr.length > 0) {
        arr[0].isPrimary = true;
      }
      this.roomGallery = arr;
    } else {
      const arr = [...this.roomGallery];
      arr[index] = { ...arr[index], markedForDeletion: true };
      if (img.isPrimary) {
        const nextPrimary = arr.find(i => !i.markedForDeletion);
        if (nextPrimary) nextPrimary.isPrimary = true;
      }
      this.roomGallery = arr;
    }
  }

  undoRemoveRoomImage(index: number): void {
    const arr = [...this.roomGallery];
    if (arr[index]) {
      arr[index] = { ...arr[index], markedForDeletion: false };
      this.roomGallery = arr;
    }
  }

  clearRoomGallery(): void {
    for (const img of this.roomGallery) {
      if (img.isNew && img.previewUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
    }
    this.roomGallery = [];
  }

  /* =========================================================
     IMAGE COMPRESSION (WebP)
  ========================================================= */

  private async compressToWebP(
    file: File,
    maxWidth = 1600,
    maxHeight = 1200,
    quality = 0.82
  ): Promise<File> {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    try {
      image.src = objectUrl;

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Could not read image'));
      });

      let width = image.naturalWidth;
      let height = image.naturalHeight;

      if (!width || !height) throw new Error('Invalid image dimensions');

      const scale = Math.min(maxWidth / width, maxHeight / height, 1);
      width = Math.round(width * scale);
      height = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not create canvas');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, width, height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/webp', quality);
      });

      if (!blob) throw new Error('Could not convert image to WebP');

      const newFileName =
        file.name.replace(/\.[^/.]+$/, '') + '.webp';

      return new File([blob], newFileName, {
        type: 'image/webp',
        lastModified: Date.now()
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  getFileSize(file: File | null | undefined): string {
    if (!file) return '';
    const mb = file.size / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  }

  /* =========================================================
     CATEGORIES
  ========================================================= */

  loadCategories(): void {
    this.categoriesLoading = true;
    this.categoriesError = '';

    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.categories = data || [];
        this.categoriesLoading = false;
      },
      error: (err) => {
        this.categoriesError =
          'Failed to load categories: ' +
          (err?.error?.message || err?.message || 'Unknown error');
        this.categoriesLoading = false;
      }
    });
  }

  /* =========================================================
     HPMS CATEGORIES (read-only reference)
  ========================================================= */

  private loadHpmsCategoriesIfNeeded(): void {
    if (this.hpmsCategoriesLoaded || this.hpmsCategoriesLoading) {
      return;
    }
    this.loadHpmsCategories();
  }

  private loadHpmsCategories(): void {
    this.hpmsCategoriesLoading = true;
    this.hpmsCategoriesError = '';

    this.http
      .get<HpmsRoomSummary[]>(this.hpmsRoomsUrl)
      .subscribe({
        next: (data) => {
          this.hpmsCategories = data || [];
          this.hpmsCategoriesLoading = false;
          this.hpmsCategoriesLoaded = true;
        },
        error: (err) => {
          this.hpmsCategoriesError =
            'Failed to load HPMS categories: ' +
            (err?.error?.message || err?.message || 'Unknown error');
          this.hpmsCategoriesLoading = false;
        }
      });
  }

  /* =========================================================
     CATEGORY MODAL – ENTRY POINTS
  ========================================================= */

  openCreateCategoryModal(): void {
    this.startNewCategory();
    this.loadHpmsCategoriesIfNeeded();
    this.showCategoryModal = true;
  }

  startNewCategory(): void {
    this.isEditCategory = false;
    this.selectedCategoryId = null;

    this.categoryForm.reset({
      id: '',
      name: '',
      description: '',
      price: 0,
      numBeds: 1,
      bedType: '',
      maxAdults: 1,
      maxKids: 0,
      hasWifi: false,
      numTvs: 0,
      viewType: ''
    });

    this.clearCategoryGallery();
    this.categoriesError = '';
  }

  openEditCategoryModal(category: RoomCategory): void {
    this.isEditCategory = true;
    // convert id to string
    this.selectedCategoryId = String(category.id);

    this.categoryForm.patchValue({
      id: String(category.id),
      name: category.name,
      description: category.description || '',
      price: category.price,
      numBeds: category.numBeds,
      bedType: category.bedType,
      maxAdults: category.maxAdults,
      maxKids: category.maxKids,
      hasWifi: category.hasWifi,
      numTvs: category.numTvs,
      viewType: category.viewType || ''
    });

    this.clearCategoryGallery();

    if (category.images && category.images.length > 0) {
      const sorted = [...category.images].sort(
        (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
      );
      this.categoryGallery = sorted.map(img => ({
        id: img.id,
        previewUrl: img.imageUrl,
        isPrimary: img.isPrimary,
        isNew: false
      }));
    } else if (category.imageUrl) {
      this.categoryGallery = [{
        previewUrl: category.imageUrl,
        isPrimary: true,
        isNew: false
      }];
    }

    this.loadHpmsCategoriesIfNeeded();
    this.showCategoryModal = true;
    this.categoriesError = '';
  }

  closeCategoryModal(): void {
    this.showCategoryModal = false;
    this.clearCategoryGallery();
  }

  /* =========================================================
     APPLY HPMS CATEGORY (click to fill ID + Name)
  ========================================================= */

  applyHpmsCategory(hpms: HpmsRoomSummary): void {
    this.categoryForm.patchValue({
      id: hpms.id,
      name: hpms.name
    });
    // Optionally mark as touched so validation updates
    this.categoryForm.get('id')?.markAsTouched();
    this.categoryForm.get('name')?.markAsTouched();
  }

  isHpmsCategorySelected(hpms: HpmsRoomSummary): boolean {
    const currentId = this.categoryForm.get('id')?.value;
    return currentId === hpms.id;
  }

  /* =========================================================
     SAVE CATEGORY
  ========================================================= */

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    const formValue = this.categoryForm.value;

    this.categoriesLoading = true;
    this.categoriesError = '';

    try {
      let categoryId: string;

      if (this.isEditCategory && this.selectedCategoryId) {
        categoryId = this.selectedCategoryId;

        const updateData: UpdateCategoryRequest = {
          id: formValue.id, // string
          name: formValue.name,
          description: formValue.description,
          price: formValue.price,
          numBeds: formValue.numBeds,
          bedType: formValue.bedType,
          maxAdults: formValue.maxAdults,
          maxKids: formValue.maxKids,
          hasWifi: formValue.hasWifi,
          numTvs: formValue.numTvs,
          viewType: formValue.viewType
        } as any; // cast because service expects number

        await this.categoryService
          .updateCategory(categoryId as any, updateData)
          .toPromise();
      } else {
        const createData: CreateCategoryRequest = {
          id: formValue.id, // string
          name: formValue.name,
          description: formValue.description,
          price: formValue.price,
          numBeds: formValue.numBeds,
          bedType: formValue.bedType,
          maxAdults: formValue.maxAdults,
          maxKids: formValue.maxKids,
          hasWifi: formValue.hasWifi,
          numTvs: formValue.numTvs,
          viewType: formValue.viewType
        } as any;

        const created = await this.categoryService
          .createCategory(createData)
          .toPromise();

        if (!created) {
          throw new Error('Category creation returned no data.');
        }

        categoryId = String(created.id);
      }

      await this.syncCategoryGallery(categoryId as any);

      this.categoriesLoading = false;
      this.closeCategoryModal();
      this.loadCategories();
      this.loadRooms();
    } catch (err: any) {
      this.categoriesLoading = false;
      this.categoriesError =
        'Save failed: ' +
        (err?.error?.message || err?.message || 'Unknown error');
    }
  }

  /* =========================================================
     SYNC CATEGORY GALLERY
  ========================================================= */

  private async syncCategoryGallery(categoryId: number): Promise<void> {
    const gallery = this.categoryGallery;
    const finalList = gallery.filter(img => !img.markedForDeletion);

    for (const img of gallery) {
      if (img.markedForDeletion && img.id) {
        try {
          await this.categoryService
            .deleteRoomCategoryImage(categoryId, img.id)
            .toPromise();
        } catch (err) {
          console.warn('Failed to delete category image', img.id, err);
        }
      }
    }

    const knownIds = new Set(
      finalList
        .filter(i => !i.isNew && i.id)
        .map(i => i.id as number)
    );

    for (const img of finalList) {
      if (img.isNew && img.file) {
        try {
          const resp = await this.categoryService
            .uploadRoomCategoryGalleryImage(categoryId, img.file)
            .toPromise();

          if (resp?.images) {
            const newImg = resp.images.find(i => !knownIds.has(i.id));
            if (newImg) {
              img.id = newImg.id;
              knownIds.add(newImg.id);
            }
          }
        } catch (err) {
          console.warn('Failed to upload category image', img.file.name, err);
        }
      }
    }

    const orderedIds = finalList
      .map(i => i.id)
      .filter((id): id is number => id !== undefined && id !== null);

    if (orderedIds.length > 1) {
      try {
        await this.categoryService
          .reorderRoomCategoryImages(categoryId, orderedIds)
          .toPromise();
      } catch (err) {
        console.warn('Failed to reorder category images', err);
      }
    }

    const primary = finalList.find(i => i.isPrimary);
    if (primary?.id) {
      try {
        await this.categoryService
          .setRoomCategoryPrimaryImage(categoryId, primary.id)
          .toPromise();
      } catch (err) {
        console.warn('Failed to set primary category image', err);
      }
    }
  }

  /* =========================================================
     CATEGORY GALLERY – FILE PICKER & ACTIONS
  ========================================================= */

  async onCategoryFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.imageProcessing = true;
    this.categoriesError = '';

    try {
      for (const file of files) {
        const compressed = await this.compressToWebP(file, 1600, 1200, 0.82);
        const previewUrl = URL.createObjectURL(compressed);

        this.categoryGallery.push({
          file: compressed,
          previewUrl,
          isPrimary: this.categoryGallery.length === 0,
          isNew: true
        });
      }
    } catch (err) {
      console.error('Category image processing failed:', err);
      this.categoriesError = 'Could not process one or more category images.';
    } finally {
      this.imageProcessing = false;
      input.value = '';
    }
  }

  setPrimaryCategoryImage(index: number): void {
    this.categoryGallery = this.categoryGallery.map((img, i) => ({
      ...img,
      isPrimary: i === index
    }));
  }

  moveCategoryImageLeft(index: number): void {
    if (index <= 0) return;
    const arr = [...this.categoryGallery];
    [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
    this.categoryGallery = arr;
  }

  moveCategoryImageRight(index: number): void {
    if (index >= this.categoryGallery.length - 1) return;
    const arr = [...this.categoryGallery];
    [arr[index + 1], arr[index]] = [arr[index], arr[index + 1]];
    this.categoryGallery = arr;
  }

  removeCategoryImage(index: number): void {
    const img = this.categoryGallery[index];
    if (!img) return;

    if (img.isNew && img.previewUrl) {
      URL.revokeObjectURL(img.previewUrl);
      const arr = [...this.categoryGallery];
      arr.splice(index, 1);
      if (img.isPrimary && arr.length > 0) {
        arr[0].isPrimary = true;
      }
      this.categoryGallery = arr;
    } else {
      const arr = [...this.categoryGallery];
      arr[index] = { ...arr[index], markedForDeletion: true };
      if (img.isPrimary) {
        const nextPrimary = arr.find(i => !i.markedForDeletion);
        if (nextPrimary) nextPrimary.isPrimary = true;
      }
      this.categoryGallery = arr;
    }
  }

  undoRemoveCategoryImage(index: number): void {
    const arr = [...this.categoryGallery];
    if (arr[index]) {
      arr[index] = { ...arr[index], markedForDeletion: false };
      this.categoryGallery = arr;
    }
  }

  clearCategoryGallery(): void {
    for (const img of this.categoryGallery) {
      if (img.isNew && img.previewUrl) {
        URL.revokeObjectURL(img.previewUrl);
      }
    }
    this.categoryGallery = [];
  }

  /* =========================================================
     DELETE CATEGORY
  ========================================================= */

  deleteCategory(id: number | string): void {
    if (!confirm('Are you sure you want to delete this category?')) return;

    // Convert to number if the service expects it
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;

    this.categoryService.deleteCategory(numericId).subscribe({
      next: () => {
        if (this.selectedCategoryId === String(id)) {
          this.startNewCategory();
        }
        this.loadCategories();
        this.loadRooms();
      },
      error: (err) => {
        this.categoriesError =
          'Delete failed: ' +
          (err?.error?.message || err?.message || 'Unknown error');
      }
    });
  }

  /* =========================================================
     LABELS
  ========================================================= */

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      AVAILABLE: 'Available',
      OCCUPIED: 'Occupied',
      CLEANING: 'Cleaning',
      MAINTENANCE: 'Maintenance'
    };
    return map[status] || status;
  }

  getViewLabel(view: string | null | undefined): string {
    if (!view) return '';
    return view
      .toString()
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase());
  }

  getBedTypeLabel(type: string | null | undefined): string {
    if (!type) return '';
    return type
      .toString()
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, char => char.toUpperCase());
  }
}