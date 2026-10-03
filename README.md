# Dawson Mudenyo | Sauti Ya Kwanza website

Static site (HTML + ES modules + Firebase). No build step.

## Run locally
ES modules do not work when you double-click `index.html`. Use a local server from this folder:

    npx serve .            # or:  python3 -m http.server 8080

Open http://localhost:3000 (serve) or http://localhost:8080. Admin portal: `/admin.html`.

## 1. Configure (edit only `config.js`)
- `firebaseConfig`: paste the keys from Firebase console > Project settings > Your apps > Web app.
- `WARDS`: replace every "REPLACE WITH REAL WARD NAME" with real ward names. Until then visitors are asked for their ward as free text and no placeholder is shown.
- `siteConfig`: phone, email and social links. Empty items are hidden from the Contact page.
Until Firebase keys are added, Community Connection shows "temporarily unavailable" and the admin portal cannot sign in.

## 2. Firebase setup
1. Create a project, add a Web app, and create a Cloud Firestore database.
2. Authentication > Sign-in method > enable Email/Password. Add your administrators under Users and copy each UID.
3. In Firestore, create `admins/{UID}` (document ID = the user's UID) with fields `name` (string) and `role` ("admin" or "editor"). Do this only in the console.
4. Deploy the rules: `firebase deploy --only firestore:rules` (or paste `firestore.rules` into the console).
5. Authentication > Settings > Authorized domains: add your live domain (localhost is allowed by default).
6. Optional App Check: register reCAPTCHA v3, put the site key in `appCheckSiteKey`, then enforce App Check for Firestore.
7. Deploy: `firebase deploy --only hosting` (or any static host).

## Roles
- Public: create a limited submission only (cannot read, edit or delete).
- editor: read submissions, change status.
- admin: the same, plus delete.

## Site structure (redesign)
Static multi-page site. Public pages are plain HTML: `index.html`, `about.html`, `projects.html`, `contact.html`, `privacy.html`. Admin: `admin.html` (noindex).
- `assets/css/site.css` is the design system (tokens at the top). `assets/css/admin.css` is the admin layer.
- `assets/js/site.js` (nav, reveal), `assets/js/connect.js` (Community Connection, same Firestore writes as before), `assets/js/admin.js` (portal).
- `assets/icons.svg` is the icon sprite (Font Awesome removed). `assets/img/` holds responsive WebP, favicons and the social image.
- `firebase.js`: initialisation unchanged. Only extra Firestore helpers were added to its export list (where, limit, startAfter, getDocs, getCountFromServer, Timestamp). `firestore.rules` is unchanged.
- SEO URLs use https://sauti-ya-kwanza.web.app. If you add a custom domain, replace it in each page's canonical/og:url, in `sitemap.xml` and `robots.txt`.

## v5 polish pass: what changed
- Public pages regenerated with one design system (`site.css`), calm single-photo hero, editorial About, case-study Projects, new footer, per-page SEO + structured data. Photos below 600px native width are never shown above native size.
- Community Connection: same Firestore writes. Restyled (navy controls, restrained red, lighter photo overlay) and the mobile horizontal overflow is fixed.
- Admin portal rewritten for scale: headline figures use server-side count queries; the Responses list is cursor-paginated (50/page); search and multi-filters cover the 1,000 most recent responses; one live listener (latest 100) powers LIVE, activity and new-response alerts. No rule or index changes needed.
- Times come from `createdAt` and are shown in East Africa Time. Missing `createdAt` shows "Time unavailable".
- Analytics: the admin Analytics page uses real Firestore data. Website visit analytics is OFF until a GA4 Measurement ID is put in `config.js` (`analyticsConfig.measurementId`). Nothing is loaded or collected until then. Google Analytics reports are viewed in Google's dashboard, not in this portal.

## v6 editorial + programmes pass
- Public pages rewritten with far less copy; navy structural colour, red kept to buttons and thin accents.
- `projects.html` is now a 12-programme portfolio (generated from supplied facts only). Programme data for the detail drawer sits in the `#project-data` JSON block; `assets/js/projects.js` renders it. Fields with no supplied information are omitted.
- Borehole register: add confirmed boreholes to the `BOREHOLES` array at the bottom of `assets/js/projects.js` (location, site, status, year). The table appears automatically.
- Photographs added under `assets/img/` (responsive WebP, named by subject).
- Community Connection: same Firestore writes and field names. Only copy and the photo panel changed.
- `firebase.js`, `config.js`, `firestore.rules`, `admin.html` and the admin scripts are untouched.
