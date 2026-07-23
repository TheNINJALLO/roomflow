// --- ROOMFLOW SUPABASE INTEGRATION & OFFLINE PERSISTENCE SERVICE ---

let supabaseClient = null;

function initSupabase() {
    if (typeof supabase === 'undefined') {
        console.warn("Supabase library not loaded yet.");
        return null;
    }
    const config = window.RoomFlowConfig || {};
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
        console.error("Supabase config is missing endpoints.");
        return null;
    }
    supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    return supabaseClient;
}

// Global cached permissions
state.userCapabilities = [];
state.userOrganizations = [];
state.currentOrganization = null;
state.sessionUser = null;
state.syncStatus = 'offline'; // 'saving', 'saved', 'uploading', 'synced', 'offline', 'conflict'

// 1. Authentication helpers
window.RoomFlowAuth = {
    async signUp(email, password, fullName) {
        const client = supabaseClient || initSupabase();
        if (!client) throw new Error("Database offline");

        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: { full_name: fullName }
            }
        });
        if (error) throw new Error(translateAuthError(error.message));
        return data;
    },

    async signIn(email, password) {
        const client = supabaseClient || initSupabase();
        if (!client) throw new Error("Database offline");

        const { data, error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw new Error(translateAuthError(error.message));
        
        state.sessionUser = data.user;
        await this.loadSessionContext();
        return data;
    },

    async sendMagicLink(email) {
        const client = supabaseClient || initSupabase();
        if (!client) throw new Error("Database offline");

        const { error } = await client.auth.signInWithOtp({ email });
        if (error) throw new Error(translateAuthError(error.message));
        return true;
    },

    async signOut() {
        const client = supabaseClient || initSupabase();
        if (client) {
            await client.auth.signOut();
        }
        state.sessionUser = null;
        state.userCapabilities = [];
        state.userOrganizations = [];
        state.currentOrganization = null;
        localStorage.removeItem('roomflow_active_org_id');
        window.location.reload();
    },

    async loadSessionContext() {
        const client = supabaseClient || initSupabase();
        if (!client) return;

        const { data: { session } } = await client.auth.getSession();
        if (!session) {
            state.syncStatus = 'offline';
            return;
        }

        state.sessionUser = session.user;
        
        // Fetch organizations list
        const { data: orgs, error: orgsErr } = await client
            .from('organization_members')
            .select('organization_id, organizations(name, address, phone, email, logo_url, colors, default_measurement_units, timezone), custom_roles(name)')
            .eq('user_id', session.user.id);
            
        if (orgs) {
            state.userOrganizations = orgs.map(o => {
                let orgObj = o.organizations;
                if (Array.isArray(orgObj)) orgObj = orgObj[0];
                let roleObj = o.custom_roles;
                if (Array.isArray(roleObj)) roleObj = roleObj[0];
                
                return {
                    id: o.organization_id,
                    name: orgObj ? orgObj.name : 'Organization',
                    role: roleObj ? roleObj.name : 'Member',
                    colors: orgObj ? orgObj.colors : null,
                    units: orgObj ? orgObj.default_measurement_units : 'ft',
                    timezone: orgObj ? orgObj.timezone : 'UTC'
                };
            });

            // Restore active company selection
            let activeOrgId = localStorage.getItem('roomflow_active_org_id');
            if (!activeOrgId && state.userOrganizations.length > 0) {
                activeOrgId = state.userOrganizations[0].id;
            }
            if (activeOrgId) {
                await this.setActiveOrganization(activeOrgId);
            }
        }
        
        // Update header display if elements exist
        const nameEl = document.getElementById('session-user-name');
        if (nameEl) nameEl.innerText = session.user.email;
    },

    async setActiveOrganization(orgId) {
        const client = supabaseClient || initSupabase();
        if (!client) return;

        const org = state.userOrganizations.find(o => o.id === orgId);
        if (!org) return;

        state.currentOrganization = org;
        localStorage.setItem('roomflow_active_org_id', orgId);

        // Fetch User Capabilities RLS policy mirror cache
        const { data: caps } = await client
            .from('organization_members')
            .select('custom_roles(role_capabilities(capability))')
            .eq('organization_id', orgId)
            .eq('user_id', state.sessionUser.id)
            .single();

        state.userCapabilities = [];
        if (caps) {
            let roleObj = caps.custom_roles;
            if (Array.isArray(roleObj)) roleObj = roleObj[0];
            if (roleObj && roleObj.role_capabilities) {
                let capsList = roleObj.role_capabilities;
                if (Array.isArray(capsList)) {
                    state.userCapabilities = capsList.map(rc => rc.capability).filter(Boolean);
                }
            }
        }

        // Apply branding colors dynamically
        if (org.colors) {
            const root = document.documentElement;
            if (org.colors.primary) root.style.setProperty('--accent-blue', org.colors.primary);
            if (org.colors.accent) root.style.setProperty('--accent-teal', org.colors.accent);
        }

        // Re-render costing screens with capability context
        if (typeof window.renderCostUI === 'function') window.renderCostUI();
        if (typeof window.renderGuidedStep === 'function') window.renderGuidedStep();
    },

    async createCompany(name) {
        const client = supabaseClient || initSupabase();
        if (!client || !state.sessionUser) throw new Error("Authentication required");

        const { data: newOrgId, error } = await client.rpc('create_new_company_with_owner', {
            company_name: name,
            owner_id: state.sessionUser.id
        });

        if (error) throw new Error(error.message);
        
        if (newOrgId) {
            localStorage.setItem('roomflow_active_org_id', newOrgId);
        }
        await this.loadSessionContext();
        if (newOrgId) {
            await this.setActiveOrganization(newOrgId);
        }
        if (typeof populateCompanySwitcher === 'function') {
            populateCompanySwitcher();
        }
        return newOrgId;
    }
};

