# Seller onboarding reference implementation

The customer account's Switch to Seller link now opens seller-start.html.

Screen 1 follows the supplied seller welcome reference: orange header, profile registration action, information strip, three registration steps, Register now action, and bottom navigation. Register now opens screen 2 using a URL hash, so browser back works.

Screen 2 includes a short English registration form and the eight benefit categories supplied in images 3 and 4 (which are duplicates). The source's 1688-specific cash reward, map provider, Sesame Credit service, AI employee and source endorsement are not offered as RANOVA promises. Unavailable services are labelled Planned; each tile explains its status.

The integrated page uses existing Supabase Auth OTP methods. Email verification may use a code or magic link depending on project email templates. Phone OTP needs an SMS provider. Successful authentication is followed by the three required business fields (location, seller type, products). These are submitted to the existing seller-apply function, linked to the authenticated account, then passed to the existing document verification workspace. Store approval is not bypassed.

seller-design-preview.html is a self-contained visual preview. It does not load Supabase or make registration requests. Open it in a browser and click Register now to inspect both screens.

Validation: JavaScript syntax, HTML IDs, static links, and diff checks. Browser visual verification was blocked because the environment's Chromium download returned an invalid archive. Real OTP delivery, allowed email redirect URL, and authenticated application linking still require a staging account check before release. Do not merge as a completed production registration rollout until these pass.
