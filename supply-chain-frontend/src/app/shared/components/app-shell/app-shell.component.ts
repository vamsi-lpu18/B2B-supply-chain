import { Component, inject, computed, signal, HostListener, DestroyRef } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { LoadingStore } from '../../../core/stores/loading.store';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { UserRole } from '../../../core/models/enums';
import { ToastContainerComponent } from '../toast-container/toast-container.component';

interface NavGroup { label: string; items: NavItem[]; }
interface NavItem  { label: string; icon: SafeHtml; route: string; roles?: UserRole[]; badge?: () => number; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ToastContainerComponent],
  template: `
    <div class="shell" [class.sidebar-collapsed]="sidebarCollapsed()">
      @if (loading.isLoading()) { <div class="loading-bar"></div> }

      <!-- ── Mobile overlay ── -->
      @if (mobileMenuOpen()) {
        <div class="mobile-overlay" (click)="closeMobileMenu()"></div>
      }

      <!-- ── Sidebar ── -->
      <aside class="sidebar" [class.mobile-open]="mobileMenuOpen()">
        <div class="sidebar-header">
          <div class="sidebar-logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" width="20" height="20">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </div>
          <div class="sidebar-brand" *ngIf="!sidebarCollapsed()">
            <span class="sidebar-brand-name">SupplyChain</span>
            <span class="sidebar-brand-sub">Platform</span>
          </div>
        </div>

        <nav class="sidebar-nav" aria-label="Primary navigation">
          @for (group of visibleGroups(); track group.label) {
            <div class="nav-group">
              <button
                *ngIf="!sidebarCollapsed()"
                type="button"
                class="nav-group-toggle"
                [attr.aria-expanded]="isGroupExpanded(group.label)"
                (click)="toggleGroup(group.label)">
                <span class="nav-group-label">{{ group.label }}</span>
                <svg class="nav-group-caret" [class.rotated]="isGroupExpanded(group.label)" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              <div class="nav-group-items" [class.expanded]="sidebarCollapsed() || isGroupExpanded(group.label)">
                @for (item of group.items; track item.route) {
                  <a [routerLink]="item.route" routerLinkActive="active"
                     class="nav-item" [title]="item.label"
                     (click)="closeMobileMenu()">
                    <span class="nav-icon" [innerHTML]="item.icon"></span>
                    <span class="nav-label" *ngIf="!sidebarCollapsed()">{{ item.label }}</span>
                    @if (item.badge && item.badge() > 0 && !sidebarCollapsed()) {
                      <span class="nav-badge">{{ item.badge() }}</span>
                    }
                  </a>
                }
              </div>
            </div>
          }
        </nav>

        <div class="sidebar-footer">
          <div class="sidebar-profile" (click)="$event.stopPropagation(); toggleProfileMenu()">
            <div class="sidebar-avatar">{{ userInitial() }}</div>
            <div class="sidebar-profile-info" *ngIf="!sidebarCollapsed()">
              <span class="sidebar-profile-name">{{ firstName() }}</span>
              <span class="sidebar-profile-role">{{ authStore.role() }}</span>
            </div>
            <svg *ngIf="!sidebarCollapsed()" class="sidebar-profile-caret" [class.rotated]="profileMenuOpen()" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </div>

          @if (profileMenuOpen()) {
            <div class="profile-menu" role="menu" aria-label="Profile menu">
              <a routerLink="/profile" class="profile-menu-item" role="menuitem" (click)="closeProfileMenu()">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                View Profile
              </a>
              <button type="button" class="profile-menu-item danger" role="menuitem" (click)="onLogoutFromMenu()">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                Logout
              </button>
            </div>
          }

          <button class="sidebar-collapse-btn" (click)="toggleSidebar()" *ngIf="!isMobile()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              @if (sidebarCollapsed()) {
                <polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/>
              } @else {
                <polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>
              }
            </svg>
            <span *ngIf="!sidebarCollapsed()">Collapse</span>
          </button>
        </div>
      </aside>

      <!-- ── Main ── -->
      <div class="main-area">
        <header class="topbar">
          <button class="topbar-hamburger" (click)="toggleMobileMenu()" *ngIf="isMobile()">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>

          <div class="topbar-breadcrumb">
            <span class="topbar-section">{{ currentSectionLabel() }}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
            <span class="topbar-page">{{ currentRouteLabel() }}</span>
          </div>

          <div class="topbar-search">
            <svg class="topbar-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search orders, products..." readonly>
            <kbd class="topbar-kbd">⌘K</kbd>
          </div>

          <div class="topbar-right">
            <span class="topbar-chip">{{ todayLabel() }}</span>

            @if (authStore.hasRole(UserRole.Dealer)) {
              <a routerLink="/cart" class="topbar-icon-btn" title="Cart">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                @if (cartStore.itemCount()>0) {
                  <span class="topbar-badge">{{ cartStore.itemCount() }}</span>
                }
              </a>
            }

            <a routerLink="/notifications" class="topbar-icon-btn" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </a>
          </div>
        </header>

        <main class="main-content"><router-outlet /></main>
      </div>

      <!-- ── Mobile bottom nav ── -->
      @if (isMobile()) {
        <nav class="mobile-nav">
          @for (item of mobileNavItems(); track item.route) {
            <a [routerLink]="item.route" routerLinkActive="active" class="mobile-nav-item">
              <span class="mobile-nav-icon" [innerHTML]="item.icon"></span>
              <span class="mobile-nav-label">{{ item.label }}</span>
              @if (item.badge && item.badge() > 0) {
                <span class="mobile-nav-badge">{{ item.badge() }}</span>
              }
            </a>
          }
        </nav>
      }
    </div>
    <app-toast-container />
  `,
  styles: [`
    :host { display: block; }

    /* ─── Shell ──────────────────────────────────────────────────── */
    .shell {
      display: flex;
      min-height: 100dvh;
      height: 100dvh;
      background: var(--bg);
      font-family: var(--font-sans);
      position: relative;
      overflow: hidden;
    }

    /* ─── Sidebar ───────────────────────────────────────────────── */
    .sidebar {
      width: var(--sidebar-width);
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      flex-shrink: 0;
      transition: width var(--t-slow) var(--ease);
      overflow: hidden;
      z-index: 700;
    }

    .sidebar-collapsed .sidebar {
      width: var(--sidebar-collapsed);
    }

    .sidebar-header {
      padding: 18px 16px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      min-height: 60px;
    }

    .sidebar-logo {
      width: 36px; height: 36px;
      background: linear-gradient(135deg, var(--brand-600) 0%, var(--brand-400) 100%);
      border-radius: var(--r-lg);
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 12px rgba(43,77,115,.3);
    }

    .sidebar-brand {
      display: flex;
      flex-direction: column;
      min-width: 0;
      animation: fadeIn .2s var(--ease);
    }
    .sidebar-brand-name {
      font-family: var(--font-display);
      font-size: 1.05rem;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -.02em;
      line-height: 1.2;
    }
    .sidebar-brand-sub {
      font-size: .62rem;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 600;
    }

    /* Nav */
    .sidebar-nav {
      flex: 1;
      overflow-y: auto;
      padding: 10px 8px;
      scrollbar-width: thin;
    }

    .nav-group {
      margin-bottom: 8px;
    }
    .nav-group-toggle {
      width: 100%;
      border: none;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 6px;
      border-radius: var(--r-md);
      cursor: pointer;
      color: var(--text-tertiary);
      transition: all var(--t-fast) var(--ease);
      font-family: inherit;
    }
    .nav-group-toggle:hover {
      background: var(--gray-50);
      color: var(--text-secondary);
    }
    .nav-group-label {
      font-size: .62rem;
      font-weight: 700;
      color: var(--text-tertiary);
      text-transform: uppercase;
      letter-spacing: .08em;
      padding: 0;
    }
    .nav-group-caret {
      color: currentColor;
      transition: transform var(--t-base) var(--ease);
      flex-shrink: 0;
    }
    .nav-group-caret.rotated {
      transform: rotate(180deg);
    }
    .nav-group-items {
      display: none;
      animation: fadeIn .15s var(--ease);
    }
    .nav-group-items.expanded {
      display: block;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: var(--r-md);
      color: var(--text-secondary);
      text-decoration: none;
      font-size: .84rem;
      font-weight: 600;
      transition: all var(--t-fast) var(--ease);
      position: relative;
      cursor: pointer;
      border: 1px solid transparent;
      margin-bottom: 2px;
    }
    .nav-item:hover {
      background: var(--gray-50);
      color: var(--text-primary);
    }
    .nav-item.active {
      background: var(--brand-50);
      color: var(--brand-700);
      font-weight: 700;
      border-color: var(--brand-100);
    }
    .nav-item.active::before {
      content: none;
    }

    .sidebar-collapsed .nav-item {
      justify-content: center;
      padding: 10px;
    }
    .sidebar-collapsed .nav-group-toggle { display: none; }
    .sidebar-collapsed .nav-group-label { display: none; }
    .sidebar-collapsed .nav-group-items { display: block; }

    .nav-icon {
      width: 18px; height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      opacity: .65;
      svg { width: 18px; height: 18px; }
    }
    .nav-item.active .nav-icon,
    .nav-item:hover .nav-icon { opacity: 1; }

    .nav-badge {
      margin-left: auto;
      min-width: 20px; height: 20px;
      background: var(--brand-600);
      color: #fff;
      border-radius: var(--r-full);
      font-size: .62rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 6px;
    }

    /* Sidebar footer */
    .sidebar-footer {
      padding: 10px 8px;
      border-top: 1px solid var(--border);
      position: relative;
    }
    .sidebar-profile {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: var(--r-lg);
      cursor: pointer;
      transition: background var(--t-fast) var(--ease);
    }
    .sidebar-profile:hover { background: var(--gray-50); }

    .sidebar-avatar {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--brand-600), #8b5cf6);
      border-radius: var(--r-full);
      display: flex; align-items: center; justify-content: center;
      color: #fff;
      font-weight: 700;
      font-size: .78rem;
      flex-shrink: 0;
    }
    .sidebar-profile-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column;
    }
    .sidebar-profile-name {
      font-size: .8rem;
      font-weight: 600;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .sidebar-profile-role {
      font-size: .68rem;
      color: var(--text-tertiary);
      font-weight: 500;
    }
    .sidebar-profile-caret {
      transition: transform var(--t-base) var(--ease);
      flex-shrink: 0;
    }
    .sidebar-profile-caret.rotated {
      transform: rotate(180deg);
    }

    .sidebar-collapsed .sidebar-profile {
      justify-content: center;
    }

    .profile-menu {
      position: absolute;
      left: 8px; right: 8px;
      bottom: calc(100% + 4px);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: 6px;
      box-shadow: var(--shadow-xl);
      display: flex;
      flex-direction: column;
      gap: 2px;
      animation: slideUp .2s var(--ease-spring);
      z-index: 900;
    }
    .profile-menu-item {
      display: flex; align-items: center; gap: 8px;
      border: none;
      background: transparent;
      text-align: left;
      width: 100%;
      border-radius: var(--r-sm);
      padding: 8px 10px;
      font-size: .8rem;
      font-weight: 600;
      color: var(--text-secondary);
      cursor: pointer;
      text-decoration: none;
      font-family: inherit;
      transition: all var(--t-fast) var(--ease);
      &:hover { background: var(--gray-50); color: var(--text-primary); }
    }
    .profile-menu-item.danger {
      color: #b91c1c;
      &:hover { background: var(--error-bg); color: #991b1b; }
    }

    .sidebar-collapse-btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 7px;
      margin-top: 6px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      border-radius: var(--r-md);
      color: var(--text-tertiary);
      font-size: .72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all var(--t-fast) var(--ease);
      font-family: inherit;
      &:hover { background: var(--gray-100); color: var(--text-secondary); }
    }

    /* ─── Topbar ──────────────────────────────────────────────── */
    .topbar {
      height: var(--topbar-height);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 20px;
      gap: 16px;
      flex-shrink: 0;
    }

    .topbar-hamburger {
      border: none; background: none;
      padding: 6px;
      border-radius: var(--r-md);
      color: var(--text-secondary);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      &:hover { background: var(--gray-100); }
    }

    .topbar-breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: .82rem;
      min-width: 0;
    }
    .topbar-section { color: var(--text-tertiary); font-weight: 500; }
    .topbar-page { color: var(--text-primary); font-weight: 600; }

    .topbar-search {
      flex: 1;
      max-width: 380px;
      margin-left: 12px;
      position: relative;
    }
    .topbar-search input {
      width: 100%;
      padding: 8px 12px 8px 36px;
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      font-size: .8rem;
      font-family: inherit;
      color: var(--text-primary);
      background: var(--surface-2);
      outline: none;
      transition: all var(--t-base) var(--ease);
      cursor: pointer;
    }
    .topbar-search input::placeholder { color: var(--text-tertiary); }
    .topbar-search input:focus {
      border-color: var(--brand-300);
      box-shadow: 0 0 0 3px var(--focus-ring);
      background: var(--surface);
      cursor: text;
    }
    .topbar-search-icon {
      position: absolute;
      left: 10px; top: 50%;
      transform: translateY(-50%);
      color: var(--text-tertiary);
      pointer-events: none;
    }
    .topbar-kbd {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      padding: 2px 6px; border-radius: 4px;
      background: var(--gray-100); border: 1px solid var(--gray-300);
      font-size: .62rem; font-weight: 600; color: var(--text-tertiary);
      font-family: var(--font-sans); line-height: 1.4; pointer-events: none;
    }

    .topbar-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .topbar-chip {
      height: 28px;
      padding: 0 10px;
      border-radius: var(--r-full);
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      font-size: .68rem;
      font-weight: 600;
      letter-spacing: .02em;
      white-space: nowrap;
    }

    .topbar-icon-btn {
      position: relative;
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border-radius: var(--r-md);
      color: var(--text-secondary);
      text-decoration: none;
      transition: all var(--t-fast) var(--ease);
      border: none;
      background: transparent;
      cursor: pointer;
      &:hover {
        background: var(--gray-100);
        color: var(--text-primary);
      }
    }
    .topbar-badge {
      position: absolute; top: 4px; right: 4px;
      background: var(--error);
      color: #fff;
      border-radius: 50%; width: 16px; height: 16px;
      font-size: .6rem; display: flex; align-items: center; justify-content: center;
      font-weight: 700; border: 2px solid var(--surface);
    }

    /* ─── Main ───────────────────────────────────────────────── */
    .main-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 100dvh;
      height: 100dvh;
      background: var(--bg);
    }

    .main-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      scrollbar-gutter: stable;
      padding-bottom: 20px;
      animation: contentReveal .35s var(--ease-out);
    }

    /* ─── Mobile overlay ─────────────────────────────────────── */
    .mobile-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15,23,42,.4);
      backdrop-filter: blur(4px);
      z-index: 650;
      animation: fadeIn .2s var(--ease);
    }

    /* ─── Mobile bottom nav ─────────────────────────────────── */
    .mobile-nav {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      background: var(--surface);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-around;
      padding: 6px 4px;
      padding-bottom: max(6px, env(safe-area-inset-bottom));
      z-index: 600;
      box-shadow: 0 -4px 12px rgba(0,0,0,.06);
    }
    .mobile-nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 6px 12px;
      border-radius: var(--r-md);
      text-decoration: none;
      color: var(--text-tertiary);
      font-size: .62rem;
      font-weight: 600;
      transition: all var(--t-fast) var(--ease);
      position: relative;
    }
    .mobile-nav-item.active {
      color: var(--brand-700);
    }
    .mobile-nav-icon {
      width: 22px; height: 22px;
      display: flex; align-items: center; justify-content: center;
      svg { width: 22px; height: 22px; }
    }
    .mobile-nav-badge {
      position: absolute;
      top: 2px; right: 6px;
      width: 14px; height: 14px;
      background: var(--error);
      color: #fff;
      font-size: .5rem;
      font-weight: 700;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
    }

    /* ─── Responsive ─────────────────────────────────────────── */
    @media (max-width: 768px) {
      .sidebar {
        position: fixed;
        left: 0; top: 0; bottom: 0;
        transform: translateX(-100%);
        z-index: 700;
        width: var(--sidebar-width);
        box-shadow: var(--shadow-2xl);
      }
      .sidebar.mobile-open {
        transform: translateX(0);
      }
      .topbar-search { display: none; }
      .topbar-chip { display: none; }
      .main-content { padding-bottom: 80px; }
    }

    @media (min-width: 769px) {
      .mobile-nav { display: none; }
      .topbar-hamburger { display: none; }
    }

    @media (max-width: 1100px) and (min-width: 769px) {
      .topbar-search { max-width: 260px; }
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes contentReveal {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sidebar, .main-content, .profile-menu, .mobile-overlay {
        animation: none !important;
        transition: none !important;
      }
    }
  `]
})
export class AppShellComponent {
  readonly authStore  = inject(AuthStore);
  readonly cartStore  = inject(CartStore);
  readonly loading    = inject(LoadingStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authApi = inject(AuthApiService);
  private readonly router  = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly UserRole   = UserRole;
  readonly profileMenuOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly expandedGroups = signal<Record<string, boolean>>({});
  readonly pendingOrderCount = signal(0);
  private windowWidth = signal(window.innerWidth);

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.closeMobileMenu();
      });
  }

  readonly userInitial = computed(() => (this.authStore.user()?.fullName ?? '?').charAt(0).toUpperCase());

  firstName(): string {
    const n = this.authStore.user()?.fullName ?? '';
    return n.split(' ')[0] ?? n;
  }

  isMobile(): boolean {
    return this.windowWidth() <= 768;
  }

  @HostListener('window:resize')
  onResize(): void {
    this.windowWidth.set(window.innerWidth);
    if (!this.isMobile()) {
      this.mobileMenuOpen.set(false);
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.profileMenuOpen()) {
      this.profileMenuOpen.set(false);
    }
  }

  toggleProfileMenu(): void { this.profileMenuOpen.update(v => !v); }
  closeProfileMenu(): void { this.profileMenuOpen.set(false); }
  toggleSidebar(): void { this.sidebarCollapsed.update(v => !v); }
  toggleMobileMenu(): void { this.mobileMenuOpen.update(v => !v); }
  closeMobileMenu(): void { this.mobileMenuOpen.set(false); }

  isGroupExpanded(label: string): boolean {
    return this.expandedGroups()[label] ?? true;
  }

  toggleGroup(label: string): void {
    this.expandedGroups.update(current => ({
      ...current,
      [label]: !(current[label] ?? true)
    }));
  }

  onLogoutFromMenu(): void {
    this.profileMenuOpen.set(false);
    this.logout();
  }

  private readonly icons: Record<string, SafeHtml> = {
    dashboard:     this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`),
    products:      this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`),
    cart:          this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`),
    orders:        this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`),
    shipments:     this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`),
    invoices:      this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`),
    notifications: this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`),
    dealers:       this.safeSvg(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`),
  };

  private safeSvg(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  private readonly allGroups: NavGroup[] = [
    { label: 'Overview', items: [
      { label: 'Dashboard', icon: this.icons['dashboard'], route: '/dashboard' },
    ]},
    { label: 'Catalog', items: [
      { label: 'Products', icon: this.icons['products'], route: '/products' },
      { label: 'Cart',     icon: this.icons['cart'],     route: '/cart', roles: [UserRole.Dealer], badge: () => this.cartStore.itemCount() },
    ]},
    { label: 'Operations', items: [
      { label: 'My Orders',  icon: this.icons['orders'],    route: '/orders',    roles: [UserRole.Dealer] },
      { label: 'All Orders', icon: this.icons['orders'],    route: '/orders',    roles: [UserRole.Admin, UserRole.Warehouse, UserRole.Logistics], badge: () => this.pendingOrderCount() },
      { label: 'Shipments',  icon: this.icons['shipments'], route: '/shipments', roles: [UserRole.Admin, UserRole.Logistics, UserRole.Agent, UserRole.Dealer] },
    ]},
    { label: 'Finance', items: [
      { label: 'Invoices', icon: this.icons['invoices'], route: '/invoices', roles: [UserRole.Admin, UserRole.Dealer] },
    ]},
    { label: 'System', items: [
      { label: 'Notifications', icon: this.icons['notifications'], route: '/notifications' },
      { label: 'Dealers',       icon: this.icons['dealers'],       route: '/admin/dealers', roles: [UserRole.Admin] },
      { label: 'Create Agent',  icon: this.icons['dealers'],       route: '/admin/agents/create', roles: [UserRole.Admin] },
    ]},
  ];

  readonly visibleGroups = computed(() => {
    const role = this.authStore.role();
    return this.allGroups
      .map(g => ({ ...g, items: g.items.filter(i => this.isRoleAllowed(i, role)) }))
      .filter(g => g.items.length > 0);
  });

  readonly visibleNavItems = computed(() => {
    return this.visibleGroups().flatMap(g => g.items);
  });

  readonly mobileNavItems = computed(() => {
    const all = this.visibleNavItems();
    // Show max 5 items in mobile nav
    return all.slice(0, 5);
  });

  currentSectionLabel(): string {
    const role = this.authStore.role();
    const url = this.router.url || '';
    const group = this.allGroups.find(g => g.items.some(i => this.isRoleAllowed(i, role) && this.routeMatches(url, i.route)));
    return group?.label ?? 'Workspace';
  }

  currentRouteLabel(): string {
    const role = this.authStore.role();
    const url = this.router.url || '';
    const matches = this.allGroups
      .flatMap(g => g.items)
      .filter(i => this.isRoleAllowed(i, role) && this.routeMatches(url, i.route))
      .sort((a, b) => b.route.length - a.route.length);
    return matches[0]?.label ?? 'SupplyChain';
  }

  todayLabel(): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    }).format(new Date());
  }

  private isRoleAllowed(item: NavItem, role: UserRole | null | undefined): boolean {
    return !item.roles || (!!role && item.roles.includes(role));
  }

  private routeMatches(currentUrl: string, route: string): boolean {
    return currentUrl === route || currentUrl.startsWith(`${route}/`) || currentUrl.startsWith(`${route}?`);
  }

  logout(): void {
    this.authApi.logout().subscribe({
      complete: () => { this.authStore.clear(); this.cartStore.clear(); this.router.navigate(['/login']); },
      error:    () => { this.authStore.clear(); this.cartStore.clear(); this.router.navigate(['/login']); }
    });
  }
}
