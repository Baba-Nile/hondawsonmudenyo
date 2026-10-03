// ============================================================
// SITE CONFIGURATION
// ============================================================

// 1) FIREBASE CONFIGURATION
// Firebase Console > Project Settings > Your apps > Web app

export const firebaseConfig = {
  apiKey: "AIzaSyC_pCdC6P__678YLc-MMH1NNIfzztt4E1o",
  authDomain: "sauti-ya-kwanza.firebaseapp.com",
  projectId: "sauti-ya-kwanza",
  storageBucket: "sauti-ya-kwanza.firebasestorage.app",
  messagingSenderId: "775800605405",
  appId: "1:775800605405:web:a44d04880f498ca205e934"
};


// ============================================================
// 2) FIREBASE APP CHECK
// ============================================================

// Leave empty for now.
// We will configure App Check after the basic Firebase system
// has been tested successfully.

export const appCheckSiteKey = "";


// ============================================================
// 3) KWANZA CONSTITUENCY WARDS
// ============================================================

// Official Kwanza Constituency wards:
// Kwanza
// Keiyo
// Bidii
// Kapomboi

export const WARDS = [
  "Kwanza",
  "Keiyo",
  "Bidii",
  "Kapomboi"
];


// ============================================================
// 4) WEBSITE INFORMATION
// ============================================================

export const siteConfig = {

  // Organisation / platform
  name: "Sauti Ya Kwanza",

  // Constituency
  constituency: "Kwanza Constituency",

  county: "Trans-Nzoia County",

  country: "Kenya",

  location: "Kwanza Constituency, Trans-Nzoia County, Kenya",


  // ----------------------------------------------------------
  // CONTACT
  // ----------------------------------------------------------
  // Leave these empty until you provide the official details.
  // Empty fields are automatically hidden by the website.

  phone: "",

  email: "",


  // ----------------------------------------------------------
  // SOCIAL MEDIA
  // ----------------------------------------------------------
  // Add the official accounts when confirmed.

  facebook: "",

  x: "",

  instagram: "",

  youtube: "",


  // ----------------------------------------------------------
  // WEBSITE
  // ----------------------------------------------------------

  website: "",

  // ----------------------------------------------------------
  // ADMINISTRATIVE CONTACT
  // ----------------------------------------------------------

  office: "",

  officeHours: ""
};

// ============================================================
// 5) WEBSITE ANALYTICS (optional, off by default)
// ============================================================
// Paste the Google Analytics 4 Measurement ID (looks like G-XXXXXXXXXX)
// to switch on page-view analytics for the public pages.
// Leave empty and nothing is loaded and nothing is collected.

export const analyticsConfig = {
  measurementId: ""
};
