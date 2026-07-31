'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast } from '@/components/ToastProvider';
import { apiClient } from '@aagam/utils';
import {
  BadgeCheck,
  Bike,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileWarning,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  XCircle,
} from 'lucide-react';

type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
type PartnerApplication = {
  id: string; applicationNumber: string; type: 'RIDER' | 'STORE'; status: ApplicationStatus;
  applicantName: string; email?: string | null; phoneE164?: string | null;
  emailVerifiedAt?: string | null; phoneVerifiedAt?: string | null;
  applicantPayload: Record<string, any>; submissionVersion: number;
  linkedExistingUser?: boolean; deletedAt?: string | null; deletionReason?: string | null;
  scheduledPurgeAt?: string | null; createdAt: string; updatedAt: string;
};
type PartnerDocument = {
  id: string; type: string; originalFilename: string; mimeType: string; fileSize: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'EXPIRED' | 'REPLACEMENT_REQUIRED';
  reviewNote?: string | null; reviewedAt?: string | null; uploadedAt?: string | null; version?: number;
};
type ApplicationDetail = {
  application: PartnerApplication; documents: PartnerDocument[];
  requirements: { requiredDocuments: string[]; completedRequired: string[]; completionPercent: number };
  events: Array<{ id: string; eventType: string; actorKind: string; message?: string | null; createdAt: string }>;
};

