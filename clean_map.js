
import { db } from './src/firebase.js';
import { ref, set } from 'firebase/database';

async function clearLocations() {
    console.log("Clearing all locations...");
    try {
        await set(ref(db, 'locations'), null);
        console.log("All locations cleared successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error clearing locations:", error);
        process.exit(1);
    }
}

clearLocations();
