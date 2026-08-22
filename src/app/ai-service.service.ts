import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from './environment';
export interface AgentRequest {
  query: string;
}

export interface GraphDataset {
  label: string;
  data: number[];
}

export interface GraphData {
  type: 'BAR' | 'PIE' | 'LINE';
  title: string;
  labels: string[];
  datasets: GraphDataset[];
}

export interface AgentResponse {
  textSummary: string;
  showGraph: boolean;
  graph?: GraphData;
}

@Injectable({ providedIn: 'root' })
export class AiService {
  private url = `${environment.apiUrl}/api/ai/ask`;

  constructor(private http: HttpClient) {}

  ask(query: string): Observable<AgentResponse> {
    return this.http.post<AgentResponse>(this.url, { query });
  }
}