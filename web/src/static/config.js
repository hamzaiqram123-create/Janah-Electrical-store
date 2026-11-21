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
    apiKey: "AIzaSyAnW1i32DasZ1RWzDutFsMbncd70hpap8s",
    authDomain: "janah-al-riyadah.firebaseapp.com",
    projectId: "janah-al-riyadah",
    storageBucket: "janah-al-riyadah.firebasestorage.app",
    messagingSenderId: "781851334952",
    appId: "1:781851334952:web:abae98635e438d3ca4981d"
  },
  ownerEmails: ["akrambajwa062@gmail.com"]
};
