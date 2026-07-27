// RoomFlow Phase 1 Integration Layer
// Adds atomic company creation, inbound email leads, shared tracking,
// cloud estimate catalog, inline estimates, layout attachments, and outreach scheduling.
(function () {
    'use strict';

    const Integration = {
        version: '1.0.0',
        client: null,
        leadChannel: null,
        jobIdMapKey: 'roomflow_cloud_job_ids_v1',
        estimateDraftKey: 'roomflow_estimate_drafts_v1',
        catalogCache: [],
        currentLines: [],
        currentEstimateId: null,
        currentEstimateJobName: null,
        initialized: false,

        getClient() {
            if (this.client) return this.client;
            if (typeof initSupabase === 'function') this.client = initSupabase();
            return this.client;
        },

        escape(value) {
            return String(value ?? '')
                .replaceAll('&', '&amp;')
                .replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;')
                .replaceAll('"', '&quot;')
                .replaceAll("'", '&#039;');
        },

        money(value) {
            return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
                .format(Number(value) || 0);
        },

        slug(value) {
            return String(value || '')
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '')
                .slice(0, 64) || `item-${Date.now()}`;
        },

        randomToken(bytes = 24) {
            const values = new Uint8Array(bytes);
            crypto.getRandomValues(values);
            return Array.from(values, b => b.toString(16).padStart(2, '0')).join('');
        },

        async sha256(value) {
            const data = new TextEncoder().encode(value);
            const digest = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        },

        currentOrgId() {
            return state?.currentOrganization?.id || null;
        },

        currentJobId() {
            if (state?.jobId) return state.jobId;
            const map = JSON.parse(localStorage.getItem(this.jobIdMapKey) || '{}');
            return state?.currentJobName ? map[state.currentJobName] || null : null;
        },

        setJobMapping(jobName, jobId) {
            if (!jobName || !jobId) return;
            const map = JSON.parse(localStorage.getItem(this.jobIdMapKey) || '{}');
            map[jobName] = jobId;
            localStorage.setItem(this.jobIdMapKey, JSON.stringify(map));
            state.jobId = jobId;
        },

        toast(message, type = 'info') {
            const existing = document.getElementById('roomflow-integration-toast');
            if (existing) existing.remove();
            const el = document.createElement('div');
            el.id = 'roomflow-integration-toast';
            el.textContent = message;
            const colors = { info: '#2563eb', success: '#059669', error: '#dc2626', warning: '#d97706' };
            Object.assign(el.style, {
                position: 'fixed', right: '20px', bottom: '20px', zIndex: '20000',
                maxWidth: '420px', padding: '0.85rem 1rem', borderRadius: '10px',
                background: colors[type] || colors.info, color: '#fff', fontWeight: '700',
                boxShadow: '0 18px 40px rgba(0,0,0,.35)'
            });
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 5000);
        },

        async init() {
            if (this.initialized) return;
            this.initialized = true;
            this.patchCompanyCreation();
            this.patchJobPersistence();
            this.patchRenderers();
            this.injectSettingsCards();
            this.injectLeadPanel();
            await this.waitForSession();
            await Promise.allSettled([this.refreshInboundLeads(), this.loadCatalog()]);
            this.subscribeRealtime();
        },

        async waitForSession() {
            for (let i = 0; i < 30; i++) {
                if (state?.sessionUser && state?.currentOrganization) return true;
                await new Promise(resolve => setTimeout(resolve, 250));
            }
            return false;
        },

        patchCompanyCreation() {
            const install = () => {
                if (!window.RoomFlowAuth || window.RoomFlowAuth.__phase1CompanyPatch) return false;
                const original = window.RoomFlowAuth.createCompany?.bind(window.RoomFlowAuth);
                window.RoomFlowAuth.createCompany = async (name) => {
                    const client = Integration.getClient();
                    if (!client || !state.sessionUser) throw new Error('Authentication required');
                    const companyName = String(name || '').trim();
                    if (companyName.length < 2) throw new Error('Company name must contain at least 2 characters');

                    let result = await client.rpc('create_new_company_with_owner', { company_name: companyName });
                    if (result.error && /function.*does not exist|schema cache/i.test(result.error.message || '')) {
                        result = await client.rpc('create_new_company_with_owner', {
                            company_name: companyName,
                            owner_id: state.sessionUser.id
                        });
                    }
                    if (result.error) {
                        if (original && /does not exist/i.test(result.error.message || '')) return original(companyName);
                        throw new Error(result.error.message);
                    }

                    const newOrgId = result.data;
                    localStorage.setItem('roomflow_active_org_id', newOrgId);
                    await window.RoomFlowAuth.loadSessionContext();
                    await window.RoomFlowAuth.setActiveOrganization(newOrgId);
                    const visible = state.userOrganizations.some(org => org.id === newOrgId);
                    if (!visible) throw new Error('Company was created, but owner membership was not established. Apply the Phase 1 Supabase migration.');
                    if (typeof populateCompanySwitcher === 'function') populateCompanySwitcher();
                    Integration.injectSettingsCards();
                    await Integration.refreshInboundLeads();
                    return newOrgId;
                };
                window.RoomFlowAuth.__phase1CompanyPatch = true;
                return true;
            };
            if (!install()) setTimeout(install, 500);
        },

        patchJobPersistence() {
            const install = () => {
                if (window.__roomflowPhase1PersistencePatched) return true;
                if (typeof window.loadJobData !== 'function' || typeof window.autosaveJob !== 'function') return false;

                const originalLoad = window.loadJobData;
                window.loadJobData = function (data) {
                    const result = originalLoad(data);
                    if (data?.jobId) Integration.setJobMapping(state.currentJobName || data.currentJobName || data.name, data.jobId);
                    else if (state.currentJobName) state.jobId = Integration.currentJobId();
                    return result;
                };

                const originalAutosave = window.autosaveJob;
                window.autosaveJob = function () {
                    const result = originalAutosave();
                    if (state.currentJobName) {
                        const jobs = JSON.parse(localStorage.getItem('roomflow_jobs') || '{}');
                        if (jobs[state.currentJobName]) {
                            jobs[state.currentJobName].jobId = Integration.currentJobId();
                            jobs[state.currentJobName].organizationId = Integration.currentOrgId();
                            localStorage.setItem('roomflow_jobs', JSON.stringify(jobs));
                        }
                    }
                    return result;
                };
                window.__roomflowPhase1PersistencePatched = true;
                return true;
            };
            if (!install()) setTimeout(install, 800);
        },

        patchRenderers() {
            const install = () => {
                if (window.__roomflowPhase1RenderPatched) return true;
                let installed = false;
                if (typeof window.renderGuidedStep === 'function') {
                    const original = window.renderGuidedStep;
                    window.renderGuidedStep = function (...args) {
                        const result = original.apply(this, args);
                        setTimeout(() => Integration.renderEstimateBuilder(), 0);
                        return result;
                    };
                    installed = true;
                }
                if (typeof window.renderCostUI === 'function') {
                    const originalCost = window.renderCostUI;
                    window.renderCostUI = function (...args) {
                        const result = originalCost.apply(this, args);
                        setTimeout(() => Integration.renderEstimateBuilder(true), 0);
                        return result;
                    };
                    installed = true;
                }
                if (installed) window.__roomflowPhase1RenderPatched = true;
                return installed;
            };
            if (!install()) setTimeout(install, 900);
        },

        injectLeadPanel() {
            const host = document.getElementById('jobs-viewport');
            if (!host || document.getElementById('roomflow-inbound-leads-card')) return;
            const card = document.createElement('section');
            card.id = 'roomflow-inbound-leads-card';
            card.className = 'checklist-room-card';
            card.style.padding = '1.25rem';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:.8rem;">
                    <div><h3 style="margin:0;color:#fff;">Email Leads</h3><p style="margin:.25rem 0 0;color:#94a3b8;font-size:.8rem;">New callers imported by Zapier appear here automatically.</p></div>
                    <button id="roomflow-refresh-leads" class="btn-secondary">Refresh</button>
                </div>
                <div id="roomflow-inbound-leads-list" style="display:grid;gap:.65rem;"><div style="color:#64748b;">Sign in and select a company to load leads.</div></div>`;
            const listSection = host.querySelector('.jobs-list-section');
            host.insertBefore(card, listSection || host.lastChild);
            document.getElementById('roomflow-refresh-leads')?.addEventListener('click', () => this.refreshInboundLeads());
        },

        async refreshInboundLeads() {
            this.injectLeadPanel();
            const list = document.getElementById('roomflow-inbound-leads-list');
            const client = this.getClient();
            const orgId = this.currentOrgId();
            if (!list || !client || !orgId) return;
            list.innerHTML = '<div style="color:#94a3b8;">Loading email leads…</div>';

            const { data, error } = await client
                .from('jobs')
                .select('id,name,status,property_address,city,state,postal_code,issue_description,appointment_start,lead_source,tracking_color,estimate_status,updated_at,customers(id,name,first_name,last_name,email,phone,address,city,state,postal_code)')
                .eq('organization_id', orgId)
                .in('status', ['New Lead', 'Contacted', 'Inspection Scheduled', 'Layout In Progress', 'Estimate Draft'])
                .order('updated_at', { ascending: false })
                .limit(50);

            if (error) {
                list.innerHTML = `<div style="color:#fca5a5;">${this.escape(error.message)}</div>`;
                return;
            }
            if (!data?.length) {
                list.innerHTML = '<div style="color:#64748b;">No imported leads yet.</div>';
                return;
            }

            list.innerHTML = data.map(job => {
                const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
                const address = job.property_address || customer?.address || 'No address supplied';
                const contact = [customer?.phone, customer?.email].filter(Boolean).join(' · ');
                return `<article style="display:grid;grid-template-columns:minmax(180px,1.4fr) minmax(160px,1fr) auto;gap:1rem;align-items:center;padding:.8rem;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(15,23,42,.35);">
                    <div><strong style="color:#fff;">${this.escape(customer?.name || job.name)}</strong><div style="font-size:.75rem;color:#94a3b8;">${this.escape(address)}</div><div style="font-size:.72rem;color:#64748b;">${this.escape(contact)}</div></div>
                    <div><span style="display:inline-block;padding:.2rem .45rem;border-radius:999px;background:rgba(245,158,11,.15);color:#fbbf24;font-size:.72rem;font-weight:700;">${this.escape(job.status)}</span><div style="font-size:.75rem;color:#cbd5e1;margin-top:.3rem;">${this.escape(job.issue_description || 'No issue description')}</div></div>
                    <button class="btn-primary roomflow-open-lead" data-job-id="${this.escape(job.id)}">Open in RoomFlow</button>
                </article>`;
            }).join('');

            list.querySelectorAll('.roomflow-open-lead').forEach(button => {
                button.addEventListener('click', () => this.openInboundLead(button.dataset.jobId));
            });
        },

        async openInboundLead(jobId) {
            const client = this.getClient();
            if (!client || !jobId) return;
            const { data: job, error } = await client
                .from('jobs')
                .select('*,customers(*)')
                .eq('id', jobId)
                .single();
            if (error) return this.toast(error.message, 'error');
            const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers;
            let jobName = job.name || `${customer?.name || 'Customer'} Estimate`;
            const stored = JSON.parse(localStorage.getItem('roomflow_jobs') || '{}');
            if (stored[jobName] && stored[jobName].jobId !== jobId) jobName += ` ${jobId.slice(0, 6)}`;

            const initial = typeof getInitialProjectState === 'function'
                ? getInitialProjectState(
                    jobName,
                    customer?.name || jobName,
                    job.property_address || customer?.address || '',
                    customer?.phone || '',
                    customer?.email || '',
                    '',
                    job.appointment_start ? job.appointment_start.slice(0, 10) : '',
                    'basement',
                    job.issue_description || customer?.notes || '',
                    job.organization_id,
                    job.id
                )
                : { rooms: [], costing: {} };
            initial.jobId = job.id;
            initial.currentJobName = jobName;
            state.currentJobName = jobName;
            this.setJobMapping(jobName, job.id);
            window.loadJobData(initial);
            window.autosaveJob();
            await client.from('jobs').update({ status: 'Layout In Progress', tracking_color: 'blue' }).eq('id', job.id);
            await client.from('job_status_events').insert({
                organization_id: job.organization_id,
                job_id: job.id,
                event_type: 'roomflow.opened',
                old_status: job.status,
                new_status: 'Layout In Progress',
                note: 'Lead opened in RoomFlow layout workflow',
                actor_user_id: state.sessionUser?.id || null
            });
            if (typeof switchTab === 'function') switchTab('project');
            this.toast('Lead loaded into RoomFlow.', 'success');
            this.refreshInboundLeads();
        },

        injectSettingsCards() {
            const host = document.getElementById('more-viewport');
            if (!host) return;
            if (!document.getElementById('roomflow-email-integration-card')) {
                const card = document.createElement('section');
                card.id = 'roomflow-email-integration-card';
                card.className = 'checklist-room-card';
                card.style.padding = '1.25rem';
                card.innerHTML = `
                    <h3 style="color:#fff;margin:0 0 .35rem;">Email Intake / Zapier</h3>
                    <p style="color:#94a3b8;font-size:.8rem;">Create a secure endpoint for Zapier. The secret is displayed once and only its SHA-256 hash is stored.</p>
                    <div style="display:flex;gap:.5rem;flex-wrap:wrap;"><input id="roomflow-endpoint-name" value="Caller Email Intake" style="flex:1;min-width:220px;background:#1f2937;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.55rem;color:#fff;"><button id="roomflow-create-endpoint" class="btn-primary">Create Endpoint</button></div>
                    <pre id="roomflow-endpoint-output" style="display:none;white-space:pre-wrap;margin-top:.8rem;padding:.8rem;border-radius:8px;background:#020617;color:#cbd5e1;font-size:.72rem;overflow:auto;"></pre>`;
                host.appendChild(card);
                card.querySelector('#roomflow-create-endpoint')?.addEventListener('click', () => this.createIntegrationEndpoint());
            }
            if (!document.getElementById('roomflow-catalog-import-card')) {
                const card = document.createElement('section');
                card.id = 'roomflow-catalog-import-card';
                card.className = 'checklist-room-card';
                card.style.padding = '1.25rem';
                card.innerHTML = `
                    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;"><div><h3 style="color:#fff;margin:0;">Estimate Product Catalog</h3><p style="color:#94a3b8;font-size:.8rem;margin:.25rem 0;">Import the copied product list, then edit prices, units, tax settings, and descriptions.</p></div><button id="roomflow-import-seed" class="btn-primary">Import 229 Products</button></div>
                    <div style="display:flex;gap:.5rem;margin:.7rem 0;"><input id="roomflow-catalog-search" placeholder="Search products…" style="flex:1;background:#1f2937;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.55rem;color:#fff;"><button id="roomflow-refresh-catalog" class="btn-secondary">Refresh</button></div>
                    <div id="roomflow-catalog-summary" style="font-size:.75rem;color:#94a3b8;margin-bottom:.5rem;"></div>
                    <div id="roomflow-catalog-list" style="max-height:420px;overflow:auto;display:grid;gap:.45rem;"></div>`;
                host.appendChild(card);
                card.querySelector('#roomflow-import-seed')?.addEventListener('click', () => this.importSeedCatalog());
                card.querySelector('#roomflow-refresh-catalog')?.addEventListener('click', () => this.loadCatalog(true));
                card.querySelector('#roomflow-catalog-search')?.addEventListener('input', () => this.renderCatalogManager());
            }
        },

        async createIntegrationEndpoint() {
            const client = this.getClient();
            const orgId = this.currentOrgId();
            if (!client || !orgId) return this.toast('Sign in and select a company first.', 'warning');
            const secret = this.randomToken(24);
            const endpointKey = `${this.slug(state.currentOrganization.name)}-${this.randomToken(6)}`;
            const secretHash = await this.sha256(secret);
            const name = document.getElementById('roomflow-endpoint-name')?.value?.trim() || 'Caller Email Intake';
            const { error } = await client.from('integration_endpoints').insert({
                organization_id: orgId,
                endpoint_key: endpointKey,
                secret_hash: secretHash,
                source_type: 'zapier_email',
                name,
                created_by: state.sessionUser?.id || null
            });
            if (error) return this.toast(error.message, 'error');
            const base = window.RoomFlowConfig?.supabaseUrl;
            const output = document.getElementById('roomflow-endpoint-output');
            if (output) {
                output.style.display = 'block';
                output.textContent = `POST URL\n${base}/functions/v1/intake-lead?endpoint=${endpointKey}\n\nHEADER\nx-roomflow-webhook-secret: ${secret}\nContent-Type: application/json\n\nZapier JSON fields\ncustomer_name, email, phone, address, city, state, postal_code, issue_description, appointment_start, source_message_id, source_sender, source_subject\n\nSave this secret now. RoomFlow cannot display it again.`;
            }
            this.toast('Secure Zapier endpoint created.', 'success');
        },

        async importSeedCatalog() {
            const client = this.getClient();
            const orgId = this.currentOrgId();
            if (!client || !orgId) return this.toast('Sign in and select a company first.', 'warning');
            let source;
            try {
                const result = await fetch('catalog/floodman-products.json?v=1', { cache: 'no-store' });
                if (!result.ok) throw new Error(`Catalog file returned ${result.status}`);
                source = await result.json();
            } catch (error) {
                return this.toast(`Could not load catalog seed: ${error.message}`, 'error');
            }
            const rows = source.map(item => ({
                organization_id: orgId,
                external_key: item.external_key,
                name: item.name,
                description: item.description || null,
                category: item.category || 'general-services',
                pricing_method: item.pricing_method || 'fixed',
                unit: item.unit || 'each',
                unit_price: Number(item.unit_price) || 0,
                internal_cost: item.internal_cost,
                taxable: Boolean(item.taxable),
                active: item.active !== false,
                source: item.source || 'catalog-import',
                review_required: Boolean(item.review_required),
                review_notes: item.review_notes || null,
                created_by: state.sessionUser?.id || null
            }));
            for (let i = 0; i < rows.length; i += 75) {
                const { error } = await client.from('estimate_catalog_items').upsert(rows.slice(i, i + 75), { onConflict: 'organization_id,external_key' });
                if (error) return this.toast(`Catalog import failed: ${error.message}`, 'error');
            }
            this.toast(`${rows.length} products imported. Review zero-price and duplicate entries.`, 'success');
            await this.loadCatalog(true);
        },

        async loadCatalog(force = false) {
            const client = this.getClient();
            const orgId = this.currentOrgId();
            if (!client || !orgId) return [];
            if (this.catalogCache.length && !force) return this.catalogCache;
            const { data, error } = await client
                .from('estimate_catalog_items')
                .select('*')
                .eq('organization_id', orgId)
                .order('category')
                .order('name');
            if (error) {
                this.toast(error.message, 'error');
                return [];
            }
            this.catalogCache = data || [];
            this.renderCatalogManager();
            this.renderEstimateBuilder();
            return this.catalogCache;
        },

        renderCatalogManager() {
            const list = document.getElementById('roomflow-catalog-list');
            const summary = document.getElementById('roomflow-catalog-summary');
            if (!list) return;
            const query = (document.getElementById('roomflow-catalog-search')?.value || '').toLowerCase();
            const items = this.catalogCache.filter(item => !query || `${item.name} ${item.category} ${item.description || ''}`.toLowerCase().includes(query));
            if (summary) summary.textContent = `${this.catalogCache.length} products · ${this.catalogCache.filter(i => i.review_required).length} require review · ${this.catalogCache.filter(i => Number(i.unit_price) === 0).length} have a $0.00 price`;
            list.innerHTML = items.slice(0, 250).map(item => `<div style="display:grid;grid-template-columns:minmax(180px,1fr) 120px 105px 85px;gap:.5rem;align-items:center;padding:.55rem;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(15,23,42,.3);">
                <div><strong style="color:#fff;font-size:.8rem;">${this.escape(item.name)}</strong><div style="font-size:.68rem;color:${item.review_required ? '#fbbf24' : '#64748b'};">${this.escape(item.category)}${item.review_required ? ' · Review required' : ''}</div></div>
                <select data-catalog-field="pricing_method" data-id="${item.id}" style="background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:.4rem;font-size:.72rem;">
                    ${['fixed','per_square_foot','per_linear_foot','per_hour','per_day','manual','discount','deposit'].map(value => `<option ${item.pricing_method === value ? 'selected' : ''}>${value}</option>`).join('')}
                </select>
                <input data-catalog-field="unit_price" data-id="${item.id}" type="number" step="0.01" value="${Number(item.unit_price || 0).toFixed(2)}" style="background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:.4rem;">
                <button class="btn-secondary roomflow-save-catalog-item" data-id="${item.id}" style="font-size:.7rem;">Save</button>
            </div>`).join('') || '<div style="color:#64748b;">No catalog items found.</div>';
            list.querySelectorAll('.roomflow-save-catalog-item').forEach(button => button.addEventListener('click', () => this.saveCatalogItem(button.dataset.id)));
        },

        async saveCatalogItem(id) {
            const row = document.querySelector(`[data-catalog-field="unit_price"][data-id="${id}"]`);
            const method = document.querySelector(`[data-catalog-field="pricing_method"][data-id="${id}"]`);
            const client = this.getClient();
            const { error } = await client.from('estimate_catalog_items').update({
                unit_price: Number(row?.value) || 0,
                pricing_method: method?.value || 'fixed',
                review_required: false,
                review_notes: null
            }).eq('id', id);
            if (error) return this.toast(error.message, 'error');
            this.toast('Catalog price updated.', 'success');
            await this.loadCatalog(true);
        },

        estimateStorage() {
            const all = JSON.parse(localStorage.getItem(this.estimateDraftKey) || '{}');
            return { all, current: all[state.currentJobName] || { lines: [], estimateId: null } };
        },

        saveEstimateStorage() {
            if (!state.currentJobName) return;
            const { all } = this.estimateStorage();
            all[state.currentJobName] = { lines: this.currentLines, estimateId: this.currentEstimateId };
            localStorage.setItem(this.estimateDraftKey, JSON.stringify(all));
        },

        renderEstimateBuilder(forceCost = false) {
            if (!state?.currentJobName) return;
            const target = forceCost
                ? document.getElementById('cost-container')
                : document.getElementById('guided-step-content-container');
            if (!target) return;
            if (!forceCost && Number(state.currentStep || 0) < 6) return;
            let panel = target.querySelector('#roomflow-inline-estimate-builder');
            if (!panel) {
                panel = document.createElement('section');
                panel.id = 'roomflow-inline-estimate-builder';
                panel.className = 'checklist-room-card';
                panel.style.cssText = 'padding:1.25rem;margin-top:1rem;';
                target.appendChild(panel);
            }
            const saved = this.estimateStorage().current;
            if (this.currentEstimateJobName !== state.currentJobName) {
                this.currentEstimateJobName = state.currentJobName;
                this.currentLines = Array.isArray(saved.lines) ? JSON.parse(JSON.stringify(saved.lines)) : [];
                this.currentEstimateId = saved.estimateId || null;
            }
            const catalogOptions = this.catalogCache.filter(item => item.active).slice(0, 500).map(item => `<option value="${item.id}">${this.escape(item.name)} · ${this.money(item.unit_price)}</option>`).join('');
            const total = this.currentLines.filter(line => line.selected !== false).reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0);
            panel.innerHTML = `
                <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;"><div><h3 style="color:#fff;margin:0;">Inline Customer Estimate</h3><p style="color:#94a3b8;font-size:.78rem;margin:.25rem 0;">Build the draft here. Prices remain editable per estimate without changing the catalog.</p></div><strong style="font-size:1.25rem;color:#34d399;">${this.money(total)}</strong></div>
                <div style="display:flex;gap:.5rem;margin:.8rem 0;flex-wrap:wrap;"><select id="roomflow-add-catalog-select" style="flex:1;min-width:260px;background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.55rem;"><option value="">Select a product or service…</option>${catalogOptions}</select><button id="roomflow-add-estimate-line" class="btn-secondary">Add Item</button><button id="roomflow-save-estimate" class="btn-primary">Save Draft</button><button id="roomflow-mark-estimate-sent" class="btn-primary" style="background:#059669;">Mark Sent + Follow-ups</button></div>
                <div style="overflow:auto;"><table style="width:100%;border-collapse:collapse;font-size:.78rem;"><thead><tr style="color:#94a3b8;text-align:left;"><th>Item</th><th style="width:90px;">Qty</th><th style="width:120px;">Price</th><th style="width:110px;">Total</th><th style="width:65px;"></th></tr></thead><tbody>${this.currentLines.map((line, index) => `<tr style="border-top:1px solid rgba(255,255,255,.07);"><td style="padding:.55rem 0;color:#fff;"><strong>${this.escape(line.name)}</strong><div style="font-size:.68rem;color:#64748b;">${this.escape(line.unit || 'each')}</div></td><td><input class="roomflow-line-qty" data-index="${index}" type="number" step="0.01" value="${Number(line.quantity || 1)}" style="width:78px;background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:.35rem;"></td><td><input class="roomflow-line-price" data-index="${index}" type="number" step="0.01" value="${Number(line.unit_price || 0).toFixed(2)}" style="width:105px;background:#1f2937;color:#fff;border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:.35rem;"></td><td style="color:#cbd5e1;">${this.money((Number(line.quantity)||0)*(Number(line.unit_price)||0))}</td><td><button class="roomflow-remove-line btn-secondary" data-index="${index}">×</button></td></tr>`).join('') || '<tr><td colspan="5" style="padding:1rem;color:#64748b;text-align:center;">No estimate items added yet.</td></tr>'}</tbody></table></div>`;
            panel.querySelector('#roomflow-add-estimate-line')?.addEventListener('click', () => this.addEstimateLine());
            panel.querySelector('#roomflow-save-estimate')?.addEventListener('click', () => this.saveDraftEstimate());
            panel.querySelector('#roomflow-mark-estimate-sent')?.addEventListener('click', () => this.markEstimateSent());
            panel.querySelectorAll('.roomflow-line-qty,.roomflow-line-price').forEach(input => input.addEventListener('change', () => {
                const index = Number(input.dataset.index);
                if (input.classList.contains('roomflow-line-qty')) this.currentLines[index].quantity = Number(input.value) || 0;
                else this.currentLines[index].unit_price = Number(input.value) || 0;
                this.saveEstimateStorage();
                this.renderEstimateBuilder(forceCost);
            }));
            panel.querySelectorAll('.roomflow-remove-line').forEach(button => button.addEventListener('click', () => {
                this.currentLines.splice(Number(button.dataset.index), 1);
                this.saveEstimateStorage();
                this.renderEstimateBuilder(forceCost);
            }));
        },

        addEstimateLine() {
            const select = document.getElementById('roomflow-add-catalog-select');
            const item = this.catalogCache.find(row => row.id === select?.value);
            if (!item) return;
            this.currentLines.push({
                catalog_item_id: item.id,
                name: item.name,
                description: item.description || '',
                pricing_method: item.pricing_method,
                quantity: 1,
                unit: item.unit,
                unit_price: Number(item.unit_price) || 0,
                taxable: Boolean(item.taxable),
                optional: false,
                selected: true
            });
            this.saveEstimateStorage();
            this.renderEstimateBuilder();
        },

        async ensureCloudJob() {
            const jobId = this.currentJobId();
            if (jobId) return jobId;
            if (window.RoomFlowSync?.createCloudJobRecord) {
                const created = await window.RoomFlowSync.createCloudJobRecord(
                    state.currentJobName,
                    state.costing?.customerName || state.currentJobName,
                    state.costing?.customerEmail || '',
                    state.costing?.customerPhone || ''
                );
                if (created?.id) {
                    this.setJobMapping(state.currentJobName, created.id);
                    window.autosaveJob();
                    return created.id;
                }
            }
            throw new Error('Could not create or resolve the cloud job record.');
        },

        async saveDraftEstimate() {
            if (!this.currentLines.length) return this.toast('Add at least one estimate item.', 'warning');
            const client = this.getClient();
            const orgId = this.currentOrgId();
            try {
                const jobId = await this.ensureCloudJob();
                if (!this.currentEstimateId) {
                    const existing = await client
                        .from('estimates')
                        .select('id')
                        .eq('job_id', jobId)
                        .eq('status', 'draft')
                        .order('version_number', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (existing.error) throw existing.error;
                    if (existing.data?.id) this.currentEstimateId = existing.data.id;
                }
                const subtotal = this.currentLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
                const taxableSubtotal = this.currentLines.filter(line => line.taxable).reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unit_price || 0), 0);
                const taxRate = Number(state.costing?.settings?.salesTaxRate ?? state.costing?.settings?.taxRate ?? 0);
                const taxTotal = taxableSubtotal * taxRate / 100;
                const estimatePayload = {
                    organization_id: orgId,
                    job_id: jobId,
                    estimate_number: `RF-${new Date().getFullYear()}-${jobId.replaceAll('-', '').slice(0, 8).toUpperCase()}`,
                    status: 'draft', subtotal, taxable_subtotal: taxableSubtotal,
                    tax_rate: taxRate, tax_total: taxTotal, total: subtotal + taxTotal,
                    terms: state.currentOrganization?.default_proposal_terms || null,
                    created_by: state.sessionUser?.id || null
                };
                let estimate;
                if (this.currentEstimateId) {
                    const result = await client.from('estimates').update(estimatePayload).eq('id', this.currentEstimateId).select('*').single();
                    if (result.error) throw result.error;
                    estimate = result.data;
                    await client.from('estimate_lines').delete().eq('estimate_id', estimate.id);
                } else {
                    const result = await client.from('estimates').insert(estimatePayload).select('*').single();
                    if (result.error) throw result.error;
                    estimate = result.data;
                    this.currentEstimateId = estimate.id;
                }
                const rows = this.currentLines.map((line, index) => ({ ...line, estimate_id: estimate.id, sort_order: index }));
                const linesResult = await client.from('estimate_lines').insert(rows);
                if (linesResult.error) throw linesResult.error;
                await client.from('jobs').update({ status: 'Estimate Draft', estimate_status: 'draft', tracking_color: 'purple' }).eq('id', jobId);
                await this.uploadLayoutAttachments(estimate.id, jobId);
                this.saveEstimateStorage();
                this.toast(`Draft ${estimate.estimate_number} saved.`, 'success');
                this.refreshInboundLeads();
                return estimate;
            } catch (error) {
                this.toast(error.message || String(error), 'error');
                return null;
            }
        },

        canvasBlob(canvas) {
            return new Promise(resolve => canvas?.toBlob(resolve, 'image/png', 0.92));
        },

        async uploadLayoutAttachments(estimateId, jobId) {
            const client = this.getClient();
            const orgId = this.currentOrgId();
            const canvases = [
                { type: 'layout_2d', canvas: document.getElementById('sketch-canvas'), name: 'layout-2d.png' },
                { type: 'layout_3d', canvas: document.querySelector('#three-container canvas'), name: 'layout-3d.png' }
            ];
            for (const item of canvases) {
                if (!item.canvas) continue;
                const blob = await this.canvasBlob(item.canvas);
                if (!blob) continue;
                const path = `${orgId}/${jobId}/${estimateId}/${item.name}`;
                const upload = await client.storage.from('estimate-attachments').upload(path, blob, { contentType: 'image/png', upsert: true });
                if (upload.error) {
                    console.warn('Layout attachment upload failed', upload.error);
                    continue;
                }
                await client.from('estimate_attachments').upsert({
                    estimate_id: estimateId,
                    attachment_type: item.type,
                    storage_bucket: 'estimate-attachments',
                    storage_path: path,
                    display_name: item.name,
                    mime_type: 'image/png'
                }, { onConflict: 'estimate_id,attachment_type' });
            }
        },

        async markEstimateSent() {
            const estimate = await this.saveDraftEstimate();
            if (!estimate) return;
            const client = this.getClient();
            const jobId = await this.ensureCloudJob();
            const { data: job } = await client.from('jobs').select('*,customers(*)').eq('id', jobId).single();
            const customer = Array.isArray(job?.customers) ? job.customers[0] : job?.customers;
            if (!customer?.email) return this.toast('Customer email is required before follow-ups can be scheduled.', 'warning');
            const sentAt = new Date();
            await client.from('estimates').update({ status: 'sent', sent_at: sentAt.toISOString() }).eq('id', estimate.id);
            await client.from('jobs').update({ status: 'Estimate Sent', estimate_status: 'sent', followup_status: 'active', tracking_color: 'green' }).eq('id', jobId);
            const { data: sequences } = await client.from('outreach_sequences').select('*').eq('organization_id', this.currentOrgId()).eq('active', true).limit(1);
            const sequence = sequences?.[0];
            if (sequence?.steps?.length) {
                const messages = sequence.steps.map(step => ({
                    organization_id: this.currentOrgId(), job_id: jobId, estimate_id: estimate.id,
                    sequence_id: sequence.id, sequence_step: step.step, channel: 'email', recipient: customer.email,
                    subject: String(step.subject || 'Estimate follow-up').replaceAll('{{first_name}}', customer.first_name || customer.name?.split(' ')[0] || '').replaceAll('{{estimate_number}}', estimate.estimate_number),
                    body: String(step.body || '').replaceAll('{{first_name}}', customer.first_name || customer.name?.split(' ')[0] || '').replaceAll('{{estimate_number}}', estimate.estimate_number),
                    status: 'scheduled',
                    scheduled_at: new Date(sentAt.getTime() + Number(step.delay_days || 0) * 86400000).toISOString()
                }));
                await client.from('outreach_messages').delete().eq('estimate_id', estimate.id).eq('status', 'scheduled');
                const result = await client.from('outreach_messages').insert(messages);
                if (result.error) return this.toast(`Estimate marked sent, but follow-up scheduling failed: ${result.error.message}`, 'warning');
            }
            await client.from('job_status_events').insert({
                organization_id: this.currentOrgId(), job_id: jobId, event_type: 'estimate.sent',
                old_status: job?.status, new_status: 'Estimate Sent', note: `${estimate.estimate_number} marked sent`,
                actor_user_id: state.sessionUser?.id || null
            });
            this.toast('Estimate marked sent and follow-ups scheduled.', 'success');
            this.refreshInboundLeads();
        },

        subscribeRealtime() {
            const client = this.getClient();
            const orgId = this.currentOrgId();
            if (!client || !orgId || this.leadChannel) return;
            this.leadChannel = client.channel(`roomflow-tracker-${orgId}`)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `organization_id=eq.${orgId}` }, () => this.refreshInboundLeads())
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_imports', filter: `organization_id=eq.${orgId}` }, payload => {
                    this.toast(`New email lead imported${payload.new?.source_subject ? `: ${payload.new.source_subject}` : ''}.`, 'success');
                    this.refreshInboundLeads();
                })
                .subscribe();
        }
    };

    window.RoomFlowIntegrations = Integration;
    window.addEventListener('load', () => setTimeout(() => Integration.init(), 650));
})();
