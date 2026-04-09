import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap } from 'rxjs';
import { ShipmentStatus } from '../models/enums';
import { LogisticsApiService } from '../api/logistics-api.service';
import {
  HandoverState,
  ShipmentOpsStateDto,
  UpsertShipmentOpsStateRequest
} from '../models/logistics.models';

export type ShipmentOpsState = ShipmentOpsStateDto;

@Injectable({ providedIn: 'root' })
export class ShipmentOpsQueueService {
  private readonly logisticsApi = inject(LogisticsApiService);

  get(shipmentId: string, context?: {
    assignedAgentId?: string;
    vehicleNumber?: string;
    status?: ShipmentStatus;
  }): Observable<ShipmentOpsState> {
    return this.logisticsApi.getShipmentOpsState(shipmentId).pipe(
      map(state => this.normalizeState(state, shipmentId)),
      switchMap(state => this.syncWithContext(shipmentId, state, context)),
      catchError(() => of(this.createDefault(shipmentId, context)))
    );
  }

  getBatch(shipmentIds: string[]): Observable<Record<string, ShipmentOpsState>> {
    const normalizedIds = shipmentIds
      .map(id => String(id ?? '').trim())
      .filter(id => id.length > 0);

    if (normalizedIds.length === 0) {
      return of({});
    }

    return this.logisticsApi.getShipmentOpsStatesBatch({ shipmentIds: normalizedIds }).pipe(
      map(items => {
        const mapById: Record<string, ShipmentOpsState> = {};
        items.forEach(item => {
          const normalized = this.normalizeState(item, item.shipmentId);
          mapById[normalized.shipmentId] = normalized;
        });

        normalizedIds.forEach(id => {
          if (!mapById[id]) {
            mapById[id] = this.createDefault(id);
          }
        });

        return mapById;
      }),
      catchError(() => {
        const fallback: Record<string, ShipmentOpsState> = {};
        normalizedIds.forEach(id => {
          fallback[id] = this.createDefault(id);
        });

        return of(fallback);
      })
    );
  }

  syncWithShipment(shipmentId: string, context?: {
    assignedAgentId?: string;
    vehicleNumber?: string;
    status?: ShipmentStatus;
  }): Observable<ShipmentOpsState> {
    return this.get(shipmentId, context);
  }

  update(shipmentId: string, patch: Partial<ShipmentOpsState>, context?: {
    assignedAgentId?: string;
    vehicleNumber?: string;
    status?: ShipmentStatus;
  }): Observable<ShipmentOpsState> {
    return this.get(shipmentId, context).pipe(
      switchMap(current => {
        const next: ShipmentOpsState = {
          ...current,
          handoverState: patch.handoverState ? this.normalizeHandoverState(patch.handoverState) : current.handoverState,
          handoverExceptionReason: patch.handoverExceptionReason !== undefined
            ? this.normalizeOptionalText(patch.handoverExceptionReason)
            : current.handoverExceptionReason,
          retryRequired: patch.retryRequired !== undefined ? !!patch.retryRequired : current.retryRequired,
          retryCount: patch.retryCount !== undefined ? this.normalizeRetryCount(Number(patch.retryCount)) : current.retryCount,
          retryReason: patch.retryReason !== undefined ? this.normalizeOptionalText(patch.retryReason) : current.retryReason,
          nextRetryAtUtc: patch.nextRetryAtUtc !== undefined ? this.normalizeOptionalIso(patch.nextRetryAtUtc) : current.nextRetryAtUtc,
          lastRetryScheduledAtUtc: patch.lastRetryScheduledAtUtc !== undefined
            ? this.normalizeOptionalIso(patch.lastRetryScheduledAtUtc)
            : current.lastRetryScheduledAtUtc,
          updatedAtUtc: new Date().toISOString()
        };

        const request: UpsertShipmentOpsStateRequest = this.toUpsertRequest(next);
        return this.logisticsApi.upsertShipmentOpsState(shipmentId, request).pipe(
          map(saved => this.normalizeState(saved, shipmentId)),
          catchError(() => of(next))
        );
      })
    );
  }

  markHandoverException(shipmentId: string, reason: string): Observable<ShipmentOpsState> {
    return this.update(shipmentId, {
      handoverState: 'exception',
      handoverExceptionReason: reason
    });
  }

  markHandoverCompleted(shipmentId: string): Observable<ShipmentOpsState> {
    return this.update(shipmentId, {
      handoverState: 'completed',
      handoverExceptionReason: undefined
    });
  }

  scheduleRetry(shipmentId: string, nextRetryAtUtc: string, reason: string): Observable<ShipmentOpsState> {
    return this.get(shipmentId).pipe(
      switchMap(current => this.update(shipmentId, {
        retryRequired: true,
        retryCount: current.retryCount + 1,
        retryReason: reason,
        nextRetryAtUtc,
        lastRetryScheduledAtUtc: new Date().toISOString()
      }))
    );
  }

