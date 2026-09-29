// Approval comes from administrator-controlled records, never user metadata.
export function sellerAccessApproved(application, store = null) {
  if (!application) return false;
  const state = String(application?.verification_status || application?.status || '').toLowerCase();
  if (['rejected', 'suspended'].includes(state)) return false;
  if (store?.store_status === 'suspended' && Date.parse(store.moderated_at || '') >= Date.parse(application?.reviewed_at || '1970-01-01')) return false;
  return state === 'approved' || !!(store?.store_status === 'active' && store.moderated_by);
}
