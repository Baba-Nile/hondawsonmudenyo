import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { getFirestore, collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, query, orderBy, onSnapshot, where, limit, startAfter, getDocs, getCountFromServer, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig, appCheckSiteKey, WARDS as ALL_WARDS, siteConfig } from "./config.js";

// Firebase counts as configured only when the essential keys are filled in.
export const ready = ["apiKey", "authDomain", "projectId", "appId"].every(k => String(firebaseConfig[k] || "").trim());
// Real ward names only (placeholders are filtered out).
export const WARDS = ALL_WARDS.map(w => String(w).trim()).filter(w => w && !/^REPLACE/i.test(w));

let app = null, db = null, auth = null;
if (ready) {
  try {
    app = initializeApp(firebaseConfig);
    if (appCheckSiteKey) initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    db = getFirestore(app); auth = getAuth(app);
  } catch (e) { console.error("Firebase init failed", e); }
}
export const connected = !!(db && auth);
export { db, auth, siteConfig, collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, query, orderBy, onSnapshot, where, limit, startAfter, getDocs, getCountFromServer, Timestamp,
  signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail, setPersistence, browserLocalPersistence, browserSessionPersistence };
