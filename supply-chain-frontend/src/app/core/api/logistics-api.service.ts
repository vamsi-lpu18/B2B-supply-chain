import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateShipmentRequest,
  AssignAgentRequest,
  AssignVehicleRequest,
  RateDeliveryAgentRequest,
  RejectAssignmentRequest,
  UpdateShipmentStatusRequest,
  ShipmentDto,
  ShipmentOpsStateDto,
  GetShipmentOpsStatesRequest,
  UpsertShipmentOpsStateRequest,
  ShipmentAiRecommendationDto,
  ApproveAiRecommendationResultDto
} from '../models/logistics.models';

@Injectable({ providedIn: 'root' })
export class LogisticsApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/logistics/api/logistics/shipments';

  createShipment(req: CreateShipmentRequest): Observable<ShipmentDto> {
    return this.http.post<ShipmentDto>(this.base, req);
  }

  getShipmentById(id: string): Observable<ShipmentDto> {
    return this.http.get<ShipmentDto>(`${this.base}/${id}`);
  }

  getMyShipments(): Observable<ShipmentDto[]> {
    return this.http.get<ShipmentDto[]>(`${this.base}/my`);
  }

  getAllShipments(): Observable<ShipmentDto[]> {
    return this.http.get<ShipmentDto[]>(this.base);
  }

  getAssignedShipments(): Observable<ShipmentDto[]> {
    return this.http.get<ShipmentDto[]>(`${this.base}/assigned`);
  }

  assignAgent(shipmentId: string, req: AssignAgentRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/assign-agent`, req);
  }

  acceptAssignment(shipmentId: string): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/assignment/accept`, {});
  }

  rejectAssignment(shipmentId: string, req: RejectAssignmentRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/assignment/reject`, req);
  }

  rateDeliveryAgent(shipmentId: string, req: RateDeliveryAgentRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/agent-rating`, req);
  }

  assignVehicle(shipmentId: string, req: AssignVehicleRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/assign-vehicle`, req);
  }

  updateStatus(shipmentId: string, req: UpdateShipmentStatusRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/status`, req);
  }

  getShipmentOpsState(shipmentId: string): Observable<ShipmentOpsStateDto> {
    return this.http.get<ShipmentOpsStateDto>(`${this.base}/${shipmentId}/ops-state`);
  }

  getShipmentOpsStatesBatch(req: GetShipmentOpsStatesRequest): Observable<ShipmentOpsStateDto[]> {
    return this.http.post<ShipmentOpsStateDto[]>(`${this.base}/ops-states/batch`, req);
  }

  upsertShipmentOpsState(shipmentId: string, req: UpsertShipmentOpsStateRequest): Observable<ShipmentOpsStateDto> {
    return this.http.put<ShipmentOpsStateDto>(`${this.base}/${shipmentId}/ops-state`, req);
  }

  generateAiRecommendation(shipmentId: string): Observable<ShipmentAiRecommendationDto> {
    return this.http.post<ShipmentAiRecommendationDto>(`${this.base}/${shipmentId}/ai-recommendation`, {});
  }

  approveAiRecommendation(recommendationId: string): Observable<ApproveAiRecommendationResultDto> {
    return this.http.post<ApproveAiRecommendationResultDto>(`${this.base}/ai-recommendations/${recommendationId}/approve`, {});
  }
}