  clearRetry(shipmentId: string): Observable<ShipmentOpsState> {
    return this.update(shipmentId, {
      retryRequired: false,
      retryReason: undefined,
      nextRetryAtUtc: undefined
    });
  }

  private syncWithContext(
    shipmentId: string,
    current: ShipmentOpsState,
    context?: {
      assignedAgentId?: string;
      vehicleNumber?: string;
      status?: ShipmentStatus;
    }
  ): Observable<ShipmentOpsState> {
    if (!context) {
      return of(current);
    }

    let nextHandoverState = current.handoverState;
    if (context.status === ShipmentStatus.Delivered) {
      nextHandoverState = 'completed';
    } else if (current.handoverState !== 'exception' && current.handoverState !== 'completed') {
      const hasAgent = !!String(context.assignedAgentId ?? '').trim();
      const hasVehicle = !!String(context.vehicleNumber ?? '').trim();
      nextHandoverState = hasAgent && hasVehicle ? 'ready' : 'pending';
    }

    if (nextHandoverState === current.handoverState) {
      return of(current);
    }

    return this.update(shipmentId, { handoverState: nextHandoverState }, context);
  }

  private createDefault(shipmentId: string, context?: {
    assignedAgentId?: string;
    vehicleNumber?: string;
    status?: ShipmentStatus;
  }): ShipmentOpsState {
    const handoverState = this.deriveHandoverState(context);

    return {
      shipmentId,
      handoverState,
      retryRequired: false,
      retryCount: 0,
      updatedAtUtc: new Date().toISOString()
    };
  }

  private deriveHandoverState(context?: {
    assignedAgentId?: string;
    vehicleNumber?: string;
    status?: ShipmentStatus;
  }): HandoverState {
    if (context?.status === ShipmentStatus.Delivered) {
      return 'completed';
    }

    const hasAgent = !!String(context?.assignedAgentId ?? '').trim();
    const hasVehicle = !!String(context?.vehicleNumber ?? '').trim();

    if (hasAgent && hasVehicle) {
      return 'ready';
    }

    return 'pending';
  }

  private normalizeState(state: ShipmentOpsStateDto, shipmentIdFallback: string): ShipmentOpsState {
    return {
      shipmentId: String(state.shipmentId ?? shipmentIdFallback),
      handoverState: this.normalizeHandoverState(state.handoverState),
      handoverExceptionReason: this.normalizeOptionalText(state.handoverExceptionReason),
      retryRequired: !!state.retryRequired,
      retryCount: this.normalizeRetryCount(Number(state.retryCount ?? 0)),
      retryReason: this.normalizeOptionalText(state.retryReason),
      nextRetryAtUtc: this.normalizeOptionalIso(state.nextRetryAtUtc),
      lastRetryScheduledAtUtc: this.normalizeOptionalIso(state.lastRetryScheduledAtUtc),
      updatedAtUtc: this.normalizeIso(String(state.updatedAtUtc ?? new Date().toISOString()))
    };
  }

  private toUpsertRequest(state: ShipmentOpsState): UpsertShipmentOpsStateRequest {
    return {
      handoverState: this.normalizeHandoverState(state.handoverState),
      handoverExceptionReason: this.normalizeOptionalText(state.handoverExceptionReason) ?? null,
      retryRequired: !!state.retryRequired,
      retryCount: this.normalizeRetryCount(state.retryCount),
      retryReason: this.normalizeOptionalText(state.retryReason) ?? null,
      nextRetryAtUtc: this.normalizeOptionalIso(state.nextRetryAtUtc) ?? null,
      lastRetryScheduledAtUtc: this.normalizeOptionalIso(state.lastRetryScheduledAtUtc) ?? null
    };
  }

  private normalizeHandoverState(value: unknown): HandoverState {
    const normalized = String(value ?? '').trim().toLowerCase();
    if (normalized === 'pending' || normalized === 'ready' || normalized === 'exception' || normalized === 'completed') {
      return normalized;
    }

    return 'pending';
  }

  private normalizeRetryCount(value: number): number {
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }

    return Math.min(99, Math.floor(value));
  }

  private normalizeOptionalIso(value: unknown): string | undefined {
    const raw = String(value ?? '').trim();
    if (!raw) {
      return undefined;
    }

    const date = new Date(raw);
    if (!Number.isFinite(date.getTime())) {
      return undefined;
    }

    return date.toISOString();
  }

  private normalizeOptionalText(value: unknown): string | undefined {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized.slice(0, 300) : undefined;
  }

  private normalizeIso(value: string): string {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) {
      return date.toISOString();
    }

    return new Date().toISOString();
  }
}
