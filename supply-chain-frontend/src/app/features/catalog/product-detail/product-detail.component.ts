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
  template: `
    <div class="page-content feature-catalog">
      <div class="page-header">
        <a routerLink="/products" class="btn btn-ghost">← Products</a>
        @if (isAdmin()) {
          <div class="d-flex gap-2">
            <a [routerLink]="['/products', id(), 'edit']" class="btn btn-secondary">Edit</a>
            <button class="btn btn-danger" (click)="deactivate()" [disabled]="!product()?.isActive">Deactivate</button>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="skeleton" style="height:400px;border-radius:8px"></div>
      } @else if (product()) {
        <div class="product-detail-layout">
          <div class="product-image-section">
            <img [src]="getProductImageUrl(product()!)"
                 [alt]="product()!.name"
                 class="product-detail-img"
                 (error)="onProductImageError($event)">
          </div>

          <div class="product-info-section">
            <div class="d-flex gap-2 align-center mb-2">
              @if (!product()!.isActive) { <span class="badge badge-neutral">Inactive</span> }
              @if (product()!.availableStock === 0) { <span class="badge badge-error">Out of Stock</span> }
              @if (product()!.availableStock > 0 && product()!.availableStock < 10) { <span class="badge badge-warning">Low Stock</span> }
            </div>

            <h1 class="product-title">{{ product()!.name }}</h1>
            <p class="text-secondary text-sm mb-4">SKU: {{ product()!.sku }}</p>
            <p class="mb-4">{{ product()!.description }}</p>

            <div class="price-section mb-4">
              <span class="price-value">{{ product()!.unitPrice | currency:'INR':'symbol':'1.2-2' }}</span>
              <span class="text-secondary text-sm ml-2">per unit</span>
            </div>

            <div class="stock-grid mb-4">
              <div class="stock-item">
                <span class="stock-label">Available</span>
                <span class="stock-value" [class.text-error]="product()!.availableStock < 10">{{ product()!.availableStock }}</span>
              </div>
              <div class="stock-item">
                <span class="stock-label">Reserved</span>
                <span class="stock-value">{{ product()!.reservedStock }}</span>
              </div>
              <div class="stock-item">
                <span class="stock-label">Total</span>
                <span class="stock-value">{{ product()!.totalStock }}</span>
              </div>
              <div class="stock-item">
                <span class="stock-label">Min Order</span>
                <span class="stock-value fw-600 text-primary">{{ product()!.minOrderQty }}</span>
              </div>
            </div>

            <p class="text-xs text-secondary mb-4">Updated {{ relativeTime(product()!.updatedAtUtc) }}</p>

            @if (isDealer()) {
              <div class="add-to-cart">
                <div class="text-sm text-secondary mb-2">Order Quantity</div>
                <div class="d-flex gap-3 align-center flex-wrap">
                  <div class="qty-control">
                    <button type="button" class="qty-btn" (click)="stepQty(-1)" [disabled]="!canPurchase()">-</button>
                    <input type="number"
                           class="form-control qty-input"
                           [ngModel]="qty"
                           (ngModelChange)="onQtyInput($event)"
                           (blur)="onQtyBlur()"
                           [min]="product()!.minOrderQty"
                           [max]="maxPurchasable()"
                           [step]="product()!.minOrderQty">
                    <button type="button" class="qty-btn" (click)="stepQty(1)" [disabled]="!canPurchase()">+</button>
                  </div>

                  <button type="button" class="btn btn-secondary btn-sm" (click)="setQtyToMin()" [disabled]="!canPurchase()">
                    Min {{ product()!.minOrderQty }}
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="setQtyToMax()" [disabled]="!canPurchase() || maxPurchasable() === 0">
                    Max {{ maxPurchasable() }}
                  </button>
                </div>

                <div class="text-xs text-secondary mt-2">
                  Step {{ product()!.minOrderQty }} · Available {{ product()!.availableStock }}
                </div>

                <button class="btn btn-primary btn-lg"
                        [disabled]="!canPurchase()"
                        (click)="addToCart()">
                  🛒 Add to Cart
                </button>
              </div>
            }

            @if (canRestock()) {
              <button class="btn btn-secondary mt-4" (click)="showRestockDialog.set(true)">📦 Restock</button>
            }
          </div>
        </div>

        <div class="card mt-4">
          <div class="d-flex justify-between align-center mb-4 flex-wrap gap-2">
            <h2>Reviews</h2>
            <span class="text-sm text-secondary">Average {{ averageRating() }} / 5 · {{ reviews().length }} review(s)</span>
          </div>

          @if (isDealer()) {
            <div class="review-form mb-4">
              <h3 class="mb-2">Add Review</h3>
              <div class="d-flex gap-2 mb-2 flex-wrap">
                <select class="form-control" style="max-width:140px" [(ngModel)]="reviewRating">
                  <option [ngValue]="5">5 - Excellent</option>
                  <option [ngValue]="4">4 - Good</option>
                  <option [ngValue]="3">3 - Average</option>
                  <option [ngValue]="2">2 - Poor</option>
                  <option [ngValue]="1">1 - Bad</option>
                </select>
                <input class="form-control" style="min-width:220px" maxlength="120" placeholder="Review title" [(ngModel)]="reviewTitle">
              </div>
              <textarea class="form-control" rows="3" maxlength="1500" placeholder="Write your review" [(ngModel)]="reviewComment"></textarea>
              <div class="mt-2">
                <button class="btn btn-primary" (click)="submitReview()" [disabled]="!reviewTitle.trim() || !reviewComment.trim() || actionLoading()">Submit Review</button>
              </div>
            </div>
          }

          @if (reviews().length === 0) {
            <p class="text-sm text-secondary">No reviews yet.</p>
          } @else {
            <div class="review-list">
              @for (r of reviews(); track r.reviewId) {
                <div class="review-item">
                  <div class="d-flex justify-between align-center flex-wrap gap-2">
                    <div>
                      <span class="fw-700">{{ r.title }}</span>
                      <span class="text-sm text-secondary ml-2">{{ stars(r.rating) }} · {{ r.createdAtUtc | date:'dd MMM yyyy' }}</span>
                    </div>
                    @if (r.isApproved) { <span class="badge badge-success">Approved</span> }
                    @if (r.isRejected) { <span class="badge badge-error">Rejected</span> }
                    @if (!r.isApproved && !r.isRejected) { <span class="badge badge-warning">Pending Moderation</span> }
                  </div>
                  <p class="text-sm mt-2">{{ r.comment }}</p>

                  @if (isAdmin() && !r.isApproved && !r.isRejected) {
                    <div class="d-flex gap-2 mt-2">
                      <button class="btn btn-primary btn-sm" (click)="approveReview(r.reviewId)" [disabled]="actionLoading()">Approve</button>
                      <button class="btn btn-danger btn-sm" (click)="rejectReview(r.reviewId)" [disabled]="actionLoading()">Reject</button>
                    </div>
                  }

                  @if (r.moderationNote) {
                    <p class="text-xs text-secondary mt-2">Moderation note: {{ r.moderationNote }}</p>
                  }
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <div class="empty-state">
          <div class="empty-icon">❌</div>
          <div class="empty-title">Product not found</div>
          <a routerLink="/products" class="btn btn-primary mt-4">Back to Products</a>
        </div>
      }

      <!-- Restock Dialog -->
      @if (showRestockDialog()) {
        <div class="modal-backdrop" (click)="showRestockDialog.set(false)">
          <div class="modal" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h2>Restock Product</h2>
              <button class="btn btn-ghost btn-icon" (click)="showRestockDialog.set(false)">✕</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Quantity *</label>
                <input type="number" class="form-control" [(ngModel)]="restockQty" min="1">
              </div>
              <div class="form-group">
                <label>Reference ID *</label>
                <input type="text" class="form-control" [(ngModel)]="restockRef" placeholder="PO-12345">
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" (click)="showRestockDialog.set(false)">Cancel</button>
              <button class="btn btn-primary" (click)="restock()" [disabled]="restockQty < 1 || !restockRef">Restock</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .product-detail-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
    .product-detail-img {
      width: 100%;
      border-radius: 12px;
      object-fit: cover;
      max-height: 400px;
      border: 1px solid #c3d4e5;
      box-shadow: 0 10px 20px rgba(23, 39, 58, .14);
    }
    .product-title {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--text-primary);
    }
    .price-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--brand-700);
      letter-spacing: -.02em;
    }
    .stock-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .stock-item {
      background: linear-gradient(180deg, rgba(246,250,255,.78) 0%, rgba(234,243,252,.68) 100%);
      border: 1px solid #c3d4e5;
      border-radius: 10px;
      padding: 12px;
      text-align: center;
    }
    .review-form {
      background: linear-gradient(180deg, rgba(246,250,255,.74) 0%, rgba(234,243,252,.62) 100%);
      border: 1px solid #c3d4e5;
      border-radius: 10px;
      padding: 12px;
    }
    .review-list { display: flex; flex-direction: column; gap: 12px; }
    .review-item {
      border: 1px solid #c7d7e7;
      background: linear-gradient(180deg, rgba(248,252,255,.80) 0%, rgba(236,245,252,.66) 100%);
      border-radius: 10px;
      padding: 12px;
    }
    .stock-label { display: block; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 4px; }
    .stock-value { font-size: 20px; font-weight: 700; }
    .qty-control {
      display: inline-flex;
      align-items: center;
      border: 1px solid #b9ccdf;
      border-radius: 8px;
      overflow: hidden;
      background: linear-gradient(180deg, rgba(247,252,255,.84) 0%, rgba(233,242,251,.70) 100%);
    }
    .qty-btn {
      width: 36px;
      height: 38px;
      border: none;
      background: rgba(224, 235, 246, .8);
      color: var(--text-primary);
      font-size: 18px;
      cursor: pointer;
    }
    .qty-btn:disabled {
      cursor: not-allowed;
      opacity: .45;
    }
    .qty-input {
      width: 110px;
      border: none;
      border-left: 1px solid #c3d4e5;
      border-right: 1px solid #c3d4e5;
      border-radius: 0;
      text-align: center;
      font-weight: 600;
      padding-left: 8px;
      padding-right: 8px;
    }
    .qty-input:focus {
      box-shadow: none;
    }
    .ml-2 { margin-left: 8px; }
    @media (max-width: 768px) { .product-detail-layout { grid-template-columns: 1fr; } .stock-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
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
