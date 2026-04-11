export interface CreateProductRequest {
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  unitPrice: number;
  minOrderQty: number;
  openingStock: number;
  imageUrl?: string;
}

export interface UpdateProductRequest {
  name: string;
  description: string;
  categoryId: string;
  unitPrice: number;
  minOrderQty: number;
  imageUrl?: string;
  isActive: boolean;
}

export interface RestockProductRequest {
  quantity: number;
  referenceId: string;
}

export interface SoftLockStockRequest {
  productId: string;
  orderId: string;
  quantity: number;
}

export interface HardDeductStockRequest {
  productId: string;
  orderId: string;
  quantity: number;
}

export interface ReleaseSoftLockRequest {
  productId: string;
  orderId: string;
}

export interface StockSubscriptionRequest {
  dealerId: string;
  productId: string;
}

export interface ProductDto {
  productId: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  unitPrice: number;
  minOrderQty: number;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  isActive: boolean;
  imageUrl?: string;
  updatedAtUtc: string;
}

export interface CreateProductReviewRequest {
  rating: number;
  title: string;
  comment: string;
}

export interface ModerateProductReviewRequest {
  note?: string;
}

export interface ProductReviewDto {
  reviewId: string;
  productId: string;
  dealerId: string;
  rating: number;
  title: string;
  comment: string;
  isApproved: boolean;
  isRejected: boolean;
  moderationNote?: string;
  createdAtUtc: string;
  moderatedAtUtc?: string;
  moderatedByUserId?: string;
}

export interface ProductListItemDto {
  productId: string;
  sku: string;
  name: string;
  categoryId: string;
  unitPrice: number;
  availableStock: number;
  isActive: boolean;
  imageUrl?: string;
}

export interface CategoryDto {
  categoryId: string;
  name: string;
  parentCategoryId?: string | null;
}

export interface StockLevelDto {
  productId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
}
