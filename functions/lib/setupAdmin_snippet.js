"use strict";
// --- ACCESS CONTROL ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAdminStatus = exports.setupAdmin = void 0;
exports.setupAdmin = functions.https.onCall(async (data, context) => {
    // SECURITY: checks for a hardcoded setup key to prevent abuse
    // In production, this function should be deleted after use.
    const { email, password, setupKey } = data;
    if (setupKey !== 'INTEL_SETUP_2026') {
        throw new functions.https.HttpsError('permission-denied', 'Invalid Setup Key');
    }
    try {
        // 1. Check if user exists
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
        }
        catch (e) {
            if (e.code === 'auth/user-not-found') {
                // Create user
                userRecord = await admin.auth().createUser({
                    email,
                    password,
                    emailVerified: true
                });
                console.log(`Created new user: ${email}`);
            }
            else {
                throw e;
            }
        }
        // 2. Set Custom Claims
        await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        return { success: true, message: `User ${email} is now an ADMIN.` };
    }
    catch (error) {
        console.error("Setup Admin Error", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
exports.checkAdminStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth)
        return { isAdmin: false };
    const token = context.auth.token;
    return { isAdmin: !!token.admin };
});
//# sourceMappingURL=setupAdmin_snippet.js.map