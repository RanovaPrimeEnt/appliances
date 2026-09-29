export const REQUIRED_SELLER_DOCUMENTS = ['business_registration', 'identity_document', 'fulfilment_evidence'];
export function addCalendarMonths(value, months) {
  const source = new Date(value), date = new Date(source);
  const day = source.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}
export function sellerDocumentCompliance(application, files, now = Date.now()) {
  const rows = [...files].sort((a,b) => Date.parse(b.created_at)-Date.parse(a.created_at) || Number(b.id)-Number(a.id));
  const missing_types = REQUIRED_SELLER_DOCUMENTS.filter(type => {
    const latest = rows.find(file => file.document_type === type);
    return !latest || !/\.(pdf|doc|docx|ppt|pptx|jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif|svg|ico)$/i.test(String(latest.original_filename || ''));
  });
  if (!application?.created_at) throw new Error('Seller registration date is unavailable.');
  const registered = new Date(application.created_at);
  if (!Number.isFinite(registered.getTime())) throw new Error('Seller registration date is unavailable.');
  const grace = addCalendarMonths(registered, 8), deadline = addCalendarMonths(registered, 10);
  const phase = !missing_types.length ? 'complete' : now >= deadline.getTime() ? 'expired' : now >= grace.getTime() ? 'grace' : 'reminder';
  return {missing_types, phase, blocked: phase === 'expired', registered_at: registered.toISOString(), grace_starts_at: grace.toISOString(), deadline_at: deadline.toISOString(), days_remaining: Math.max(0,Math.ceil((deadline.getTime()-now)/86400000)), server_now: new Date(now).toISOString(), support_email: 'ranovaprimeenterprise360@gmail.com'};
}
