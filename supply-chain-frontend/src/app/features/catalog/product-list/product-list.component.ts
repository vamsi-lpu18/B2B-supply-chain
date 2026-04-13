import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, switchMap } from 'rxjs';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { ToastService } from '../../../core/services/toast.service';
import { CategoryDto, ProductListItemDto } from '../../../core/models/catalog.models';
import { UserRole } from '../../../core/models/enums';
import { PaginationComponent } from '../../../shared/components/pagination/pagination.component';
import { buildProductPlaceholderDataUrl, resolveEnterpriseProductImageUrl } from '../../../core/services/product-image.service';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PaginationComponent],
  template: `
    <div class="page-content feature-catalog">
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

      <div class="toolbar mb-6">
        <div class="search-wrap">
          <span class="search-icon"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
          <input
            type="search"
            class="search-input"
            placeholder="Search products by name or SKU..."
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearch($event)">
        </div>

        <div class="toolbar-right">
          <div class="filter-field category-field">
            <label class="filter-label" for="category-parent-filter">Category</label>
            <select id="category-parent-filter" class="form-control toolbar-select category-select" [(ngModel)]="parentCategoryFilter" (ngModelChange)="onParentCategoryFilterChange()">
              <option value="all">All Categories</option>
              @for (parent of topLevelCategories(); track parent.categoryId) {
                <option [value]="parent.categoryId">{{ parent.name }}</option>
              }
            </select>

            @if (showChildCategoryFilter()) {
              <select id="category-child-filter" class="form-control toolbar-select category-select child-category-select" [(ngModel)]="childCategoryFilter" (ngModelChange)="onChildCategoryFilterChange()">
                <option value="all">All under {{ selectedParentName() }}</option>
                @for (child of selectedParentChildren(); track child.categoryId) {
                  <option [value]="child.categoryId">{{ child.name }}</option>
                }
              </select>
            }
          </div>

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
          <button class="btn btn-ghost btn-sm" (click)="clearFilters()" [disabled]="!hasActiveFilters()">Reset Filters</button>
        </div>
      </div>

      <div class="catalog-insights mb-4">
        <div class="insight-card">
          <span class="insight-label">Visible Products</span>
          <span class="insight-value">{{ products().length }}</span>
        </div>
        <div class="insight-card">
          <span class="insight-label">In Stock</span>
          <span class="insight-value">{{ inStockCount() }}</span>
        </div>
        <div class="insight-card">
          <span class="insight-label">Low Stock</span>
          <span class="insight-value">{{ lowStockCount() }}</span>
        </div>
        <div class="insight-card">
          <span class="insight-label">Visible Categories</span>
          <span class="insight-value">{{ visibleCategoryCount() }}</span>
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
          <div class="empty-icon"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>
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
                <img [src]="getProductImageUrl(p)"
                     [alt]="p.name"
                     [attr.data-sku]="p.sku"
                     [attr.data-category]="categoryLabel(p.categoryId)"
                     (error)="onProductImageError($event)">
                @if (!p.isActive) {
                  <div class="product-overlay-badge">Inactive</div>
                }
              </div>

              <div class="product-body">
                <div class="product-name">{{ p.name }}</div>
                <div class="product-sku">{{ p.sku }}</div>
                <div class="product-category">{{ categoryLabel(p.categoryId) }}</div>

                <div class="product-footer">
                  <div class="product-price">{{ p.unitPrice | currency:'INR':'₹':'1.2-2' }}</div>
                  <div class="stock-badge" [class]="stockClass(p)">{{ stockLabel(p) }}</div>
                </div>
              </div>

              @if (isDealer() && p.isActive && p.availableStock > 0) {
                <button
                  class="add-to-cart-btn"
                  (click)="quickAdd($event, p)"
                  [disabled]="quickAddProductId() === p.productId">
                  {{ quickAddProductId() === p.productId ? 'Adding...' : '+ Add to Cart' }}
                </button>
              }
            </a>
          }
        </div>

        @if (showPagination()) {
          <app-pagination
            [currentPage]="page()"
            [totalCount]="totalCount()"
            [pageSize]="20"
            (pageChange)="loadPage($event)" />
        }
      }
    </div>
  `,
  styles: [`
    .toolbar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; flex-wrap: wrap; margin-bottom: 24px;
    }
    .search-wrap { position: relative; flex: 1; max-width: 420px; }
    .search-icon {
      position: absolute; left: 13px; top: 50%; transform: translateY(-50%);
      font-size: 15px; color: var(--text-tertiary); pointer-events: none;
      transition: color 200ms;
    }
    .search-wrap:focus-within .search-icon { color: var(--brand-600); }
    .search-input {
      width: 100%; padding: 10px 14px 10px 40px;
      border: 1.5px solid var(--gray-300); border-radius: var(--r-lg);
      font-size: .875rem; font-family: inherit; color: var(--text-primary);
      background: var(--surface); box-shadow: var(--shadow-sm); outline: none;
      transition: all 200ms;
    }
    .search-input:hover { border-color: var(--gray-400); }
    .search-input:focus {
      border-color: var(--brand-400);
      box-shadow: 0 0 0 4px rgba(65,120,173,.12), var(--shadow-sm);
      background: #fff;
    }

    .toolbar-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .filter-field { display: flex; flex-direction: column; gap: 4px; }
    .filter-label {
      font-size: .68rem; color: var(--text-tertiary); text-transform: uppercase;
      letter-spacing: .05em; font-weight: 700; margin-left: 2px;
    }
    .category-field { min-width: 220px; }
    .category-select { min-width: 220px; font-weight: 600; }
    .child-category-select { margin-top: 4px; }
    .result-count { font-size: .8rem; color: var(--text-secondary); font-weight: 600; }
    .toolbar-select { width: 170px; min-width: 170px; font-size: .8rem; padding-top: 8px; padding-bottom: 8px; }

    .catalog-insights { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .insight-card {
      border: 1px solid var(--border); border-radius: var(--r-lg);
      background: var(--surface); padding: 14px; display: flex;
      flex-direction: column; gap: 4px; box-shadow: var(--shadow-sm);
      transition: all 200ms; position: relative; overflow: hidden;
    }
    .insight-card::before {
      content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
      background: var(--brand-400); border-radius: 0 9999px 9999px 0;
    }
    .insight-card:nth-child(2)::before { background: #10b981; }
    .insight-card:nth-child(3)::before { background: #f59e0b; }
    .insight-card:nth-child(4)::before { background: #8b5cf6; }
    .insight-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
    .insight-label {
      font-size: .68rem; color: var(--text-tertiary); text-transform: uppercase;
      letter-spacing: .04em; font-weight: 700;
    }
    .insight-value {
      font-size: 1.4rem; color: var(--text-primary); font-weight: 800;
      letter-spacing: -.02em; font-variant-numeric: tabular-nums;
    }

    .product-card {
      text-decoration: none; color: inherit; position: relative;
      display: flex; flex-direction: column;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--r-xl); overflow: hidden;
      box-shadow: var(--shadow-sm); transition: all 250ms cubic-bezier(.22,1,.36,1);
    }
    .product-card:hover {
      box-shadow: var(--shadow-lg); transform: translateY(-4px);
      border-color: var(--border-2);
    }

    .product-img-wrap {
      position: relative; overflow: hidden; aspect-ratio: 4/3;
      background: var(--surface-2);
    }
    .product-img-wrap img {
      width: 100%; height: 100%; object-fit: cover;
      transition: transform 400ms cubic-bezier(.22,1,.36,1);
    }
    .product-card:hover .product-img-wrap img { transform: scale(1.06); }

    .product-overlay-badge {
      position: absolute; top: 10px; left: 10px;
      background: rgba(24, 40, 58, .78); color: #fff;
      font-size: .68rem; font-weight: 700; padding: 4px 10px;
      border-radius: 9999px; backdrop-filter: blur(4px); letter-spacing: .02em;
    }

    .product-body { padding: 14px 16px 16px; flex: 1; display: flex; flex-direction: column; }
    .product-name {
      font-size: .9rem; font-weight: 700; color: var(--text-primary);
      line-height: 1.3; margin-bottom: 2px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .product-sku { font-size: .72rem; color: var(--text-tertiary); font-family: var(--font-mono); font-weight: 500; }
    .product-category { margin-top: 6px; font-size: .72rem; color: var(--brand-600); font-weight: 600; }

    .product-footer { display: flex; align-items: center; justify-content: space-between; margin-top: auto; padding-top: 10px; gap: 8px; }
    .product-price { font-size: 1rem; font-weight: 800; color: var(--text-primary); letter-spacing: -.02em; }

    .stock-badge { font-size: .68rem; font-weight: 700; padding: 3px 9px; border-radius: 9999px; letter-spacing: .01em; }
    .stock-ok { background: var(--success-bg); color: var(--success-text); }
    .stock-low { background: var(--warning-bg); color: var(--warning-text); }
    .stock-out { background: var(--error-bg); color: var(--error-text); }
    .stock-inactive { background: var(--gray-100); color: var(--text-tertiary); }

    .add-to-cart-btn {
      display: block; width: calc(100% - 24px); margin: 0 12px 12px;
      padding: 9px 12px; background: linear-gradient(135deg, var(--brand-700), var(--brand-500));
      color: #fff; border: none; border-radius: var(--r-lg);
      font-size: .8rem; font-weight: 700; cursor: pointer; font-family: inherit;
      box-shadow: 0 4px 12px rgba(43,77,115,.3);
      opacity: 0; transform: translateY(4px);
      transition: all 200ms cubic-bezier(.22,1,.36,1);
    }
    .product-card:hover .add-to-cart-btn { opacity: 1; transform: translateY(0); }
    .add-to-cart-btn:hover { box-shadow: 0 6px 16px rgba(43,77,115,.4); transform: translateY(-1px); }
    .add-to-cart-btn:active { transform: scale(.97); }

    @media (max-width: 768px) {
      .catalog-insights { grid-template-columns: repeat(2, 1fr); }
      .search-wrap { max-width: none; width: 100%; }
      .toolbar-right { width: 100%; }
      .category-field { width: 100%; min-width: 0; }
      .category-select { min-width: 0; }
      .toolbar-select { width: 100%; min-width: 0; }
      .result-count { width: 100%; }
      .add-to-cart-btn { opacity: 1; transform: none; }
    }
  `]
})
export class ProductListComponent implements OnInit {
  private readonly catalogApi = inject(CatalogApiService);
  private readonly authStore = inject(AuthStore);
  private readonly cartStore = inject(CartStore);
  private readonly toast = inject(ToastService);
  private readonly search$ = new Subject<string>();

