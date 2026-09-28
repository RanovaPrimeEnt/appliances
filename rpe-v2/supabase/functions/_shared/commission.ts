// Shared server-side policy selection and settlement arithmetic.
export const SETTLEMENT_CURRENCY = 'GHS';
export function assertSettlementCurrency(value = 'GHS') {
  if (String(value).toUpperCase() !== SETTLEMENT_CURRENCY) {
    throw new Error('Checkout currently settles in GHS only. A supported payment provider and exchange-rate quote are required before another currency can be charged.');
  }
  return SETTLEMENT_CURRENCY;
}
export function selectCommissionRule(rows, context, now = Date.now()) {
  const currency = assertSettlementCurrency(context.currency);
  const eligible = rows.filter(r => r.active && !r.effective_to &&
    Number.isFinite(Date.parse(r.effective_from)) && Date.parse(r.effective_from) <= now &&
    String(r.currency || '').toUpperCase() === currency &&
    (!r.store_id || r.store_id === context.store_id) &&
    (!r.seller_country_code || r.seller_country_code === context.seller_country_code) &&
    (!r.buyer_country_code || r.buyer_country_code === context.buyer_country_code) &&
    (!r.payment_method || r.payment_method === context.payment_method));
  const score = r => (r.store_id ? 8 : 0) + (r.seller_country_code ? 4 : 0) + (r.buyer_country_code ? 2 : 0) + (r.payment_method ? 1 : 0);
  eligible.sort((a,b) => score(b)-score(a) || Date.parse(b.effective_from)-Date.parse(a.effective_from) || Number(b.rule_version)-Number(a.rule_version) || String(a.id).localeCompare(String(b.id)));
  if (!eligible.length) throw new Error('No active commission policy matches this country and settlement currency. Contact RANOVA before placing the order.');
  return eligible[0];
}
function cents(value, label) {
  if (value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 1000000000) throw new Error('Invalid '+label+'.');
  return Math.round((Number(value) + Number.EPSILON) * 100);
}
function basisPoints(value, label) {
  if (value === null || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) throw new Error('Invalid '+label+'.');
  return Math.round(Number(value)*100);
}
export function commissionBreakdown(rule, subtotal, delivery = 0) {
  assertSettlementCurrency(rule.currency);
  const product = cents(subtotal, 'product subtotal'), shipping = cents(delivery, 'delivery fee');
  const commissionBps = basisPoints(rule.commission_rate, 'commission rate');
  const processingBps = basisPoints(rule.payment_processing_rate, 'processing rate');
  const fixed = cents(rule.payment_fixed_fee, 'fixed fee');
  const payer = rule.payment_fee_payer;
  if (!['buyer','seller','platform'].includes(payer)) throw new Error('Invalid provider fee payer.');
  const commission = Math.round(product * commissionBps / 10000);
  const provider = Math.round((product + shipping) * processingBps / 10000) + fixed;
  const sellerDeduction = payer === 'seller' ? provider : 0;
  const seller = product + shipping - commission - sellerDeduction;
  if (seller < 0) throw new Error('This fee policy would produce a negative seller payout. Reduce the fees before activating it.');
  return {
    currency: SETTLEMENT_CURRENCY, product_subtotal: product/100, delivery_fee: shipping/100,
    commission_rate: commissionBps/100, commission_amount: commission/100,
    provider_fee_estimate: provider/100, provider_fee_payer: payer,
    seller_provider_fee: sellerDeduction/100, seller_payout_estimate: seller/100,
    buyer_provider_fee: payer === 'buyer' ? provider/100 : 0,
    buyer_total_estimate: (product+shipping+(payer === 'buyer' ? provider : 0))/100,
    platform_net_before_other_costs: (commission-(payer === 'platform' ? provider : 0))/100,
    rule_id: rule.id || null, rule_version: Number(rule.rule_version || 1),
    settlement_note: 'Estimates become payable only after confirmed payment and the applicable delivery, refund and payout checks. Provider costs, taxes and refunds may affect net earnings.'
  };
}
