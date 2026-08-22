import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from './auth-service.service'; // adjust path

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private auth: AuthService, private router: Router) {}

  canActivate(): boolean {
  const token = localStorage.getItem('token'); // direct read
  console.log('🔐 Guard sees token:', token);
  if (token) {
    return true;
  } else {
    this.router.navigate(['/login']);
    return false;
  }
}}