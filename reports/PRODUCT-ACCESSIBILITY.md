# Actual-product accessibility cycle — 6 October 2026

The optional product adapter now runs axe after a fictional chat is arranged into an editable draft and after approved saving retrieves an accessible source. It scans the whole page with WCAG 2 A/AA and 2.1 A/AA tags; there are no explicit rule or node exclusions within the selected WCAG tag scope. This is separate from the reference application's axe tests.

Baseline `product-20261006T092843993Z-6fef5db4`: desktop and mobile both failed. Findings were an accessible label on a generic element without a valid role, plus desktop draft text contrast of 1.16:1 (required 4.5:1). A diagnostic desktop run preserved detailed failure summaries. The product fix supplied an appropriate group role and scoped light-control colors so the surrounding dark theme cannot override the foreground.

Fixed focused run `product-20261006T093019768Z-802c0978`: 2/2 passed. The original failures and private screenshots/traces remain ignored. The source code of the private app is not included in this package.

Complete actual-product adapter rerun `product-20261006T093114940Z-8282f78b`: 10/10 passed across desktop Chromium and mobile-browser Chromium, including both axe journeys. TypeScript compilation also passed. These are local synthetic-product results, not evidence of real-account sign-in or native accessibility.

Run after independently starting the product's synthetic fixture:

```sh
QUALITY_PRODUCT_BASE_URL=http://127.0.0.1:4186 npm run test:product
```

The adapter permits only a loopback target and substitutes all Luna inference requests. Fictional identity and model substitutes are explicit; no paid inference or genuine authentication occurs. Automated checks do not replace keyboard/screen-reader review or establish general WCAG conformance.