const label = (value: string) => value.replaceAll('_', ' ');
const date = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
const badge = (status: string) => {
  if (['APPROVED', 'VERIFIED'].includes(status)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (['REJECTED', 'EXPIRED'].includes(status)) return 'border-red-200 bg-red-50 text-red-700';
  if (['ACTION_REQUIRED', 'REPLACEMENT_REQUIRED'].includes(status)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (status === 'UNDER_REVIEW') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-sky-200 bg-sky-50 text-sky-700';
};

export default function PartnerApplicationsAdminPage() {
  const toast = useToast();
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [detail, setDetail] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState('');
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<'active' | 'deleted' | 'all'>('active');
  const [documentNotes, setDocumentNotes] = useState<Record<string, string>>({});
  const [bulkNote, setBulkNote] = useState('Reviewed against the submitted originals.');
  const [contactMethod, setContactMethod] = useState('IN_PERSON');
  const [contactReason, setContactReason] = useState('');
  const [changeFields, setChangeFields] = useState('');
  const [changeMessage, setChangeMessage] = useState('');
  const [deleteReason, setDeleteReason] = useState('');
  const [rejectMessage, setRejectMessage] = useState('');
  const [approval, setApproval] = useState({ ownerEmail: '', operationalName: '', latitude: '', longitude: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100', visibility });
      if (search.trim()) params.set('search', search.trim());
      const response = await apiClient.get(`/admin/partner-onboarding/applications?${params.toString()}`);
      setApplications(Array.isArray(response.data?.items) ? response.data.items : []);
    } catch {
      // Global API interceptor displays the exact server message as a toast.
    } finally {
      setLoading(false);
    }
  }, [search, visibility]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const openApplication = async (application: PartnerApplication) => {
    setDetailLoading(true);
    try {
      const response = await apiClient.get(`/admin/partner-onboarding/applications/${application.id}`);
      setDetail(response.data);
      setApproval({
        ownerEmail: application.email || '',
        operationalName: String(application.applicantPayload?.displayName || application.applicantName),
        latitude: application.applicantPayload?.latitude == null ? '' : String(application.applicantPayload.latitude),
        longitude: application.applicantPayload?.longitude == null ? '' : String(application.applicantPayload.longitude),
      });
      setContactReason('');
      setDeleteReason('');
    } catch {
      // Global API interceptor displays the exact server message as a toast.
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

  const action = async (key: string, success: string, work: () => Promise<any>) => {
    setActionLoading(key);
    try {
      await work();
      toast.success(success, 'Partner review updated');
      await refreshDetail();
    } catch {
      // Global API interceptor displays exact backend conflicts, including HTTP 409,
      // above the open review dialog instead of rendering an inline page banner.
    } finally {
      setActionLoading('');
    }
  };

  const documentUrl = async (document: PartnerDocument, download = false) => {
    if (!detail) return;
    const suffix = download ? 'download-url' : 'url';
    try {
      const response = await apiClient.get(`/admin/partner-onboarding/applications/${detail.application.id}/documents/${document.id}/${suffix}`);
      const url = String(response.data?.url || '');
      if (!url || url.startsWith('test://')) {
        toast.info(`Private QA document reference: ${url || 'unavailable'}`, 'Document reference');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      // Global API interceptor displays the exact server message as a toast.
    }
  };

  const counts = useMemo(() => ({
    submitted: applications.filter((item) => item.status === 'SUBMITTED').length,
    review: applications.filter((item) => item.status === 'UNDER_REVIEW').length,
    action: applications.filter((item) => item.status === 'ACTION_REQUIRED').length,
    approved: applications.filter((item) => item.status === 'APPROVED').length,
  }), [applications]);

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mx-auto max-w-[1540px] pb-12">
        <header className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div><p className="text-xs font-black uppercase tracking-widest text-teal-700">Partner review workspace</p><h1 className="mt-2 text-3xl font-black text-slate-950">Partner Applications</h1><p className="mt-2 text-sm font-semibold text-slate-500">Phone is the primary identity. Email remains an optional recovery and notification contact.</p></div>
          <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black"><RefreshCw className="h-4 w-4" /> Refresh queue</button>
        </header>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Waiting review', counts.submitted], ['Under review', counts.review], ['Applicant action', counts.action], ['Approved', counts.approved]].map(([title, value]) => <div key={String(title)} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"><p className="text-xs font-black uppercase text-slate-400">{title}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}</div>
        <div className="grid gap-5 xl:grid-cols-[minmax(350px,.82fr)_minmax(620px,1.55fr)]">
          <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search phone, name, email or application" className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-semibold" /></div><div className="mt-3 flex gap-2">{(['active', 'deleted', 'all'] as const).map((item) => <button key={item} onClick={() => setVisibility(item)} className={`rounded-lg px-3 py-2 text-[10px] font-black uppercase ${visibility === item ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{item}</button>)}</div></div>
            <div className="max-h-[75vh] overflow-y-auto p-3">{loading ? <div className="grid min-h-56 place-items-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div> : applications.length === 0 ? <div className="p-10 text-center"><ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 text-sm font-black">No matching applications</p></div> : <div className="space-y-2">{applications.map((application) => <button key={application.id} onClick={() => void openApplication(application)} className={`w-full rounded-2xl border p-4 text-left ${detail?.application.id === application.id ? 'border-teal-400 bg-teal-50/60' : 'border-slate-100 hover:bg-slate-50'}`}><div className="flex gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white">{application.type === 'RIDER' ? <Bike className="h-5 w-5" /> : <Store className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><div><p className="truncate text-sm font-black">{application.applicantName}</p><p className="font-mono text-[10px] font-bold text-slate-400">{application.applicationNumber}</p></div><span className={`h-fit rounded-full border px-2 py-1 text-[9px] font-black ${badge(application.status)}`}>{label(application.status)}</span></div><p className="mt-2 truncate text-xs font-black text-slate-700">{application.phoneE164 || 'Phone not provided'}</p>{application.email ? <p className="truncate text-[10px] font-semibold text-slate-400">{application.email}</p> : null}{application.deletedAt ? <p className="mt-1 text-[10px] font-black text-red-600">Deleted {date(application.deletedAt)}</p> : null}</div></div></button>)}</div>}</div>
          </section>
          <section className="min-h-[620px] overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">{detailLoading ? <div className="grid min-h-[620px] place-items-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div> : detail ? <ReviewWorkspace detail={detail} actionLoading={actionLoading} documentNotes={documentNotes} setDocumentNotes={setDocumentNotes} bulkNote={bulkNote} setBulkNote={setBulkNote} preview={(document: PartnerDocument) => void documentUrl(document)} download={(document: PartnerDocument) => void documentUrl(document, true)} reviewDocument={(document: PartnerDocument, decision: string) => action(`doc-${document.id}`, 'Document review saved.', () => apiClient.patch(`/admin/partner-onboarding/applications/${detail.application.id}/documents/${document.id}/review`, { decision, note: documentNotes[document.id]?.trim() || undefined }))} verifyAll={() => action('verify-all', 'All submitted documents were verified.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/documents/verify-all`, { note: bulkNote.trim() || undefined }))} startReview={() => action('review', 'Review started.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/review`, { note: 'Review accepted by Admin.' }))} contactMethod={contactMethod} setContactMethod={setContactMethod} contactReason={contactReason} setContactReason={setContactReason} verifyContact={() => action('contact', 'Primary phone verified by Admin.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/contact-verification`, { channel: detail.application.phoneE164 ? 'PHONE' : 'EMAIL', method: contactMethod, reason: contactReason }))} changeFields={changeFields} setChangeFields={setChangeFields} changeMessage={changeMessage} setChangeMessage={setChangeMessage} requestChanges={() => action('changes', 'Changes requested from applicant.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/request-changes`, { requests: { fields: changeFields.split(',').map((item) => item.trim()).filter(Boolean) }, message: changeMessage }))} approval={approval} setApproval={setApproval} approve={() => action('approve', 'Partner approved and access provisioned.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/approve`, { ownerEmail: approval.ownerEmail || undefined, operationalName: approval.operationalName || undefined, latitude: approval.latitude ? Number(approval.latitude) : undefined, longitude: approval.longitude ? Number(approval.longitude) : undefined }))} rejectMessage={rejectMessage} setRejectMessage={setRejectMessage} reject={() => action('reject', 'Application rejected.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/reject`, { reasonCode: 'NOT_ELIGIBLE', message: rejectMessage }))} deleteReason={deleteReason} setDeleteReason={setDeleteReason} deleteDraft={() => action('delete', 'Draft moved to deleted items.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/delete`, { reason: deleteReason.trim(), retentionDays: 14 }))} restoreDraft={() => action('restore', 'Draft restored.', () => apiClient.post(`/admin/partner-onboarding/applications/${detail.application.id}/restore`, {}))} close={() => setDetail(null)} /> : <div className="grid min-h-[620px] place-items-center text-center"><div><ClipboardCheck className="mx-auto h-12 w-12 text-slate-300" /><h2 className="mt-4 text-lg font-black">Select an application</h2></div></div>}</section>
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
  const primaryVerified = application.phoneE164 ? Boolean(application.phoneVerifiedAt) : Boolean(application.emailVerifiedAt);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Review ${application.applicantName}`} onMouseDown={(event) => { if (event.currentTarget === event.target) props.close(); }}><div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-3xl bg-white shadow-2xl"><header className="sticky top-0 z-20 flex justify-between border-b bg-white/95 p-5"><div><div className="flex gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${badge(application.status)}`}>{label(application.status)}</span><span className="text-[10px] font-black text-slate-400">{application.type}</span></div><h2 className="mt-3 text-2xl font-black">{application.applicantName}</h2><p className="font-mono text-xs text-slate-400">{application.applicationNumber}</p></div><button onClick={props.close} aria-label="Close application review"><XCircle className="h-5 w-5" /></button></header><div className="space-y-5 p-5">
    <Panel title="Review summary"><div className="grid gap-3 sm:grid-cols-3"><Metric label="Completion" value={`${requirements.completionPercent}%`} /><Metric label="Documents" value={`${documents.length}`} /><Metric label="Primary phone" value={application.phoneVerifiedAt ? 'Verified' : 'Pending'} /></div>{application.status === 'SUBMITTED' ? <ActionButton onClick={props.startReview} loading={props.actionLoading === 'review'} icon={<ShieldCheck className="h-4 w-4" />} label="Start review and assign to me" /> : null}</Panel>
    <Panel title="Applicant contact"><div className="grid gap-3 md:grid-cols-2"><Info label="Primary mobile" value={application.phoneE164 || 'Not provided'} /><Info label="Phone verified" value={date(application.phoneVerifiedAt)} /><Info label="Optional email" value={application.email || 'Not provided'} /><Info label="Email verified" value={date(application.emailVerifiedAt)} /></div>{!primaryVerified ? <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><h4 className="text-sm font-black">Admin-assisted primary contact verification</h4><select value={props.contactMethod} onChange={(event) => props.setContactMethod(event.target.value)} className="mt-3 w-full rounded-xl border bg-white px-3 py-2.5"><option value="IN_PERSON">In person</option><option value="SUPPORT_VIDEO_CALL">Support video call</option><option value="DOCUMENT_MATCH">Document match</option><option value="OTHER">Other</option></select><textarea value={props.contactReason} onChange={(event) => props.setContactReason(event.target.value)} rows={2} placeholder="Reason and evidence checked" className="mt-3 w-full rounded-xl border bg-white px-3 py-2.5" /><button onClick={props.verifyContact} disabled={props.contactReason.trim().length < 5 || Boolean(props.actionLoading)} className="mt-3 w-full rounded-xl bg-sky-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">Verify primary contact</button></div> : null}</Panel>
    <Panel title={application.type === 'RIDER' ? 'Rider profile' : 'Store profile'}><div className="grid gap-3 md:grid-cols-2">{Object.entries(application.applicantPayload || {}).map(([key, value]) => <Info key={key} label={label(key.replace(/([a-z])([A-Z])/g, '$1_$2')).toLowerCase()} value={Array.isArray(value) ? value.join(', ') : String(value ?? '—')} />)}</div></Panel>
    <Panel title="Private document review" subtitle="Preview and download links expire after five minutes.">{documents.length === 0 ? <p className="text-sm font-bold text-slate-500">No documents uploaded.</p> : documents.map((document) => <article key={document.id} className="rounded-2xl border p-4"><div className="flex justify-between gap-3"><div><h4 className="text-sm font-black">{label(document.type)}</h4><p className="text-xs text-slate-500">{document.originalFilename} · v{document.version || 1}</p></div><span className={`h-fit rounded-full border px-2 py-1 text-[9px] font-black ${badge(document.status)}`}>{label(document.status)}</span></div>{document.reviewNote ? <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-bold text-amber-800">{document.reviewNote}</p> : null}<input value={props.documentNotes[document.id] || ''} onChange={(event) => props.setDocumentNotes((current: any) => ({ ...current, [document.id]: event.target.value }))} placeholder="Review note" className="mt-3 w-full rounded-xl border px-3 py-2 text-xs" /><div className="mt-3 flex flex-wrap gap-2"><SmallButton onClick={() => props.preview(document)} icon={<Eye className="h-3.5 w-3.5" />} label="Preview" /><SmallButton onClick={() => props.download(document)} icon={<Download className="h-3.5 w-3.5" />} label="Download" />{reviewable ? <><SmallButton onClick={() => props.reviewDocument(document, 'VERIFIED')} icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Verify" green /><SmallButton onClick={() => props.reviewDocument(document, 'REPLACEMENT_REQUIRED')} icon={<FileWarning className="h-3.5 w-3.5" />} label="Replace" amber /></> : null}</div></article>)}{reviewable && documents.length ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><input value={props.bulkNote} onChange={(event) => props.setBulkNote(event.target.value)} className="w-full rounded-xl border px-3 py-2" /><button onClick={props.verifyAll} className="mt-3 inline-flex w-full justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white"><BadgeCheck className="h-4 w-4" /> Verify all documents</button></div> : null}</Panel>
    {reviewable ? <Panel title="Request corrections"><input value={props.changeFields} onChange={(event) => props.setChangeFields(event.target.value)} placeholder="Fields, comma separated" className="w-full rounded-xl border px-3 py-2.5" /><textarea value={props.changeMessage} onChange={(event) => props.setChangeMessage(event.target.value)} rows={3} placeholder="Explain required changes" className="w-full rounded-xl border px-3 py-2.5" /><button onClick={props.requestChanges} disabled={props.changeMessage.trim().length < 5} className="w-full rounded-xl bg-amber-500 px-4 py-3 font-black text-white disabled:opacity-50">Request changes</button></Panel> : null}
    {reviewable ? <Panel title="Approve and provision" subtitle="Verified phone becomes the login identity. Operational email is optional."><Info label="Primary login" value={application.phoneE164 || application.email || 'Missing'} /><input value={props.approval.ownerEmail} onChange={(event) => props.setApproval((current: any) => ({ ...current, ownerEmail: event.target.value }))} placeholder="Optional operational email" className="w-full rounded-xl border px-3 py-2.5" /><input value={props.approval.operationalName} onChange={(event) => props.setApproval((current: any) => ({ ...current, operationalName: event.target.value }))} placeholder="Operational name" className="w-full rounded-xl border px-3 py-2.5" />{application.type === 'STORE' ? <div className="grid gap-3 sm:grid-cols-2"><input value={props.approval.latitude} onChange={(event) => props.setApproval((current: any) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" className="rounded-xl border px-3 py-2.5" /><input value={props.approval.longitude} onChange={(event) => props.setApproval((current: any) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" className="rounded-xl border px-3 py-2.5" /></div> : null}<button onClick={props.approve} disabled={!allVerified || !primaryVerified || Boolean(props.actionLoading)} className="inline-flex w-full justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 font-black text-white disabled:opacity-50">{application.type === 'RIDER' ? <Bike className="h-4 w-4" /> : <Building2 className="h-4 w-4" />} Approve and provision</button></Panel> : null}
    {reviewable ? <Panel title="Reject application"><textarea value={props.rejectMessage} onChange={(event) => props.setRejectMessage(event.target.value)} rows={3} placeholder="Applicant-facing reason" className="w-full rounded-xl border px-3 py-2.5" /><button onClick={props.reject} disabled={props.rejectMessage.trim().length < 5} className="w-full rounded-xl bg-red-600 px-4 py-3 font-black text-white disabled:opacity-50">Reject application</button></Panel> : null}
    {deletable ? <Panel title={application.deletedAt ? 'Restore deleted draft' : 'Delete draft'} subtitle="Deletion is recoverable for 14 days.">{application.deletedAt ? <><Info label="Deletion reason" value={application.deletionReason || 'Not recorded'} /><Info label="Scheduled purge" value={date(application.scheduledPurgeAt)} /><button onClick={props.restoreDraft} className="inline-flex w-full justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-black text-white"><RotateCcw className="h-4 w-4" /> Restore draft</button></> : <><textarea value={props.deleteReason} onChange={(event) => props.setDeleteReason(event.target.value)} rows={2} placeholder="Required deletion reason" className="w-full rounded-xl border border-red-200 px-3 py-2.5" /><button onClick={props.deleteDraft} disabled={props.deleteReason.trim().length < 5 || props.actionLoading === 'delete'} className="inline-flex w-full justify-center gap-2 rounded-xl bg-red-700 px-4 py-3 font-black text-white disabled:opacity-50">{props.actionLoading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete draft</button></>}</Panel> : null}
    <Panel title="Audit timeline">{events.map((event) => <div key={event.id} className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 rounded-full bg-teal-600" /><div><p className="text-xs font-black">{label(event.eventType)}</p>{event.message ? <p className="text-xs text-slate-500">{event.message}</p> : null}<p className="text-[9px] text-slate-400">{event.actorKind} · {date(event.createdAt)}</p></div></div>)}</Panel>
  </div></div></div>;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 p-4"><h3 className="text-sm font-black">{title}</h3>{subtitle ? <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p> : null}<div className="mt-4 space-y-3">{children}</div></section>; }
function Metric({ label: metricLabel, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-slate-50 p-4"><p className="text-[10px] font-black uppercase text-slate-400">{metricLabel}</p><p className="mt-2 text-lg font-black">{value}</p></div>; }
function Info({ label: infoLabel, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[9px] font-black uppercase text-slate-400">{infoLabel}</p><p className="mt-1 break-words text-xs font-bold text-slate-700">{value}</p></div>; }
function ActionButton({ onClick, loading, icon, label: buttonLabel }: any) { return <button onClick={onClick} disabled={loading} className="inline-flex w-full justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{buttonLabel}</button>; }
function SmallButton({ onClick, icon, label: buttonLabel, green, amber }: any) { const style = green ? 'bg-emerald-600 text-white' : amber ? 'bg-amber-500 text-white' : 'border border-slate-200 text-slate-700'; return <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-black ${style}`}>{icon}{buttonLabel}</button>; }
