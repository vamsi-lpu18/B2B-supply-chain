import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DealerSummaryDto, DealerDetailDto, RejectDealerRequest, UpdateCreditLimitRequest, CreditLimitUpdateResult, CreateAgentRequest, CreateAgentResponse, AgentSummaryDto } from '../models/auth.models';
import { PagedResult } from '../models/shared.models';

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly base = '/identity/api/admin';

  getDealers(page = 1, pageSize = 20, search?: string): Observable<PagedResult<DealerSummaryDto>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<PagedResult<DealerSummaryDto>>(`${this.base}/dealers`, { params });
  }

  getDealerById(id: string): Observable<DealerDetailDto> {
    return this.http.get<DealerDetailDto>(`${this.base}/dealers/${id}`);
  }

  approveDealer(id: string): Observable<unknown> {
    return this.http.put(`${this.base}/dealers/${id}/approve`, {});
  }

  rejectDealer(id: string, req: RejectDealerRequest): Observable<unknown> {
    return this.http.put(`${this.base}/dealers/${id}/reject`, req);
  }

  updateCreditLimit(id: string, req: UpdateCreditLimitRequest): Observable<CreditLimitUpdateResult> {
    return this.http.put<CreditLimitUpdateResult>(`${this.base}/dealers/${id}/credit-limit`, req);
  }

  createAgent(req: CreateAgentRequest): Observable<CreateAgentResponse> {
    return this.http.post<CreateAgentResponse>(`${this.base}/users/agents`, req);
  }

  getAgents(page = 1, pageSize = 50, search?: string): Observable<PagedResult<AgentSummaryDto>> {
    let params = new HttpParams().set('page', page).set('pageSize', pageSize);
    if (search) params = params.set('search', search);
    return this.http.get<PagedResult<AgentSummaryDto>>(`${this.base}/users/agents`, { params });
  }
}
