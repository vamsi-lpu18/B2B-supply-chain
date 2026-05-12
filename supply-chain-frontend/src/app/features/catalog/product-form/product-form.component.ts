import { Component, computed, inject, signal, OnInit, input } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CatalogApiService } from '../../../core/api/catalog-api.service';
import { ToastService } from '../../../core/services/toast.service';
import { CategoryDto } from '../../../core/models/catalog.models';

interface CategoryGroupEntry {
  parent: CategoryDto;
  children: CategoryDto[];
}

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, RouterLink],
  templateUrl: './product-form.component.html',
  styleUrl: './product-form.component.scss'
})
export class ProductFormComponent implements OnInit {
  readonly id = input<string>();

  private readonly fb         = inject(FormBuilder);
  private readonly catalogApi = inject(CatalogApiService);
  private readonly toast      = inject(ToastService);
  private readonly router     = inject(Router);

  readonly loading = signal(false);
  readonly isEdit  = () => !!this.id();
  readonly categories = signal<CategoryDto[]>([]);
  readonly categoriesLoading = signal(false);
  readonly categoryLoadFailed = signal(false);
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
  readonly categoryGroups = computed<CategoryGroupEntry[]>(() =>
    this.topLevelCategories().map(parent => ({
      parent,
      children: this.categoryChildrenMap().get(parent.categoryId) ?? []
    }))
  );

  readonly form = this.fb.group({
    sku:          ['', [Validators.required, Validators.maxLength(60), Validators.pattern(/^[A-Za-z0-9-_]+$/)]],
    name:         ['', [Validators.required, Validators.maxLength(200)]],
    description:  ['', [Validators.required, Validators.maxLength(2000)]],
    categoryId:   ['', [Validators.required, Validators.pattern(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/)]],
    unitPrice:    [0, [Validators.required, Validators.min(0.01)]],
    minOrderQty:  [1, [Validators.required, Validators.min(1)]],
    openingStock: [0, [Validators.required, Validators.min(0)]],
    imageUrl:     ['', [Validators.maxLength(500), Validators.pattern(/^$|^https?:\/\/.+/)]],
    isActive:     [true]
  });

  err(f: string): boolean { const c = this.form.get(f); return !!(c?.invalid && c.touched); }

  ngOnInit(): void {
    this.loadCategories();

    if (this.isEdit()) {
      this.catalogApi.getProductById(this.id()!).subscribe(p => {
        this.form.patchValue({ ...p, imageUrl: p.imageUrl ?? '' });
        this.form.get('sku')?.disable();
      });
    }
  }

  private loadCategories(): void {
    this.categoriesLoading.set(true);
    this.categoryLoadFailed.set(false);

    this.catalogApi.getCategories().subscribe({
      next: (items) => {
        this.categories.set(items ?? []);
        this.categoriesLoading.set(false);
      },
      error: () => {
        this.categories.set([]);
        this.categoryLoadFailed.set(true);
        this.categoriesLoading.set(false);
      }
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    const v = this.form.getRawValue();

    if (this.isEdit()) {
      this.catalogApi.updateProduct(this.id()!, {
        name: v.name!, description: v.description!, categoryId: v.categoryId!,
        unitPrice: v.unitPrice!, minOrderQty: v.minOrderQty!, imageUrl: v.imageUrl || undefined, isActive: v.isActive!
      }).subscribe({
        next: p => { this.loading.set(false); this.toast.success('Product updated'); this.router.navigate(['/products', p.productId]); },
        error: () => this.loading.set(false)
      });
    } else {
      this.catalogApi.createProduct({
        sku: v.sku!, name: v.name!, description: v.description!, categoryId: v.categoryId!,
        unitPrice: v.unitPrice!, minOrderQty: v.minOrderQty!, openingStock: v.openingStock!, imageUrl: v.imageUrl || undefined
      }).subscribe({
        next: p => { this.loading.set(false); this.toast.success('Product created'); this.router.navigate(['/products', p.productId]); },
        error: () => this.loading.set(false)
      });
    }
  }
}
