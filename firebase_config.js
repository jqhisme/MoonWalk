// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { getAuth, signOut, setPersistence, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, createUserWithEmailAndPassword, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js"

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB0dl3ceDjh4c4Jkc2TTTpXKERy0_wVhU4",
    authDomain: "sharedmindsteaching.firebaseapp.com",
    projectId: "sharedmindsteaching",
    storageBucket: "sharedmindsteaching.firebasestorage.app",
    messagingSenderId: "1034518385194",
    appId: "1:1034518385194:web:a51227545957caa68de953"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Export to global scope for use in script.js
window.firebaseDB = db;
window.firebaseAddDoc = addDoc;
window.firebaseCollection = collection;
window.firebaseServerTimestamp = serverTimestamp;

// create a button on the page to sign in with google
let auth;
let button = document.createElement("button");
button.innerText = "Sign in with Google";
button.addEventListener("click", () => {
    auth = getAuth(app);
    const googleAuthProvider = new GoogleAuthProvider();
    signInWithPopup(auth, googleAuthProvider)
        .then((result) => { 
            const user = result.user;
            console.log("User signed in: ", user);
            // remove the button after signing in
            button.remove();
        })
        .catch((error) => {
            console.error("Error signing in: ", error);
        });
});
document.body.appendChild(button);

// auth = getAuth();
// googleAuthProvider = new GoogleAuthProvider();
// signInWithPopup(auth, googleAuthProvider)