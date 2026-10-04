// Seller Center / Dashboard access comes only from the administrator-controlled
// seller application approval state. A previously active store must never bypass
// the required-document review and final RANOVA Admin approval.
export function sellerAccessApproved(application, store = null) {
  if (!application) return false;
  const state = String(application?.verification_status || application?.status || '').toLowerCase();
  if (state !== 'approved') return false;
  if (store?.store_status === 'suspended' && Date.parse(store.moderated_at || '') >= Date.parse(application?.reviewed_at || '1970-01-01')) return false;
  return true;
}
