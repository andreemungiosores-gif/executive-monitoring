import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Configuration for Firebase project "UbicacionAndree"
const firebaseConfig = {
    apiKey: "AIzaSyCtW_g_qusDpHJKwcyuOFdTGPClacO_jkk",
    authDomain: "ubicacionandree.firebaseapp.com",
    projectId: "ubicacionandree",
    storageBucket: "ubicacionandree.firebasestorage.app",
    messagingSenderId: "547078316204",
    appId: "1:547078316204:web:f8ff5a8dcfcb7cec4c7f09",
    databaseURL: "https://ubicacionandree-default-rtdb.firebaseio.com"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database and get a reference to the service
export const db = getDatabase(app);
