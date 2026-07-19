'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  BadgeCheck,
  Bike,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileCheck2,
  FileWarning,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserCheck,
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
  applicantPayload: Record<string, any>;
  actionRequests?: Record<string, any> | null;
  submissionVersion: number;
  linkedExistingUser?: boolean;
  provisionedUserId?: string | null;
  provisionedStoreId?: string | null;
  deletedAt?: string | null;
  deletionReason?: string | null;
  scheduledPurgeAt?: string | null;
  contactVerificationMethod?: string | null;
  contactVerificationReason?: string | null;
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
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  uploadedAt?: string | null;
  version?: number;
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

const label = (value: string) => value.replaceAll('_', ' ');
const date = (value?: string | null) => (value ? new Date(value).toLocaleString() : 'Not recorded');

const badge = (status: string) => {
  if (['APPROVED', 'VERIFIED'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['REJECTED', 'EXPIRED'].includes(status)) return 'border-red-200 bg-red-50 text-red-700';
  if (['ACTION_REQUIRED', 'REPLACEMENT_REQUIRED'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'UNDER_REVIEW') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
};

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
  const [visibility, setVisibility] = useState<'active' | 'deleted' | 'all'>('active');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [bulkNote, setBulkNote] = useState('Reviewed against the submitted originals.');
  const [changeFields, setChangeFields] = useState('');
  const [changeMessage, setChangeMessage] = useState('');
  const [contactChannel, setContactChannel] = useState<'EMAIL' | 'PHONE'>('EMAIL');
  const [contactMethod, setContactMethod] = useState('IN_PERSON');
  const [contactReason, setContactReason] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [rejectReason, setRejectReason] = useState('NOT_ELIGIBLE');
  const [rejectMessage, setRejectMessage] = useState('');
  const [approval, setApproval] = useState({ ownerEmail: '', operationalName: '', latitude: '', longitude: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '100', visibility });
      if (status !== 'ALL') params.set('status', status);
      if (type !== 'ALL') params.set('type', type);
      if (search.trim()) params.set('search', search.trim());
      const response = await apiClient.get(`/admin/partner-onboarding/applications?${params.toString()}`);
      setApplications(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Partner applications could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [search, status, type, visibility]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openApplication = async (application: PartnerApplication) => {
    setDetailLoading(true);
    setError('');
    try {
      const response = await apiClient.get(`/admin/partner-onboarding/applications/${application.id}`);
      setDetail(response.data);
      setApproval({
        ownerEmail: application.email || '',
        operationalName: String(application.applicantPayload?.displayName || application.applicantName),
        latitude: application.applicantPayload?.latitude == null ? '' : String(application.applicantPayload.latitude),
        longitude: application.applicantPayload?.longitude == null ? '' : String(application.applicantPayload.longitude),
      });
      setContactChannel(application.email ? 'EMAIL' : 'PHONE');
      setContactReason('');
      setDeleteReason('');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Application details could not be loaded.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetail = async () => {
    if (!detail) return;
    const response = await apiClient.get(`/admin/partner-onboarding/applications/${detail.application.id}`);
    setDetail(response.data);
    await load();
  };

  const action = async (key: string, work: () => Promise<any>) => {
    setActionLoading(key);
    setError('');
    try {
      await work();
      await refreshDetail();
    } catch (requestError: any) {
      const raw = requestError?.response?.data?.message;
      setError(Array.isArray(raw) ? raw.join(', ') : typeof raw === 'object' ? raw.message || JSON.stringify(raw) : raw || 'Review action failed.');
    } finally {
      setActionLoading('');
    }
  };

  const documentUrl = async (document: PartnerDocument, download = false) => {
    if (!detail) return;
    try {
      const suffix = download ? 'download-url' : 'url';
      const response = await apiClient.get(`/admin/partner-onboarding/applications/${detail.application.id}/documents/${document.id}/${suffix}`);
      const url = String(response.data?.url || '');
      if (!url || url.startsWith('test://')) {
        window.alert(`Private QA document reference: ${url || 'unavailable'}`);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Document access failed.');
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
      <div className="mx-auto max-w-[1540px] pb-12">
        <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-teal-700">
              <ClipboardCheck className="h-3.5 w-3.5" /> Partner review workspace
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-950">Partner Applications</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
              Verify Rider and Store identities, inspect private evidence, request corrections, link existing Customer accounts and provision operational access.
            </p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm">
            <RefreshCw className="h-4 w-4" /> Refresh queue
          </button>
        </header>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Waiting review', counts.submitted],
            ['Under review', counts.review],
            ['Applicant action', counts.action],
            ['Approved', counts.approved],
          ].map(([title, value]) => (
            <div key={String(title)} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">{String(title)}</p>
              <p className="mt-2 text-3xl font-black text-slate-950">{Number(value)}</p>
            </div>
          ))}
        </div>

        {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{String(error)}</div> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(350px,0.82fr)_minmax(620px,1.55fr)]">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email or application" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-teal-500" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(['active', 'deleted', 'all'] as const).map((item) => (
                  <button key={item} onClick={() => setVisibility(item)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${visibility === item ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{item}</button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {['ALL', 'RIDER', 'STORE'].map((item) => (
                  <button key={item} onClick={() => setType(item)} className={`rounded-lg px-3 py-2 text-[10px] font-black ${type === item ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-600'}`}>{item}</button>
                ))}
              </div>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {['ALL', 'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'APPROVED', 'REJECTED'].map((item) => (
                  <button key={item} onClick={() => setStatus(item)} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-black ${status === item ? 'bg-violet-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{label(item)}</button>
                ))}
              </div>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-3">
              {loading ? (
                <div className="grid min-h-56 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div>
              ) : applications.length === 0 ? (
                <div className="p-10 text-center"><ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-black text-slate-700">No matching applications</p></div>
              ) : (
                <div className="space-y-2">
                  {applications.map((application) => (
                    <button key={application.id} onClick={() => void openApplication(application)} className={`w-full rounded-2xl border p-4 text-left transition ${detail?.application.id === application.id ? 'border-teal-400 bg-teal-50/60' : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'}`}>
                      <div className="flex items-start gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white">{application.type === 'RIDER' ? <Bike className="h-5 w-5" /> : <Store className="h-5 w-5" />}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div><p className="truncate text-sm font-black text-slate-950">{application.applicantName}</p><p className="mt-0.5 font-mono text-[10px] font-bold text-slate-400">{application.applicationNumber}</p></div>
                            <span className={`rounded-full border px-2 py-1 text-[9px] font-black ${badge(application.status)}`}>{label(application.status)}</span>
                          </div>
                          <p className="mt-2 truncate text-xs font-semibold text-slate-500">{application.email || application.phoneE164 || 'No contact'}</p>
                          {application.deletedAt ? <p className="mt-1 text-[10px] font-black text-red-600">Deleted {date(application.deletedAt)}</p> : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="min-h-[620px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            {detailLoading ? (
              <div className="grid min-h-[620px] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
            ) : !detail ? (
              <div className="grid min-h-[620px] place-items-center p-10 text-center"><div><UserCheck className="mx-auto h-12 w-12 text-slate-300" /><h2 className="mt-4 text-lg font-black text-slate-800">Select an application</h2><p className="mt-2 text-sm font-semibold text-slate-500">Profile, private documents and the full audit trail appear here.</p></div></div>
            ) : (
              <ReviewWorkspace
                detail={detail}
                actionLoading={actionLoading}
                documentNotes={documentNotes}
                setDocumentNotes={setDocumentNotes}
                bulkNote={bulkNote}
                setBulkNote={setBulkNote}
                preview={(document) => void documentUrl(document, false)}
                download={(document) => void documentUrl(document, true)}
                reviewDocument={(document, decision) => action(`doc-${document.id}-${decision}`, () => apiClient.patch(`/admin/partner-onboarding/applications/${detail.application.id}/documents/${document.id}/review`, { decision, note: documentNotes[document.id]?.trim() || undefined }))}
                verifyAll={() => action('verify-all', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/documents/verify-all`, { note: bulkNote.trim() || undefined }))}
                startReview={() => action('review', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/review`, { note: 'Review accepted by Admin.' }))}
                contactChannel={contactChannel}
                setContactChannel={setContactChannel}
                contactMethod={contactMethod}
                setContactMethod={setContactMethod}
                contactReason={contactReason}
                setContactReason={setContactReason}
                verifyContact={() => action('contact', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/contact-verification`, { channel: contactChannel, method: contactMethod, reason: contactReason }))}
                changeFields={changeFields}
                setChangeFields={setChangeFields}
                changeMessage={changeMessage}
                setChangeMessage={setChangeMessage}
                requestChanges={() => action('changes', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/request-changes`, { requests: { fields: changeFields.split(',').map((item) => item.trim()).filter(Boolean) }, message: changeMessage }))}
                approval={approval}
                setApproval={setApproval}
                approve={() => action('approve', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/approve`, { ownerEmail: approval.ownerEmail || undefined, operationalName: approval.operationalName || undefined, latitude: approval.latitude ? Number(approval.latitude) : undefined, longitude: approval.longitude ? Number(approval.longitude) : undefined }))}
                rejectReason={rejectReason}
                setRejectReason={setRejectReason}
                rejectMessage={rejectMessage}
                setRejectMessage={setRejectMessage}
                reject={() => action('reject', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/reject`, { reasonCode: rejectReason, message: rejectMessage }))}
                deleteReason={deleteReason}
                setDeleteReason={setDeleteReason}
                deleteDraft={() => action('delete', () => apiClient.delete(`/admin/partner-onboarding/applications/${detail.application.id}`, { data: { reason: deleteReason, retentionDays: 14 } }))}
                restoreDraft={() => action('restore', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/restore`, {}))}
                close={() => setDetail(null)}
              />
            )}
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}

function ReviewWorkspace(props: any) {
  const { application, documents, requirements, events } = props.detail as ApplicationDetail;
  const reviewable = ['UNDER_REVIEW', 'ACTION_REQUIRED'].includes(application.status);
  const deletable = ['DRAFT', 'WITHDRAWN', 'EXPIRED'].includes(application.status);
  const allVerified = requirements.requiredDocuments.every((type) => documents.some((document) => document.type === type && document.status === 'VERIFIED'));

  return (
    <div className="max-h-[84vh] overflow-y-auto">
      <header className="sticky top-0 z-20 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 p-5 backdrop-blur-xl">
        <div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${badge(application.status)}`}>{label(application.status)}</span><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{application.type}</span>{application.linkedExistingUser ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700">EXISTING CUSTOMER LINKED</span> : null}</div><h2 className="mt-3 text-2xl font-black text-slate-950">{application.applicantName}</h2><p className="mt-1 font-mono text-xs font-bold text-slate-400">{application.applicationNumber}</p></div>
        <button onClick={props.close} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100"><XCircle className="h-4 w-4" /></button>
      </header>

      <div className="space-y-5 p-5">
        <Panel title="Review summary">
          <div className="grid gap-3 sm:grid-cols-3"><Metric label="Completion" value={`${requirements.completionPercent}%`} /><Metric label="Documents" value={`${documents.length}`} /><Metric label="Contact" value={application.emailVerifiedAt || application.phoneVerifiedAt ? 'Verified' : 'Pending'} /></div>
          {application.status === 'SUBMITTED' ? <ActionButton onClick={props.startReview} loading={props.actionLoading === 'review'} icon={<ShieldCheck className="h-4 w-4" />} label="Start review and assign to me" /> : null}
        </Panel>

        <Panel title="Applicant and contact">
          <div className="grid gap-3 md:grid-cols-2"><Info label="Email" value={application.email || 'Not provided'} /><Info label="Phone" value={application.phoneE164 || 'Not provided'} /><Info label="Email verified" value={date(application.emailVerifiedAt)} /><Info label="Phone verified" value={date(application.phoneVerifiedAt)} /></div>
          {!application.emailVerifiedAt || (!application.phoneVerifiedAt && application.phoneE164) ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <h4 className="text-sm font-black text-sky-950">Admin-assisted verification</h4>
              <p className="mt-1 text-xs font-semibold text-sky-700">Use only after an in-person, video or document-match check. The method, reason and Admin identity are audited.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2"><select value={props.contactChannel} onChange={(event) => props.setContactChannel(event.target.value)} className="rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-semibold"><option value="EMAIL">Email</option><option value="PHONE">Phone</option></select><select value={props.contactMethod} onChange={(event) => props.setContactMethod(event.target.value)} className="rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-semibold"><option value="IN_PERSON">In person</option><option value="SUPPORT_VIDEO_CALL">Support video call</option><option value="DOCUMENT_MATCH">Document match</option><option value="OTHER">Other</option></select></div>
              <textarea value={props.contactReason} onChange={(event) => props.setContactReason(event.target.value)} rows={2} placeholder="Reason and evidence checked" className="mt-3 w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm font-semibold" />
              <button onClick={props.verifyContact} disabled={props.contactReason.trim().length < 5 || Boolean(props.actionLoading)} className="mt-3 w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Mark contact verified by Admin</button>
            </div>
          ) : null}
        </Panel>

        <Panel title={application.type === 'RIDER' ? 'Rider profile' : 'Store profile'}>
          <div className="grid gap-3 md:grid-cols-2">{Object.entries(application.applicantPayload || {}).map(([key, value]) => <Info key={key} label={label(key.replace(/([a-z])([A-Z])/g, '$1_$2')).toLowerCase()} value={Array.isArray(value) ? value.join(', ') : String(value ?? '—')} />)}</div>
        </Panel>

        <Panel title="Private document review" subtitle="Use five-minute signed URLs. Each preview and download is recorded in the audit timeline.">
          {documents.length === 0 ? <p className="text-sm font-bold text-slate-500">No documents uploaded.</p> : <div className="space-y-3">{documents.map((document) => (
            <article key={document.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700"><FileCheck2 className="h-5 w-5" /></div><div><h4 className="text-sm font-black text-slate-950">{label(document.type)}</h4><p className="mt-1 text-xs font-semibold text-slate-500">{document.originalFilename}</p><p className="mt-1 text-[10px] font-bold text-slate-400">{Math.ceil(document.fileSize / 1024)} KB · v{document.version || 1} · uploaded {date(document.uploadedAt)}</p>{document.reviewedAt ? <p className="mt-1 text-[10px] font-bold text-emerald-700">Reviewed {date(document.reviewedAt)}</p> : null}</div></div><span className={`self-start rounded-full border px-2.5 py-1 text-[9px] font-black ${badge(document.status)}`}>{label(document.status)}</span></div>
              {document.reviewNote ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{document.reviewNote}</p> : null}
              <input value={props.documentNotes[document.id] || ''} onChange={(event) => props.setDocumentNotes((current: any) => ({ ...current, [document.id]: event.target.value }))} placeholder="Review note for replacement or rejection" className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" />
              <div className="mt-3 flex flex-wrap gap-2"><SmallButton onClick={() => props.preview(document)} icon={<Eye className="h-3.5 w-3.5" />} label="Preview" /><SmallButton onClick={() => props.download(document)} icon={<Download className="h-3.5 w-3.5" />} label="Download" />{reviewable ? <><SmallButton onClick={() => props.reviewDocument(document, 'VERIFIED')} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Verify" green /><SmallButton onClick={() => props.reviewDocument(document, 'REPLACEMENT_REQUIRED')} icon={<FileWarning className="h-3.5 w-3.5" />} label="Request replacement" amber /><SmallButton onClick={() => props.reviewDocument(document, 'REJECTED')} icon={<XCircle className="h-3.5 w-3.5" />} label="Reject" red /></> : null}</div>
            </article>
          ))}</div>}
          {reviewable && documents.length ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><input value={props.bulkNote} onChange={(event) => props.setBulkNote(event.target.value)} placeholder="Common verification note" className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-semibold" /><button onClick={props.verifyAll} disabled={Boolean(props.actionLoading)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><BadgeCheck className="h-4 w-4" /> Verify all submitted documents</button></div> : null}
        </Panel>

        {reviewable ? <Panel title="Request corrections"><input value={props.changeFields} onChange={(event) => props.setChangeFields(event.target.value)} placeholder="Fields, comma separated" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><textarea value={props.changeMessage} onChange={(event) => props.setChangeMessage(event.target.value)} rows={3} placeholder="Explain exactly what the applicant must change" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><button onClick={props.requestChanges} disabled={props.changeMessage.trim().length < 5 || Boolean(props.actionLoading)} className="w-full rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Request applicant changes</button></Panel> : null}

        {reviewable ? <Panel title="Approve and provision" subtitle="An existing Customer is linked to Rider/Store access; a new applicant receives secure activation."><input value={props.approval.ownerEmail} onChange={(event) => props.setApproval((current: any) => ({ ...current, ownerEmail: event.target.value }))} placeholder="Operational email" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><input value={props.approval.operationalName} onChange={(event) => props.setApproval((current: any) => ({ ...current, operationalName: event.target.value }))} placeholder="Operational name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" />{application.type === 'STORE' ? <div className="grid gap-3 sm:grid-cols-2"><input value={props.approval.latitude} onChange={(event) => props.setApproval((current: any) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><input value={props.approval.longitude} onChange={(event) => props.setApproval((current: any) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /></div> : null}<div className={`rounded-xl border px-3 py-2 text-xs font-bold ${allVerified ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{allVerified ? 'All mandatory documents are verified.' : 'Approval remains blocked until every mandatory document is verified.'}</div><button onClick={props.approve} disabled={!allVerified || !props.approval.ownerEmail.trim() || Boolean(props.actionLoading)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{application.type === 'RIDER' ? <Bike className="h-4 w-4" /> : <Building2 className="h-4 w-4" />} Approve and provision {application.type === 'RIDER' ? 'Rider' : 'Store'}</button></Panel> : null}

        {reviewable ? <Panel title="Reject application"><select value={props.rejectReason} onChange={(event) => props.setRejectReason(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"><option value="NOT_ELIGIBLE">Not eligible</option><option value="IDENTITY_MISMATCH">Identity mismatch</option><option value="DUPLICATE_APPLICATION">Duplicate application</option><option value="UNSUPPORTED_LOCATION">Unsupported location</option><option value="DOCUMENT_INTEGRITY">Document integrity concern</option><option value="OTHER">Other</option></select><textarea value={props.rejectMessage} onChange={(event) => props.setRejectMessage(event.target.value)} rows={3} placeholder="Applicant-facing rejection reason" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold" /><button onClick={props.reject} disabled={props.rejectMessage.trim().length < 5 || Boolean(props.actionLoading)} className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Reject application</button></Panel> : null}

        {deletable ? <Panel title={application.deletedAt ? 'Restore deleted draft' : 'Delete draft'} subtitle="Only Draft, Withdrawn and Expired applications can be deleted. Deletion is recoverable for 14 days.">{application.deletedAt ? <><Info label="Deletion reason" value={application.deletionReason || 'Not recorded'} /><Info label="Scheduled purge" value={date(application.scheduledPurgeAt)} /><button onClick={props.restoreDraft} disabled={Boolean(props.actionLoading)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white"><RotateCcw className="h-4 w-4" /> Restore draft</button></> : <><textarea value={props.deleteReason} onChange={(event) => props.setDeleteReason(event.target.value)} rows={2} placeholder="Required deletion reason" className="w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold" /><button onClick={props.deleteDraft} disabled={props.deleteReason.trim().length < 5 || Boolean(props.actionLoading)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50"><Trash2 className="h-4 w-4" /> Delete draft</button></>}</Panel> : null}

        <Panel title="Audit timeline">{events.length === 0 ? <p className="text-sm font-semibold text-slate-500">No events yet.</p> : <div className="space-y-4">{events.map((event) => <div key={event.id} className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600" /><div><p className="text-xs font-black text-slate-900">{label(event.eventType)}</p>{event.message ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{event.message}</p> : null}<p className="mt-1 text-[9px] font-bold text-slate-400">{event.actorKind} · {date(event.createdAt)}</p></div></div>)}</div>}</Panel>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-black text-slate-950">{title}</h3>{subtitle ? <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{subtitle}</p> : null}<div className="mt-4 space-y-3">{children}</div></section>;
}
function Metric({ label: metricLabel, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{metricLabel}</p><p className="mt-2 text-lg font-black text-slate-950">{value}</p></div>; }
function Info({ label: infoLabel, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[9px] font-black uppercase tracking-wide text-slate-400">{infoLabel}</p><p className="mt-1 break-words text-xs font-bold text-slate-700">{value}</p></div>; }
function ActionButton({ onClick, loading, icon, label: buttonLabel }: any) { return <button onClick={onClick} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{buttonLabel}</button>; }
function SmallButton({ onClick, icon, label: buttonLabel, green, amber, red }: any) { const style = green ? 'bg-emerald-600 text-white' : amber ? 'bg-amber-500 text-white' : red ? 'bg-red-600 text-white' : 'border border-slate-200 text-slate-700'; return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black ${style}`}>{icon}{buttonLabel}</button>; }
