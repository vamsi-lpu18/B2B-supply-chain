import { Component, inject, signal, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
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
    <div class="shell" [class.collapsed]="collapsed()" [class.mobile-open]="mobileOpen()">
      @if (loading.isLoading()) { <div class="loading-bar"></div> }

      <!-- ── Sidebar ── -->
      <aside class="sidebar">

        <div class="sb-brand">
          <div class="sb-logo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5z" fill="#2563eb"/>
              <path d="M2 17l10 5 10-5" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" opacity=".45"/>
              <path d="M2 12l10 5 10-5" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
            </svg>
          </div>
          @if (!collapsed()) {
            <div class="sb-brand-text">
              <span class="sb-name">SupplyChain</span>
              <span class="sb-tag">Enterprise</span>
            </div>
          }
          <button class="sb-toggle" (click)="collapsed.update(v=>!v)"
                  [title]="collapsed() ? 'Expand' : 'Collapse'">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              @if (collapsed()) { <polyline points="9 18 15 12 9 6"/> }
              @else              { <polyline points="15 18 9 12 15 6"/> }
            </svg>
          </button>
        </div>

        <nav class="sb-nav">
          @for (g of visibleGroups(); track g.label) {
            @if (!collapsed()) {
              <p class="sb-group-label">{{ g.label }}</p>
            }
            @for (item of g.items; track item.route) {
              <a [routerLink]="item.route" routerLinkActive="active"
                 class="sb-item" [title]="collapsed() ? item.label : ''">
                <span class="sb-icon" [innerHTML]="item.icon"></span>
                @if (!collapsed()) {
                  <span class="sb-item-label">{{ item.label }}</span>
                  @if (item.badge && item.badge() > 0) {
                    <span class="sb-badge">{{ item.badge() }}</span>
                  }
                } @else if (item.badge && item.badge() > 0) {
                  <span class="sb-dot"></span>
                }
              </a>
            }
          }
        </nav>

        <div class="sb-footer">
          @if (!collapsed()) {
            <div class="sb-user">
              <div class="sb-ava">{{ userInitial() }}</div>
              <div class="sb-user-info">
                <span class="sb-user-name">{{ authStore.user()?.fullName }}</span>
                <span class="sb-user-role">{{ authStore.role() }}</span>
              </div>
            </div>
            <button class="sb-signout" (click)="logout()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sign out
            </button>
          } @else {
            <button class="sb-signout-icon" (click)="logout()" title="Sign out">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
            </button>
          }
        </div>
      </aside>

      <!-- ── Main ── -->
      <div class="main-wrap">
        <header class="topbar">
          <div class="tb-left">
            <button class="tb-menu" (click)="toggleSidebar()" title="Toggle sidebar">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <span class="tb-app-name">SupplyChain</span>
          </div>
          <div class="tb-right">
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
            <a routerLink="/profile" class="tb-profile">
              <div class="tb-ava">{{ userInitial() }}</div>
              <div class="tb-profile-text">
                <span class="tb-profile-name">{{ firstName() }}</span>
                <span class="tb-profile-role">{{ authStore.role() }}</span>
              </div>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </a>
          </div>
        </header>
        <main class="main-content"><router-outlet /></main>
      </div>

      @if (mobileOpen()) {
        <div class="mobile-overlay" (click)="mobileOpen.set(false)"></div>
      }
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
        radial-gradient(900px 520px at 105% -8%, rgba(37, 99, 235, 0.14), transparent 62%),
        radial-gradient(720px 400px at -8% 30%, rgba(14, 165, 233, 0.10), transparent 58%),
        #f4f8fc;
      font-family: var(--font-sans);
    }

    /* ─── SIDEBAR — pure light, zero conflicts ──────────────────────── */
    .sidebar {
      width: 256px;
      background: linear-gradient(180deg, rgba(255,255,255,.97) 0%, rgba(250,253,255,.92) 100%);
      border-right: 1px solid #d8e2ef;
      display: flex;
      flex-direction: column;
      position: fixed;
      top: 0; left: 0; bottom: 0;
      z-index: 300;
      transition: width 220ms cubic-bezier(.4,0,.2,1);
      overflow: hidden;
      box-shadow: 12px 0 34px rgba(15, 23, 42, 0.07);
      backdrop-filter: blur(12px);
    }
    .shell.collapsed .sidebar { width: 68px; }

    /* Brand row */
    .sb-brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 14px;
      height: 68px;
      border-bottom: 1px solid #e7eef7;
      flex-shrink: 0;
    }
    .sb-logo {
      width: 34px; height: 34px;
      background: linear-gradient(140deg, #eff6ff 0%, #dbeafe 100%);
      border: 1px solid #bfdbfe;
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 8px 18px rgba(37, 99, 235, 0.15);
    }
    .sb-brand-text { flex: 1; min-width: 0; }
    .sb-name {
      display: block;
      font-size: 1rem;
      font-weight: 800;
      color: #0f172a;          /* dark text on white — no conflict */
      letter-spacing: -.02em;
      line-height: 1.2;
    }
    .sb-tag {
      display: block;
      font-size: .625rem;
      font-weight: 700;
      color: #64748b;          /* medium gray on white — readable */
      text-transform: uppercase;
      letter-spacing: .11em;
      margin-top: 1px;
    }
    .sb-toggle {
      width: 30px; height: 30px;
      background: linear-gradient(180deg, #ffffff 0%, #f3f8ff 100%);
      border: 1px solid #cfe0f5;
      border-radius: 9px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      color: #94a3b8;          /* gray icon on white — readable */
      flex-shrink: 0;
      margin-left: auto;
      transition: transform 140ms, background 140ms, border-color 140ms, color 140ms, box-shadow 140ms;
      &:hover {
        transform: translateY(-1px);
        background: linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%);
        border-color: #93c5fd;
        color: #2563eb;        /* blue icon on light-blue bg — readable */
        box-shadow: 0 10px 18px rgba(37, 99, 235, 0.18);
      }
    }

    /* Nav */
    .sb-nav {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 10px 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .sb-group-label {
      font-size: .625rem;
      font-weight: 700;
      color: #8aa0b8;          /* light gray on white — decorative, not critical */
      text-transform: uppercase;
      letter-spacing: .12em;
      padding: 16px 10px 6px;
      margin: 0;
      white-space: nowrap;
    }
    .sb-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 11px;
      color: #4b5563;          /* dark gray on white — readable */
      text-decoration: none;
      font-size: .875rem;
      font-weight: 600;
      transition: transform 120ms, background 120ms, color 120ms, box-shadow 120ms;
      position: relative;
      white-space: nowrap;
      cursor: pointer;
      line-height: 1.4;

      &:hover {
        transform: translateX(2px);
        background: #edf3fb;
        color: #111827;        /* near-black on light gray — readable */
        box-shadow: inset 0 0 0 1px #d9e7f7;
      }
      &.active {
        background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
        color: #1d4ed8;        /* dark blue on light blue — readable */
        font-weight: 700;
        box-shadow: 0 10px 20px rgba(37, 99, 235, 0.16);
        &::before {
          content: '';
          position: absolute;
          left: 0; top: 8px; bottom: 8px;
          width: 3px;
          background: #2563eb;
          border-radius: 0 3px 3px 0;
        }
      }
    }
    .sb-icon {
      width: 18px; height: 18px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      opacity: .9;
      svg { width: 15px; height: 15px; }
    }
    .sb-item.active .sb-icon { opacity: 1; }
    .sb-item-label { flex: 1; }
    .sb-badge {
      background: #2563eb;
      color: #ffffff;          /* white on blue — readable */
      border-radius: 9999px;
      font-size: .625rem;
      padding: 2px 7px;
      font-weight: 700;
      margin-left: auto;
    }
    .sb-dot {
      position: absolute;
      top: 7px; right: 7px;
      width: 6px; height: 6px;
      background: #2563eb;
      border-radius: 50%;
      border: 2px solid #ffffff;
    }

    /* Footer */
    .sb-footer {
      padding: 12px 10px 14px;
      border-top: 1px solid #e7eef7;
      flex-shrink: 0;
    }
    .sb-user {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 8px;
      margin-bottom: 4px;
      transition: background 120ms;
      &:hover { background: #eef4fb; }
    }
    .sb-ava {
      width: 30px; height: 30px;
      background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: .75rem;
      color: #ffffff;          /* white on gradient — readable */
      flex-shrink: 0;
      box-shadow: 0 8px 16px rgba(37, 99, 235, 0.28);
    }
    .sb-user-info { min-width: 0; }
    .sb-user-name {
      display: block;
      font-size: .8125rem;
      font-weight: 600;
      color: #0f172a;          /* dark on white — readable */
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }
    .sb-user-role {
      display: block;
      font-size: .6875rem;
      color: #64748b;          /* gray on white — readable */
      font-weight: 500;
      margin-top: 1px;
    }
    .sb-signout {
      display: flex; align-items: center; gap: 8px;
      width: 100%; padding: 7px 10px;
      background: none; border: none; border-radius: 7px;
      font-size: .8125rem; font-weight: 500;
      color: #64748b;          /* gray on white — readable */
      cursor: pointer; transition: all 120ms; font-family: inherit;
      &:hover {
        background: #fee2e2;
        color: #991b1b;        /* dark red on light red — readable */
      }
    }
    .sb-signout-icon {
      display: flex; align-items: center; justify-content: center;
      width: 100%; padding: 8px;
      background: none; border: none; border-radius: 7px;
      color: #64748b; cursor: pointer; transition: all 120ms;
      &:hover { background: #fee2e2; color: #991b1b; }
    }

    /* ─── Main area ─────────────────────────────────────────────────── */
    .main-wrap {
      flex: 1;
      margin-left: 256px;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      transition: margin-left 220ms cubic-bezier(.4,0,.2,1);
    }
    .shell.collapsed .main-wrap { margin-left: 68px; }

    /* ─── Topbar ─────────────────────────────────────────────────────── */
    .topbar {
      height: 68px;
      background: rgba(255, 255, 255, 0.85);
      border-bottom: 1px solid #d8e2ef;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
      position: sticky;
      top: 0;
      z-index: 200;
      backdrop-filter: blur(10px);
    }
    .tb-left { display: flex; align-items: center; gap: 14px; }
    .tb-menu {
      width: 38px; height: 38px;
      background: none; border: none; border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      color: #64748b;          /* gray on white — readable */
      transition: all 120ms;
      &:hover { background: #edf3fb; color: #0f172a; transform: translateY(-1px); }
    }
    .tb-app-name {
      font-size: 1rem;
      font-weight: 800;
      color: #0f172a;          /* dark on white — readable */
      letter-spacing: -.02em;
    }

    .tb-right { display: flex; align-items: center; gap: 2px; }
    .tb-icon-btn {
      position: relative;
      width: 38px; height: 38px;
      display: flex; align-items: center; justify-content: center;
      border-radius: 10px;
      color: #64748b;          /* gray on white — readable */
      text-decoration: none;
      transition: all 120ms;
      &:hover { background: #edf3fb; color: #0f172a; transform: translateY(-1px); }
    }
    .tb-badge {
      position: absolute; top: 5px; right: 5px;
      background: #ef4444;
      color: #ffffff;          /* white on red — readable */
      border-radius: 50%; width: 14px; height: 14px;
      font-size: .5625rem; display: flex; align-items: center; justify-content: center;
      font-weight: 700; border: 2px solid #ffffff;
    }
    .tb-sep { width: 1px; height: 20px; background: #e2e8f0; margin: 0 10px; }
    .tb-profile {
      display: flex; align-items: center; gap: 9px;
      padding: 6px 10px 6px 6px;
      border-radius: 12px; text-decoration: none;
      border: 1px solid #d8e2ef;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
      transition: all 120ms;
      &:hover { background: #ffffff; border-color: #bfdbfe; transform: translateY(-1px); box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08); }
    }
    .tb-ava {
      width: 28px; height: 28px;
      background: linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-weight: 700; font-size: .75rem;
      color: #ffffff;          /* white on gradient — readable */
      box-shadow: 0 8px 16px rgba(37, 99, 235, 0.2);
    }
    .tb-profile-text { display: flex; flex-direction: column; }
    .tb-profile-name {
      font-size: .8125rem; font-weight: 600;
      color: #0f172a;          /* dark on white — readable */
      line-height: 1.2;
    }
    .tb-profile-role {
      font-size: .6875rem;
      color: #64748b;          /* gray on white — readable */
    }

    .main-content { flex: 1; }

    .mobile-overlay {
      display: none;
      position: fixed; inset: 0;
      background: rgba(15,23,42,.35);
      z-index: 299;
    }

    /* ─── Mobile ─────────────────────────────────────────────────────── */
    @media (max-width: 768px) {
      .sidebar { transform: translateX(-100%); width: 256px !important; }
      .shell.mobile-open .sidebar { transform: translateX(0); }
      .main-wrap { margin-left: 0 !important; }
      .mobile-overlay { display: block; }
      .tb-app-name { display: none; }
      .tb-profile-text { display: none; }
    }
  `]
})
export class AppShellComponent {
  readonly authStore  = inject(AuthStore);
  readonly cartStore  = inject(CartStore);
  readonly loading    = inject(LoadingStore);
  private readonly authApi = inject(AuthApiService);
  private readonly router  = inject(Router);

  readonly UserRole   = UserRole;
  readonly collapsed  = signal(false);
  readonly mobileOpen = signal(false);

  readonly userInitial = computed(() => (this.authStore.user()?.fullName ?? '?').charAt(0).toUpperCase());

  firstName(): string {
    const n = this.authStore.user()?.fullName ?? '';
    return n.split(' ')[0] ?? n;
  }

  toggleSidebar(): void {
    if (window.innerWidth <= 768) {
      this.mobileOpen.update(v => !v);
    } else {
      this.collapsed.update(v => !v);
    }
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
      { label: 'Shipments',  icon: this.icons['shipments'], route: '/shipments' },
    ]},
    { label: 'Finance', items: [
      { label: 'Invoices', icon: this.icons['invoices'], route: '/invoices', roles: [UserRole.Admin, UserRole.Dealer] },
    ]},
    { label: 'System', items: [
      { label: 'Notifications', icon: this.icons['notifications'], route: '/notifications' },
      { label: 'Dealers',       icon: this.icons['dealers'],       route: '/admin/dealers', roles: [UserRole.Admin] },
    ]},
  ];

  readonly visibleGroups = computed(() => {
    const role = this.authStore.role();
    return this.allGroups
      .map(g => ({ ...g, items: g.items.filter(i => !i.roles || (role && i.roles.includes(role))) }))
      .filter(g => g.items.length > 0);
  });

  logout(): void {
    this.authApi.logout().subscribe({
      complete: () => { this.authStore.clear(); this.cartStore.clear(); this.router.navigate(['/login']); },
      error:    () => { this.authStore.clear(); this.cartStore.clear(); this.router.navigate(['/login']); }
    });
  }
}
