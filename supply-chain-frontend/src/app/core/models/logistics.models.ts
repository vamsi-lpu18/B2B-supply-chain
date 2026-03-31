import { ShipmentStatus } from './enums';

export interface CreateShipmentRequest {
  orderId: string;
  dealerId: string;
  deliveryAddress: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface AssignAgentRequest {
  agentId: string;
}

export interface AssignVehicleRequest {
  vehicleNumber: string;
}

export interface UpdateShipmentStatusRequest {
  status: ShipmentStatus;
  note: string;
}

export interface ShipmentEventDto {
  shipmentEventId: string;
  status: ShipmentStatus;
  note: string;
  updatedByUserId: string;
  updatedByRole: string;
  createdAtUtc: string;
}

export interface ShipmentDto {
  shipmentId: string;
  orderId: string;
  dealerId: string;
  shipmentNumber: string;
  deliveryAddress: string;
  city: string;
  state: string;
  postalCode: string;
  assignedAgentId?: string;
  vehicleNumber?: string;
  status: ShipmentStatus;
  createdAtUtc: string;
  deliveredAtUtc?: string;
  events: ShipmentEventDto[];
}
