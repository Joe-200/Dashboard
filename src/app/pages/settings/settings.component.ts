
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import {
  SettingsService,
  UserResponse,
  TenantResponse,
  StaffRole,
  SystemRole,
  CreateTenantRequest,
  CreateSystemUserRequest,
} from  '../../settings.service';

type Tab = 'users' | 'tenants' | 'system-users';

type DeleteTarget = {
  type: 'user' | 'tenant' | 'system-user';
  id: number | string;
  label: string;
};

type UserFormModel = {
  username: string;
  password: string;
  role: StaffRole;
};

type SystemUserFormModel = {
  username: string;
  password: string;
  role: SystemRole;
};

type EditTenantFormModel = {
  email: string;
  hpmsAccountUuid: string;
};

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css',
})
export class SettingsComponent implements OnInit {
  private readonly api = inject(SettingsService);

  /* =========================================================
     AUTH / ROLE
  ========================================================= */
  readonly isAdmin = signal(false);

  constructor() {
    this.detectRole();
    // ADMIN users do not manage hotel staff — start on Hotels.
    this.activeTab.set(this.isAdmin() ? 'tenants' : 'users');
  }

  private detectRole(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem('user');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      this.isAdmin.set(parsed?.role === 'ADMIN');
    } catch {
      this.isAdmin.set(false);
    }
  }

  /* =========================================================
     TABS
  ========================================================= */
  readonly activeTab = signal<Tab>('users');

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'tenants' && this.tenants().length === 0) this.loadTenants();
    if (tab === 'system-users' && this.systemUsers().length === 0) {
      this.loadSystemUsers();
    }
    if (tab === 'users' && this.users().length === 0) this.loadUsers();
  }

  /* =========================================================
     STAFF USERS  (hidden from ADMIN)
  ========================================================= */
  readonly users = signal<UserResponse[]>([]);
  readonly usersLoading = signal(false);
  readonly usersError = signal('');
  readonly usersPage = signal(0);
  readonly usersSize = signal(10);
  readonly usersTotal = signal(0);

  readonly userModalOpen = signal(false);
  readonly editingUserId = signal<number | null>(null);
  readonly userForm = signal<UserFormModel>({
    username: '',
    password: '',
    role: 'STAFF',
  });
  readonly userFormError = signal('');
  readonly userFormSubmitting = signal(false);

  readonly staffRoles: StaffRole[] = [
    'MANAGER', 'CHEF', 'BARISTA', 'ROOM_SERVICE', 'STAFF', 'GUEST',
  ];

  ngOnInit(): void {
    if (this.isAdmin()) {
      // Load only what ADMIN sees
      this.loadTenants();
    } else {
      this.loadUsers();
    }
  }

  loadUsers(): void {
    if (this.isAdmin()) return; // safety: never load for ADMIN
    this.usersLoading.set(true);
    this.usersError.set('');
    this.api.getUsers(this.usersPage(), this.usersSize()).subscribe({
      next: (res) => {
        this.users.set(res.content ?? []);
        this.usersTotal.set(res.page?.totalElements ?? 0);
        this.usersLoading.set(false);
      },
      error: (err) => {
        this.usersError.set(this.describeError(err, 'Failed to load users.'));
        this.usersLoading.set(false);
      },
    });
  }

  updateUserForm(field: keyof UserFormModel, value: any): void {
    const current = this.userForm();
    this.userForm.set({ ...current, [field]: value });
  }

  openCreateUser(): void {
    this.editingUserId.set(null);
    this.userForm.set({ username: '', password: '', role: 'STAFF' });
    this.userFormError.set('');
    this.userModalOpen.set(true);
  }

  openEditUser(u: UserResponse): void {
    this.editingUserId.set(u.id);
    this.userForm.set({
      username: u.username,
      password: '',
      role: u.role as StaffRole,
    });
    this.userFormError.set('');
    this.userModalOpen.set(true);
  }

  closeUserModal(): void {
    if (this.userFormSubmitting()) return;
    this.userModalOpen.set(false);
  }

  submitUserForm(): void {
    const form = this.userForm();
    const editingId = this.editingUserId();

    if (!form.username.trim()) {
      this.userFormError.set('Username is required.');
      return;
    }
    if (!editingId && !form.password) {
      this.userFormError.set('Password is required.');
      return;
    }
    if (!form.role) {
      this.userFormError.set('Role is required.');
      return;
    }

    this.userFormSubmitting.set(true);
    this.userFormError.set('');

    if (editingId) {
      const req: { username: string; role: StaffRole; password?: string } = {
        username: form.username.trim(),
        role: form.role,
      };
      if (form.password) req.password = form.password;

      this.api.updateUser(editingId, req).subscribe({
        next: () => this.afterUserSaved(),
        error: (err) => {
          this.userFormError.set(this.describeError(err, 'Failed to update user.'));
          this.userFormSubmitting.set(false);
        },
      });
    } else {
      this.api.createUser({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      }).subscribe({
        next: () => this.afterUserSaved(),
        error: (err) => {
          this.userFormError.set(this.describeError(err, 'Failed to create user.'));
          this.userFormSubmitting.set(false);
        },
      });
    }
  }

  private afterUserSaved(): void {
    this.userFormSubmitting.set(false);
    this.userModalOpen.set(false);
    this.loadUsers();
  }

  prevUsersPage(): void {
    if (this.usersPage() === 0) return;
    this.usersPage.set(this.usersPage() - 1);
    this.loadUsers();
  }

  nextUsersPage(): void {
    if ((this.usersPage() + 1) * this.usersSize() >= this.usersTotal()) return;
    this.usersPage.set(this.usersPage() + 1);
    this.loadUsers();
  }

  /* =========================================================
     TENANTS (ADMIN only)
  ========================================================= */
  readonly tenants = signal<TenantResponse[]>([]);
  readonly tenantsLoading = signal(false);
  readonly tenantsError = signal('');
  readonly tenantsPage = signal(0);
  readonly tenantsSize = signal(10);
  readonly tenantsTotal = signal(0);

  readonly tenantModalOpen = signal(false);
  readonly tenantForm = signal<CreateTenantRequest>({
    id: '',
    name: '',
    email: '',
    schemaName: '',
    timezone: 'UTC',
    hpmsAccountUuid: '',
    managerUsername: '',
    managerPassword: '',
  });
  readonly tenantFormError = signal('');
  readonly tenantFormSubmitting = signal(false);

  loadTenants(): void {
    this.tenantsLoading.set(true);
    this.tenantsError.set('');
    this.api.getTenants(this.tenantsPage(), this.tenantsSize()).subscribe({
      next: (res) => {
        this.tenants.set(res.content ?? []);
        this.tenantsTotal.set(res.page?.totalElements ?? 0);
        this.tenantsLoading.set(false);
      },
      error: (err) => {
        this.tenantsError.set(this.describeError(err, 'Failed to load hotels.'));
        this.tenantsLoading.set(false);
      },
    });
  }

  updateTenantForm(field: keyof CreateTenantRequest, value: any): void {
    const current = this.tenantForm();
    this.tenantForm.set({ ...current, [field]: value });
  }

  openCreateTenant(): void {
    this.tenantForm.set({
      id: '',
      name: '',
      email: '',
      schemaName: '',
      timezone: 'UTC',
      hpmsAccountUuid: '',
      managerUsername: '',
      managerPassword: '',
    });
    this.tenantFormError.set('');
    this.tenantModalOpen.set(true);
  }

  closeTenantModal(): void {
    if (this.tenantFormSubmitting()) return;
    this.tenantModalOpen.set(false);
  }

  submitTenantForm(): void {
    const f = this.tenantForm();
    if (!f.id.trim() || !f.name.trim() || !f.schemaName.trim()
        || !f.timezone.trim() || !f.managerUsername.trim()
        || !f.managerPassword) {
      this.tenantFormError.set('Please fill all required fields.');
      return;
    }
    if (!/^[a-z0-9_]+$/.test(f.id) || !/^[a-z0-9_]+$/.test(f.schemaName)) {
      this.tenantFormError.set('ID and Schema name may contain only a-z, 0-9 and _');
      return;
    }

    this.tenantFormSubmitting.set(true);
    this.tenantFormError.set('');
    this.api.createTenant({
      id: f.id.trim(),
      name: f.name.trim(),
      email: f.email?.trim() || undefined,
      schemaName: f.schemaName.trim(),
      timezone: f.timezone.trim(),
      hpmsAccountUuid: f.hpmsAccountUuid?.trim() || undefined,
      managerUsername: f.managerUsername.trim(),
      managerPassword: f.managerPassword,
    }).subscribe({
      next: () => {
        this.tenantFormSubmitting.set(false);
        this.tenantModalOpen.set(false);
        this.loadTenants();
      },
      error: (err) => {
        this.tenantFormError.set(this.describeError(err, 'Failed to create hotel.'));
        this.tenantFormSubmitting.set(false);
      },
    });
  }

  toggleTenantStatus(t: TenantResponse): void {
    const call = t.status === 'ACTIVE'
      ? this.api.deactivateTenant(t.id)
      : this.api.activateTenant(t.id);
    call.subscribe({
      next: (updated) => {
        const list = this.tenants();
        this.tenants.set(list.map((x) => (x.id === updated.id ? updated : x)));
      },
      error: (err) => {
        this.tenantsError.set(
          this.describeError(err, 'Failed to update hotel status.')
        );
      },
    });
  }

  prevTenantsPage(): void {
    if (this.tenantsPage() === 0) return;
    this.tenantsPage.set(this.tenantsPage() - 1);
    this.loadTenants();
  }

  nextTenantsPage(): void {
    if ((this.tenantsPage() + 1) * this.tenantsSize() >= this.tenantsTotal()) return;
    this.tenantsPage.set(this.tenantsPage() + 1);
    this.loadTenants();
  }

  /* ---------- Edit Tenant (email + hpms) ---------- */
  readonly editTenantModalOpen = signal(false);
  readonly editingTenant = signal<TenantResponse | null>(null);
  readonly editTenantForm = signal<EditTenantFormModel>({
    email: '',
    hpmsAccountUuid: '',
  });
  readonly editTenantFormError = signal('');
  readonly editTenantFormSubmitting = signal(false);

  updateEditTenantForm(field: keyof EditTenantFormModel, value: string): void {
    const current = this.editTenantForm();
    this.editTenantForm.set({ ...current, [field]: value });
  }

  openEditTenant(t: TenantResponse): void {
    this.editingTenant.set(t);
    this.editTenantForm.set({
      email: t.email ?? '',
      hpmsAccountUuid: t.hpmsAccountUuid ?? '',
    });
    this.editTenantFormError.set('');
    this.editTenantModalOpen.set(true);
  }

  closeEditTenantModal(): void {
    if (this.editTenantFormSubmitting()) return;
    this.editTenantModalOpen.set(false);
  }

  submitEditTenantForm(): void {
    const t = this.editingTenant();
    if (!t) return;

    const f = this.editTenantForm();
    const emailChanged = f.email.trim() !== (t.email ?? '').trim();
    const hpmsChanged  = f.hpmsAccountUuid.trim() !== (t.hpmsAccountUuid ?? '').trim();

    if (!emailChanged && !hpmsChanged) {
      this.editTenantModalOpen.set(false);
      return;
    }

    if (emailChanged && !f.email.trim()) {
      this.editTenantFormError.set('Email cannot be empty.');
      return;
    }

    this.editTenantFormSubmitting.set(true);
    this.editTenantFormError.set('');

    const ops: Observable<TenantResponse>[] = [];
    if (emailChanged) {
      ops.push(this.api.updateTenantEmail(t.id, f.email.trim()));
    }
    if (hpmsChanged) {
      ops.push(this.api.updateHpmsAccount(t.id, f.hpmsAccountUuid.trim()));
    }

    forkJoin(ops).subscribe({
      next: () => {
        this.editTenantFormSubmitting.set(false);
        this.editTenantModalOpen.set(false);
        this.loadTenants();
      },
      error: (err) => {
        this.editTenantFormError.set(
          this.describeError(err, 'Failed to update hotel.')
        );
        this.editTenantFormSubmitting.set(false);
      },
    });
  }

  /* =========================================================
     SYSTEM USERS (ADMIN only)
  ========================================================= */
  readonly systemUsers = signal<UserResponse[]>([]);
  readonly systemUsersLoading = signal(false);
  readonly systemUsersError = signal('');

  readonly systemUserModalOpen = signal(false);
  readonly systemUserForm = signal<SystemUserFormModel>({
    username: '',
    password: '',
    role: 'ADMIN',
  });
  readonly systemUserFormError = signal('');
  readonly systemUserFormSubmitting = signal(false);

  readonly systemRoles: SystemRole[] = ['ADMIN', 'MONITOR'];

  loadSystemUsers(): void {
    this.systemUsersLoading.set(true);
    this.systemUsersError.set('');
    this.api.getSystemUsers().subscribe({
      next: (list) => {
        this.systemUsers.set(list ?? []);
        this.systemUsersLoading.set(false);
      },
      error: (err) => {
        this.systemUsersError.set(
          this.describeError(err, 'Failed to load system users.')
        );
        this.systemUsersLoading.set(false);
      },
    });
  }

  updateSystemUserForm(field: keyof SystemUserFormModel, value: any): void {
    const current = this.systemUserForm();
    this.systemUserForm.set({ ...current, [field]: value });
  }

  openCreateSystemUser(): void {
    this.systemUserForm.set({ username: '', password: '', role: 'ADMIN' });
    this.systemUserFormError.set('');
    this.systemUserModalOpen.set(true);
  }

  closeSystemUserModal(): void {
    if (this.systemUserFormSubmitting()) return;
    this.systemUserModalOpen.set(false);
  }

  submitSystemUserForm(): void {
    const f = this.systemUserForm();
    if (!f.username.trim() || !f.password || !f.role) {
      this.systemUserFormError.set('Please fill all fields.');
      return;
    }
    this.systemUserFormSubmitting.set(true);
    this.systemUserFormError.set('');
    this.api.createSystemUser({
      username: f.username.trim(),
      password: f.password,
      role: f.role,
    }).subscribe({
      next: () => {
        this.systemUserFormSubmitting.set(false);
        this.systemUserModalOpen.set(false);
        this.loadSystemUsers();
      },
      error: (err) => {
        this.systemUserFormError.set(
          this.describeError(err, 'Failed to create system user.')
        );
        this.systemUserFormSubmitting.set(false);
      },
    });
  }

  /* =========================================================
     DELETE CONFIRMATION
  ========================================================= */
  readonly deleteConfirm = signal<DeleteTarget | null>(null);
  readonly deleteSubmitting = signal(false);
  readonly deleteError = signal('');

  askDeleteUser(u: UserResponse): void {
    this.deleteError.set('');
    this.deleteConfirm.set({ type: 'user', id: u.id, label: u.username });
  }

  askDeleteTenant(t: TenantResponse): void {
    this.deleteError.set('');
    this.deleteConfirm.set({ type: 'tenant', id: t.id, label: t.name });
  }

  askDeleteSystemUser(u: UserResponse): void {
    this.deleteError.set('');
    this.deleteConfirm.set({ type: 'system-user', id: u.id, label: u.username });
  }

  cancelDelete(): void {
    if (this.deleteSubmitting()) return;
    this.deleteConfirm.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteConfirm();
    if (!target) return;
    this.deleteSubmitting.set(true);
    this.deleteError.set('');

    const onSuccess = () => {
      this.deleteSubmitting.set(false);
      this.deleteConfirm.set(null);
      if (target.type === 'user') this.loadUsers();
      if (target.type === 'tenant') this.loadTenants();
      if (target.type === 'system-user') this.loadSystemUsers();
    };
    const onError = (err: unknown) => {
      this.deleteSubmitting.set(false);
      this.deleteError.set(this.describeError(err, 'Failed to delete.'));
    };

    if (target.type === 'user') {
      this.api.deleteUser(target.id as number)
        .subscribe({ next: onSuccess, error: onError });
    } else if (target.type === 'tenant') {
      this.api.deleteTenant(target.id as string)
        .subscribe({ next: onSuccess, error: onError });
    } else {
      this.api.deleteSystemUser(target.id as number)
        .subscribe({ next: onSuccess, error: onError });
    }
  }

  /* =========================================================
     HELPERS
  ========================================================= */
  totalPages(total: number, size: number): number {
    if (!size) return 1;
    return Math.max(1, Math.ceil(total / size));
  }

  private describeError(err: any, fallback: string): string {
    if (!err) return fallback;
    if (typeof err.error === 'string' && err.error.trim()) return err.error;
    if (err.error?.message) return err.error.message;
    if (err.message) return err.message;
    return fallback;
  }
}