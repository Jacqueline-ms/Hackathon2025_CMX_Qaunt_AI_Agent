# Authentication Guide
Understanding Authentication for Azure Blade Analytics Dashboard

## 🎯 The Authentication Challenge

### The Problem
Your dashboard needs to query Azure Data Explorer (Kusto) to get live telemetry data. Authentication works differently in development vs production.

---

## 🔐 Authentication Scenarios

### Scenario 1: Local Development (Current State)
**Who authenticates:** You (the developer)
**How:** Azure CLI credentials
**Setup:**
```bash
az login
az account set --subscription "your-subscription"
```

**How it works:**
1. You run `az login` on your machine
2. `DefaultAzureCredential` in Node.js finds your Azure CLI token
3. App uses YOUR personal credentials to query Kusto
4. ✅ Works great for development!
5. ❌ Won't work in production (no Azure CLI on server)

**Verification:**
```bash
# Check you're logged in
az account show

# Check your Kusto token
az account get-access-token --resource https://kusto.kusto.windows.net
```

---

### Scenario 2: Production Deployment (Azure-hosted)
**Who authenticates:** The application (via Managed Identity)
**How:** Azure automatically assigns an identity to your app
**Setup:**
```bash
# Enable Managed Identity (automatic in Azure App Service/Container Apps)
az webapp identity assign --name <app-name> --resource-group <rg>

# Get the identity's principal ID
IDENTITY_ID=$(az webapp identity show --name <app-name> --resource-group <rg> --query principalId -o tsv)
```

**Grant Kusto Access:**
In Kusto Web Explorer (`dataexplorer.azure.com`):
```kql
.add database AzurePortal viewers ('aadapp=<IDENTITY_ID>') 'Blade Analytics Dashboard'
```

**How it works:**
1. Azure assigns a Managed Identity to your deployed app
2. You grant that identity "Viewer" role on the Kusto database
3. `DefaultAzureCredential` automatically uses the Managed Identity when deployed
4. ✅ Works for ALL users without individual permissions!
5. ✅ More secure (no credentials to manage)

---

### Scenario 3: Non-Azure Hosting (Service Principal)
**Who authenticates:** The application (via Service Principal)
**How:** Create a dedicated app registration
**Setup:**
```bash
# Create Service Principal
az ad sp create-for-rbac --name "blade-analytics-sp" --role contributor --scopes /subscriptions/<subscription-id>

# Save the output - you'll need:
# - appId (client ID)
# - password (client secret)
# - tenant
```

**Set Environment Variables:**
```bash
export AZURE_CLIENT_ID="<appId>"
export AZURE_CLIENT_SECRET="<password>"
export AZURE_TENANT_ID="<tenant>"
```

**Grant Kusto Access:**
```kql
.add database AzurePortal viewers ('aadapp=<CLIENT_ID>;<TENANT_ID>') 'Blade Analytics Dashboard'
```

---

## 👥 User Access (End Users of Your Dashboard)

### Important: Users Don't Need Kusto Access!

**Your app authenticates to Kusto, not the users.**

```
User Browser → Your Web App → Kusto
              [App Identity]
```

**What users need:**
- ✅ Access to your web app URL
- ❌ NO Kusto permissions required!

**Optional: Add User Authentication**
If you want to control who can access your dashboard:
```javascript
// Add Azure AD authentication to your web app
// Users authenticate to see your app
// Your app authenticates to query Kusto
```

---

## 🔄 DefaultAzureCredential Flow

The code uses `DefaultAzureCredential` which tries authentication methods in order:

1. **Environment Variables** (Service Principal credentials)
2. **Managed Identity** (when deployed to Azure)
3. **Azure CLI** (for local development)

```javascript
const credential = new DefaultAzureCredential({
    excludeEnvironmentCredential: false,  // ✅ Service Principal
    excludeManagedIdentityCredential: false, // ✅ Azure-hosted
    excludeAzureCliCredential: false,     // ✅ Local dev
    // Disable others for security
    excludeAzurePowerShellCredential: true,
    excludeVisualStudioCodeCredential: true,
    excludeInteractiveBrowserCredential: true
});
```

**Why this works:**
- 🏠 **Local:** Finds Azure CLI token
- ☁️ **Azure:** Finds Managed Identity
- 🔧 **CI/CD:** Finds Service Principal from environment

---

## 🚀 Quick Start: Getting Production-Ready

### Step 1: Test Locally (You Have This Working!)
```bash
az login
npm start
# Click "Refresh from Kusto" - should work!
```

### Step 2: Deploy to Azure
```bash
# Deploy to Azure Container Apps or App Service
# See DEPLOYMENT.md for detailed commands
```

### Step 3: Grant App Access to Kusto
```kql
-- Get your app's Managed Identity first
-- Then run in Kusto Web Explorer:
.add database AzurePortal viewers ('aadapp=<MANAGED_IDENTITY_ID>') 'Dashboard App'
```

### Step 4: Verify
```bash
# Test the deployed app URL
curl https://your-app.azurecontainerapps.io/api/health

# Try the "Refresh from Kusto" button in the deployed app
```

---

## 🆘 Troubleshooting

### Local Development Issues

**401 Error Locally?**
```bash
# Re-login to Azure
az login

# Verify access to Kusto cluster
az kusto cluster list

# Check your token
az account get-access-token --resource https://kusto.kusto.windows.net
```

### Production Issues

**401 Error in Production?**
1. Verify Managed Identity is enabled
2. Check that you granted Kusto permissions to the correct principal ID
3. Wait 5-10 minutes for permissions to propagate

**Can't Find Managed Identity?**
```bash
# For App Service
az webapp identity show --name <app> --resource-group <rg>

# For Container Apps
az containerapp identity show --name <app> --resource-group <rg>
```

---

## 📚 Additional Resources

- [Azure Managed Identity Docs](https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/)
- [Kusto Access Control](https://learn.microsoft.com/en-us/azure/data-explorer/kusto/management/access-control/)
- [DefaultAzureCredential Reference](https://learn.microsoft.com/en-us/dotnet/api/azure.identity.defaultazurecredential)
