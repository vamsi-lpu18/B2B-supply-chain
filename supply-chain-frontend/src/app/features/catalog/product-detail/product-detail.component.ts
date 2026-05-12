import { Component, inject, signal, OnInit, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { AuthStore } from '../../../core/stores/auth.store';
import { CartStore } from '../../../core/stores/cart.store';
import { ToastService } from '../../../core/services/toast.service';
import { ProductDto, ProductReviewDto } from '../../../core/models/catalog.models';
import { UserRole } from '../../../core/models/enums';
import { buildProductPlaceholderDataUrl, enterpriseProductFallbackImageUrl, resolveEnterpriseProductImageUrl } from '../../../core/services/product-image.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './product-detail.component.html',
  styleUrl: './product-detail.component.scss'
})
export class ProductDetailComponent implements OnInit {
  readonly id = input.required<string>();

  private readonly catalogApi = inject(CatalogApiService);
  private readonly authStore  = inject(AuthStore);
  private readonly cartStore  = inject(CartStore);
  private readonly toast      = inject(ToastService);
  private readonly router     = inject(Router);

  readonly loading          = signal(true);
  readonly actionLoading    = signal(false);
  readonly product          = signal<ProductDto | null>(null);
  readonly reviews          = signal<ProductReviewDto[]>([]);
  readonly showRestockDialog = signal(false);
  readonly enterpriseCatalogFallbackImageUrl = enterpriseProductFallbackImageUrl;
  qty = 1;
  restockQty = 1;
  restockRef = '';
  reviewRating = 5;
  reviewTitle = '';
  reviewComment = '';

  readonly isAdmin     = () => this.authStore.hasRole(UserRole.Admin);
  readonly isDealer    = () => this.authStore.hasRole(UserRole.Dealer);
  readonly canRestock  = () => this.authStore.hasRole(UserRole.Admin, UserRole.Warehouse);

  ngOnInit(): void {
    this.catalogApi.getProductById(this.id()).subscribe({
      next: p => {
        this.product.set(p);
        this.qty = this.normalizeQty(p.minOrderQty);
        this.loadReviews();
        this.loading.set(false);
      },
      error: () => { this.product.set(null); this.loading.set(false); }
    });
  }

  averageRating(): string {
    const all = this.reviews();
    if (all.length === 0) {
      return '0.0';
    }

    const sum = all.reduce((total, review) => total + review.rating, 0);
    return (sum / all.length).toFixed(1);
  }

  canPurchase(): boolean {
    const p = this.product();
    if (!p) {
      return false;
    }

    if (!p.isActive || p.availableStock <= 0) {
      return false;
    }

    return this.maxPurchasable() > 0;
  }

  maxPurchasable(): number {
    const p = this.product();
    if (!p) {
      return 0;
    }

    if (p.availableStock < p.minOrderQty) {
      return 0;
    }

    return Math.floor(p.availableStock / p.minOrderQty) * p.minOrderQty;
  }

