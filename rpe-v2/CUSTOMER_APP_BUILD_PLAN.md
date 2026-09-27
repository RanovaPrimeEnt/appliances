# RANOVA customer app: marketplace build plan

1688 is a product design reference, not a source of copied branding, proprietary ranking rules, or promised third-party services. Implement each feature against RANOVA's own seller, inventory, order, payment, and support rules.

## Working now in the review branch

- Native marketplace home opens without requiring sign-in. It shows approved seller products and remaining core RANOVA products from the live catalogue; cards rotate by device and time with store variety.
- Mobile product grid, category and text search, store view, product gallery, price and stock status, minimum quantity, and available quantity price tiers.
- Buyer filters for minimum order size and confirmed prices; sorting by mixed stores, newest seller listings, or lowest confirmed price. A comparison table checks up to three products for seller, category, price at the minimum order, order quantity, and listed stock. Empty values are labelled rather than guessed. Store pages display published delivery and return summaries where supplied.
- One local cart can hold products from multiple sellers. Seller lines are checked with the live marketplace quote function, which returns current availability, tier prices, grouped store subtotals, and published delivery options. Checkout repeats that check before placing an order.
- In-app order request and basic order tracking; RANOVA only shows payment instructions through the order lookup when they are available. Buyer account, saved products, and existing order history remain available in the account area. Account product actions feed the marketplace cart; existing saved legacy carts remain accessible until used.

## Next product slices

1. Product discovery: stronger spelling and synonym search, category images, image search inside the app, saved products and followed stores. Improve comparisons with structured seller specifications and variants when those fields are available.
2. Product confidence: verified purchase reviews, seller details, variants, package contents, warranty and return details, and a clear request-for-quote flow for products without confirmed prices.
3. Seller interaction: in-app messages and inquiries tied to the product and order, with response notifications and abuse reporting.
4. Checkout and fulfilment: confirmed delivery zones and fees, choices for split shipments, per-store order status, payment confirmation, refunds and dispute handling, all backed by the existing server services.
5. Marketplace quality: event-based ranking and measured exposure fairness, labelled sponsored slots if introduced, duplicate detection, moderation consistency, accessible loading/empty/error states, and browser/device verification.

Do not present a feature as live until its customer controls and its server-backed result are both working. Never infer payment confirmation from a buyer's button press or trust a client-supplied seller price as the final charge.
