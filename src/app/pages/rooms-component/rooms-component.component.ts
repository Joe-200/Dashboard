import {
  Component,
  OnInit
} from '@angular/core';

import {
  CommonModule
} from '@angular/common';

import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';

import {
  RouterModule
} from '@angular/router';

import {
  RoomService,
  CreateRoomRequest,
  UpdateRoomRequest,
  Pageable,
  RoomResponse
} from '../../room-response.service';

import {
  CategoryService,
  CreateCategoryRequest,
  RoomCategory,
  UpdateCategoryRequest
} from '../../category-service.service';


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

  loading = false;

  error = '';


  /* =========================================================
     ROOM MODAL
  ========================================================= */

  showRoomModal = false;

  isEditRoom = false;

  selectedRoomId: number | null = null;

  roomForm: FormGroup;

  imageFile: File | null = null;

  imagePreview: string | null = null;

  imageUploading = false;

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

  selectedCategoryId: number | null = null;

  categoryForm: FormGroup;

  categoryImageFile: File | null = null;

  categoryImagePreview: string | null = null;


  constructor(
    private fb: FormBuilder,

    private roomService: RoomService,

    private categoryService: CategoryService
  ) {

    /* ROOM FORM */

    this.roomForm = this.fb.group({

      roomNumber: [
        '',
        Validators.required
      ],

      categoryId: [
        null,
        [
          Validators.required,
          Validators.min(1)
        ]
      ],

      floor: [
        1,
        [
          Validators.required,
          Validators.min(1)
        ]
      ],

      viewType: [
        '',
        Validators.required
      ],

      description: [
        ''
      ],

      status: [
        'AVAILABLE'
      ]

    });


    /* CATEGORY FORM */

    this.categoryForm = this.fb.group({

      name: [
        '',
        [
          Validators.required,
          Validators.maxLength(100)
        ]
      ],

      description: [
        ''
      ],

      price: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      numBeds: [
        1,
        [
          Validators.required,
          Validators.min(1)
        ]
      ],

      bedType: [
        '',
        Validators.required
      ],

      maxAdults: [
        1,
        [
          Validators.required,
          Validators.min(1)
        ]
      ],

      maxKids: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      hasWifi: [
        false
      ],

      numTvs: [
        0,
        [
          Validators.required,
          Validators.min(0)
        ]
      ],

      viewType: [
        '',
        Validators.required
      ]

    });

  }


  ngOnInit(): void {

    this.loadRooms();

    this.loadCategories();

  }


  /* =========================================================
     ROOMS
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

        status:
          this.filterStatus ||
          undefined,

        floor:
          this.filterFloor ||
          undefined
      })

      .subscribe({

        next: (data) => {

          this.rooms =
            data.content || [];

          this.totalElements =
            data.page.totalElements;

          this.totalPages =
            data.page.totalPages;

          this.loading = false;

        },

        error: (err) => {

          this.error =
            'Failed to load rooms: ' +
            (err?.error?.message ||
             err?.message ||
             'Unknown error');

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

    this.clearRoomImage();

    this.showRoomModal = true;

  }


  /* =========================================================
     EDIT ROOM
  ========================================================= */

  openEditRoomModal(
    room: RoomResponse
  ): void {

    this.isEditRoom = true;

    this.selectedRoomId = room.id;

    this.roomForm.patchValue({

      roomNumber:
        room.roomNumber,

      categoryId:
        room.categoryId,

      floor:
        room.floor,

      viewType:
        room.viewType || '',

      description:
        room.description || '',

      status:
        room.status

    });

    this.clearRoomImage();

    this.showRoomModal = true;

  }


  closeRoomModal(): void {

    this.showRoomModal = false;

    this.clearRoomImage();

  }


  /* =========================================================
     SAVE ROOM
  ========================================================= */

  saveRoom(): void {

    if (this.roomForm.invalid) {

      this.roomForm.markAllAsTouched();

      return;

    }

    const formValue =
      this.roomForm.value;

    const selectedImage =
      this.imageFile;

    this.loading = true;

    this.error = '';


    /* EDIT */

    if (
      this.isEditRoom &&
      this.selectedRoomId
    ) {

      const roomId =
        this.selectedRoomId;

      const updateData:
        UpdateRoomRequest = {

        roomNumber:
          formValue.roomNumber,

        categoryId:
          formValue.categoryId,

        floor:
          formValue.floor,

        viewType:
          formValue.viewType,

        description:
          formValue.description,

        status:
          formValue.status

      };


      this.roomService
        .updateRoom(
          roomId,
          updateData
        )

        .subscribe({

          next: () => {

            if (!selectedImage) {

              this.loading = false;

              this.closeRoomModal();

              this.loadRooms();

              return;

            }


            this.uploadRoomImageAfterSave(
              roomId,
              selectedImage
            );

          },

          error: (err) => {

            this.loading = false;

            this.error =
              'Update failed: ' +
              (
                err?.error?.message ||
                err?.message ||
                'Unknown error'
              );

          }

        });

      return;

    }


    /* CREATE */

    const createData:
      CreateRoomRequest = {

      roomNumber:
        formValue.roomNumber,

      categoryId:
        formValue.categoryId,

      floor:
        formValue.floor,

      viewType:
        formValue.viewType,

      description:
        formValue.description

    };


    this.roomService
      .createRoom(createData)

      .subscribe({

        next: (created) => {

          if (!selectedImage) {

            this.loading = false;

            this.closeRoomModal();

            this.loadRooms();

            return;

          }


          this.uploadRoomImageAfterSave(
            created.id,
            selectedImage
          );

        },

        error: (err) => {

          this.loading = false;

          this.error =
            'Create failed: ' +
            (
              err?.error?.message ||
              err?.message ||
              'Unknown error'
            );

        }

      });

  }


  /* =========================================================
     ROOM IMAGE UPLOAD
  ========================================================= */

  private uploadRoomImageAfterSave(
    roomId: number,
    file: File
  ): void {

    this.imageUploading = true;

    this.roomService
      .uploadImage(
        roomId,
        file
      )

      .subscribe({

        next: () => {

          this.imageUploading = false;

          this.loading = false;

          this.closeRoomModal();

          this.loadRooms();

        },

        error: (err) => {

          this.imageUploading = false;

          this.loading = false;

          this.error =
            'Room saved, but image upload failed: ' +
            (
              err?.error?.message ||
              err?.message ||
              'Unknown error'
            );

        }

      });

  }


  /* =========================================================
     ROOM FILE SELECTION
  ========================================================= */

  async onFileSelected(
    event: Event
  ): Promise<void> {

    const input =
      event.target as HTMLInputElement;

    if (
      !input.files ||
      input.files.length === 0
    ) {

      return;

    }

    const originalFile =
      input.files[0];

    try {

      this.imageProcessing = true;

      this.error = '';

      const compressedFile =
        await this.compressToWebP(
          originalFile,
          1600,
          1200,
          0.82
        );

      this.imageFile =
        compressedFile;


      if (this.imagePreview) {

        URL.revokeObjectURL(
          this.imagePreview
        );

      }


      this.imagePreview =
        URL.createObjectURL(
          compressedFile
        );

    }

    catch (err) {

      console.error(
        'Image processing failed:',
        err
      );

      this.imageFile = null;

      this.imagePreview = null;

      this.error =
        'Could not process the image.';

    }

    finally {

      this.imageProcessing = false;

      input.value = '';

    }

  }


  /* =========================================================
     WEBP COMPRESSION
  ========================================================= */

  private async compressToWebP(
    file: File,

    maxWidth = 1600,

    maxHeight = 1200,

    quality = 0.82

  ): Promise<File> {

    const image =
      new Image();

    const objectUrl =
      URL.createObjectURL(file);


    try {

      image.src =
        objectUrl;


      await new Promise<void>(
        (resolve, reject) => {

          image.onload = () =>
            resolve();

          image.onerror = () =>
            reject(
              new Error(
                'Could not read image'
              )
            );

        }
      );


      let width =
        image.naturalWidth;

      let height =
        image.naturalHeight;


      if (
        !width ||
        !height
      ) {

        throw new Error(
          'Invalid image dimensions'
        );

      }


      const scale =
        Math.min(
          maxWidth / width,
          maxHeight / height,
          1
        );


      width =
        Math.round(
          width * scale
        );

      height =
        Math.round(
          height * scale
        );


      const canvas =
        document.createElement(
          'canvas'
        );

      canvas.width =
        width;

      canvas.height =
        height;


      const ctx =
        canvas.getContext(
          '2d'
        );


      if (!ctx) {

        throw new Error(
          'Could not create canvas'
        );

      }


      ctx.imageSmoothingEnabled =
        true;

      ctx.imageSmoothingQuality =
        'high';


      ctx.drawImage(
        image,
        0,
        0,
        width,
        height
      );


      const blob =
        await new Promise<Blob | null>(
          (resolve) => {

            canvas.toBlob(
              resolve,
              'image/webp',
              quality
            );

          }
        );


      if (!blob) {

        throw new Error(
          'Could not convert image to WebP'
        );

      }


      const newFileName =
        file.name.replace(
          /\.[^/.]+$/,
          ''
        ) + '.webp';


      return new File(
        [blob],
        newFileName,
        {
          type: 'image/webp',

          lastModified:
            Date.now()
        }
      );

    }

    finally {

      URL.revokeObjectURL(
        objectUrl
      );

    }

  }


  clearRoomImage(): void {

    if (this.imagePreview) {

      URL.revokeObjectURL(
        this.imagePreview
      );

    }

    this.imageFile = null;

    this.imagePreview = null;

    this.imageProcessing = false;

  }


  getFileSize(
    file: File | null
  ): string {

    if (!file) {
      return '';
    }

    const mb =
      file.size /
      1024 /
      1024;

    return `${mb.toFixed(2)} MB`;

  }


  /* =========================================================
     CATEGORIES
  ========================================================= */

  loadCategories(): void {

    this.categoriesLoading = true;

    this.categoriesError = '';

    this.categoryService
      .getCategories()

      .subscribe({

        next: (data) => {

          this.categories =
            data || [];

          this.categoriesLoading = false;

        },

        error: (err) => {

          this.categoriesError =
            'Failed to load categories: ' +
            (
              err?.error?.message ||
              err?.message ||
              'Unknown error'
            );

          this.categoriesLoading = false;

        }

      });

  }


  /* =========================================================
     CREATE CATEGORY
  ========================================================= */

  openCreateCategoryModal(): void {

    this.isEditCategory = false;

    this.selectedCategoryId = null;

    this.categoryForm.reset({

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

    this.clearCategoryImage();

    this.showCategoryModal = true;

  }


  /* =========================================================
     EDIT CATEGORY
  ========================================================= */

  openEditCategoryModal(
    category: RoomCategory
  ): void {

    this.isEditCategory = true;

    this.selectedCategoryId =
      category.id;

    this.categoryForm.patchValue({

      name:
        category.name,

      description:
        category.description || '',

      price:
        category.price,

      numBeds:
        category.numBeds,

      bedType:
        category.bedType,

      maxAdults:
        category.maxAdults,

      maxKids:
        category.maxKids,

      hasWifi:
        category.hasWifi,

      numTvs:
        category.numTvs,

      viewType:
        category.viewType || ''

    });

    this.clearCategoryImage();

    /*
     * Show the existing category image
     * while editing.
     */
    if (category.imageUrl) {

      this.categoryImagePreview =
        category.imageUrl;

    }

    this.showCategoryModal = true;

  }


  closeCategoryModal(): void {

    this.showCategoryModal = false;

    this.clearCategoryImage();

  }


  /* =========================================================
     SAVE CATEGORY
  ========================================================= */

  saveCategory(): void {

    if (this.categoryForm.invalid) {

      this.categoryForm.markAllAsTouched();

      return;

    }

    const formValue =
      this.categoryForm.value;

    const selectedImage =
      this.categoryImageFile;

    this.categoriesLoading = true;

    this.categoriesError = '';


    /* EDIT */

    if (
      this.isEditCategory &&
      this.selectedCategoryId
    ) {

      const categoryId =
        this.selectedCategoryId;

      const updateData:
        UpdateCategoryRequest = {

        ...formValue

      };


      this.categoryService
        .updateCategory(
          categoryId,
          updateData
        )

        .subscribe({

          next: () => {

            if (!selectedImage) {

              this.categoriesLoading = false;

              this.closeCategoryModal();

              this.loadCategories();

              return;

            }


            this.uploadCategoryImageAfterSave(
              categoryId,
              selectedImage
            );

          },

          error: (err) => {

            this.categoriesLoading = false;

            this.categoriesError =
              'Update failed: ' +
              (
                err?.error?.message ||
                err?.message ||
                'Unknown error'
              );

          }

        });

      return;

    }


    /* CREATE */

    const createData:
      CreateCategoryRequest = {

      ...formValue

    };


    this.categoryService
      .createCategory(createData)

      .subscribe({

        next: (created) => {

          if (!selectedImage) {

            this.categoriesLoading = false;

            this.loadCategories();

            return;

          }


          this.uploadCategoryImageAfterSave(
            created.id,
            selectedImage
          );

        },

        error: (err) => {

          this.categoriesLoading = false;

          this.categoriesError =
            'Create failed: ' +
            (
              err?.error?.message ||
              err?.message ||
              'Unknown error'
            );

        }

      });

  }


  /* =========================================================
     CATEGORY IMAGE UPLOAD
  ========================================================= */

  private uploadCategoryImageAfterSave(
    categoryId: number,
    file: File
  ): void {

    this.categoryService
      .uploadCategoryImage(
        categoryId,
        file
      )

      .subscribe({

        next: () => {

          this.categoriesLoading = false;

          this.clearCategoryImage();

          this.loadCategories();

          this.showCategoryModal = true;

        },

        error: (err) => {

          this.categoriesLoading = false;

          this.categoriesError =
            'Category saved, but image upload failed: ' +
            (
              err?.error?.message ||
              err?.message ||
              'Unknown error'
            );

        }

      });

  }


  /* =========================================================
     CATEGORY FILE SELECTION
  ========================================================= */

  async onCategoryFileSelected(
    event: Event
  ): Promise<void> {

    const input =
      event.target as HTMLInputElement;

    if (
      !input.files ||
      input.files.length === 0
    ) {

      return;

    }

    const originalFile =
      input.files[0];

    try {

      this.imageProcessing = true;

      const compressedFile =
        await this.compressToWebP(
          originalFile,
          1600,
          1200,
          0.82
        );

      this.categoryImageFile =
        compressedFile;


      if (
        this.categoryImagePreview &&
        !this.categoryImagePreview.startsWith('http')
      ) {

        URL.revokeObjectURL(
          this.categoryImagePreview
        );

      }


      this.categoryImagePreview =
        URL.createObjectURL(
          compressedFile
        );

    }

    catch (err) {

      console.error(
        'Category image processing failed:',
        err
      );

      this.categoryImageFile = null;

      this.categoryImagePreview = null;

      this.categoriesError =
        'Could not process the category image.';

    }

    finally {

      this.imageProcessing = false;

      input.value = '';

    }

  }


  clearCategoryImage(): void {

    if (
      this.categoryImagePreview &&
      !this.categoryImagePreview.startsWith('http')
    ) {

      URL.revokeObjectURL(
        this.categoryImagePreview
      );

    }

    this.categoryImageFile = null;

    this.categoryImagePreview = null;

  }


  /* =========================================================
     DELETE CATEGORY
  ========================================================= */

  deleteCategory(
    id: number
  ): void {

    if (
      !confirm(
        'Are you sure you want to delete this category?'
      )
    ) {

      return;

    }


    this.categoryService
      .deleteCategory(id)

      .subscribe({

        next: () => {

          this.loadCategories();

          this.loadRooms();

        },

        error: (err) => {

          this.categoriesError =
            'Delete failed: ' +
            (
              err?.error?.message ||
              err?.message ||
              'Unknown error'
            );

        }

      });

  }


  /* =========================================================
     STATUS
  ========================================================= */

  getStatusLabel(
    status: string
  ): string {

    const map:
      Record<string, string> = {

      AVAILABLE:
        'Available',

      OCCUPIED:
        'Occupied',

      CLEANING:
        'Cleaning',

      MAINTENANCE:
        'Maintenance'

    };

    return map[status] || status;

  }


  /* =========================================================
     VIEW
  ========================================================= */

  getViewLabel(
    view: string | null | undefined
  ): string {

    if (!view) {
      return '';
    }

    return view
      .toString()
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(
        /\b\w/g,
        char =>
          char.toUpperCase()
      );

  }


  /* =========================================================
     BED TYPE
  ========================================================= */

  getBedTypeLabel(
    type: string | null | undefined
  ): string {

    if (!type) {
      return '';
    }

    return type
      .toString()
      .trim()
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(
        /\b\w/g,
        char =>
          char.toUpperCase()
      );

  }


  

}