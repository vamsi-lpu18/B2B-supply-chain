import { AssignmentDecisionStatus, ShipmentStatus } from './enums';

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

export interface RejectAssignmentRequest {
  reason: string;
}

export interface RateDeliveryAgentRequest {
  rating: number;
  comment?: string;
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
  assignmentDecisionStatus: AssignmentDecisionStatus;
  assignmentDecisionReason?: string;
  assignmentDecisionAtUtc?: string;
  deliveryAgentRating?: number;
  deliveryAgentRatingComment?: string;
  deliveryAgentRatedAtUtc?: string;
  deliveryAgentRatedByUserId?: string;
  status: ShipmentStatus;
  createdAtUtc: string;
  deliveredAtUtc?: string;
  events: ShipmentEventDto[];
}

export type HandoverState = 'pending' | 'ready' | 'exception' | 'completed';

export interface ShipmentOpsStateDto {
  shipmentId: string;
  handoverState: HandoverState;
  handoverExceptionReason?: string;
  retryRequired: boolean;
  retryCount: number;
  retryReason?: string;
  nextRetryAtUtc?: string;
  lastRetryScheduledAtUtc?: string;
  updatedAtUtc: string;
}

export interface GetShipmentOpsStatesRequest {
  shipmentIds: string[];
}

export interface UpsertShipmentOpsStateRequest {
  handoverState?: HandoverState;
  handoverExceptionReason?: string | null;
  retryRequired?: boolean;
  retryCount?: number;
  retryReason?: string | null;
  nextRetryAtUtc?: string | null;
  lastRetryScheduledAtUtc?: string | null;
}

export interface ShipmentAiActionDto {
  actionType: string;
  description: string;
  proposedValue: string;
}

export interface ShipmentAiRecommendationDto {
  recommendationId: string;
  shipmentId: string;
  playbookType: string;
  confidenceScore: number;
  explanationText: string;
  requiresHumanApproval: boolean;
  createdAtUtc: string;
  suggestedActions: ShipmentAiActionDto[];
}

export interface AiRecommendationExecutionStepDto {
  actionType: string;
  result: string;
  message: string;
}

export interface ApproveAiRecommendationResultDto {
  recommendationId: string;
  shipmentId: string;
  executed: boolean;
  approvedAtUtc: string;
  steps: AiRecommendationExecutionStepDto[];
  shipment: ShipmentDto;
}
