import { UserRole, UserStatus } from './enums';

export interface RegisterDealerRequest {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  businessName: string;
  gstNumber: string;
  tradeLicenseNo: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  isInterstate: boolean;
}

export interface RegisterDealerResponse {
  userId: string;
  status: string;
  message: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  email: string;
  role: string;
  accessToken: string;
  accessTokenExpiresAtUtc: string;
  refreshToken: string;
  refreshTokenExpiresAtUtc: string;
  mustChangePassword: boolean;
}

export interface CreateAgentRequest {
  email: string;
  temporaryPassword: string;
  fullName: string;
  phoneNumber: string;
}

export interface CreateAgentResponse {
  userId: string;
  email: string;
  fullName: string;
  status: string;
  message: string;
}

export interface AgentSummaryDto {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  status: string;
  createdAtUtc: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  email: string;
  otpCode: string;
  newPassword: string;
}

export interface LogoutRequest {
  refreshToken?: string;
}

export interface UserProfileDto {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  creditLimit: number;
  dealerBusinessName?: string;
  dealerGstNumber?: string;
  isInterstate?: boolean;
}

export interface DealerSummaryDto {
  userId: string;
  fullName: string;
  email: string;
  businessName: string;
  gstNumber: string;
  status: string;
  creditLimit: number;
  registeredAtUtc: string;
}

export interface DealerDetailDto {
  userId: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  status: string;
  creditLimit: number;
  rejectionReason?: string;
  businessName: string;
  gstNumber: string;
  tradeLicenseNo: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  isInterstate: boolean;
  registeredAtUtc: string;
}

export interface RejectDealerRequest {
  reason: string;
}

export interface UpdateCreditLimitRequest {
  creditLimit: number;
}

export interface CreditLimitUpdateResult {
  succeeded: boolean;
  message: string;
}

/** In-memory auth state */
export interface AuthState {
  user: UserProfileDto | null;
  accessToken: string | null;
  role: UserRole | null;
  isAuthenticated: boolean;
}
