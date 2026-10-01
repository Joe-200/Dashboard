import { Component, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Router,
  RouterOutlet,
  RouterLink,
  RouterLinkActive
} from '@angular/router';
import { AuthService } from '../../auth-service.service';

const SIDEBAR_STORAGE_KEY = 'lytc.sidebar.collapsed';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {

  /** true = icons only, false = full sidebar */
  collapsed = this.loadCollapsedState();

  get user() {
    return this.auth.getUser();
  }

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  toggleSidebar(): void {
    this.collapsed = !this.collapsed;
    this.saveCollapsedState();
  }

  /** Ctrl/⌘ + B toggles the sidebar */
  @HostListener('window:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      this.toggleSidebar();
    }
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  private loadCollapsedState(): boolean {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) {
        return saved === 'true';
      }
    } catch {
      /* storage unavailable — fall through to default */
    }
    // No saved preference: start collapsed on narrower screens
    return typeof window !== 'undefined' && window.innerWidth <= 1024;
  }

  private saveCollapsedState(): void {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(this.collapsed));
    } catch {
      /* ignore */
    }
  }
}