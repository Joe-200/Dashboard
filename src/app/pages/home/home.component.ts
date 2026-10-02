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
const THEME_STORAGE_KEY   = 'lytc.theme';

export type ThemePref = 'light' | 'dark' | 'midnight' | 'system';

interface ThemeOption {
  value: ThemePref;
  label: string;
  hint: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {

  /* ---------- Sidebar ---------- */
  collapsed = this.loadCollapsedState();

  /* ---------- Theme ---------- */
  themePref: ThemePref = this.loadThemePref();
  themeMenuOpen = false;
  themeMenuPos = { x: 0, bottom: 0 };

  readonly themeOptions: ThemeOption[] = [
    { value: 'light',    label: 'Light',    hint: 'Bright & clean' },
    { value: 'dark',     label: 'Dark',     hint: 'Zinc, low glare' },
    { value: 'midnight', label: 'Midnight', hint: 'Deep navy' },
    { value: 'system',   label: 'System',   hint: 'Match your OS' }
  ];

  private media: MediaQueryList | null = null;

  get user() {
    return this.auth.getUser();
  }

  get themeLabel(): string {
    return this.themeOptions.find(o => o.value === this.themePref)?.label ?? 'Theme';
  }

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {
    if (typeof window !== 'undefined') {
      this.media = window.matchMedia('(prefers-color-scheme: dark)');
      this.media.addEventListener('change', () => {
        if (this.themePref === 'system') this.applyTheme(false);
      });
      this.applyTheme(false); // initial — no cross-fade
    }
  }

  /* ---------- Sidebar behaviour ---------- */
  toggleSidebar(): void {
    this.collapsed = !this.collapsed;
    this.saveCollapsedState();
  }

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

  /* ---------- Theme behaviour ---------- */
  toggleThemeMenu(event: MouseEvent): void {
    event.stopPropagation();

    if (this.themeMenuOpen) {
      this.themeMenuOpen = false;
      return;
    }

    const btn  = event.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 232;

    // Default: open to the right of the trigger (i.e. over the workspace)
    let left = rect.right + 8;
    // If it would overflow, flip to the left of the trigger
    if (left + menuWidth > window.innerWidth - 8) {
      left = Math.max(8, rect.left - menuWidth - 8);
    }

    this.themeMenuPos = {
      x: left,
      bottom: window.innerHeight - rect.bottom
    };
    this.themeMenuOpen = true;
  }

  setTheme(theme: ThemePref): void {
    if (theme === this.themePref) {
      this.themeMenuOpen = false;
      return;
    }
    this.themePref = theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* ignore */ }
    this.applyTheme(true);
    this.themeMenuOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.themeMenuOpen) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('.theme-menu') || target?.closest('.theme-trigger')) return;
    this.themeMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.themeMenuOpen = false;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.themeMenuOpen = false;
  }

  /* ---------- Theme internals ---------- */
  private applyTheme(animate: boolean): void {
    if (typeof document === 'undefined') return;

    const resolved: 'light' | 'dark' | 'midnight' =
      this.themePref === 'system'
        ? (this.media?.matches ? 'dark' : 'light')
        : this.themePref;

    const root = document.documentElement;

    if (animate) {
      root.classList.add('theme-transition');
      window.setTimeout(() => root.classList.remove('theme-transition'), 260);
    }

    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-theme-pref', this.themePref);
  }

  private loadThemePref(): ThemePref {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' ||
          saved === 'midnight' || saved === 'system') {
        return saved;
      }
    } catch { /* storage unavailable */ }
    return 'system';
  }

  /* ---------- Sidebar persistence ---------- */
  private loadCollapsedState(): boolean {
    try {
      const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (saved !== null) return saved === 'true';
    } catch { /* storage unavailable */ }
    return typeof window !== 'undefined' && window.innerWidth <= 1024;
  }

  private saveCollapsedState(): void {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(this.collapsed));
    } catch { /* ignore */ }
  }
}