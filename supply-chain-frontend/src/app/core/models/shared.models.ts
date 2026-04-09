export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ApiError {
  message: string;
  statusCode: number;
  correlationId?: string;
}

/** Cart item stored in localStorage */
export interface CartItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  note?: string;
  unitPrice: number;
  minOrderQty: number;
  availableStock: number;
  lineTotal: number;
}