// Check permissions locally
window.hasCapability = function(capabilityName) {
    if (!state.sessionUser) return true; // offline/standalone local user has full permissions
    return state.userCapabilities.includes(capabilityName);
};

// Translate auth exceptions to friendly user-facing alerts
function translateAuthError(msg) {
    if (!msg) return "An unexpected error occurred.";
    if (msg.includes("Failed to fetch") || msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("your-project-id")) {
        return "Cannot connect to Supabase cloud. Please update config.js with your live Supabase project URL & API key, or use RoomFlow offline.";
    }
    if (msg.includes("Invalid login credentials")) {
        return "Incorrect email or password. Please verify and try again.";
    }
    if (msg.includes("JWT expired") || msg.includes("session_expired")) {
        return "Your session expired. Please sign in again. Your saved work remains available locally.";
    }
    if (msg.includes("User already exists")) {
        return "An account with this email address has already been registered.";
    }
    return msg;
}

// 2. Offline Database Sync Service (IndexedDB)
const DB_NAME = 'roomflow_offline_store';
const STORE_NAME = 'sync_queue';

function openIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

window.RoomFlowSync = {
    async enqueueOffline(jobName, payload) {
        try {
            const db = await openIndexedDB();
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            
            await new Promise((resolve, reject) => {
                const req = store.put({
                    id: jobName,
                    payload: payload,
                    timestamp: Date.now(),
                    status: 'pending'
                });
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
            
            state.syncStatus = 'offline';
            this.updateSyncBadge();
        } catch (e) {
            console.error("IndexedDB Cache failed:", e);
        }
    },

    async processSyncQueue() {
        if (!navigator.onLine || !state.sessionUser || !state.currentOrganization) {
            return;
        }

        const client = supabaseClient || initSupabase();
        if (!client) return;

        try {
            const db = await openIndexedDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            
            const queue = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });

            if (queue.length === 0) return;

            state.syncStatus = 'uploading';
            this.updateSyncBadge();

            for (const item of queue) {
                const jobName = item.id;
                const p = item.payload;

                // 1. Fetch or create Customer record
                let customerId = null;
                const { data: custs } = await client
                    .from('customers')
                    .select('id')
                    .eq('organization_id', state.currentOrganization.id)
                    .eq('name', p.customerName || jobName)
                    .limit(1);

                if (custs && custs.length > 0) {
                    customerId = custs[0].id;
                } else {
                    const { data: newCust, error: custErr } = await client
                        .from('customers')
                        .insert({
                            organization_id: state.currentOrganization.id,
                            name: p.customerName || jobName,
                            phone: p.costing?.customerPhone || '',
                            email: p.costing?.customerEmail || '',
                            notes: p.costing?.notes || ''
                        })
                        .select('id')
                        .single();
                    if (custErr) throw custErr;
                    customerId = newCust.id;
                }

                // 2. Fetch or create Job record
                let jobId = null;
                let currentVersion = 1;
                const { data: jobs } = await client
                    .from('jobs')
                    .select('id, current_version_number')
                    .eq('organization_id', state.currentOrganization.id)
                    .eq('name', jobName)
                    .limit(1);

                if (jobs && jobs.length > 0) {
                    jobId = jobs[0].id;
                    currentVersion = jobs[0].current_version_number;
                } else {
                    const { data: newJob, error: jobErr } = await client
                        .from('jobs')
                        .insert({
                            organization_id: state.currentOrganization.id,
                            customer_id: customerId,
                            name: jobName,
                            status: 'Draft',
                            current_version_number: 1
                        })
                        .select('id')
                        .single();
                    if (jobErr) throw jobErr;
                    jobId = newJob.id;
                }

                // 3. Upsert Layout (Footprints geometry)
                const { error: layoutErr } = await client
                    .from('job_layouts')
                    .upsert({
                        job_id: jobId,
                        version_number: currentVersion,
                        layout_json: {
                            rooms: p.rooms,
                            sumpPumps: p.sumpPumps,
                            dehumidifiers: p.dehumidifiers,
                            dischargeLines: p.dischargeLines,
                            floorHatches: p.floorHatches,
                            interiorPipes: p.interiorPipes,
                            stanchions: p.stanchions,
                            mainBeams: p.mainBeams,
                            capturedMeasurements: p.capturedMeasurements
                        }
                    });
                if (layoutErr) throw layoutErr;

                // 4. Upsert protected Costing (only if capability is allowed)
                if (hasCapability('edit_margin') && p.costing) {
                    await client
                        .from('job_pricing')
                        .upsert({
                            job_id: jobId,
                            target_gross_margin: p.costing.settings?.targetGrossMargin || 40.0,
                            sales_tax_rate: p.costing.settings?.salesTaxRate || 6.0,
                            additional_overhead_rate: p.costing.settings?.overhead || 15.0,
                            commission_rate: p.costing.commission || 0.0
                        });
                }

                // Delete from sync queue
                const delTx = db.transaction(STORE_NAME, 'readwrite');
                delTx.objectStore(STORE_NAME).delete(jobName);
            }

            state.syncStatus = 'synced';
            this.updateSyncBadge();
        } catch (e) {
            console.error("Reconciliation failed:", e);
            state.syncStatus = 'offline';
            this.updateSyncBadge();
        }
    },

    async createCloudJobRecord(jobName, customerName, email, phone) {
        if (!supabaseClient || !state.currentOrganization) return null;
        
        try {
            // 1. Create or get customer
            let customerId = null;
            const { data: custs } = await supabaseClient
                .from('customers')
                .select('id')
                .eq('organization_id', state.currentOrganization.id)
                .eq('name', customerName)
                .limit(1);

            if (custs && custs.length > 0) {
                customerId = custs[0].id;
            } else {
                const { data: newCust, error: custErr } = await supabaseClient
                    .from('customers')
                    .insert({
                        organization_id: state.currentOrganization.id,
                        name: customerName,
                        phone: phone || '',
                        email: email || ''
                    })
                    .select('id')
                    .single();
                if (custErr) throw custErr;
                customerId = newCust.id;
            }

            // 2. Create Job
            const { data: newJob, error: jobErr } = await supabaseClient
                .from('jobs')
                .insert({
                    organization_id: state.currentOrganization.id,
                    customer_id: customerId,
                    name: jobName,
                    status: 'Draft',
                    current_version_number: 1
                })
                .select('id')
                .single();
            if (jobErr) throw jobErr;

            return newJob;
        } catch (err) {
            console.error("Failed to create cloud job record:", err);
            return null;
        }
    },

    updateSyncBadge() {
        const badge = document.getElementById('sync-status-badge');
        if (!badge) return;

        const maps = {
            'saving': { text: 'Saving...', color: '#f59e0b' },
            'saved': { text: 'Saved locally', color: '#10b981' },
            'uploading': { text: 'Syncing...', color: '#3b82f6' },
            'synced': { text: 'Synced', color: '#10b981' },
            'offline': { text: 'Offline mode', color: '#64748b' },
            'conflict': { text: 'Conflict review needed', color: '#ef4444' }
        };

        const current = maps[state.syncStatus] || maps.offline;
        badge.innerText = current.text;
        badge.style.background = current.color;
    }
};

