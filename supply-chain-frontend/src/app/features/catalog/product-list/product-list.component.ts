import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { ToastService } from '../../../core/services/toast.service';
import { ProductListItemDto } from '../../../core/models/catalog.models';
import { UserRole } from '../../../core/models/enums';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { buildProductPlaceholderDataUrl, enterpriseProductFallbackImageUrl, resolveEnterpriseProductImageUrl } from '../../../core/services/product-image.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PaginationComponent],
  template: `
    <div class="page-content">
      <div class="page-header">
        <div class="page-title">
          <h1>Products</h1>
          <p>Browse and manage the product catalog</p>
        </div>
        <div class="page-actions">
          @if (isAdmin()) {
            <a routerLink="/products/new" class="btn btn-primary">
              <span>+</span> Add Product
            </a>
          }
        </div>
      </div>

      <!-- Search & filters -->
      <div class="toolbar mb-6">
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input type="search" class="search-input" placeholder="Search products by name or SKU..."
                 [(ngModel)]="searchQuery" (ngModelChange)="onSearch($event)">
        </div>
        <div class="toolbar-right">
          <select class="form-control toolbar-select" [(ngModel)]="stockFilter" (ngModelChange)="onStockFilterChange()">
            <option value="all">All Stock</option>
            <option value="in-stock">In Stock</option>
            <option value="low-stock">Low Stock</option>
            <option value="out-of-stock">Out of Stock</option>
            <option value="inactive">Inactive</option>
          </select>
          <select class="form-control toolbar-select" [(ngModel)]="sortBy" (ngModelChange)="onSortChange()">
            <option value="relevance">Relevance</option>
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="price-asc">Price Low-High</option>
            <option value="price-desc">Price High-Low</option>
            <option value="stock-desc">Highest Stock</option>
          </select>
          <span class="result-count">{{ resultCountLabel() }}</span>
        </div>
      </div>

      @if (loading()) {
        <div class="grid-4">
          @for (i of [1,2,3,4,5,6,7,8]; track i) {
            <div class="skeleton" style="height:260px"></div>
          }
        </div>
      } @else if (products().length === 0) {
        <div class="empty-state">
          <div class="empty-icon">📦</div>
          <div class="empty-title">No products found</div>
          <div class="empty-desc">Try a different search term or add a new product</div>
          @if (isAdmin()) {
            <a routerLink="/products/new" class="btn btn-primary mt-4">Add First Product</a>
          }
        </div>
      } @else {
        <div class="grid-4">
          @for (p of products(); track p.productId) {
            <a [routerLink]="['/products', p.productId]" class="product-card">
              <div class="product-img-wrap">
                <img [src]="getProductImageUrl(p)" [alt]="p.name" (error)="onProductImageError($event)">
                @if (!p.isActive) {
                  <div class="product-overlay-badge">Inactive</div>
                }
              </div>
              <div class="product-body">
                <div class="product-name">{{ p.name }}</div>
                <div class="product-sku">{{ p.sku }}</div>
                <div class="product-footer">
                  <div class="product-price">{{ p.unitPrice | currency:'INR':'₹':'1.2-2' }}</div>
                  <div class="stock-badge" [class]="stockClass(p)">{{ stockLabel(p) }}</div>
                </div>
              </div>
              @if (isDealer() && p.isActive && p.availableStock > 0) {
                <button class="add-to-cart-btn" (click)="quickAdd($event, p)">
                  + Add to Cart
                </button>
              }
            </a>
          }
        </div>

        @if (showPagination()) {
          <app-pagination [currentPage]="page()" [totalCount]="totalCount()" [pageSize]="20"
                          (pageChange)="loadPage($event)" />
        }
      }
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .search-wrap {
      position: relative;
      flex: 1;
      max-width: 420px;
    }
    .search-icon {
      position: absolute;
      left: 13px; top: 50%;
      transform: translateY(-50%);
      font-size: 15px;
      color: var(--text-tertiary);
      pointer-events: none;
    }
    .search-input {
      width: 100%;
      padding: 10px 14px 10px 40px;
      border: 1.5px solid var(--border);
      border-radius: var(--r-lg);
      font-size: .875rem;
      font-family: inherit;
      color: var(--text-primary);
      background: var(--surface);
      outline: none;
      transition: border-color var(--t-base) var(--ease), box-shadow var(--t-base) var(--ease);
      &:focus { 
        border-color: var(--brand-500); 
        box-shadow: 0 0 0 3px rgba(59,130,246,.15); 
      }
    }
    .toolbar-right { display: flex; align-items: center; gap: 12px; }
    .result-count { font-size: .8125rem; color: var(--text-secondary); font-weight: 600; }
    .toolbar-select {
      width: 170px;
      min-width: 170px;
      font-size: .8125rem;
      padding-top: 8px;
      padding-bottom: 8px;
    }

    /* Product card enhancements */
    .product-card {
      text-decoration: none;
      color: inherit;
      position: relative;
    }
    .product-overlay-badge {
      position: absolute;
      top: 10px; left: 10px;
      background: rgba(15,23,42,.75);
      color: #fff;
      font-size: .6875rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: var(--r-full);
      backdrop-filter: blur(4px);
      letter-spacing: .02em;
    }
    .product-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 10px;
      gap: 8px;
    }
    .stock-badge {
      font-size: .6875rem;
      font-weight: 600;
      padding: 4px 9px;
      border-radius: var(--r-full);
      letter-spacing: .01em;
    }
    .stock-ok      { background: var(--success-bg); color: var(--success-text); }
    .stock-low     { background: var(--warning-bg); color: var(--warning-text); }
    .stock-out     { background: var(--error-bg);   color: var(--error-text); }
    .stock-inactive{ background: var(--gray-100);   color: var(--text-tertiary); }

    .add-to-cart-btn {
      display: block;
      width: calc(100% - 24px);
      margin: 0 12px 12px;
      padding: 9px 12px;
      background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 55%, #0ea5e9 100%);
      color: #fff;
      border: none;
      border-radius: var(--r-lg);
      font-size: .8125rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity var(--t-base) var(--ease), transform var(--t-base) var(--ease), box-shadow var(--t-base) var(--ease);
      opacity: 0;
      transform: translateY(4px);
      font-family: inherit;
      box-shadow: 0 4px 12px rgba(37,99,235,.25);
    }
    .product-card:hover .add-to-cart-btn {
      opacity: 1;
      transform: translateY(0);
    }
    .add-to-cart-btn:hover { 
      box-shadow: 0 6px 16px rgba(37,99,235,.35);
      transform: translateY(-1px);
    }
    .add-to-cart-btn:active {
      transform: scale(0.97);
    }
  `]
})
export class ProductListComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly authStore  = inject(AuthStore);
  private readonly cartStore  = inject(CartStore);
  private readonly toast      = inject(ToastService);
  private readonly search$    = new Subject<string>();

  readonly enterpriseCatalogFallbackImageUrl = enterpriseProductFallbackImageUrl;

  readonly loading     = signal(true);
  readonly allProducts = signal<ProductListItemDto[]>([]);
  readonly products    = signal<ProductListItemDto[]>([]);
  readonly page        = signal(1);
  readonly serverTotalCount = signal(0);
  readonly totalCount  = signal(0);
  readonly isSearching = signal(false);
  searchQuery = '';
  stockFilter: 'all' | 'in-stock' | 'low-stock' | 'out-of-stock' | 'inactive' = 'all';
  sortBy: 'relevance' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-desc' = 'relevance';

  readonly isAdmin  = () => this.authStore.hasRole(UserRole.Admin);
  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly canViewInactive = () => this.isAdmin();

  stockClass(p: ProductListItemDto): string {
    if (!p.isActive) return 'stock-inactive';
    if (p.availableStock === 0) return 'stock-out';
    if (p.availableStock < 10) return 'stock-low';
    return 'stock-ok';
  }

  stockLabel(p: ProductListItemDto): string {
    if (!p.isActive) return 'Inactive';
    if (p.availableStock === 0) return 'Out of stock';
    if (p.availableStock < 10) return `Low: ${p.availableStock}`;
    return `${p.availableStock} in stock`;
  }

  getProductImageUrl(product: ProductListItemDto): string {
    return product.imageUrl || resolveEnterpriseProductImageUrl(product.name, product.sku, 640, 420);
  }

  onProductImageError(event: Event): void {
    const imageElement = event.target as HTMLImageElement | null;
    if (!imageElement) {
      return;
    }

    if (imageElement.dataset['fallbackApplied'] === '1') {
      return;
    }

    imageElement.dataset['fallbackApplied'] = '1';
    const productName = imageElement.alt || 'Product';
    imageElement.src = buildProductPlaceholderDataUrl(productName, undefined, 640, 420);
  }

  ngOnInit(): void {
    this.loadPage(1);
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => {
        this.loading.set(true);
        if (!q.trim()) {
          this.isSearching.set(false);
          return this.catalogApi.getProducts(1, 20, this.canViewInactive());
        }
        this.isSearching.set(true);
        return this.catalogApi.searchProducts(q, this.canViewInactive());
      })
    ).subscribe({
      next: res => {
        if (Array.isArray(res)) {
          this.allProducts.set(res);
          this.serverTotalCount.set(res.length);
          this.applyView();
        } else {
          this.allProducts.set(res.items);
          this.serverTotalCount.set(res.totalCount);
          this.applyView();
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  loadPage(p: number): void {
    this.page.set(p);
    this.loading.set(true);
    this.catalogApi.getProducts(p, 20, this.canViewInactive()).subscribe({
      next: res => {
        this.allProducts.set(res.items);
        this.serverTotalCount.set(res.totalCount);
        this.applyView();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSearch(q: string): void { this.search$.next(q); }

  onStockFilterChange(): void {
    this.applyView();
  }

  onSortChange(): void {
    this.applyView();
  }

  showPagination(): boolean {
    return !this.isSearching() && this.stockFilter === 'all' && this.sortBy === 'relevance';
  }

  resultCountLabel(): string {
    const visible = this.products().length;
    const total = this.totalCount();
    return total > visible ? `${visible} shown of ${total}` : `${visible} shown`;
  }

  quickAdd(event: Event, p: ProductListItemDto): void {
    event.preventDefault();
    event.stopPropagation();
    this.cartStore.addItem({ productId: p.productId, productName: p.name, sku: p.sku, quantity: 1, unitPrice: p.unitPrice, minOrderQty: 1, availableStock: p.availableStock });
    this.toast.success(`${p.name} added to cart`);
  }

  private applyView(): void {
    let view = [...this.allProducts()];

    if (this.stockFilter === 'in-stock') {
      view = view.filter(p => p.isActive && p.availableStock >= 10);
    } else if (this.stockFilter === 'low-stock') {
      view = view.filter(p => p.isActive && p.availableStock > 0 && p.availableStock < 10);
    } else if (this.stockFilter === 'out-of-stock') {
      view = view.filter(p => p.isActive && p.availableStock === 0);
    } else if (this.stockFilter === 'inactive') {
      view = view.filter(p => !p.isActive);
    }

    if (this.sortBy === 'name-asc') {
      view.sort((a, b) => a.name.localeCompare(b.name));
    } else if (this.sortBy === 'name-desc') {
      view.sort((a, b) => b.name.localeCompare(a.name));
    } else if (this.sortBy === 'price-asc') {
      view.sort((a, b) => a.unitPrice - b.unitPrice);
    } else if (this.sortBy === 'price-desc') {
      view.sort((a, b) => b.unitPrice - a.unitPrice);
    } else if (this.sortBy === 'stock-desc') {
      view.sort((a, b) => b.availableStock - a.availableStock);
    }

    this.products.set(view);

    if (this.showPagination()) {
      this.totalCount.set(this.serverTotalCount());
    } else {
      this.totalCount.set(view.length);
    }
  }
}
