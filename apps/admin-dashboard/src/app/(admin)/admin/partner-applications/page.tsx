'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  BadgeCheck,
  Bike,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  FileCheck2,
  FileWarning,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';

type ApplicationStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ACTION_REQUIRED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'EXPIRED';

type PartnerApplication = {
  id: string;
  applicationNumber: string;
  type: 'RIDER' | 'STORE';
  status: ApplicationStatus;
  applicantName: string;
  email?: string | null;
  phoneE164?: string | null;
  emailVerifiedAt?: string | null;
  phoneVerifiedAt?: string | null;
  submissionVersion: number;
  applicantPayload: Record<string, any>;
  actionRequests?: Record<string, any> | null;
  submittedAt?: string | null;
  reviewStartedAt?: string | null;
  approvedAt?: string | null;
  provisionedUserId?: string | null;
  provisionedStoreId?: string | null;
  createdAt: string;
  updatedAt: string;
};

type PartnerDocument = {
  id: string;
  type: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  documentNumberLast4?: string | null;
  expiresAt?: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REPLACEMENT_REQUIRED';
  reviewNote?: string | null;
};

type PartnerEvent = {
  id: string;
  eventType: string;
  actorKind: string;
  message?: string | null;
  createdAt: string;
};

type ApplicationDetail = {
  application: PartnerApplication;
  documents: PartnerDocument[];
  requirements: {
    requiredDocuments: string[];
    completedRequired: string[];
    completionPercent: number;
  };
  events: PartnerEvent[];
};

const STATUS_OPTIONS = [
  'ALL',
  'SUBMITTED',
  'UNDER_REVIEW',
  'ACTION_REQUIRED',
  'APPROVED',
  'REJECTED',
];

const statusClass = (status: string) => {
  switch (status) {
    case 'APPROVED':
    case 'VERIFIED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'REJECTED':
    case 'EXPIRED':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'ACTION_REQUIRED':
    case 'REPLACEMENT_REQUIRED':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'UNDER_REVIEW':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    default:
      return 'bg-sky-50 text-sky-700 border-sky-200';
  }
};

const label = (value: string) => value.replaceAll('_', ' ');
const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : 'Not recorded';

