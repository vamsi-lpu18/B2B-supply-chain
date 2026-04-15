import { Component, inject, computed, signal, HostListener, DestroyRef, ElementRef, ViewChild } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { LoadingStore } from '../../../core/stores/loading.store';
import { AuthApiService } from '../../../core/api/auth-api.service';
import { LogisticsApiService } from '../../../core/api/logistics-api.service';
import { LogisticsChatbotResponseDto } from '../../../core/models/logistics.models';
import { UserRole } from '../../../core/models/enums';
import { ToastContainerComponent } from '../toast-container/toast-container.component';

interface NavGroup { label: string; items: NavItem[]; }
interface NavItem  { label: string; icon: SafeHtml; route: string; roles?: UserRole[]; badge?: () => number; }
interface ShellChatMessage { sender: 'user' | 'bot'; text: string; intent?: string; createdAtUtc: string; }

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule, FormsModule, ToastContainerComponent],
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

      @if (shouldShowOpsChatbot()) {
        <button
          type="button"
          class="ops-chat-fab"
          (click)="toggleOpsChatbot()"
          [attr.aria-expanded]="opsChatOpen()"
          [attr.aria-label]="opsChatOpen() ? 'Close chatbot' : 'Open chatbot'">
          @if (opsChatOpen()) {
            <span class="ops-chat-fab-icon" aria-hidden="true">×</span>
          } @else {
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M8 10h8" />
              <path d="M8 14h5" />
              <path d="M6 19l-1 3 4-2h9a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v8a4 4 0 0 0 4 4z" />
            </svg>
          }
        </button>

        @if (opsChatOpen()) {
          <section class="ops-chat-panel" role="dialog" aria-label="Operations chatbot">
            <div class="ops-chat-head">
              <div class="ops-chat-head-content">
                <div class="ops-chat-title-row">
                  <div class="ops-chat-title">Ops Concierge</div>
                  <span class="ops-chat-status">
                    <span class="ops-chat-status-dot" aria-hidden="true"></span>
                    Live
                  </span>
                </div>
                <div class="ops-chat-sub">Ask anything about shipment progress, delays, retries, and assignments.</div>
              </div>
              <button type="button" class="ops-chat-minimize" (click)="toggleOpsChatbot()" aria-label="Minimize chatbot">−</button>
            </div>

            <div class="ops-chat-body" #opsChatBody>
              @for (msg of opsChatMessages(); track $index) {
                <div class="ops-chat-msg" [class.ops-chat-msg-user]="msg.sender === 'user'" [class.ops-chat-msg-bot]="msg.sender === 'bot'">
                  @if (msg.intent && msg.sender === 'bot') {
                    <div class="ops-chat-intent">{{ msg.intent }}</div>
                  }
                  <div class="ops-chat-text">{{ msg.text }}</div>
                  <div class="ops-chat-time">{{ formatOpsChatTime(msg.createdAtUtc) }}</div>
                </div>
              }

              @if (opsChatLoading()) {
                <div class="ops-chat-msg ops-chat-msg-bot ops-chat-msg-loading" aria-label="Thinking">
                  <div class="ops-chat-typing" aria-hidden="true">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              }
            </div>

            @if (opsChatSuggestedPrompts().length > 0) {
              <div class="ops-chat-suggest">
                @for (prompt of opsChatSuggestedPrompts(); track $index) {
                  <button type="button" class="btn btn-ghost btn-sm ops-chat-chip" (click)="useOpsSuggestedPrompt(prompt)">{{ prompt }}</button>
                }
              </div>
            }

            <div class="ops-chat-input">
              <input
                class="form-control"
                type="text"
                maxlength="500"
                [(ngModel)]="opsChatPrompt"
                placeholder="Ask a logistics question"
                (keyup.enter)="sendOpsChatbotMessage()">
              <button type="button" class="btn btn-primary btn-sm ops-chat-send" (click)="sendOpsChatbotMessage()" [disabled]="opsChatLoading() || !opsChatPrompt.trim()">Ask</button>
            </div>
          </section>
        }
      }

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

    .ops-chat-fab {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 60px;
      height: 60px;
      border-radius: 9999px;
      border: 1px solid rgba(23, 73, 111, 0.7);
      background: linear-gradient(145deg, #184b73 0%, #2d77ae 52%, #56a2dc 100%);
      color: #fff;
      line-height: 1;
      box-shadow:
        0 18px 32px rgba(9, 37, 62, 0.28),
        0 6px 12px rgba(37, 96, 145, 0.2);
      z-index: 950;
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: transform .2s cubic-bezier(.22,1,.36,1), box-shadow .2s cubic-bezier(.22,1,.36,1), background .2s ease;
      animation: opsFabFloat 3.4s ease-in-out infinite;
      overflow: hidden;
    }
    .ops-chat-fab::before {
      content: '';
      position: absolute;
      inset: -4px;
      border-radius: inherit;
      background: radial-gradient(circle at 30% 30%, rgba(140, 210, 255, 0.4), transparent 58%);
      filter: blur(8px);
      z-index: -1;
      opacity: 0.9;
    }
    .ops-chat-fab:hover {
      transform: translateY(-3px) scale(1.02);
      box-shadow:
        0 22px 36px rgba(9, 37, 62, 0.32),
        0 9px 16px rgba(37, 96, 145, 0.24);
    }
    .ops-chat-fab[aria-expanded='true'] {
      animation: none;
      background: linear-gradient(145deg, #215f8f 0%, #3d90c8 100%);
      transform: rotate(90deg);
    }
    .ops-chat-fab svg {
      width: 24px;
      height: 24px;
    }
    .ops-chat-fab-icon {
      font-size: 26px;
      font-weight: 700;
      transform: rotate(-90deg);
    }

    .ops-chat-panel {
      position: fixed;
      right: 24px;
      bottom: 92px;
      width: min(430px, calc(100vw - 24px));
      max-height: min(75vh, 720px);
      display: flex;
      flex-direction: column;
      border-radius: 18px;
      border: 1px solid rgba(143, 175, 203, 0.55);
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(245, 250, 255, 0.95));
      backdrop-filter: blur(10px);
      box-shadow:
        0 30px 70px rgba(8, 30, 51, 0.2),
        0 10px 24px rgba(18, 66, 103, 0.16);
      overflow: hidden;
      z-index: 950;
      animation: opsPanelReveal .26s cubic-bezier(.22,1,.36,1) both;
    }
    .ops-chat-panel::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #2e76ab, #86c6ff, #2e76ab);
      background-size: 220% 100%;
      animation: opsAccentFlow 3.6s linear infinite;
    }
    .ops-chat-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 14px 14px 12px;
      border-bottom: 1px solid rgba(175, 198, 219, 0.52);
      background:
        radial-gradient(75% 120% at 0% 0%, rgba(187, 222, 249, 0.42), transparent 60%),
        linear-gradient(180deg, rgba(250, 253, 255, 0.98), rgba(241, 248, 255, 0.95));
    }
    .ops-chat-head-content { min-width: 0; }
    .ops-chat-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ops-chat-title {
      font-size: .9rem;
      font-weight: 800;
      letter-spacing: .01em;
      color: #123d62;
    }
    .ops-chat-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 2px 8px;
      border-radius: 9999px;
      border: 1px solid rgba(126, 191, 131, 0.45);
      background: rgba(232, 250, 235, 0.9);
      color: #2a7040;
      font-size: .63rem;
      font-weight: 700;
      letter-spacing: .03em;
      text-transform: uppercase;
    }
    .ops-chat-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #3bbd5d;
      animation: opsStatusPulse 1.4s ease-in-out infinite;
    }
    .ops-chat-sub {
      margin-top: 4px;
      font-size: .72rem;
      line-height: 1.35;
      color: var(--text-secondary);
      max-width: 290px;
    }
    .ops-chat-minimize {
      width: 30px;
      height: 30px;
      border-radius: 10px;
      border: 1px solid rgba(157, 185, 210, 0.7);
      background: rgba(255, 255, 255, 0.95);
      color: #3a6b96;
      font-size: 18px;
      line-height: 1;
      font-weight: 700;
      cursor: pointer;
      flex-shrink: 0;
      transition: background .18s ease, transform .18s ease;
    }
    .ops-chat-minimize:hover {
      background: #eef6fd;
      transform: translateY(-1px);
    }

    .ops-chat-body {
      flex: 1;
      min-height: 196px;
      max-height: 360px;
      overflow-y: auto;
      padding: 12px;
      background:
        radial-gradient(140% 140% at 100% 0%, rgba(225, 242, 255, 0.42), transparent 62%),
        #fbfdff;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scroll-behavior: smooth;
      scrollbar-width: thin;
      scrollbar-color: rgba(122, 157, 189, 0.68) transparent;
    }
    .ops-chat-body::-webkit-scrollbar { width: 8px; }
    .ops-chat-body::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, #9ec5e7, #6d9dc8);
      border-radius: 9999px;
    }

    .ops-chat-msg {
      max-width: 88%;
      border-radius: 16px;
      border: 1px solid rgba(193, 212, 229, 0.9);
      padding: 10px 11px;
      box-shadow: 0 6px 16px rgba(12, 42, 67, 0.08);
      display: flex;
      flex-direction: column;
      gap: 5px;
      animation: opsMessageIn .24s ease-out;
    }
    .ops-chat-msg-user {
      margin-left: auto;
      background: linear-gradient(145deg, #deefff, #cde7ff);
      border-color: #b4d7f6;
    }
    .ops-chat-msg-bot {
      margin-right: auto;
      background: linear-gradient(160deg, #ffffff, #f7fbff);
      border-color: rgba(188, 209, 229, 0.9);
    }
    .ops-chat-msg-loading {
      width: 84px;
      min-height: 34px;
      justify-content: center;
    }
    .ops-chat-intent {
      align-self: flex-start;
      font-size: .6rem;
      font-weight: 800;
      letter-spacing: .05em;
      text-transform: uppercase;
      color: #165d93;
      background: linear-gradient(180deg, #edf6ff, #e1f1ff);
      border: 1px solid #c8e0f3;
      border-radius: 9999px;
      padding: 2px 8px;
    }
    .ops-chat-text {
      font-size: .8rem;
      line-height: 1.42;
      color: #1c3551;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ops-chat-time {
      font-size: .64rem;
      color: #7a92a9;
      text-align: right;
      letter-spacing: .01em;
    }
    .ops-chat-typing {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 1px 0;
    }
    .ops-chat-typing span {
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: #6ea5d3;
      animation: opsTypingBounce 1s infinite ease-in-out;
    }
    .ops-chat-typing span:nth-child(2) { animation-delay: .15s; }
    .ops-chat-typing span:nth-child(3) { animation-delay: .3s; }

    .ops-chat-suggest {
      display: flex;
      gap: 7px;
      padding: 9px 10px;
      border-top: 1px solid rgba(187, 208, 227, 0.74);
      background: linear-gradient(180deg, rgba(248, 251, 255, 0.96), rgba(239, 247, 255, 0.96));
      overflow-x: auto;
      overflow-y: hidden;
      white-space: nowrap;
      scrollbar-width: thin;
    }
    .ops-chat-chip {
      flex: 0 0 auto;
      white-space: nowrap;
      border-radius: 9999px;
      border: 1px solid #cae0f3;
      background: #fff;
      color: #2b628f;
      font-size: .72rem;
      font-weight: 600;
      transition: transform .15s ease, background .15s ease, border-color .15s ease;
      box-shadow: 0 2px 5px rgba(22, 64, 97, 0.07);
    }
    .ops-chat-chip:hover {
      transform: translateY(-1px);
      border-color: #8fbde4;
      background: #f3f9ff;
      color: #1f577f;
    }

    .ops-chat-input {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      padding: 10px 12px 12px;
      border-top: 1px solid rgba(178, 202, 224, 0.75);
      background: linear-gradient(180deg, #ffffff, #f8fbff);
    }
    .ops-chat-input .form-control {
      min-height: 38px;
      padding: 7px 11px;
      font-size: .8rem;
      border-radius: 11px;
      border: 1px solid #b7d3ea;
      background: #fff;
      transition: border-color .2s ease, box-shadow .2s ease;
    }
    .ops-chat-input .form-control:focus {
      border-color: #5e9ccf;
      box-shadow: 0 0 0 3px rgba(77, 145, 199, 0.2);
    }
    .ops-chat-send {
      min-width: 64px;
      border: none;
      border-radius: 11px;
      background: linear-gradient(145deg, #205f8f, #2f80b9);
      color: #fff;
      font-weight: 700;
      box-shadow: 0 8px 16px rgba(24, 70, 107, 0.25);
      transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease;
    }
    .ops-chat-send:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 18px rgba(24, 70, 107, 0.3);
    }
    .ops-chat-send:disabled {
      opacity: 0.58;
      box-shadow: none;
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
      .ops-chat-fab {
        right: 12px;
        bottom: 86px;
        width: 56px;
        height: 56px;
      }
      .ops-chat-panel {
        right: 12px;
        bottom: 154px;
        width: calc(100vw - 24px);
        max-height: min(70vh, 640px);
      }
      .ops-chat-sub { max-width: 240px; }
      .ops-chat-msg { max-width: 94%; }
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
    @keyframes opsFabFloat {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-4px); }
    }
    @keyframes opsPanelReveal {
      from { opacity: 0; transform: translateY(12px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes opsMessageIn {
      from { opacity: 0; transform: translateY(7px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes opsStatusPulse {
      0%, 100% { transform: scale(.86); opacity: .7; }
      50% { transform: scale(1.18); opacity: 1; }
    }
    @keyframes opsTypingBounce {
      0%, 80%, 100% { transform: translateY(0); opacity: .35; }
      40% { transform: translateY(-4px); opacity: 1; }
    }
    @keyframes opsAccentFlow {
      from { background-position: 0 50%; }
      to { background-position: 220% 50%; }
    }
    @keyframes contentReveal {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (prefers-reduced-motion: reduce) {
      .sidebar,
      .main-content,
      .profile-menu,
      .mobile-overlay,
      .ops-chat-fab,
      .ops-chat-panel,
      .ops-chat-msg,
      .ops-chat-status-dot,
      .ops-chat-typing span {
        animation: none !important;
        transition: none !important;
      }
    }
  `]
})
export class AppShellComponent {
    @ViewChild('opsChatBody')
    private opsChatBodyRef?: ElementRef<HTMLDivElement>;

  readonly authStore  = inject(AuthStore);
  readonly cartStore  = inject(CartStore);
  readonly loading    = inject(LoadingStore);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly authApi = inject(AuthApiService);
  private readonly logisticsApi = inject(LogisticsApiService);
  private readonly router  = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly UserRole   = UserRole;
  readonly profileMenuOpen = signal(false);
  readonly sidebarCollapsed = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly expandedGroups = signal<Record<string, boolean>>({});
  readonly pendingOrderCount = signal(0);
  readonly currentUrl = signal(this.router.url || '/dashboard');
  readonly opsChatOpen = signal(false);
  readonly opsChatLoading = signal(false);
  readonly opsChatMessages = signal<ShellChatMessage[]>([
    {
      sender: 'bot',
      text: 'Hi, I can answer operational questions about shipments, delays, retries, and assignments.',
      createdAtUtc: new Date().toISOString()
    }
  ]);
  readonly opsChatSuggestedPrompts = signal<string[]>([
    'How many shipments are delayed today?',
    'Show assignment gaps for my scope.',
    'List active deliveries in transit.',
    'Which shipments need retry handling?'
  ]);
  opsChatPrompt = '';
  private windowWidth = signal(window.innerWidth);
  readonly canUseOpsChatbot = () => this.authStore.hasRole(UserRole.Admin, UserRole.Logistics, UserRole.Agent, UserRole.Dealer, UserRole.Warehouse);
  readonly shouldShowOpsChatbot = computed(() => this.currentUrl().startsWith('/dashboard') && this.canUseOpsChatbot());

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        this.currentUrl.set(this.router.url || '/dashboard');
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
  toggleOpsChatbot(): void {
    this.opsChatOpen.update(open => !open);
    if (this.opsChatOpen()) {
      this.scrollOpsChatToBottom();
    }
  }

  sendOpsChatbotMessage(): void {
    const message = this.opsChatPrompt.trim();
    if (!message || this.opsChatLoading() || !this.canUseOpsChatbot()) {
      return;
    }

    this.opsChatMessages.update(messages => [
      ...messages,
      {
        sender: 'user',
        text: message,
        createdAtUtc: new Date().toISOString()
      }
    ]);
    this.scrollOpsChatToBottom();

    const localContextResponse = this.tryBuildLocalContextResponse(message);
    if (localContextResponse) {
      this.opsChatMessages.update(messages => [...messages, localContextResponse]);
      this.scrollOpsChatToBottom();
      this.opsChatPrompt = '';
      return;
    }

    this.opsChatPrompt = '';
    this.opsChatLoading.set(true);
    this.scrollOpsChatToBottom();

    this.logisticsApi.askChatbot({ message }).subscribe({
      next: (response: LogisticsChatbotResponseDto) => {
        this.opsChatMessages.update(messages => [
          ...messages,
          {
            sender: 'bot',
            text: response.reply,
            intent: response.intent,
            createdAtUtc: response.createdAtUtc
          }
        ]);
        this.scrollOpsChatToBottom();

        if (response.suggestedPrompts.length > 0) {
          this.opsChatSuggestedPrompts.set(response.suggestedPrompts.slice(0, 5));
        }

        this.opsChatLoading.set(false);
      },
      error: () => {
        this.opsChatMessages.update(messages => [
          ...messages,
          {
            sender: 'bot',
            text: 'I could not fetch a response right now. Please try again in a moment.',
            createdAtUtc: new Date().toISOString()
          }
        ]);
        this.scrollOpsChatToBottom();
        this.opsChatLoading.set(false);
      }
    });
  }

  useOpsSuggestedPrompt(prompt: string): void {
    this.opsChatPrompt = prompt;
    this.sendOpsChatbotMessage();
  }

  formatOpsChatTime(value: string): string {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) {
      return '';
    }

    return parsed.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private scrollOpsChatToBottom(): void {
    setTimeout(() => {
      const body = this.opsChatBodyRef?.nativeElement;
      if (!body) {
        return;
      }

      body.scrollTop = body.scrollHeight;
    }, 0);
  }

  private tryBuildLocalContextResponse(message: string): ShellChatMessage | null {
    const normalizedMessage = this.normalizeChatMessage(message);

    const dateTimeResponse = this.tryBuildDateTimeContextResponse(normalizedMessage);
    if (dateTimeResponse) {
      return dateTimeResponse;
    }

    const cartResponse = this.tryBuildCartContextResponse(normalizedMessage);
    if (cartResponse) {
      return cartResponse;
    }

    return this.tryBuildBasicAssistantResponse(normalizedMessage);
  }

  private normalizeChatMessage(message: string): string {
    return message.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  private tryBuildCartContextResponse(normalizedMessage: string): ShellChatMessage | null {
    if (!this.isCartDetailsQuery(normalizedMessage)) {
      return null;
    }

    const cartItemCount = this.cartStore.itemCount();
    const cartTotal = this.cartStore.total();
    const cartTotalLabel = `INR ${cartTotal.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

    const text = cartItemCount > 0
      ? `You currently have ${cartItemCount} cart item(s) with a total of ${cartTotalLabel}. Next action: open Cart to review items or proceed to checkout.`
      : 'You currently do not have any cart items. Next action: browse products and add items before checkout.';

    return {
      sender: 'bot',
      text,
      intent: 'ui-cart-context',
      createdAtUtc: new Date().toISOString()
    };
  }

  private tryBuildDateTimeContextResponse(normalizedMessage: string): ShellChatMessage | null {
    const queryKind = this.resolveDateTimeQueryKind(normalizedMessage);
    if (!queryKind) {
      return null;
    }

    const now = new Date();
    const dayLabel = now.toLocaleDateString('en-IN', {
      weekday: 'long'
    });
    const dateLabel = now.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
    const fullDateLabel = `${dayLabel}, ${dateLabel}`;
    const timeLabel = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local time zone';

    let text = `It is currently ${timeLabel} on ${fullDateLabel} (${timeZone}).`;
    if (queryKind === 'time') {
      text = `It is currently ${timeLabel} (${timeZone}).`;
    } else if (queryKind === 'date') {
      text = `Today is ${fullDateLabel}.`;
    } else if (queryKind === 'day') {
      text = `Today is ${dayLabel}.`;
    }

    return {
      sender: 'bot',
      text,
      intent: 'ui-datetime-context',
      createdAtUtc: now.toISOString()
    };
  }

  private resolveDateTimeQueryKind(normalizedMessage: string): 'date-time' | 'date' | 'time' | 'day' | null {
    if (!normalizedMessage) {
      return null;
    }

    const dateTimePatterns: RegExp[] = [
      /\bdate\s*(?:and|&)\s*time\b/,
      /\bwhat(?:'s| is)\s+(?:the\s+)?(?:current\s+)?date\s+and\s+time\b/,
      /\bcurrent\s+date\s+and\s+time\b/
    ];
    const timePatterns: RegExp[] = [
      /\bwhat\s+time\s+is\s+it\b/,
      /\bcurrent\s+time\b/,
      /\btime\s+now\b/,
      /\btell\s+me\s+(?:the\s+)?time\b/,
      /^(?:time|time\s+please)\??$/
    ];
    const datePatterns: RegExp[] = [
      /\bwhat(?:'s| is)\s+(?:the\s+)?(?:current\s+)?date\b/,
      /\btoday(?:'s)?\s+date\b/,
      /\bcurrent\s+date\b/,
      /\btell\s+me\s+(?:the\s+)?date\b/,
      /^(?:date|date\s+please)\??$/
    ];
    const dayPatterns: RegExp[] = [
      /\bwhat\s+day\s+is\s+it\b/,
      /\bwhich\s+day\s+is\s+it\b/,
      /\bday\s+today\b/,
      /\btoday\s+is\s+what\s+day\b/
    ];

    if (dateTimePatterns.some(pattern => pattern.test(normalizedMessage))) {
      return 'date-time';
    }

    const mentionsDate = /\bdate\b/.test(normalizedMessage);
    const mentionsTime = /\btime\b/.test(normalizedMessage);
    if (mentionsDate && mentionsTime) {
      return 'date-time';
    }

    if (dayPatterns.some(pattern => pattern.test(normalizedMessage))) {
      return 'day';
    }

    if (timePatterns.some(pattern => pattern.test(normalizedMessage))) {
      return 'time';
    }

    if (datePatterns.some(pattern => pattern.test(normalizedMessage))) {
      return 'date';
    }

    return null;
  }

  private tryBuildBasicAssistantResponse(normalizedMessage: string): ShellChatMessage | null {
    if (!normalizedMessage || this.isLikelyOperationsQuery(normalizedMessage)) {
      return null;
    }

    if (/^(?:hi|hello|hey|hey there|good morning|good afternoon|good evening|yo)\b/.test(normalizedMessage)) {
      return {
        sender: 'bot',
        text: 'Hi! I am Ops Concierge. I can help with shipment operations, cart checks, and quick basics like date/time.',
        intent: 'ui-greeting-context',
        createdAtUtc: new Date().toISOString()
      };
    }

    if (/\b(?:what(?:'s| is)\s+your\s+name|who\s+are\s+you|your\s+name)\b/.test(normalizedMessage)) {
      return {
        sender: 'bot',
        text: 'I am Ops Concierge, your SupplyChain operations assistant.',
        intent: 'ui-identity-context',
        createdAtUtc: new Date().toISOString()
      };
    }

    if (/^(?:help|menu|options|what\s+can\s+you\s+do|how\s+can\s+you\s+help|capabilities|commands)\b/.test(normalizedMessage)) {
      return {
        sender: 'bot',
        text: 'I can answer shipment questions (status, delays, retries, assignments), check your cart summary, and share current date/time. Try: "How many shipments are delayed today?"',
        intent: 'ui-help-context',
        createdAtUtc: new Date().toISOString()
      };
    }

    if (/^(?:thanks|thank\s+you|thx|ty)\b/.test(normalizedMessage)) {
      return {
        sender: 'bot',
        text: 'You are welcome. If you want, I can show shipment status insights or quick cart/date-time info.',
        intent: 'ui-thanks-context',
        createdAtUtc: new Date().toISOString()
      };
    }

    return null;
  }

  private isLikelyOperationsQuery(normalizedMessage: string): boolean {
    return [
      'shipment',
      'shipments',
      'delay',
      'delayed',
      'delivery',
      'deliveries',
      'in transit',
      'retry',
      'assignment',
      'warehouse',
      'invoice',
      'order status'
    ].some(token => normalizedMessage.includes(token));
  }

  private isCartDetailsQuery(normalizedMessage: string): boolean {
    if (!normalizedMessage) {
      return false;
    }

    const mentionsCart = /\bcart\b|\bbasket\b|\bbag\b|\bcheckout\b/.test(normalizedMessage);
    if (!mentionsCart) {
      return false;
    }

    return [
      /\bdo\s+i\s+have\b/,
      /\bhow\s+many\b/,
      /\bany\b/,
      /\bcount\b/,
      /\bitem\b/,
      /\bitems\b/,
      /\btotal\b/,
      /\bamount\b/,
      /\bvalue\b/,
      /\bwhat(?:'s| is)\s+in\s+my\s+(?:cart|basket|bag)\b/,
      /\bmy\s+(?:cart|basket|bag)\b/
    ].some(pattern => pattern.test(normalizedMessage));
  }

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
