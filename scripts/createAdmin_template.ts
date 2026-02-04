
import * as admin from 'firebase-admin';

// Initialize Firebase Admin SDK
// Ideally, this runs locally with service account creds or in a cloud environment
// For local execution, ensure GOOGLE_APPLICATION_CREDENTIALS is set
// OR use `firebase functions:shell` to run snippets if valid

const serviceAccount = require('../service-account-key.json'); // You'll need this or default auth

// Check if app is initialized
if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

async function createAdminUser() {
    const email = 'jefersonszalanski@gmail.com';
    const password = 'YOUR_PASSWORD_HERE'; // User asked for 123456, but in script I'll put placeholder or implementation

    try {
        // 1. Check if user exists
        let user;
        try {
            user = await admin.auth().getUserByEmail(email);
            console.log('User exists:', user.uid);
        } catch (e: any) {
            if (e.code === 'auth/user-not-found') {
                // 2. Create User
                console.log('Creating user...');
                user = await admin.auth().createUser({
                    email,
                    password: 'YOUR_PASSWORD_HERE', // I will put the actual requested one in the "real" command
                    emailVerified: true
                });
                console.log('User created:', user.uid);
            } else {
                throw e;
            }
        }

        // 3. Set Custom Claim
        await admin.auth().setCustomUserClaims(user.uid, { admin: true });
        console.log(`Custom claim 'admin: true' set for ${email}`);

    } catch (error) {
        console.error('Error creating admin:', error);
    }
}

createAdminUser();
