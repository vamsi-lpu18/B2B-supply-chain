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
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss'
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