  onQtyInput(value: string | number): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }

    this.qty = Math.max(0, Math.trunc(parsed));
  }

  onQtyBlur(): void {
    this.qty = this.normalizeQty(this.qty);
  }

  stepQty(direction: -1 | 1): void {
    const p = this.product();
    if (!p) {
      return;
    }

    const step = Math.max(1, p.minOrderQty);
    const next = direction > 0 ? this.qty + step : this.qty - step;
    this.qty = this.normalizeQty(next);
  }

  setQtyToMin(): void {
    const p = this.product();
    if (!p) {
      return;
    }

    this.qty = this.normalizeQty(p.minOrderQty);
  }

  setQtyToMax(): void {
    this.qty = this.maxPurchasable();
  }

  addToCart(): void {
    const p = this.product()!;
    if (!this.canPurchase()) {
      this.toast.warning('This product is currently unavailable for purchase');
      return;
    }

    const normalizedQty = this.normalizeQty(this.qty);
    if (normalizedQty < p.minOrderQty) {
      this.toast.warning(`Minimum order quantity is ${p.minOrderQty}`);
      return;
    }

    if (normalizedQty > p.availableStock) {
      this.toast.warning(`Only ${p.availableStock} units available`);
      return;
    }

    this.qty = normalizedQty;
    this.cartStore.addItem({ productId: p.productId, productName: p.name, sku: p.sku, quantity: normalizedQty, unitPrice: p.unitPrice, minOrderQty: p.minOrderQty, availableStock: p.availableStock });
    this.toast.success(`${p.name} added to cart`);
  }

  deactivate(): void {
    this.catalogApi.deactivateProduct(this.id()).subscribe({
      next: () => { this.toast.success('Product deactivated'); this.product.update(p => p ? { ...p, isActive: false } : p); },
      error: () => {}
    });
  }

  restock(): void {
    this.catalogApi.restockProduct(this.id(), { quantity: this.restockQty, referenceId: this.restockRef }).subscribe({
      next: () => {
        this.toast.success('Product restocked');
        this.showRestockDialog.set(false);
        this.catalogApi.getProductById(this.id()).subscribe(p => {
          this.product.set(p);
          this.qty = this.normalizeQty(this.qty);
        });
      },
      error: () => {}
    });
  }

  submitReview(): void {
    if (!this.reviewTitle.trim() || !this.reviewComment.trim()) {
      return;
    }

    this.actionLoading.set(true);
    this.catalogApi.createProductReview(this.id(), {
      rating: this.reviewRating,
      title: this.reviewTitle,
      comment: this.reviewComment
    }).subscribe({
      next: () => {
        this.toast.success('Review submitted for moderation');
        this.reviewRating = 5;
        this.reviewTitle = '';
        this.reviewComment = '';
        this.loadReviews();
        this.actionLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to submit review');
        this.actionLoading.set(false);
      }
    });
  }

  approveReview(reviewId: string): void {
    this.actionLoading.set(true);
    this.catalogApi.approveProductReview(reviewId, {}).subscribe({
      next: () => {
        this.toast.success('Review approved');
        this.loadReviews();
        this.actionLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to approve review');
        this.actionLoading.set(false);
      }
    });
  }

  rejectReview(reviewId: string): void {
    this.actionLoading.set(true);
    this.catalogApi.rejectProductReview(reviewId, {}).subscribe({
      next: () => {
        this.toast.info('Review rejected');
        this.loadReviews();
        this.actionLoading.set(false);
      },
      error: () => {
        this.toast.error('Failed to reject review');
        this.actionLoading.set(false);
      }
    });
  }

  stars(rating: number): string {
    const safeRating = Math.max(1, Math.min(5, Math.round(rating)));
    return `${'★'.repeat(safeRating)}${'☆'.repeat(5 - safeRating)}`;
  }

  private normalizeQty(value: number): number {
    const p = this.product();
    if (!p) {
      return Math.max(1, Math.trunc(value));
    }

    if (!this.canPurchase()) {
      return 0;
    }

    const max = this.maxPurchasable();
    let next = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : p.minOrderQty;

    if (next < p.minOrderQty) {
      next = p.minOrderQty;
    }

    if (next > max) {
      next = max;
    }

    next = Math.floor(next / p.minOrderQty) * p.minOrderQty;
    return Math.max(p.minOrderQty, Math.min(max, next));
  }

  getProductImageUrl(product: ProductDto): string {
    return product.imageUrl || resolveEnterpriseProductImageUrl(product.name, product.sku, 1024, 640);
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
    const productName = imageElement.alt || this.product()?.name || 'Product';
    const sku = this.product()?.sku;
    imageElement.src = buildProductPlaceholderDataUrl(productName, sku, 1024, 640);
  }

  relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    return `${Math.floor(hrs / 24)} days ago`;
  }

  private loadReviews(): void {
    this.catalogApi.getProductReviews(this.id(), this.isAdmin()).subscribe({
      next: reviews => this.reviews.set(reviews),
      error: () => this.reviews.set([])
    });
  }
}
