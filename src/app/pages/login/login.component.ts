import { Component } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../auth-service.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  loginForm: FormGroup;
  isLoading = false;
  errorMessage = '';
  showPassword = false; 

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router
  ) {
    this.loginForm = this.fb.group({
      username: ['', Validators.required],
      password: ['', Validators.required],
      hotelId: ['', Validators.required]
    });
  }

  /**
   * Toggle password visibility (show/hide)
   */
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) return;

    this.isLoading = true;
    this.errorMessage = '';

    const { username, password, hotelId } = this.loginForm.value;

    this.auth.login({ username, password, hotelId }).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['']);
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Invalid credentials. Please try again.';
        console.error('Login error:', err);
      }
    });
  }
}