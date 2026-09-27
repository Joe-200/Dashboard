import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { RouterModule } from '@angular/router';

import {
  SpecialOfferResponse,
  SpecialOfferService,
  CreateSpecialOfferRequest,
  UpdateSpecialOfferRequest
} from '../../special-offer-service.service';

import { environment } from '../../environment';

@Component({
  selector: 'app-special-offers',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterModule
  ],
  templateUrl: './special-offers-component.component.html',
  styleUrl: './special-offers-component.component.css'
})
export class SpecialOffersComponent implements OnInit {

  /* =========================
     OFFERS
  ========================= */
  offers: SpecialOfferResponse[] = [];

  loading = false;
  error = '';

  /* =========================
     MODAL
  ========================= */
  showModal = false;
  isEdit = false;

  selectedOfferId: number | null = null;

  offerForm: FormGroup;

  /* =========================
     IMAGE
  ========================= */
  imageFile: File | null = null;
  imagePreview: string | null = null;
  imageUploading = false;
  imageProcessing = false;

  /* =========================
     API
  ========================= */
  apiUrl = environment.apiUrl;

  constructor(
    private fb: FormBuilder,
    private offerService: SpecialOfferService
  ) {
    this.offerForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(1)]],
      description: ['']
    });
  }

  /* =========================
     INIT
  ========================= */
  ngOnInit(): void {
    this.loadOffers();
  }

  /* =========================
     LOAD OFFERS (paged)
  ========================= */
  loadOffers(): void {
    this.loading = true;
    this.error = '';

    this.offerService.getSpecialOffers(0, 100).subscribe({
      next: (data) => {
        this.offers = data?.content ?? [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load offers:', err);
        this.error =
          'Failed to load special offers: ' +
          (err?.error?.message || err?.message || 'Unknown error');
        this.loading = false;
      }
    });
  }

  /* =========================
     CREATE MODAL
  ========================= */
  openCreateModal(): void {
    this.isEdit = false;
    this.selectedOfferId = null;

    this.offerForm.reset({ title: '', description: '' });

    this.clearImage();

    this.showModal = true;
  }

  /* =========================
     EDIT MODAL
  ========================= */
  openEditModal(offer: SpecialOfferResponse): void {
    this.isEdit = true;
    this.selectedOfferId = offer.id;

    this.offerForm.patchValue({
      title: offer.title,
      description: offer.description || ''
    });

    this.clearImage();

    this.showModal = true;
  }

  /* =========================
     CLOSE MODAL
  ========================= */
  closeModal(): void {
    this.showModal = false;
    this.clearImage();
  }

  /* =========================
     CLEAR IMAGE
  ========================= */
  private clearImage(): void {
    if (this.imagePreview) {
      URL.revokeObjectURL(this.imagePreview);
    }
    this.imageFile = null;
    this.imagePreview = null;
    this.imageProcessing = false;
  }

  /* =========================
     FILE SELECTION
  ========================= */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      this.clearImage();
      return;
    }

    const originalFile = input.files[0];

    if (!originalFile.type.startsWith('image/')) {
      this.error = 'Please select a valid image file.';
      input.value = '';
      return;
    }

    try {
      this.error = '';
      this.imageProcessing = true;

      const compressedFile = await this.compressImageToWebP(
        originalFile,
        1600,
        1200,
        0.82
      );

      this.imageFile = compressedFile;

      if (this.imagePreview) {
        URL.revokeObjectURL(this.imagePreview);
      }

      this.imagePreview = URL.createObjectURL(compressedFile);

    } catch (err) {
      console.error('Image processing failed:', err);
      this.imageFile = null;
      this.imagePreview = null;
      this.error = 'Could not process the selected image.';
    } finally {
      this.imageProcessing = false;
    }
  }

  /* =========================
     COMPRESS + WEBP
  ========================= */
  private async compressImageToWebP(
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

      if (width <= 0 || height <= 0) {
        throw new Error('Invalid image dimensions');
      }

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

      if (!blob) throw new Error('WebP conversion failed');

      const baseName = file.name.replace(/\.[^/.]+$/, '');

      return new File(
        [blob],
        `${baseName}.webp`,
        { type: 'image/webp', lastModified: Date.now() }
      );

    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  /* =========================
     SAVE OFFER
  ========================= */
  saveOffer(): void {
    if (this.offerForm.invalid || this.imageProcessing) {
      this.offerForm.markAllAsTouched();
      return;
    }

    const formValue = this.offerForm.value;
    const fileToUpload = this.imageFile;

    this.loading = true;
    this.error = '';

    /* ---------------- EDIT ---------------- */
    if (this.isEdit && this.selectedOfferId) {
      const offerId = this.selectedOfferId;

      const updateData: UpdateSpecialOfferRequest = {
        title: formValue.title,
        description: formValue.description
      };

      this.offerService.updateSpecialOffer(offerId, updateData).subscribe({
        next: () => {
          if (fileToUpload) {
            this.uploadImage(offerId, fileToUpload);
          } else {
            this.loading = false;
            this.closeModal();
            this.loadOffers();
          }
        },
        error: (err) => {
          console.error('Update failed:', err);
          this.loading = false;
          this.error =
            'Update failed: ' +
            (err?.error?.message || err?.message || 'Unknown error');
        }
      });

      return;
    }

    /* ---------------- CREATE ---------------- */
    const createData: CreateSpecialOfferRequest = {
      title: formValue.title,
      description: formValue.description
    };

    this.offerService.createSpecialOffer(createData).subscribe({
      next: (created) => {
        if (fileToUpload) {
          this.uploadImage(created.id, fileToUpload);
        } else {
          this.loading = false;
          this.closeModal();
          this.loadOffers();
        }
      },
      error: (err) => {
        console.error('Create failed:', err);
        this.loading = false;
        this.error =
          'Create failed: ' +
          (err?.error?.message || err?.message || 'Unknown error');
      }
    });
  }

  /* =========================
     UPLOAD IMAGE
     POST /{id}/images?isPrimary=true
  ========================= */
  private uploadImage(offerId: number, file: File): void {
    this.imageUploading = true;

    // This single-file modal treats the uploaded image as the primary one.
    this.offerService.uploadImage(offerId, file, true).subscribe({
      next: (updatedOffer) => {
        this.imageUploading = false;
        this.loading = false;

        this.closeModal();

        const index = this.offers.findIndex((o) => o.id === offerId);
        if (index !== -1 && updatedOffer) {
          this.offers[index] = updatedOffer;
        }

        // Reload to ensure server state
        this.loadOffers();
      },
      error: (err) => {
        console.error('Image upload failed:', err);
        this.imageUploading = false;
        this.loading = false;
        this.error =
          'Offer was saved, but image upload failed: ' +
          (err?.error?.message || err?.message || 'Unknown error');
      }
    });
  }

  /* =========================
     IMAGE URL HELPERS
  ========================= */

  /**
   * Returns the primary image URL for an offer:
   * falls back to the first / primary entry of `images[]`
   * when `imageUrl` is not set.
   */
  getOfferImageUrl(offer: SpecialOfferResponse): string {
    if (offer.imageUrl) {
      return this.getImageUrl(offer.imageUrl);
    }

    const primary =
      offer.images?.find((img) => img.isPrimary) ??
      offer.images?.[0];

    return primary ? this.getImageUrl(primary.imageUrl) : '';
  }

  getImageUrl(url: string | undefined): string {
    if (!url) return '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    return `${this.apiUrl}${url}`;
  }

  hasImage(offer: SpecialOfferResponse): boolean {
    return !!(
      offer.imageUrl ||
      (offer.images && offer.images.length > 0)
    );
  }

  /* =========================
     FILE SIZE
  ========================= */
  getFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }
}