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
  templateUrl: './product-list.component.html',
  styleUrl: './product-list.component.scss'
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
