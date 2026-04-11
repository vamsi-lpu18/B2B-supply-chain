import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateProductRequest, UpdateProductRequest, RestockProductRequest,
  ProductDto, ProductListItemDto, StockLevelDto, CategoryDto,
  SoftLockStockRequest, HardDeductStockRequest, ReleaseSoftLockRequest, StockSubscriptionRequest,
  ProductReviewDto, CreateProductReviewRequest, ModerateProductReviewRequest
} from '../models/catalog.models';
import { PagedResult } from '../models/shared.models';

@Injectable({ providedIn: 'root' })
export class CatalogApiService {
  private readonly http = inject(HttpClient);
  private readonly products = '/catalog/api/products';
  private readonly inventory = '/catalog/api/inventory';

  // Products
  getProducts(page = 1, size = 20, includeInactive = false): Observable<PagedResult<ProductListItemDto>> {
    const params = new HttpParams()
      .set('page', page)
      .set('size', size)
      .set('includeInactive', String(includeInactive));
    return this.http.get<PagedResult<ProductListItemDto>>(this.products, { params });
  }

  getProductById(id: string): Observable<ProductDto> {
    return this.http.get<ProductDto>(`${this.products}/${id}`);
  }

  getCategories(): Observable<CategoryDto[]> {
    return this.http.get<CategoryDto[]>(`${this.products}/categories`);
  }

  searchProducts(q: string, includeInactive = false): Observable<ProductListItemDto[]> {
    const params = new HttpParams()
      .set('q', q)
      .set('includeInactive', String(includeInactive));
    return this.http.get<ProductListItemDto[]>(`${this.products}/search`, { params });
  }

  getStockLevel(id: string): Observable<StockLevelDto> {
    return this.http.get<StockLevelDto>(`${this.products}/${id}/stock`);
  }

  createProduct(req: CreateProductRequest): Observable<ProductDto> {
    return this.http.post<ProductDto>(this.products, req);
  }

  updateProduct(id: string, req: UpdateProductRequest): Observable<ProductDto> {
    return this.http.put<ProductDto>(`${this.products}/${id}`, req);
  }

  deactivateProduct(id: string): Observable<unknown> {
    return this.http.put(`${this.products}/${id}/deactivate`, {});
  }

  restockProduct(id: string, req: RestockProductRequest): Observable<unknown> {
    return this.http.post(`${this.products}/${id}/restock`, req);
  }

  getProductReviews(id: string, includePending = false): Observable<ProductReviewDto[]> {
    const params = new HttpParams().set('includePending', String(includePending));
    return this.http.get<ProductReviewDto[]>(`${this.products}/${id}/reviews`, { params });
  }

  createProductReview(id: string, req: CreateProductReviewRequest): Observable<ProductReviewDto> {
    return this.http.post<ProductReviewDto>(`${this.products}/${id}/reviews`, req);
  }

  approveProductReview(reviewId: string, req: ModerateProductReviewRequest): Observable<ProductReviewDto> {
    return this.http.put<ProductReviewDto>(`${this.products}/reviews/${reviewId}/approve`, req);
  }

  rejectProductReview(reviewId: string, req: ModerateProductReviewRequest): Observable<ProductReviewDto> {
    return this.http.put<ProductReviewDto>(`${this.products}/reviews/${reviewId}/reject`, req);
  }

  // Inventory
  softLock(req: SoftLockStockRequest): Observable<unknown> {
    return this.http.post(`${this.inventory}/soft-lock`, req);
  }

  hardDeduct(req: HardDeductStockRequest): Observable<unknown> {
    return this.http.post(`${this.inventory}/hard-deduct`, req);
  }

  releaseSoftLock(req: ReleaseSoftLockRequest): Observable<unknown> {
    return this.http.post(`${this.inventory}/release-soft-lock`, req);
  }

  subscribe(req: StockSubscriptionRequest): Observable<unknown> {
    return this.http.post(`${this.inventory}/subscriptions`, req);
  }

  unsubscribe(req: StockSubscriptionRequest): Observable<unknown> {
    return this.http.delete(`${this.inventory}/subscriptions`, { body: req });
  }
}
