
import { db } from './src/firebase.js';
import { ref, get, child } from 'firebase/database';

async function checkConnection() {
    console.log("Checking connection...");
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'locations'));
        if (snapshot.exists()) {
            console.log("Connection SUCCESS! Locations found:", snapshot.key);
        } else {
            console.log("Connection SUCCESS! (But 'locations' node is empty - expected if cleaned up).");
        }
        process.exit(0);
    } catch (error) {
        console.error("Connection FAILED:", error);
        process.exit(1);
    }
}

checkConnection();
