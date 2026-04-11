import { Component, inject, computed, signal, HostListener, DestroyRef } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { LoadingStore } from '../../../core/stores/loading.store';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { UserRole } from '../../../core/models/enums';
import { ToastContainerComponent } from '../toast-container/toast-container.component';

interface NavGroup { label: string; items: NavItem[]; }
interface NavItem  { label: string; icon: string; route: string; roles?: UserRole[]; badge?: () => number; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, ToastContainerComponent],
  template: `
    <div class="shell">
      @if (loading.isLoading()) { <div class="loading-bar"></div> }

      <!-- ── Main ── -->
      <div class="main-wrap">
        <header class="topbar">
          <div class="tb-left">
            <div class="tb-route">
              <span class="tb-kicker">{{ currentSectionLabel() }}</span>
              <span class="tb-app-name" [class.typing-a]="typingFlip()" [class.typing-b]="!typingFlip()">{{ currentRouteLabel() }}</span>
            </div>

            <nav class="tb-nav" aria-label="Primary navigation">
              @for (item of visibleNavItems(); track item.route) {
                <a [routerLink]="item.route" routerLinkActive="active" class="tb-nav-item" [title]="item.label">
                  <span class="tb-nav-icon" [innerHTML]="item.icon"></span>
                  <span class="tb-nav-label">{{ item.label }}</span>
                  @if (item.badge && item.badge() > 0) {
                    <span class="tb-nav-badge">{{ item.badge() }}</span>
                  }
                </a>
              }
            </nav>
          </div>
          <div class="tb-right">
            <span class="tb-chip">{{ todayLabel() }}</span>
            <span class="tb-chip tb-chip-role">{{ authStore.role() }}</span>
            @if (authStore.hasRole(UserRole.Dealer)) {
              <a routerLink="/cart" class="tb-icon-btn" title="Cart">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                </svg>
                @if (cartStore.itemCount()>0) {
                  <span class="tb-badge">{{ cartStore.itemCount() }}</span>
                }
              </a>
            }
            <a routerLink="/notifications" class="tb-icon-btn" title="Notifications">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </a>
            <div class="tb-sep"></div>
            <div class="tb-profile-wrap" (click)="$event.stopPropagation()">
              <button
                type="button"
                class="tb-profile"
                aria-haspopup="menu"
                [attr.aria-expanded]="profileMenuOpen()"
                (click)="toggleProfileMenu()">
                <div class="tb-ava">{{ userInitial() }}</div>
                <div class="tb-profile-text">
                  <span class="tb-profile-name">{{ firstName() }}</span>
                  <span class="tb-profile-role">{{ authStore.role() }}</span>
                </div>
                <svg class="tb-profile-caret" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              @if (profileMenuOpen()) {
                <div class="tb-profile-menu" role="menu" aria-label="Profile menu">
                  <a routerLink="/profile" class="tb-menu-item" role="menuitem" (click)="closeProfileMenu()">View profile</a>
                  <button type="button" class="tb-menu-item tb-menu-danger" role="menuitem" (click)="onLogoutFromMenu()">Logout</button>
                </div>
              }
            </div>
          </div>
        </header>
        <main class="main-content"><router-outlet /></main>
      </div>
    </div>
    <app-toast-container />
  `,
  styles: [`
    :host { display: block; }

    /* ─── Shell wrapper ─────────────────────────────────────────────── */
    .shell {
      display: flex;
      min-height: 100vh;
      background:
        radial-gradient(980px 620px at 106% -8%, rgba(34, 56, 80, 0.42), transparent 62%),
        radial-gradient(860px 520px at -10% 36%, rgba(57, 84, 113, 0.30), transparent 60%),
        linear-gradient(160deg, #d6e2ee 0%, #c9d8e8 48%, #bfcfdf 100%);
      font-family: var(--font-sans);
      position: relative;
      isolation: isolate;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background-image:
          linear-gradient(rgba(100, 124, 149, 0.10) 1px, transparent 1px),
          linear-gradient(90deg, rgba(100, 124, 149, 0.10) 1px, transparent 1px);
        background-size: 42px 42px;
        mask-image: radial-gradient(circle at 50% 12%, #000 32%, transparent 88%);
        z-index: 0;
      }
    }

    /* ─── Main area ─────────────────────────────────────────────────── */
    .main-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      transition: filter 180ms ease;
      position: relative;
      z-index: 1;
    }

    /* ─── Topbar ─────────────────────────────────────────────────────── */
    .topbar {
      min-height: 72px;
      background: linear-gradient(180deg, rgba(221, 233, 245, .58) 0%, rgba(204, 219, 234, .44) 100%);
      border: 1px solid rgba(143, 167, 190, .60);
      border-radius: 0;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 10px 18px;
      gap: 10px;
      position: sticky;
      top: 0;
      z-index: 600;
      backdrop-filter: blur(16px) saturate(1.18);
      -webkit-backdrop-filter: blur(16px) saturate(1.18);
      margin: 0;
      border-left: none;
      border-right: none;
      border-top: none;
      box-shadow: 0 14px 30px rgba(14, 28, 43, 0.18);
      overflow: visible;

      &::before {
        content: '';
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: linear-gradient(115deg, transparent 30%, rgba(60, 89, 118, .14) 50%, transparent 70%);
        transform: translateX(-120%);
        animation: topbarSweep 12s linear infinite;
      }

      > * {
        position: relative;
        z-index: 1;
      }
    }
    .tb-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1 1 auto;
    }
    .tb-route {
      display: flex;
      flex-direction: column;
      gap: 1px;
      line-height: 1.1;
      inline-size: 156px;
      flex: 0 0 156px;
    }

    .tb-kicker {
      font-size: .64rem;
      font-weight: 700;
      letter-spacing: .11em;
      color: var(--text-secondary);
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .tb-app-name {
      font-size: 1.03rem;
      font-weight: 800;
      color: var(--text-primary);
      letter-spacing: -.02em;
      line-height: 1.1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      border-right: 2px solid transparent;
    }
    .tb-app-name.typing-a {
      animation:
        routeTyping 2.8s steps(30, end) .08s both,
        caretBlink .8s step-end 9;
    }
    .tb-app-name.typing-b {
      animation:
        routeTypingAlt 2.8s steps(30, end) .08s both,
        caretBlink .8s step-end 9;
    }

    .tb-nav {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1 1 auto;
      width: 100%;
      overflow-x: auto;
      padding: 5px;
      scrollbar-width: none;
      border-radius: 15px;
      border: none;
      background: transparent;
      box-shadow: none;
    }
    .tb-nav::-webkit-scrollbar { display: none; }

    .tb-nav-item {
      height: 36px;
      border-radius: 11px;
      border: none;
      padding: 0 11px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: var(--text-secondary);
      text-decoration: none;
      font-size: .79rem;
      font-weight: 700;
      letter-spacing: .01em;
      white-space: nowrap;
      transition: background var(--t-base) var(--ease), color var(--t-base) var(--ease), box-shadow var(--t-base) var(--ease);

      &:hover {
        background: linear-gradient(180deg, rgba(233,242,250,.62) 0%, rgba(214,227,240,.48) 100%);
        color: var(--text-primary);
        box-shadow: 0 8px 16px rgba(41, 63, 87, 0.24);
      }

      &.active {
        background: linear-gradient(145deg, rgba(236,245,252,.70) 0%, rgba(214,227,240,.58) 68%, rgba(196,213,229,.54) 100%);
        color: var(--brand-700);
        box-shadow: 0 10px 18px rgba(34, 54, 77, 0.30);
      }
    }

    .tb-nav-icon {
      width: 14px;
      height: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;

      svg {
        width: 14px;
        height: 14px;
      }
    }
    .tb-nav-label { line-height: 1; }
    .tb-nav-badge {
      min-width: 16px;
      height: 16px;
      border-radius: 999px;
      background: var(--brand-700);
      color: #ffffff;
      font-size: .6rem;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    .tb-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
      flex: 0 0 auto;
      margin-left: 12px;
    }
    .tb-chip {
      height: 29px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid rgba(143, 167, 190, .66);
      background: linear-gradient(180deg, rgba(235,244,252,.64) 0%, rgba(214,228,241,.50) 100%);
      color: var(--text-secondary);
      display: inline-flex;
      align-items: center;
      font-size: .68rem;
      font-weight: 700;
      letter-spacing: .04em;
      text-transform: uppercase;
      white-space: nowrap;
      box-shadow: 0 6px 12px rgba(14, 28, 43, 0.18);
    }
    .tb-chip-role {
      border-color: rgba(135, 161, 186, .70);
      color: #2f506f;
      background: linear-gradient(180deg, rgba(226,238,249,.66) 0%, rgba(204,220,236,.52) 100%);
    }
    .tb-icon-btn {
      position: relative;
      width: 38px; height: 38px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px;
      color: var(--text-secondary);
      text-decoration: none;
      transition: color 140ms, background 140ms, box-shadow 140ms, border-color 140ms;
      border: 1px solid transparent;
      &:hover {
        background: linear-gradient(180deg, rgba(232,242,251,.64) 0%, rgba(212,226,240,.50) 100%);
        border-color: rgba(135, 161, 186, .70);
        color: var(--text-primary);
        box-shadow: 0 10px 18px rgba(14, 28, 43, 0.20);
      }
    }
    .tb-badge {
      position: absolute; top: 5px; right: 5px;
      background: #ef4444;
      color: #ffffff;          /* white on red — readable */
      border-radius: 50%; width: 14px; height: 14px;
      font-size: .5625rem; display: flex; align-items: center; justify-content: center;
      font-weight: 700; border: 2px solid #ffffff;
    }
    .tb-sep {
      width: 1px;
      height: 22px;
      background: linear-gradient(180deg, rgba(109, 131, 153, 0) 0%, #a4bbd0 50%, rgba(109, 131, 153, 0) 100%);
      margin: 0 8px;
    }
    .tb-profile {
      display: flex; align-items: center; gap: 9px;
      padding: 6px 10px 6px 6px;
      border-radius: 12px; text-decoration: none;
      border: 1px solid rgba(137, 163, 189, .62);
      background: linear-gradient(180deg, rgba(235,244,252,.58) 0%, rgba(213,227,241,.44) 100%);
      font-family: inherit;
      cursor: pointer;
      transition: border-color 140ms, box-shadow 140ms, background 140ms;
      backdrop-filter: blur(10px) saturate(1.12);
      -webkit-backdrop-filter: blur(10px) saturate(1.12);
      &:hover {
        background: linear-gradient(180deg, rgba(239,247,253,.64) 0%, rgba(219,232,244,.52) 100%);
        border-color: rgba(129, 154, 180, .68);
        box-shadow: 0 10px 18px rgba(14, 28, 43, 0.20);
      }

      &[aria-expanded='true'] .tb-profile-caret {
        transform: rotate(180deg);
      }
    }
    .tb-profile-wrap {
      position: relative;
    }
    .tb-profile-caret {
      transition: transform var(--t-base) var(--ease);
    }
    .tb-profile-menu {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      min-width: 170px;
      background: linear-gradient(180deg, rgba(231,241,250,.66) 0%, rgba(209,224,238,.56) 100%);
      border: 1px solid rgba(137, 163, 189, .62);
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 16px 28px rgba(14, 28, 43, 0.26);
      backdrop-filter: blur(12px) saturate(1.14);
      -webkit-backdrop-filter: blur(12px) saturate(1.14);
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: shellContentReveal .2s var(--ease-out);
      z-index: 900;
    }
    .tb-menu-item {
      border: none;
      background: transparent;
      text-align: left;
      width: 100%;
      border-radius: 8px;
      padding: 9px 10px;
      font-size: .8rem;
      font-weight: 700;
      color: var(--text-secondary);
      cursor: pointer;
      text-decoration: none;
      transition: background var(--t-base) var(--ease), color var(--t-base) var(--ease);

      &:hover {
        background: rgba(196, 214, 231, .54);
        color: var(--text-primary);
      }
    }
    .tb-menu-danger {
      color: #b91c1c;

      &:hover {
        background: #faeef0;
        color: #991b1b;
      }
    }
    .tb-ava {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, var(--brand-700) 0%, #4f86b7 100%);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: .75rem;
      color: #ffffff;          /* white on gradient — readable */
      box-shadow: 0 8px 16px rgba(49, 91, 129, 0.2);
    }
    .tb-profile-text { display: flex; flex-direction: column; }
    .tb-profile-name {
      font-size: .8125rem; font-weight: 600;
      color: var(--text-primary);
      line-height: 1.2;
    }
    .tb-profile-role {
      font-size: .6875rem;
      color: var(--text-secondary);
    }

    .main-content {
      flex: 1;
      animation: shellContentReveal .45s var(--ease-out);
    }

    @media (max-width: 1180px) {
      .tb-route { display: none; }
      .tb-chip { display: none; }
      .tb-nav { gap: 4px; }
      .tb-nav-item { padding: 0 9px; }
    }

    /* ─── Mobile ─────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .topbar {
        padding: 8px 10px;
        margin: 0;
      }
      .tb-nav { display: flex; }
      .tb-route { display: none; }
      .tb-kicker { display: none; }
      .tb-chip { display: none; }
      .tb-profile-text { display: none; }
      .tb-sep { margin: 0 4px; }
    }

    @keyframes topbarSweep {
      0% { transform: translateX(-120%); }
      100% { transform: translateX(120%); }
    }

    @keyframes routeTyping {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }

    @keyframes routeTypingAlt {
      from {
        clip-path: inset(0 100% 0 0);
      }
      to {
        clip-path: inset(0 0 0 0);
      }
    }

    @keyframes caretBlink {
      0%, 49% {
        border-right-color: #60a5fa;
      }
      50%, 100% {
        border-right-color: transparent;
      }
    }

    @keyframes shellContentReveal {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .topbar::before,
      .main-content,
      .tb-app-name {
        animation: none !important;
      }
      .tb-nav-item,
      .tb-icon-btn,
      .tb-profile,
      .tb-chip {
        transition: none !important;
      }
    }
  `]
})
export class AppShellComponent {
  readonly authStore  = inject(AuthStore);
  readonly cartStore  = inject(CartStore);
  readonly loading    = inject(LoadingStore);
  private readonly authApi = inject(AuthApiService);
  private readonly router  = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly UserRole   = UserRole;
  readonly profileMenuOpen = signal(false);
  readonly typingFlip = signal(true);

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.typingFlip.update(v => !v);
      });
  }

  readonly userInitial = computed(() => (this.authStore.user()?.fullName ?? '?').charAt(0).toUpperCase());

  firstName(): string {
    const n = this.authStore.user()?.fullName ?? '';
    return n.split(' ')[0] ?? n;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.profileMenuOpen()) {
      this.profileMenuOpen.set(false);
    }
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update(v => !v);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  onLogoutFromMenu(): void {
    this.profileMenuOpen.set(false);
    this.logout();
  }

  private readonly icons: Record<string, string> = {
    dashboard:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>`,
    products:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
    cart:          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>`,
    orders:        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`,
    shipments:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
    invoices:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
    notifications: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    dealers:       `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  };

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
      { label: 'All Orders', icon: this.icons['orders'],    route: '/orders',    roles: [UserRole.Admin, UserRole.Warehouse, UserRole.Logistics] },
      { label: 'Shipments',  icon: this.icons['shipments'], route: '/shipments', roles: [UserRole.Admin, UserRole.Warehouse, UserRole.Logistics, UserRole.Agent, UserRole.Dealer] },
    ]},
    { label: 'Finance', items: [
      { label: 'Invoices', icon: this.icons['invoices'], route: '/invoices', roles: [UserRole.Admin, UserRole.Dealer] },
    ]},
    { label: 'System', items: [
      { label: 'Notifications', icon: this.icons['notifications'], route: '/notifications' },
      { label: 'Dealers',       icon: this.icons['dealers'],       route: '/admin/dealers', roles: [UserRole.Admin] },
    ]},
  ];

  readonly visibleNavItems = computed(() => {
    const role = this.authStore.role();
    return this.allGroups
      .flatMap(g => g.items)
      .filter(i => this.isRoleAllowed(i, role));
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