  readonly loading = signal(true);
  readonly allProducts = signal<ProductListItemDto[]>([]);
  readonly products = signal<ProductListItemDto[]>([]);
  readonly categories = signal<CategoryDto[]>([]);
  readonly quickAddProductId = signal<string | null>(null);
  readonly page = signal(1);
  readonly serverTotalCount = signal(0);
  readonly totalCount = signal(0);
  readonly isSearching = signal(false);

  searchQuery = '';
  parentCategoryFilter: 'all' | string = 'all';
  childCategoryFilter: 'all' | string = 'all';
  stockFilter: 'all' | 'in-stock' | 'low-stock' | 'out-of-stock' | 'inactive' = 'all';
  sortBy: 'relevance' | 'name-asc' | 'name-desc' | 'price-asc' | 'price-desc' | 'stock-desc' = 'relevance';

  readonly isAdmin = () => this.authStore.hasRole(UserRole.Admin);
  readonly isDealer = () => this.authStore.hasRole(UserRole.Dealer);
  readonly canViewInactive = () => this.isAdmin();
  readonly categoryLookup = computed(() => {
    const lookup = new Map<string, CategoryDto>();
    this.categories().forEach(category => lookup.set(category.categoryId, category));
    return lookup;
  });
  readonly topLevelCategories = computed(() =>
    this.categories()
      .filter(category => !category.parentCategoryId)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
  readonly categoryChildrenMap = computed(() => {
    const map = new Map<string, CategoryDto[]>();
    this.categories().forEach(category => {
      if (!category.parentCategoryId) {
        return;
      }

      if (!map.has(category.parentCategoryId)) {
        map.set(category.parentCategoryId, []);
      }

      map.get(category.parentCategoryId)!.push(category);
    });

    map.forEach((items, key) => {
      map.set(key, [...items].sort((a, b) => a.name.localeCompare(b.name)));
    });

    return map;
  });
  readonly selectedParentCategory = computed(() => {
    if (this.parentCategoryFilter === 'all') {
      return null;
    }

    const selected = this.categoryLookup().get(this.parentCategoryFilter);
    return selected && !selected.parentCategoryId ? selected : null;
  });
  readonly selectedParentChildren = computed(() => {
    const parent = this.selectedParentCategory();
    if (!parent) {
      return [];
    }

    return this.categoryChildrenMap().get(parent.categoryId) ?? [];
  });

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

  categoryLabel(categoryId: string): string {
    const category = this.categoryLookup().get(categoryId);
    if (!category) {
      return 'Uncategorized';
    }

    if (!category.parentCategoryId) {
      return category.name;
    }

    const parent = this.categoryLookup().get(category.parentCategoryId);
    return parent ? `${parent.name} / ${category.name}` : category.name;
  }

  hasActiveFilters(): boolean {
    return this.activeFilterCount() > 0;
  }

  activeFilterCount(): number {
    let count = 0;
    if (this.searchQuery.trim().length > 0) count += 1;
    if (this.parentCategoryFilter !== 'all') count += 1;
    if (this.stockFilter !== 'all') count += 1;
    if (this.sortBy !== 'relevance') count += 1;
    return count;
  }

  clearFilters(): void {
    this.searchQuery = '';
    this.parentCategoryFilter = 'all';
    this.childCategoryFilter = 'all';
    this.stockFilter = 'all';
    this.sortBy = 'relevance';
    this.isSearching.set(false);
    this.loadPage(1);
  }

  inStockCount(): number {
    return this.products().filter(product => product.isActive && product.availableStock > 0).length;
  }

  lowStockCount(): number {
    return this.products().filter(product => product.isActive && product.availableStock > 0 && product.availableStock < 10).length;
  }

  visibleCategoryCount(): number {
    return new Set(this.products().map(product => product.categoryId)).size;
  }

  getProductImageUrl(product: ProductListItemDto): string {
    if (product.imageUrl) return product.imageUrl;
    const category = this.categoryLabel(product.categoryId);
    return buildProductPlaceholderDataUrl(product.name, product.sku, 640, 420, category);
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
    const sku = imageElement.dataset['sku'];
    const category = imageElement.dataset['category'];
    imageElement.src = buildProductPlaceholderDataUrl(productName, sku, 640, 420, category);
  }

  ngOnInit(): void {
    this.catalogApi.getCategories().subscribe({
      next: categories => this.categories.set(categories ?? []),
      error: () => this.categories.set([])
    });

    this.loadPage(1);
    this.search$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(query => {
          this.loading.set(true);
          if (!query.trim()) {
            this.isSearching.set(false);
            return this.catalogApi.getProducts(1, 20, this.canViewInactive());
          }

          this.isSearching.set(true);
          return this.catalogApi.searchProducts(query, this.canViewInactive());
        })
      )
      .subscribe({
        next: response => {
          if (Array.isArray(response)) {
            this.allProducts.set(response);
            this.serverTotalCount.set(response.length);
          } else {
            this.allProducts.set(response.items);
            this.serverTotalCount.set(response.totalCount);
          }

          this.applyView();
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  loadPage(nextPage: number): void {
    this.page.set(nextPage);
    this.loading.set(true);

    this.catalogApi.getProducts(nextPage, 20, this.canViewInactive()).subscribe({
      next: response => {
        this.allProducts.set(response.items);
        this.serverTotalCount.set(response.totalCount);
        this.applyView();
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onSearch(query: string): void {
    this.search$.next(query);
  }

  onParentCategoryFilterChange(): void {
    this.childCategoryFilter = 'all';
    this.applyView();
  }

  onChildCategoryFilterChange(): void {
    this.applyView();
  }

  showChildCategoryFilter(): boolean {
    return this.selectedParentChildren().length > 0;
  }

  selectedParentName(): string {
    return this.selectedParentCategory()?.name ?? 'Selected category';
  }

  onStockFilterChange(): void {
    this.applyView();
  }

  onSortChange(): void {
    this.applyView();
  }

  showPagination(): boolean {
    return !this.isSearching()
      && this.parentCategoryFilter === 'all'
      && this.childCategoryFilter === 'all'
      && this.stockFilter === 'all'
      && this.sortBy === 'relevance';
  }

  resultCountLabel(): string {
    const visible = this.products().length;
    const total = this.totalCount();
    return total > visible ? `${visible} shown of ${total}` : `${visible} shown`;
  }

  quickAdd(event: Event, product: ProductListItemDto): void {
    event.preventDefault();
    event.stopPropagation();

    if (this.quickAddProductId() === product.productId) {
      return;
    }

    this.quickAddProductId.set(product.productId);
    this.catalogApi.getProductById(product.productId).subscribe({
      next: fullProduct => {
        const quantity = this.cartStore.normalizeQuantity(fullProduct.minOrderQty, fullProduct.minOrderQty, fullProduct.availableStock);
        if (!fullProduct.isActive || quantity <= 0) {
          this.toast.warning('This product is currently unavailable');
          this.quickAddProductId.set(null);
          return;
        }

        this.cartStore.addItem({
          productId: fullProduct.productId,
          productName: fullProduct.name,
          sku: fullProduct.sku,
          quantity,
          unitPrice: fullProduct.unitPrice,
          minOrderQty: fullProduct.minOrderQty,
          availableStock: fullProduct.availableStock
        });

        this.toast.success(`${fullProduct.name} added to cart`);
        this.quickAddProductId.set(null);
      },
      error: () => {
        this.toast.error('Failed to add product to cart');
        this.quickAddProductId.set(null);
      }
    });
  }

  private applyView(): void {
    let view = [...this.allProducts()];

    if (this.parentCategoryFilter !== 'all') {
      view = view.filter(product => this.matchesCategoryFilter(product.categoryId));
    }

    if (this.stockFilter === 'in-stock') {
      view = view.filter(product => product.isActive && product.availableStock >= 10);
    } else if (this.stockFilter === 'low-stock') {
      view = view.filter(product => product.isActive && product.availableStock > 0 && product.availableStock < 10);
    } else if (this.stockFilter === 'out-of-stock') {
      view = view.filter(product => product.isActive && product.availableStock === 0);
    } else if (this.stockFilter === 'inactive') {
      view = view.filter(product => !product.isActive);
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
    this.totalCount.set(this.showPagination() ? this.serverTotalCount() : view.length);
  }

  private matchesCategoryFilter(productCategoryId: string): boolean {
    if (this.parentCategoryFilter === 'all') {
      return true;
    }

    if (this.childCategoryFilter !== 'all') {
      return productCategoryId === this.childCategoryFilter;
    }

    if (productCategoryId === this.parentCategoryFilter) {
      return true;
    }

    const selected = this.categoryLookup().get(this.parentCategoryFilter);
    if (!selected || selected.parentCategoryId) {
      return false;
    }

    const productCategory = this.categoryLookup().get(productCategoryId);
    return productCategory?.parentCategoryId === selected.categoryId;
  }
}
