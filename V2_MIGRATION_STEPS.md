# v2 Access Token Migration - Implementation Steps

## Phase 1: Azure Portal Configuration (5 minutes)

### Step 1.1: Update Backend App Manifest

1. Go to **Azure Portal** → **App registrations**
2. Search and click **SPETest** (id: `23cde6e4-7c2b-4201-a46a-c62e01194b4b`)
3. Click **Manifest** tab (left sidebar)
4. Find the line: `"accessTokenAcceptedVersion": null`
5. Change to: `"accessTokenAcceptedVersion": 2`
6. Click **Save** button at top

**Expected result**: Popup confirmation "Manifest updated successfully"

### Step 1.2: Verify Frontend App (No Changes Needed)

1. In the same **App registrations** view
2. Find **SharePointEmbededApp** (id: `a036da11-eb22-4436-99fb-94efa1861999`)
3. Verify it does NOT have `accessTokenAcceptedVersion` set
4. If it's not there or is `null`, that's correct → **No changes needed**

---

## Phase 2: Local Development Environment (2 minutes)

### Step 2.1: Stop Running Servers

```bash
# If running in one terminal:
# Press Ctrl+C in the terminal running "npm run start"

# Or kill all node processes:
killall node
```

### Step 2.2: Clear Frontend Auth State

In your browser:

1. Press **F12** to open DevTools
2. Go to **Application** tab
3. Under **Storage**, click **Local Storage**
4. Select the frontend origin (e.g., `http://localhost:3000`)
5. Click **Clear storage** or delete all entries

### Step 2.3: Rebuild Backend

```bash
cd /Users/vigilante/Documents/code/spe-demo
npm run build:backend
```

**Expected result**:

```
> spe-demo@0.1.0 build:backend
> tsc -p ./server/tsconfig.json
(no output = success)
```

### Step 2.4: Start Applications

```bash
npm run start
```

Wait for both frontend and backend to start:

```
✓ Frontend dev server at http://localhost:3000
✓ API server started, restify listening to http://localhost:3001
```

---

## Phase 3: Verification (5-10 minutes)

### Step 3.1: Trigger New Login

1. Open **http://localhost:3000** in your browser
2. You should see a login prompt or redirected to sign-in
3. Sign in with your test user account
4. After login, you should see the containers UI

### Step 3.2: Inspect Token Version (Browser Console)

1. Press **F12** → **Console** tab
2. Run this command:

```javascript
// Get the current token
const token = localStorage.getItem(
  "msal.SPAClient.a036da11-eb22-4436-99fb-94efa1861999.accessTokenExpiresOn",
);
console.log("Token found:", !!token);

// Or use the provider directly (from MGT)
const provider = Providers.globalProvider;
if (provider.state === 2) {
  provider.getAccessToken({ scopes: ["User.Read"] }).then((t) => {
    const [header, payload, sig] = t.split(".");
    const decoded = JSON.parse(atob(payload));
    console.log("Token ver:", decoded.ver);
    console.log("Token iss:", decoded.iss);
    console.log(
      "Expected v2 token:",
      decoded.ver === "2.0" &&
        decoded.iss.includes("login.microsoftonline.com"),
    );
  });
}
```

**Expected output**:

```
Token ver: 2.0
Token iss: https://login.microsoftonline.com/9517aa17-4352-4384-a035-49eb9d1bc46b/v2.0
Expected v2 token: true
```

**What changed**:

- Before: `ver: "1.0"`, `iss: "https://sts.windows.net/..."`
- After: `ver: "2.0"`, `iss: "https://login.microsoftonline.com/.../v2.0"`

### Step 3.3: Test API Calls (Browser DevTools Network Tab)

1. Activate **Network** tab in DevTools
2. In the frontend UI, click **List Containers** or **Create Container**
3. Check the request logs:

**listContainers request**:

```
GET http://localhost:3001/api/listContainers
Authorization: Bearer eyJ...{v2.0 token}...
Response: 200 OK
```

**Expected response body**:

```json
{
  "value": [
    { "id": "...", "displayName": "...", ... },
    ...
  ]
}
```

### Step 3.4: Check Backend Logs (Server Console)

In the terminal where backend is running, you should see:

```
API server started, restify listening to http://localhost:3001
[No "jwt issuer invalid" errors]
```

If you see errors like:

```
Invalid access token: jwt issuer invalid
```

→ Manifest change may not have taken effect yet. Wait 1-2 minutes and retry (Entra caches metadata).

---

## Phase 4: Validation Checklist

- [ ] Backend app manifest updated (`accessTokenAcceptedVersion: 2`)
- [ ] Frontend app manifest unchanged (no `accessTokenAcceptedVersion` set)
- [ ] Local storage cleared before new login
- [ ] Backend rebuilt (`npm run build:backend`)
- [ ] Applications restarted (`npm run start`)
- [ ] New login triggered (browser prompted for credentials)
- [ ] Token inspection shows `ver: "2.0"` and `login.microsoftonline.com` in issuer
- [ ] listContainers API call returns 200 OK
- [ ] createContainer API call returns 200 OK
- [ ] No "jwt issuer invalid" errors in backend logs
- [ ] Browser devtools Network tab shows requests completing

---

## Troubleshooting

### Issue: Still getting v1 token after 5 minutes

**Solution**:

1. Entra caches metadata for 5-10 minutes
2. Try: Clear browser cache completely using DevTools → "Network" → "Disable Cache" checkbox
3. Close browser entirely and re-open
4. Check if it's been at least 10 minutes since manifest change

### Issue: "jwt issuer invalid" error after auth

**Solution**:

1. Token is still v1 (manifest change not synced yet)
2. Wait 2-3 minutes for Entra to update issuer validation
3. Re-check the token `ver` field in console
4. If still v1, verify manifest change was saved in Azure Portal

### Issue: Login fails or "no account selected"

**Solution**:

1. Clear localStorage completely: `localStorage.clear()` in console
2. Close all tabs with localhost:3000
3. Close browser entirely
4. Re-open and try again

### Issue: Backend won't start (TypeScript errors)

**Solution**:

1. Run `npm run build:backend` again
2. Check for type errors in output
3. If no output, build succeeded

---

## Success Indicators

✅ All these should be true after completion:

- Token has `ver: "2.0"`
- Token issuer is `https://login.microsoftonline.com/{tid}/v2.0`
- API returns 200 on list/create container calls
- Backend logs show no issuer validation errors
- Both v1 and v2 validation paths work (backend is dual-compatible)

---

## Next Steps (Optional, not required now)

Once you confirm v2 is stable for 30+ days in production:

- Consider removing v1 validation code from `server/auth.ts` (optional cleanup)
- Not urgent; dual-version support has zero downside

---

## Reference

- Backend Auth Code: `server/auth.ts` (lines 51-255)

  - Dual-version support: auto-detects token ver and selects issuer
  - Cloud support: global and china environments supported
  - No code changes required for v2 token acceptance

- Frontend Auth Code: `src/index.tsx` (lines 12-21)
  - MGT Msal2Provider auto-detects token version
  - No hardcoded versions
  - Transparent v1/v2 handling