// Bind online/offline network alerts
window.addEventListener('online', () => {
    RoomFlowSync.processSyncQueue();
});
window.addEventListener('offline', () => {
    state.syncStatus = 'offline';
    RoomFlowSync.updateSyncBadge();
});

// UI Account Overlay controller logic
let authMode = 'signin'; // 'signin' or 'signup' or 'magic'

function updateAuthUI() {
    const title = document.querySelector('#auth-overlay h2');
    const subtitle = document.getElementById('auth-subtitle');
    const passRow = document.getElementById('auth-password-row');
    const nameRow = document.getElementById('auth-name-row');
    const submitBtn = document.getElementById('btn-auth-submit');
    const toggleBtn = document.getElementById('btn-auth-toggle-mode');
    
    if (authMode === 'signin') {
        if (title) title.innerText = "RoomFlow Sign In";
        if (subtitle) subtitle.innerText = "Sign in to sync your estimating jobs with your team.";
        if (passRow) passRow.style.display = 'flex';
        if (nameRow) nameRow.style.display = 'none';
        if (submitBtn) submitBtn.innerText = "Sign In";
        if (toggleBtn) toggleBtn.innerText = "Don't have an account? Sign Up";
    } else if (authMode === 'signup') {
        if (title) title.innerText = "Create RoomFlow Account";
        if (subtitle) subtitle.innerText = "Create a secure account to join your company organization.";
        if (passRow) passRow.style.display = 'flex';
        if (nameRow) nameRow.style.display = 'flex';
        if (submitBtn) submitBtn.innerText = "Create Account";
        if (toggleBtn) toggleBtn.innerText = "Already have an account? Sign In";
    } else if (authMode === 'magic') {
        if (title) title.innerText = "Passwordless Access";
        if (subtitle) subtitle.innerText = "Enter your email below to receive a secure sign-in magic link.";
        if (passRow) passRow.style.display = 'none';
        if (nameRow) nameRow.style.display = 'none';
        if (submitBtn) submitBtn.innerText = "Send Magic Link";
        if (toggleBtn) toggleBtn.innerText = "Return to Standard Sign In";
    }
}

