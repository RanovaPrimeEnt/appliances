# RANOVA repository cleanup audit — 31 October 2026

## Status and safety boundary
- **Work location:** `maintenance/repo-cleanup-2026-10-31`; the production `main` branch is unchanged by this audit.
- **Approach:** inspect tracked-file inventory, check selected dependencies, avoid deleting anything that might affect the installed APK, hosted pages, offline service workers, stored images or deployment.
- **Total inventory:** 326 tracked files in the audited `main` tree, approximately 20.7 MB of blob data (tree reported 368 entries including directories). Counts are point-in-time.
- **Whole-file/folder deletions performed:** **None**. No candidate reached a safe-deletion threshold after dependency review.
- **One dead HTML element removed:** an invisible link to nonexistent `all/notifications.html` in `all/account.html`. The real Notifications button (`topNotificationBtn`) was preserved.
- **Two broken navigation links repaired:** `all/marketplace.html` and `all/product.html` now take “Sell on RANOVA” to `rpe-v2/seller-start.html`, the existing onboarding route.
- **Preventive cleanup:** added `.gitignore` for local builds, caches, device artifacts and signing credentials. Added automated hygiene checks to the release workflow.

## Dependency findings and retention decisions

| Candidate | Finding | Decision |
| --- | --- | --- |
| `all/images/catalogue-core/` vs `all/images/catalogue/` | 36 product-image pairs are byte-identical, totaling around 1,690,068 bytes of apparent duplication. `all/ranova-catalogue.js` refers to the `images/catalogue/` copy. The giant `all/site.html` was not fully readable through the available connector, so `catalogue-core` and possible historic URLs cannot be ruled out. | **Retain both**, pending a complete reference and legacy-URL check. |
| `all/site.html` (3.2 MB) | Referenced by `all/index.html` and precached by `all/sw.js`. | **Keep**: deleting it can break the public storefront or offline behavior. |
| `rpe-v2/offline-marketplace.json` (1.1 MB) | Referenced by the customer app and its service worker. | **Keep**: required for offline fallback and caching. |
| `all/seller-icon.svg`, `all/seller-icon-v2.svg` | Identical SVG payloads, but the seller service worker lists both. | **Keep** until service-worker and installed-PWA compatibility is proven. |
| `rpe-v2/admin-icon*.svg` and `rpe-v2/customer-icon*.svg` | Several are byte-identical but referenced by the customer service worker. | **Keep** for cache and installed-client compatibility. |
| `rpe-v2/seller-design-preview.html` | Disabled-registration UI prototype; explicitly described in `rpe-v2/SELLER_ONBOARDING_NOTES.md`. | **Keep** as a documented design reference; not a proven disposable file. |
| `all/scanner-test.html` | Separate, noindex diagnostic scanner interface. | **Keep** pending confirmation that device/camera diagnostic testing no longer needs it. |
| `android-app/`, `ios-app/`, `.github/workflows/`, `tests/`, `rpe-v2/supabase/` | Platform builds, CI tests, database migrations and Edge Function source. | **Keep**. Deleting source not referenced by a website hyperlink can still break builds and deployments. |
| `all/fonts/` | Referenced by site typography and service-worker caches. | **Keep** (including license). |

## Static navigation check
The updated regression check scans static `href` and `src` references in **36 HTML files** (all HTML files except oversized `all/site.html`) for missing local targets. The two broken seller-registration links and one hidden obsolete notifications link were fixed on the branch. Dynamic navigation and external redirects are not covered.

## Offline cache integrity check
All 86 explicitly listed static cache resources across the four service workers (`all/sw.js`, `seller-sw.js`, `rpe-v2/rpe-v2-sw.js`, `rpe-v2/admin-sw.js`) resolve to files in the repository. This is now checked by the automated hygiene test. Dynamic URLs and runtime cache behavior remain outside this static verification.

## Risks that should not be confused with unused code
1. **Large assets:** the two large JSON/HTML files and image folders affect download size, but removal cannot be justified only by size.
2. **Historical URLs and deployed PWA cache:** even unlinked assets can be required by service workers, installed clients or saved links.
3. **Existing open pull requests:** pending mobile build and security changes are not merged or superseded as part of cleanup.
4. **Runtime data:** no database rows, Supabase functions, payment logic, order records, signing keys or live order endpoints were changed.
5. **Visibility limitation:** a filename, identical hash or low reference count does not prove a file is unused. Dynamic URL construction and external links require additional verification.

## Future deletion gate (must all pass)
- All references searched, including large generated HTML/JSON, dynamic asset generation, SQL/server-side dependencies and historical deep links.
- Candidate has a documented replacement or redirect if it has ever been public.
- Buyer, seller, admin, offline and Android/iOS smoke tests pass with the candidate absent.
- Changes are reviewed through a pull request, and a rollback commit is recorded.
- An owner or maintainer confirms that legacy content/diagnostics can be retired.

## What this review changes
This review does **not** delete production files or modify `main`. It proposes removing one hidden obsolete link, repairing two broken links and adding safety checks in a draft pull request. Its automated guard prevents commits that accidentally track Android/iOS builds, local caches and private signing files, and checks a small set of essential application paths. Those checks supplement, not replace, end-to-end tests.

## Remaining verification
- Full reference scan of the oversized `all/site.html` and `rpe-v2/offline-marketplace.json` (file-read limit prevented whole-file inspection).
- Logged-in mobile APK and desktop browser regression checks.
- Assessment of the existing backlog of open pull requests; this cleanup branch deliberately does not merge or close them.
