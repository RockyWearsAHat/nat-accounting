export interface ConsultationRequest {
  name: string;
  email: string;
  phone: string;
  company: string;
  website?: string;
  revenueApprox?: number; // in USD
  dunsNumber?: string;
  numberOfSubsidiaries?: number;
  transactionsPerMonth?: number; // bookkeeping volume
  reconciliationAccounts?: number; // number of bank/credit accounts
  wantsBookkeeping?: boolean;
  wantsReconciliations?: boolean;
  wantsFinancials?: boolean;
  wantsSoftwareImplementation?: boolean;
  wantsAdvisory?: boolean;
  wantsAR?: boolean;
  wantsAP?: boolean;
  wantsCleanup?: boolean;
  wantsForecasting?: boolean;
  wantsWebsiteHelp?: boolean;
  goals?: string;
}

export interface ConsultationStored extends ConsultationRequest {
  id: string;
  createdAt: string;
  internalEstimate?: InternalEstimate; // not sent to client
}

export interface InternalEstimateServiceRange {
  service: string;
  low: number;
  high: number;
  cadence: string; // e.g. monthly, one-time, hourly
  notes?: string;
}

export interface InternalEstimate {
  revenueBracket: "small" | "mid";
  ranges: InternalEstimateServiceRange[];
  suggestedPackage?: "Starter" | "Growth" | "Premium";
}

export interface AvailabilitySlot {
  start: string; // ISO
  end: string; // ISO
  available: boolean;
}

export interface ScheduledMeeting {
  id: string;
  consultationId: string;
  start: string; // ISO
  end: string; // ISO
  createdAt: string; // ISO
  provider?: "zoom";
  joinUrl?: string; // placeholder until real Zoom integration
  status: "scheduled" | "cancelled" | "completed";
}

export interface ScheduleRequestBody {
  consultationId: string;
  start: string; // desired ISO start
  end: string; // desired ISO end
}

export interface ScheduleResponse {
  ok: boolean;
  meeting?: ScheduledMeeting;
  error?: string;
}