function showAuthAlert(msg, type = 'error') {
    const alertBox = document.getElementById('auth-alert-box');
    if (!alertBox) return;
    alertBox.style.display = 'block';
    alertBox.innerText = msg;
    if (type === 'success') {
        alertBox.style.background = 'rgba(16, 185, 129, 0.1)';
        alertBox.style.borderColor = 'rgba(16, 185, 129, 0.2)';
        alertBox.style.color = '#a7f3d0';
    } else {
        alertBox.style.background = 'rgba(239, 68, 68, 0.1)';
        alertBox.style.borderColor = 'rgba(239, 68, 68, 0.2)';
        alertBox.style.color = '#fca5a5';
    }
}

function checkAuthOverlay() {
    const overlay = document.getElementById('auth-overlay');
    if (!overlay) return;
    if (supabaseClient && !state.sessionUser) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

window.addEventListener('load', () => {
    initSupabase();
    
    // Bind UI actions
    const toggleBtn = document.getElementById('btn-auth-toggle-mode');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (authMode === 'signin') {
                authMode = 'signup';
            } else {
                authMode = 'signin';
            }
            updateAuthUI();
        });
    }
    
    const magicLinkBtn = document.getElementById('btn-auth-magic-link');
    if (magicLinkBtn) {
        magicLinkBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (authMode === 'magic') {
                authMode = 'signin';
            } else {
                authMode = 'magic';
            }
            updateAuthUI();
        });
    }

    const submitBtn = document.getElementById('btn-auth-submit');
    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-email').value.trim();
            const password = document.getElementById('auth-password').value;
            const name = document.getElementById('auth-name').value.trim();
            
            if (!email) {
                showAuthAlert("Please enter a valid email address.");
                return;
            }

            try {
                if (authMode === 'signin') {
                    await RoomFlowAuth.signIn(email, password);
                    checkAuthOverlay();
                    populateCompanySwitcher();
                } else if (authMode === 'signup') {
                    if (!password || password.length < 6) {
                        showAuthAlert("Password must be at least 6 characters long.");
                        return;
                    }
                    await RoomFlowAuth.signUp(email, password, name);
                    showAuthAlert("Registration successful! Check your email to confirm activation.", 'success');
                } else if (authMode === 'magic') {
                    await RoomFlowAuth.sendMagicLink(email);
                    showAuthAlert("Magic link sent! Check your email inbox.", 'success');
                }
            } catch (err) {
                showAuthAlert(translateAuthError(err.message));
            }
        });
    }

    // Switcher Dropdown Change handler
    const switcher = document.getElementById('header-company-switcher');
    if (switcher) {
        switcher.addEventListener('change', async (e) => {
            if (e.target.value) {
                await RoomFlowAuth.setActiveOrganization(e.target.value);
            }
        });
    }

    const switcherMore = document.getElementById('more-company-switcher');
    if (switcherMore) {
        switcherMore.addEventListener('change', async (e) => {
            if (e.target.value) {
                await RoomFlowAuth.setActiveOrganization(e.target.value);
            }
        });
    }

    const createCompanyBtn = document.getElementById('btn-more-create-company');
    if (createCompanyBtn) {
        createCompanyBtn.addEventListener('click', async () => {
            const input = document.getElementById('more-new-company-name');
            if (input) {
                const name = input.value.trim();
                if (!name) {
                    alert("Please enter a valid company name.");
                    return;
                }
                try {
                    await RoomFlowAuth.createCompany(name);
                    input.value = '';
                    populateCompanySwitcher();
                    alert(`Company "${name}" created successfully! You are now the Company Owner.`);
                } catch (e) {
                    alert("Failed to create company: " + e.message);
                }
            }
        });
    }

    setTimeout(async () => {
        await RoomFlowAuth.loadSessionContext();
        checkAuthOverlay();
        populateCompanySwitcher();
        RoomFlowSync.processSyncQueue();
    }, 500);
});

function populateCompanySwitcher() {
    const switcher = document.getElementById('header-company-switcher');
    const switcherMore = document.getElementById('more-company-switcher');

    if (switcher) {
        if (!state.sessionUser || state.userOrganizations.length === 0) {
            switcher.innerHTML = `<option value="">No Companies</option>`;
        } else {
            let html = '';
            state.userOrganizations.forEach(o => {
                const selected = (state.currentOrganization && state.currentOrganization.id === o.id) ? 'selected' : '';
                html += `<option value="${o.id}" ${selected}>${o.name} (${o.role})</option>`;
            });
            switcher.innerHTML = html;
        }
    }

    if (switcherMore) {
        if (!state.sessionUser || state.userOrganizations.length === 0) {
            switcherMore.innerHTML = `<option value="">No Companies</option>`;
        } else {
            let html = '';
            state.userOrganizations.forEach(o => {
                const selected = (state.currentOrganization && state.currentOrganization.id === o.id) ? 'selected' : '';
                html += `<option value="${o.id}" ${selected}>${o.name} (${o.role})</option>`;
            });
            switcherMore.innerHTML = html;
        }
    }
}

