/*
 * ============ JANAH AL RIYADAH — APP CONFIGURATION ============
 * 1) Firebase console -> Project settings -> Your apps -> Web app (</>)
 *    Copy the firebaseConfig values below. Leave apiKey empty = DEMO mode
 *    (data stays on the phone only).
 * 2) ownerEmails: only these accounts can open the Owner app.
 *    Keep the same email in firestore.rules.
 * This file is used by BOTH apps (customer + owner).
 */
window.JANAH_CONFIG = {
  firebase: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  ownerEmails: ["akrambajwa062@gmail.com"]
};