export default function PartnerApplicationsAdminPage() {
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [documentNote, setDocumentNote] = useState<Record<string, string>>({});
  const [changeFields, setChangeFields] = useState('');
  const [changeMessage, setChangeMessage] = useState('');
  const [rejectReason, setRejectReason] = useState('NOT_ELIGIBLE');
  const [rejectMessage, setRejectMessage] = useState('');
  const [approval, setApproval] = useState({
    ownerEmail: '',
    operationalName: '',
    latitude: '',
    longitude: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (status !== 'ALL') params.set('status', status);
      if (type !== 'ALL') params.set('type', type);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');
      const response = await apiClient.get(
        `/admin/partner-onboarding/applications?${params.toString()}`,
      );
      setApplications(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          'Partner applications could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, [search, status, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openApplication = async (application: PartnerApplication) => {
    setDetailLoading(true);
    setError('');
    try {
      const response = await apiClient.get(
        `/admin/partner-onboarding/applications/${application.id}`,
      );
      setDetail(response.data);
      setApproval({
        ownerEmail: application.email || '',
        operationalName:
          String(application.applicantPayload?.displayName || '') ||
          application.applicantName,
        latitude:
          application.applicantPayload?.latitude === undefined
            ? ''
            : String(application.applicantPayload.latitude),
        longitude:
          application.applicantPayload?.longitude === undefined
            ? ''
            : String(application.applicantPayload.longitude),
      });
    } catch (requestError: any) {
      setError(
        requestError?.response?.data?.message ||
          'Application details could not be loaded.',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    const response = await apiClient.get(
      `/admin/partner-onboarding/applications/${detail.application.id}`,
    );
    setDetail(response.data);
    await load();
  };

  const runAction = async (key: string, action: () => Promise<any>) => {
    setActionLoading(key);
    setError('');
    try {
      await action();
      await refreshDetail();
    } catch (requestError: any) {
      const raw = requestError?.response?.data?.message;
      setError(
        Array.isArray(raw)
          ? raw.join(', ')
          : typeof raw === 'object'
            ? raw.message || JSON.stringify(raw)
            : raw || 'Review action failed.',
      );
    } finally {
      setActionLoading('');
    }
  };

  const reviewDocument = (
    document: PartnerDocument,
    decision: 'VERIFIED' | 'REJECTED' | 'REPLACEMENT_REQUIRED',
  ) =>
    runAction(`doc-${document.id}-${decision}`, () =>
      apiClient.patch(
        `/admin/partner-onboarding/applications/${detail!.application.id}/documents/${document.id}/review`,
        {
          decision,
          note: documentNote[document.id]?.trim() || undefined,
        },
      ),
    );

  const previewDocument = async (document: PartnerDocument) => {
    try {
      const response = await apiClient.get(
        `/admin/partner-onboarding/applications/${detail!.application.id}/documents/${document.id}/url`,
      );
      const url = String(response.data?.url || '');
      if (!url || url.startsWith('test://')) {
        alert(`Private QA document reference: ${url || 'unavailable'}`);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Document preview failed.');
    }
  };

  const counts = useMemo(
    () => ({
      submitted: applications.filter((item) => item.status === 'SUBMITTED').length,
      review: applications.filter((item) => item.status === 'UNDER_REVIEW').length,
      action: applications.filter((item) => item.status === 'ACTION_REQUIRED').length,
      approved: applications.filter((item) => item.status === 'APPROVED').length,
    }),
    [applications],
  );

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mx-auto max-w-[1500px] pb-12">
        <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-teal-700">
              <ClipboardCheck className="h-3.5 w-3.5" /> Verified partner network
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Partner Applications
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
              Review Rider and Store applications, verify private documents, request field-level corrections, and provision disabled accounts without creating passwords for applicants.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm"
          >
            <RefreshCw className="h-4 w-4" /> Refresh queue
          </button>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Waiting review', counts.submitted, Clock3, 'text-sky-700 bg-sky-50'],
            ['Under review', counts.review, ShieldAlert, 'text-violet-700 bg-violet-50'],
            ['Applicant action', counts.action, FileWarning, 'text-amber-700 bg-amber-50'],
            ['Approved', counts.approved, BadgeCheck, 'text-emerald-700 bg-emerald-50'],
          ].map(([title, value, Icon, style]) => (
            <div key={String(title)} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">{String(title)}</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">{Number(value)}</p>
                </div>
                <div className={`grid h-11 w-11 place-items-center rounded-xl ${String(style)}`}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error ? (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.45fr)]">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search application, name, email or phone"
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-teal-500"
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['ALL', 'RIDER', 'STORE'].map((item) => (
                  <button
                    key={item}
                    onClick={() => setType(item)}
                    className={`rounded-lg px-3 py-2 text-[11px] font-black ${
                      type === item
                        ? 'bg-slate-950 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {STATUS_OPTIONS.map((item) => (
                  <button
                    key={item}
                    onClick={() => setStatus(item)}
                    className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black ${
                      status === item
                        ? 'bg-teal-600 text-white'
                        : 'border border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {label(item)}
                  </button>
                ))}
              </div>
            </div>

            <div className="max-h-[72vh] overflow-y-auto p-3">
              {loading ? (
                <div className="grid min-h-56 place-items-center">
                  <Loader2 className="h-7 w-7 animate-spin text-teal-600" />
                </div>
              ) : applications.length === 0 ? (
                <div className="p-10 text-center">
                  <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
                  <p className="mt-3 text-sm font-black text-slate-700">No matching applications</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {applications.map((application) => {
                    const selected = detail?.application.id === application.id;
                    return (
                      <button
                        key={application.id}
                        onClick={() => void openApplication(application)}
                        className={`w-full rounded-2xl border p-4 text-left transition ${
                          selected
                            ? 'border-teal-400 bg-teal-50/60'
                            : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
                            {application.type === 'RIDER' ? (
                              <Bike className="h-5 w-5" />
                            ) : (
                              <Store className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="truncate text-sm font-black text-slate-950">
                                  {application.applicantName}
                                </p>
                                <p className="mt-0.5 font-mono text-[10px] font-bold text-slate-400">
                                  {application.applicationNumber}
                                </p>
                              </div>
                              <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(application.status)}`}>
                                {label(application.status)}
                              </span>
                            </div>
                            <p className="mt-2 truncate text-xs font-semibold text-slate-500">
                              {application.email || application.phoneE164 || 'No contact'}
                            </p>
                            <p className="mt-1 text-[10px] font-semibold text-slate-400">
                              Updated {formatDate(application.updatedAt)}
                            </p>
                          </div>
                          <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="min-h-[560px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            {detailLoading ? (
              <div className="grid min-h-[560px] place-items-center">
                <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
              </div>
            ) : !detail ? (
              <div className="grid min-h-[560px] place-items-center p-10 text-center">
                <div>
                  <UserCheck className="mx-auto h-12 w-12 text-slate-300" />
                  <h2 className="mt-4 text-lg font-black text-slate-800">Select an application</h2>
                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Review profile sections, documents, and the audit timeline here.
                  </p>
                </div>
              </div>
            ) : (
              <ReviewWorkspace
                detail={detail}
                actionLoading={actionLoading}
                documentNote={documentNote}
                setDocumentNote={setDocumentNote}
                previewDocument={previewDocument}
                reviewDocument={reviewDocument}
                startReview={() =>
                  runAction('review', () =>
                    apiClient.post(
                      `/admin/partner-onboarding/applications/${detail.application.id}/review`,
                      { note: 'Review accepted by Admin.' },
                    ),
                  )
                }
                changeFields={changeFields}
                setChangeFields={setChangeFields}
                changeMessage={changeMessage}
                setChangeMessage={setChangeMessage}
                requestChanges={() =>
                  runAction('changes', () =>
                    apiClient.post(
                      `/admin/partner-onboarding/applications/${detail.application.id}/request-changes`,
                      {
                        requests: {
                          fields: changeFields
                            .split(',')
                            .map((item) => item.trim())
                            .filter(Boolean),
                        },
                        message: changeMessage,
                      },
                    ),
                  )
                }
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                rejectMessage={rejectMessage}
                setRejectMessage={setRejectMessage}
                reject={() =>
                  runAction('reject', () =>
                    apiClient.post(
                      `/admin/partner-onboarding/applications/${detail.application.id}/reject`,
                      { reasonCode: rejectReason, message: rejectMessage },
                    ),
                  )
                }
                approval={approval}
                setApproval={setApproval}
                approve={() =>
                  runAction('approve', () =>
                    apiClient.post(
                      `/admin/partner-onboarding/applications/${detail.application.id}/approve`,
                      {
                        ownerEmail: approval.ownerEmail || undefined,
                        operationalName: approval.operationalName || undefined,
                        latitude: approval.latitude ? Number(approval.latitude) : undefined,
                        longitude: approval.longitude ? Number(approval.longitude) : undefined,
                      },
                    ),
                  )
                }
                close={() => setDetail(null)}
              />
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReviewWorkspace(props: {
  detail: ApplicationDetail;
  actionLoading: string;
  documentNote: Record<string, string>;
  setDocumentNote: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  previewDocument: (document: PartnerDocument) => void;
  reviewDocument: (
    document: PartnerDocument,
    decision: 'VERIFIED' | 'REJECTED' | 'REPLACEMENT_REQUIRED',
  ) => void;
  startReview: () => void;
  changeFields: string;
  setChangeFields: (value: string) => void;
  changeMessage: string;
  setChangeMessage: (value: string) => void;
  requestChanges: () => void;
  rejectReason: string;
  setRejectReason: (value: string) => void;
  rejectMessage: string;
  setRejectMessage: (value: string) => void;
  reject: () => void;
  approval: { ownerEmail: string; operationalName: string; latitude: string; longitude: string };
  setApproval: React.Dispatch<React.SetStateAction<{ ownerEmail: string; operationalName: string; latitude: string; longitude: string }>>;
  approve: () => void;
  close: () => void;
}) {
  const { application, documents, requirements, events } = props.detail;
  const allVerified = requirements.requiredDocuments.every((type) =>
    documents.some((document) => document.type === type && document.status === 'VERIFIED'),
  );

  return (
    <div className="max-h-[82vh] overflow-y-auto">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 p-5 backdrop-blur-xl">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusClass(application.status)}`}>
              {label(application.status)}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              {application.type}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-black text-slate-950">{application.applicantName}</h2>
          <p className="mt-1 font-mono text-xs font-bold text-slate-400">{application.applicationNumber}</p>
        </div>
        <button onClick={props.close} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Completion" value={`${requirements.completionPercent}%`} />
          <Metric label="Submission" value={`v${application.submissionVersion}`} />
          <Metric
            label="Verified contact"
            value={application.emailVerifiedAt || application.phoneVerifiedAt ? 'Yes' : 'No'}
          />
        </div>

        {application.status === 'SUBMITTED' ? (
          <button
            onClick={props.startReview}
            disabled={Boolean(props.actionLoading)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            {props.actionLoading === 'review' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
            Start review and assign to me
          </button>
        ) : null}

        <Panel title="Applicant and contact">
          <Info label="Email" value={application.email || 'Not provided'} />
          <Info label="Phone" value={application.phoneE164 || 'Not provided'} />
          <Info label="Email verified" value={formatDate(application.emailVerifiedAt)} />
          <Info label="Phone verified" value={formatDate(application.phoneVerifiedAt)} />
        </Panel>

        <Panel title={application.type === 'RIDER' ? 'Rider profile' : 'Store and business profile'}>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(application.applicantPayload || {}).map(([key, value]) => (
              <Info
                key={key}
                label={label(key.replace(/([a-z])([A-Z])/g, '$1_$2')).toLowerCase()}
                value={Array.isArray(value) ? value.join(', ') : String(value ?? '—')}
              />
            ))}
          </div>
        </Panel>

        <Panel title="Document verification" subtitle="Every mandatory document must be verified before approval.">
          <div className="space-y-3">
            {documents.map((document) => (
              <article key={document.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                      <FileCheck2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-slate-950">{label(document.type)}</h4>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{document.originalFilename}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-400">
                        <span>{Math.ceil(document.fileSize / 1024)} KB</span>
                        <span>{document.mimeType}</span>
                        {document.documentNumberLast4 ? <span>•••• {document.documentNumberLast4}</span> : null}
                      </div>
                    </div>
                  </div>
                  <span className={`self-start rounded-full border px-2.5 py-1 text-[9px] font-black ${statusClass(document.status)}`}>
                    {label(document.status)}
                  </span>
                </div>
                {document.reviewNote ? (
                  <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                    {document.reviewNote}
                  </p>
                ) : null}
                <input
                  value={props.documentNote[document.id] || ''}
                  onChange={(event) =>
                    props.setDocumentNote((current) => ({
                      ...current,
                      [document.id]: event.target.value,
                    }))
                  }
                  placeholder="Review note required for rejection/replacement"
                  className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-teal-500"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button onClick={() => props.previewDocument(document)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black text-slate-700">
                    <ExternalLink className="h-3.5 w-3.5" /> Preview
                  </button>
                  <button onClick={() => props.reviewDocument(document, 'VERIFIED')} disabled={Boolean(props.actionLoading)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                  </button>
                  <button onClick={() => props.reviewDocument(document, 'REPLACEMENT_REQUIRED')} disabled={Boolean(props.actionLoading)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">
                    <FileWarning className="h-3.5 w-3.5" /> Replace
                  </button>
                  <button onClick={() => props.reviewDocument(document, 'REJECTED')} disabled={Boolean(props.actionLoading)} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[11px] font-black text-white disabled:opacity-50">
                    <XCircle className="h-3.5 w-3.5" /> Reject document
                  </button>
                </div>
              </article>
            ))}
          </div>
        </Panel>

        {['UNDER_REVIEW', 'ACTION_REQUIRED'].includes(application.status) ? (
          <Panel title="Request corrections" subtitle="Applicant-visible instructions must identify the exact fields or documents to change.">
            <input value={props.changeFields} onChange={(event) => props.setChangeFields(event.target.value)} placeholder="Fields, comma separated: vehicleNumber, bankProof" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-amber-500" />
            <textarea value={props.changeMessage} onChange={(event) => props.setChangeMessage(event.target.value)} rows={3} placeholder="Explain the correction clearly" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold outline-none focus:border-amber-500" />
            <button onClick={props.requestChanges} disabled={props.changeMessage.trim().length < 5 || Boolean(props.actionLoading)} className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              Request applicant changes
            </button>
          </Panel>
        ) : null}

        {['UNDER_REVIEW', 'ACTION_REQUIRED'].includes(application.status) ? (
          <Panel title="Approve and provision" subtitle="No password is created here. The applicant receives one-time activation after provisioning.">
            <input value={props.approval.ownerEmail} onChange={(event) => props.setApproval((current) => ({ ...current, ownerEmail: event.target.value }))} placeholder="Operational login email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" />
            <input value={props.approval.operationalName} onChange={(event) => props.setApproval((current) => ({ ...current, operationalName: event.target.value }))} placeholder="Operational Rider or Store name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" />
            {application.type === 'STORE' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <input value={props.approval.latitude} onChange={(event) => props.setApproval((current) => ({ ...current, latitude: event.target.value }))} placeholder="Approved latitude" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" />
                <input value={props.approval.longitude} onChange={(event) => props.setApproval((current) => ({ ...current, longitude: event.target.value }))} placeholder="Approved longitude" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" />
              </div>
            ) : null}
            <div className={`rounded-xl border px-3 py-2 text-xs font-bold ${allVerified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
              {allVerified ? 'All mandatory documents are verified.' : 'Approval remains blocked until every mandatory document is verified.'}
            </div>
            <button onClick={props.approve} disabled={!allVerified || !props.approval.ownerEmail.trim() || Boolean(props.actionLoading)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              {props.actionLoading === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : application.type === 'RIDER' ? <Bike className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
              Approve and provision {application.type === 'RIDER' ? 'Rider' : 'Store'}
            </button>
          </Panel>
        ) : null}

        {['UNDER_REVIEW', 'ACTION_REQUIRED'].includes(application.status) ? (
          <Panel title="Reject application" subtitle="Rejection requires a durable category and applicant-facing reason.">
            <select value={props.rejectReason} onChange={(event) => props.setRejectReason(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <option value="NOT_ELIGIBLE">Not eligible</option>
              <option value="IDENTITY_MISMATCH">Identity mismatch</option>
              <option value="DUPLICATE_APPLICATION">Duplicate application</option>
              <option value="UNSUPPORTED_LOCATION">Unsupported location</option>
              <option value="DOCUMENT_INTEGRITY">Document integrity concern</option>
              <option value="OTHER">Other</option>
            </select>
            <textarea value={props.rejectMessage} onChange={(event) => props.setRejectMessage(event.target.value)} rows={3} placeholder="Applicant-facing rejection reason" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" />
            <button onClick={props.reject} disabled={props.rejectMessage.trim().length < 5 || Boolean(props.actionLoading)} className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
              Reject application
            </button>
          </Panel>
        ) : null}

        <Panel title="Audit timeline">
          <div className="space-y-4">
            {events.map((event, index) => (
              <div key={event.id} className="flex gap-3">
                <div className="flex w-5 flex-col items-center">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-teal-600" />
                  {index < events.length - 1 ? <div className="mt-1 min-h-10 w-px flex-1 bg-teal-100" /> : null}
                </div>
                <div className="flex-1 pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-900">{label(event.eventType)}</p>
                    <span className="text-[9px] font-bold text-slate-400">{formatDate(event.createdAt)}</span>
                  </div>
                  {event.message ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{event.message}</p> : null}
                  <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-slate-400">{event.actorKind}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 p-4">
      <h3 className="text-sm font-black text-slate-950">{title}</h3>
      {subtitle ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{subtitle}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

function Metric({ label: metricLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{metricLabel}</p>
      <p className="mt-2 text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label: infoLabel, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{infoLabel}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-700">{value}</p>
    </div>
  );
}
