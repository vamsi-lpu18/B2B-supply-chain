import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CreateShipmentRequest, AssignAgentRequest, AssignVehicleRequest, UpdateShipmentStatusRequest, ShipmentDto
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

  assignAgent(shipmentId: string, req: AssignAgentRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/assign-agent`, req);
  }

  assignVehicle(shipmentId: string, req: AssignVehicleRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/assign-vehicle`, req);
  }

  updateStatus(shipmentId: string, req: UpdateShipmentStatusRequest): Observable<unknown> {
    return this.http.put(`${this.base}/${shipmentId}/status`, req);
  }
}
