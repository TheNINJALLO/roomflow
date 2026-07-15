// --- ROOMFLOW INTERNAL ESTIMATING & JOB-COSTING UI SYSTEM ---

// Collapsed state map to prevent collapsing on rerender
const collapsedSections = {
    summary: false,
    materials: false,
    mold: false,
    sump: false,
    perm_equip: false,
    rentals: false,
    labor: false,
    pricing: false,
    custom: false,
    settings: true, // Collapsed by default
    catalog: true   // Collapsed by default
};

// Render entry point
function renderCostUI() {
    const costContainer = document.getElementById('cost-container');
    if (!costContainer) return;

    initDefaultCosting(state);
    const catalog = RoomFlowCatalog.loadCatalog();
    const report = calculateProjectCosts(state, catalog);

    const q = calculateProjectQuantities(state);
    
    // Check if the screen is mobile or desktop
    const isMobile = window.innerWidth < 1024;

    let html = `
        <div class="cost-header-row">
            <div class="cost-title-block">
                <h2><i data-lucide="dollar-sign"></i> Internal Costing & Job-Costing System</h2>
                <div class="cost-disclaimer">
                    <i data-lucide="alert-triangle"></i> Tax, labor, overhead, markup, and coverage settings are internal estimating assumptions and should be verified for the specific project.
                </div>
            </div>
            <div class="cost-header-actions" style="display: flex; gap: 0.5rem; align-items: center;">
                <button id="btn-print-internal-cost" class="btn-tool-secondary"><i data-lucide="printer"></i> Print Cost Sheet</button>
                <button id="btn-cost-export-proposal" class="btn-tool-primary" style="background: var(--accent-teal); border-color: var(--accent-teal); color: white;"><i data-lucide="file-text"></i> Customer Proposal</button>
                <button id="btn-run-cost-tests" class="btn-tool-secondary"><i data-lucide="play-circle"></i> Run Cost Tests</button>
            </div>
        </div>
        <div id="cost-test-results-banner" class="hidden"></div>
    `;

    // Responsive split layout: Main sections on the left/top, Cost Summary card on the right/bottom
    html += `
        <div class="cost-body-grid">
            <div class="cost-main-column">
                ${renderCollapsibleSection('summary', '1. Cost Summary & Totals', renderSummaryDetails(report), 'bar-chart-2')}
                ${renderCollapsibleSection('materials', '2. Material Requirements BOM', renderMaterialsSection(report), 'package')}
                ${renderCollapsibleSection('mold', '3. Mold & Water Treatment Selection', renderMoldSection(q), 'droplet')}
                ${renderCollapsibleSection('sump', '4. Sump Basin Systems', renderSumpSection(q), 'circle-dot')}
                ${renderCollapsibleSection('perm_equip', '5. Permanent Equipment', renderPermanentEquipmentSection(q), 'wind')}
                ${renderCollapsibleSection('rentals', '6. Water Damage Rentals', renderRentalsSection(report), 'truck')}
                ${renderCollapsibleSection('labor', '7. Labor System Settings', renderLaborSection(report), 'users')}
                ${renderCollapsibleSection('pricing', '8. Overhead, Markup & Target Margin', renderOverheadSection(report), 'percent')}
                ${renderCollapsibleSection('custom', '9. Custom Cost Items', renderCustomCostSection(report), 'plus-circle')}
                ${renderCollapsibleSection('settings', '10. Global Estimating Settings', renderSettingsSection(report), 'settings')}
                ${renderCollapsibleSection('catalog', '11. Material & Equipment Catalog Management', renderCatalogSection(catalog), 'database')}
            </div>
            <div class="cost-sticky-column">
                ${renderStickySummaryCard(report)}
            </div>
        </div>
    `;

    costContainer.innerHTML = html;
    
    // Bind all inputs/actions
    bindCostUIEvents();
    
    // Draw Lucide icons
    lucide.createIcons();
}

// Collapsible Wrapper
function renderCollapsibleSection(id, title, content, iconName) {
    const isCollapsed = collapsedSections[id];
    return `
        <div class="cost-section-card ${isCollapsed ? 'collapsed' : ''}" id="sec-${id}">
            <div class="cost-section-header" onclick="toggleCostSection('${id}')">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <i data-lucide="${iconName || 'folder'}"></i>
                    <span>${title}</span>
                </div>
                <i data-lucide="chevron-${isCollapsed ? 'down' : 'up'}" class="chevron-toggle"></i>
            </div>
            <div class="cost-section-body">
                ${content}
            </div>
        </div>
    `;
}

window.toggleCostSection = function(id) {
    collapsedSections[id] = !collapsedSections[id];
    const el = document.getElementById(`sec-${id}`);
    if (el) {
        el.classList.toggle('collapsed', collapsedSections[id]);
        const chevron = el.querySelector('.chevron-toggle');
        if (chevron) {
            chevron.setAttribute('data-lucide', collapsedSections[id] ? 'chevron-down' : 'chevron-up');
            lucide.createIcons();
        }
    }
};

// --- RENDER SECTION DETAILS ---

function renderSummaryDetails(report) {
    const s = report.subtotals;
    const format = formatCurrency;
    
    return `
        <div class="summary-details-grid">
            <div class="summary-metric-box">
                <label>Material Subtotal</label>
                <span>${format(s.material)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Equipment Subtotal</label>
                <span>${format(s.equipment)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Supply Subtotal</label>
                <span>${format(s.supply)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Rental Subtotal</label>
                <span>${format(s.rental)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Taxable Subtotal</label>
                <span>${format(s.taxable)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Michigan Sales Tax</label>
                <span>${format(s.tax)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Labor Hours</label>
                <span>${report.laborHours.toFixed(1)} hrs</span>
            </div>
            <div class="summary-metric-box">
                <label>Labor Cost</label>
                <span>${format(s.labor)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Custom Direct Costs</label>
                <span>${format(s.custom)}</span>
            </div>
            <div class="summary-metric-box highlight-direct">
                <label>Direct Project Cost</label>
                <span>${format(s.direct)}</span>
            </div>
            <div class="summary-metric-box">
                <label>Overhead</label>
                <span>${format(s.overhead)}</span>
            </div>
            <div class="summary-metric-box highlight-basis">
                <label>Total Cost Basis</label>
                <span>${format(s.costBasis)}</span>
            </div>
        </div>
    `;
}

function renderMaterialsSection(report) {
    let html = `
        <div class="table-responsive">
            <table class="cost-table">
                <thead>
                    <tr>
                        <th style="width: 45px; text-align: center;">Needed</th>
                        <th>Product / Spec</th>
                        <th>Measured</th>
                        <th>Waste-Adj</th>
                        <th>Purchase Qty</th>
                        <th>Package Price</th>
                        <th>Raw Cost</th>
                        <th>Tax Info</th>
                        <th>Override</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    Object.keys(report.items).forEach(id => {
        const item = report.items[id];
        if (!item.data.active) return;

        const isTaxable = item.data.taxable;
        const waste = item.data.defaultWaste;
        const estTax = isTaxable ? (item.cost * (state.costing.settings.taxRate / 100)) : 0;
        const hasOverride = item.overrideEnabled;

        let warningBadge = '';
        if (report.warnings[id]) {
            warningBadge = `<span class="badge badge-warning" title="${report.warnings[id]}">Config Required</span>`;
        }

        let roundingInfo = ``;
        if (id === 'vapor_barrier_tape') {
            roundingInfo = `<small class="text-muted">Case of 12 rolls</small>`;
        } else if (id === 'vapor_barrier') {
            roundingInfo = `<small class="text-muted">Roll covers 3000 sq ft</small>`;
        } else if (id === 'spray_foam') {
            roundingInfo = `<small class="text-muted">Case of 24 cans</small>`;
        } else if (id === 'carbon_fiber') {
            roundingInfo = `<small class="text-muted">Roll of 75 ft</small>`;
        } else if (id === 'nb1') {
            roundingInfo = `<small class="text-muted">Bag covers ${state.costing.settings.nb1SqFtPerBag} sq ft</small>`;
        } else if (id === 'drywall_cut') {
            roundingInfo = `<small class="text-muted">Charged per sq ft</small>`;
        } else if (id === 'insulation_removal') {
            roundingInfo = `<small class="text-muted">Removal & Disposal (MI Avg: $1.00 - $2.50/sq ft)</small>`;
        } else if (id === 'insulation_blowing') {
            roundingInfo = `<small class="text-muted">Blown-in cellulose/fiberglass (MI Avg: $1.50 - $3.50/sq ft)</small>`;
        } else if (id === 'waterstop') {
            roundingInfo = `<small class="text-muted">Pail covers 2000 sq ft</small>`;
        } else if (id === 'floor_epoxy') {
            roundingInfo = `<small class="text-muted">Kit covers 300 sq ft</small>`;
        } else if (id === 'dehumidifier_stands') {
            roundingInfo = `<small class="text-muted">Pack of 4 stands</small>`;
        }

        const isExcluded = item.excluded;

        html += `
            <tr class="${isExcluded ? 'row-excluded' : (hasOverride ? 'row-override' : '')}" ${isExcluded ? 'style="opacity: 0.5; background: rgba(15, 23, 42, 0.1);"' : ''}>
                <td style="text-align: center;">
                    <input type="checkbox" 
                           class="item-include-toggle" 
                           data-id="${id}"
                           ${!isExcluded ? 'checked' : ''}>
                </td>
                <td>
                    <strong>${item.data.name}</strong><br>
                    <small class="text-muted">${item.data.notes || ''}</small><br>
                    ${warningBadge}
                </td>
                <td>
                    ${item.measured.toFixed(1)} ${item.data.usageUnit}
                </td>
                <td>
                    ${item.adjusted.toFixed(1)} ${item.data.usageUnit}<br>
                    <small class="text-muted">Waste: ${waste}%</small>
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.25rem;">
                        <input type="number" 
                               value="${item.purchaseQty}" 
                               style="width: 70px; padding: 0.25rem;" 
                               class="override-qty-input"
                               data-id="${id}"
                               min="0" step="1"
                               ${isExcluded ? 'disabled' : ''}>
                        <span style="font-size:0.8rem;">${item.data.purchaseUnit}(s)</span>
                    </div>
                    ${roundingInfo}<br>
                    <small class="text-muted">Extra: ${item.extraRemaining.toFixed(1)} ${item.data.usageUnit}</small>
                </td>
                <td>
                    ${formatCurrency(item.data.packagePrice)}
                </td>
                <td>
                    <strong>${formatCurrency(item.cost)}</strong>
                </td>
                <td>
                    <label class="checkbox-container" style="font-size: 0.8rem; display:flex; align-items:center; gap:0.25rem;">
                        <input type="checkbox" 
                               class="taxable-toggle" 
                               data-id="${id}"
                               ${isTaxable ? 'checked' : ''}
                               ${isExcluded ? 'disabled' : ''}>
                        Taxable
                    </label>
                    <small class="text-muted">Tax: ${formatCurrency(estTax)}</small>
                </td>
                <td>
                    ${isExcluded ? '-' : (hasOverride 
                        ? `<span class="badge badge-override">Override Active</span>` 
                        : `<span class="badge badge-auto">Auto-Calc</span>`)}
                </td>
                <td>
                    ${!isExcluded && hasOverride 
                        ? `<button onclick="resetOverride('${id}')" class="btn-table-action btn-table-reset" title="Reset to auto-calculated value"><i data-lucide="refresh-cw" style="width:14px; height:14px;"></i> Reset</button>` 
                        : `-`}
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}

function renderMoldSection(q) {
    let html = `
        <p class="section-hint">Select a room and set the treatment area in square feet. Gallons and purchase packs will update automatically.</p>
        <div class="table-responsive">
            <table class="cost-table">
                <thead>
                    <tr>
                        <th>Room Name</th>
                        <th>Level</th>
                        <th>Mold Area (sq ft)</th>
                        <th>Benefect Pails</th>
                        <th>RMR 3-Packs</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
    `;

    state.rooms.forEach(room => {
        const ts = state.costing.treatmentSelections[room.id] || { moldArea: 0 };
        const area = ts.moldArea || 0;

        let bPails = "Missing Coverage";
        let rmrPacks = "Missing Coverage";

        if (state.costing.settings.benefectSqFtPerGallon > 0) {
            bPails = `${Math.ceil((area / state.costing.settings.benefectSqFtPerGallon) / 5)} pails`;
        }
        if (state.costing.settings.rmrSqFtPerGallon > 0) {
            rmrPacks = `${Math.ceil((area / state.costing.settings.rmrSqFtPerGallon) / 1.5)} packs`;
        }

        html += `
            <tr>
                <td><strong>${room.name}</strong></td>
                <td>${room.levelId.toUpperCase()}</td>
                <td>
                    <input type="number" 
                           value="${area}" 
                           class="room-mold-area-input" 
                           data-room-id="${room.id}"
                           style="width: 100px; padding: 0.25rem;"
                           min="0">
                </td>
                <td>${area > 0 ? bPails : '0 pails'}</td>
                <td>${area > 0 ? rmrPacks : '0 packs'}</td>
                <td>-</td>
            </tr>
        `;
    });

    if (state.rooms.length === 0) {
        html += `<tr><td colspan="6" class="empty-state">No rooms placed in blueprint yet.</td></tr>`;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}

function renderSumpSection(q) {
    let html = `
        <p class="section-hint">Configure sump pumps, stone packages, and float overrides per sump basin placed on the canvas.</p>
        <div class="table-responsive">
            <table class="cost-table">
                <thead>
                    <tr>
                        <th>Sump Basin</th>
                        <th>Pumps Required</th>
                        <th>Wi-Fi Floats</th>
                        <th>Drain Stone Package</th>
                    </tr>
                </thead>
                <tbody>
    `;

    state.sumpPumps.forEach(sp => {
        const override = state.costing.projectOverrides[sp.id] || { pumps: 2, wifiFloats: 2, stonePack: 1 };
        const pumps = override.pumps !== undefined ? override.pumps : 2;
        const floats = override.wifiFloats !== undefined ? override.wifiFloats : pumps;
        const stone = override.stonePack !== undefined ? override.stonePack : 1;

        html += `
            <tr>
                <td>
                    <strong>${sp.name}</strong><br>
                    <small class="text-muted">Level: ${sp.levelId.toUpperCase()}</small>
                </td>
                <td>
                    <input type="number" 
                           value="${pumps}" 
                           class="sump-pumps-count-input" 
                           data-sump-id="${sp.id}"
                           style="width: 70px; padding: 0.25rem;" 
                           min="0">
                </td>
                <td>
                    <input type="number" 
                           value="${floats}" 
                           class="sump-floats-count-input" 
                           data-sump-id="${sp.id}"
                           style="width: 70px; padding: 0.25rem;" 
                           min="0">
                </td>
                <td>
                    <input type="number" 
                           value="${stone}" 
                           class="sump-stone-count-input" 
                           data-sump-id="${sp.id}"
                           style="width: 70px; padding: 0.25rem;" 
                           min="0">
                </td>
            </tr>
        `;
    });

    if (state.sumpPumps.length === 0) {
        html += `<tr><td colspan="4" class="empty-state">No sump pumps placed on the blueprint.</td></tr>`;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;
    return html;
}

function renderPermanentEquipmentSection(q) {
    const permDehum = state.costing.projectOverrides.permanentDehumQty || 0;
    const disabledStands = state.costing.projectOverrides.standsDisabledCount || 0;

    return `
        <div style="display:flex; flex-direction:column; gap:1rem; max-width: 500px;">
            <div class="input-row-group">
                <div class="input-group">
                    <label for="input-perm-dehum-qty">Permanent Dehumidifiers Placed</label>
                    <input type="number" id="input-perm-dehum-qty" value="${permDehum}" min="0" style="padding: 0.5rem;">
                    <small class="text-muted">Installed permanently or customer-owned.</small>
                </div>
            </div>
            <div class="input-row-group">
                <div class="input-group">
                    <label for="input-stands-disabled">Stands Disabled (Dehumidifier count)</label>
                    <input type="number" id="input-stands-disabled" value="${disabledStands}" min="0" style="padding: 0.5rem;">
                    <small class="text-muted">Subtract stands for dehumidifiers placed on shelves or concrete.</small>
                </div>
            </div>
        </div>
    `;
}

function renderRentalsSection(report) {
    const rentals = state.costing.rentals;
    let optionalRows = '';
    
    if (Array.isArray(rentals.optionalCharges)) {
        rentals.optionalCharges.forEach((ch, idx) => {
            optionalRows += `
                <tr>
                    <td>
                        <input type="text" value="${ch.description}" class="rental-opt-desc" data-idx="${idx}" style="width:100%; padding:0.25rem;">
                    </td>
                    <td>
                        <input type="number" value="${ch.qty}" class="rental-opt-qty" data-idx="${idx}" style="width:70px; padding:0.25rem;" min="0">
                    </td>
                    <td>
                        <input type="number" value="${ch.rate}" class="rental-opt-rate" data-idx="${idx}" style="width:90px; padding:0.25rem;" min="0">
                    </td>
                    <td>
                        <strong>${formatCurrency(ch.qty * ch.rate)}</strong>
                    </td>
                    <td>
                        <label class="checkbox-container">
                            <input type="checkbox" class="rental-opt-taxable" data-idx="${idx}" ${ch.taxable ? 'checked' : ''}>
                            Taxable
                        </label>
                    </td>
                    <td>
                        <input type="text" value="${ch.notes || ''}" class="rental-opt-notes" data-idx="${idx}" style="width:100%; padding:0.25rem;">
                    </td>
                    <td>
                        <button onclick="removeOptionalRental(${idx})" class="btn-table-action btn-table-delete" title="Delete Charge"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </td>
                </tr>
            `;
        });
    }

    return `
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            <div class="rentals-grid-inputs">
                <div class="rental-card">
                    <h4><i data-lucide="wind"></i> Rental Dehumidifiers</h4>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-top:0.5rem;">
                        <div class="input-group">
                            <label>Units</label>
                            <input type="number" id="input-rental-dehum-units" value="${rentals.dehumidifierUnits}" min="0">
                        </div>
                        <div class="input-group">
                            <label>Days</label>
                            <input type="number" id="input-rental-dehum-days" value="${rentals.dehumidifierDays}" min="0">
                        </div>
                    </div>
                    <div style="margin-top:0.5rem; display:flex; align-items:center; gap:0.5rem;">
                        <input type="checkbox" id="input-rental-dehum-taxable" ${rentals.dehumidifierTaxable ? 'checked' : ''}>
                        <label for="input-rental-dehum-taxable" style="margin:0;">Taxable</label>
                    </div>
                    <div class="input-group" style="margin-top:0.5rem;">
                        <label>Notes</label>
                        <input type="text" id="input-rental-dehum-notes" value="${rentals.dehumidifierNotes || ''}" placeholder="Dehum rental notes">
                    </div>
                    <div class="rental-rate-note">Rate: $100.00 / unit / day</div>
                </div>

                <div class="rental-card">
                    <h4><i data-lucide="rotate-cw"></i> Air Movers</h4>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-top:0.5rem;">
                        <div class="input-group">
                            <label>Units</label>
                            <input type="number" id="input-rental-mover-units" value="${rentals.airMoverUnits}" min="0">
                        </div>
                        <div class="input-group">
                            <label>Days</label>
                            <input type="number" id="input-rental-mover-days" value="${rentals.airMoverDays}" min="0">
                        </div>
                    </div>
                    <div style="margin-top:0.5rem; display:flex; align-items:center; gap:0.5rem;">
                        <input type="checkbox" id="input-rental-mover-taxable" ${rentals.airMoverTaxable ? 'checked' : ''}>
                        <label for="input-rental-mover-taxable" style="margin:0;">Taxable</label>
                    </div>
                    <div class="input-group" style="margin-top:0.5rem;">
                        <label>Notes</label>
                        <input type="text" id="input-rental-mover-notes" value="${rentals.airMoverNotes || ''}" placeholder="Air mover rental notes">
                    </div>
                    <div class="rental-rate-note">Rate: $38.00 / unit / day</div>
                </div>

                <div class="rental-card">
                    <h4><i data-lucide="filter"></i> Air Scrubbers</h4>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem; margin-top:0.5rem;">
                        <div class="input-group">
                            <label>Units</label>
                            <input type="number" id="input-rental-scrubber-units" value="${rentals.airScrubberUnits}" min="0">
                        </div>
                        <div class="input-group">
                            <label>Days</label>
                            <input type="number" id="input-rental-scrubber-days" value="${rentals.airScrubberDays}" min="0">
                        </div>
                    </div>
                    <div style="margin-top:0.5rem; display:flex; align-items:center; gap:0.5rem;">
                        <input type="checkbox" id="input-rental-scrubber-taxable" ${rentals.airScrubberTaxable ? 'checked' : ''}>
                        <label for="input-rental-scrubber-taxable" style="margin:0;">Taxable</label>
                    </div>
                    <div class="input-group" style="margin-top:0.5rem;">
                        <label>Notes</label>
                        <input type="text" id="input-rental-scrubber-notes" value="${rentals.airScrubberNotes || ''}" placeholder="Air scrubber rental notes">
                    </div>
                    <div class="rental-rate-note">Rate: $105.00 / unit / day</div>
                </div>
            </div>

            <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <h4 style="margin:0;">Additional / Optional Rental Charges</h4>
                    <button id="btn-add-optional-rental" class="btn-action-primary"><i data-lucide="plus"></i> Add Charge</button>
                </div>
                <div class="table-responsive">
                    <table class="cost-table">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>Qty</th>
                                <th>Unit Rate</th>
                                <th>Cost</th>
                                <th>Taxable</th>
                                <th>Notes</th>
                                <th style="width:50px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${optionalRows || '<tr><td colspan="7" class="empty-state">No optional rental charges added.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderLaborSection(report) {
    const labor = state.costing.labor;
    
    // Suggest labor categories
    const categories = [
        "Vapor-barrier installation", "Vapor-barrier tape installation", "Mold treatment", "Cleaning and preparation", "Carbon-fiber installation",
        "NB-1 primer application", "NB-1 application", "Waterstop application", "Floor-epoxy preparation", "Floor-epoxy application",
        "Sump excavation", "Sump-basin installation", "Pump installation", "Wi-Fi float installation",
        "Plumbing installation", "Discharge-line installation", "Permanent dehumidifier installation",
        "Equipment delivery", "Rental-equipment setup", "Rental-equipment monitoring", "Debris removal",
        "Final cleanup", "Travel", "Custom labor"
    ];

    let detailedRows = '';
    if (Array.isArray(labor.detailedLines)) {
        labor.detailedLines.forEach((line, idx) => {
            detailedRows += `
                <tr>
                    <td>
                        <select class="labor-line-category" data-idx="${idx}" style="width:100%; padding:0.25rem;">
                            ${categories.map(cat => `<option value="${cat}" ${line.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
                        </select>
                    </td>
                    <td>
                        <input type="text" value="${line.description || ''}" class="labor-line-desc" data-idx="${idx}" style="width:100%; padding:0.25rem;" placeholder="Task details">
                    </td>
                    <td>
                        <input type="number" value="${line.workers}" class="labor-line-workers" data-idx="${idx}" style="width:60px; padding:0.25rem;" min="0">
                    </td>
                    <td>
                        <input type="number" value="${line.hours}" class="labor-line-hours" data-idx="${idx}" style="width:60px; padding:0.25rem;" min="0">
                    </td>
                    <td>
                        <strong>${(line.workers * line.hours).toFixed(1)} hrs</strong>
                    </td>
                    <td>
                        <input type="number" value="${line.rate}" class="labor-line-rate" data-idx="${idx}" style="width:70px; padding:0.25rem;" min="0">
                    </td>
                    <td>
                        <strong>${formatCurrency(line.workers * line.hours * line.rate)}</strong>
                    </td>
                    <td>
                        <button onclick="removeDetailedLaborLine(${idx})" class="btn-table-action btn-table-delete" title="Delete Line"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </td>
                </tr>
            `;
        });
    }

    return `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            <div class="input-group">
                <label>Labor Estimating Method</label>
                <select id="select-labor-mode" style="padding: 0.5rem; max-width: 300px;">
                    <option value="project" ${labor.mode === 'project' ? 'selected' : ''}>Method A: Project Labor (Crew-wide)</option>
                    <option value="detailed" ${labor.mode === 'detailed' ? 'selected' : ''}>Method B: Detailed Tasks (Itemized)</option>
                    <option value="combined" ${labor.mode === 'combined' ? 'selected' : ''}>Method A + B (Combined Labor Mode)</option>
                </select>
            </div>

            <!-- Method A Inputs -->
            <div id="method-a-panel" class="${labor.mode === 'detailed' ? 'hidden' : ''}" style="background:rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding:1rem; margin-top:0.5rem;">
                <h4 style="margin-top:0;">Method A: Project Labor Assumptions</h4>
                <div class="rentals-grid-inputs" style="grid-template-columns: repeat(4, 1fr);">
                    <div class="input-group">
                        <label>Crew Size</label>
                        <input type="number" id="input-labor-crew" value="${labor.projectCrewSize}" min="0">
                    </div>
                    <div class="input-group">
                        <label>Workdays</label>
                        <input type="number" id="input-labor-workdays" value="${labor.projectWorkdays}" min="0">
                    </div>
                    <div class="input-group">
                        <label>Hours/Day</label>
                        <input type="number" id="input-labor-hours" value="${labor.projectHoursPerDay}" min="0">
                    </div>
                    <div class="input-group">
                        <label>Hourly Rate ($)</label>
                        <input type="number" id="input-labor-rate" value="${labor.projectLaborRate}" min="0">
                        <small style="color: #94a3b8; font-size: 0.7rem; margin-top: 2px;">Typical: $89 - $140/hr</small>
                    </div>
                </div>
                <div class="input-group" style="margin-top:0.5rem;">
                    <label>Crew Labor Notes</label>
                    <input type="text" id="input-labor-notes" value="${labor.projectNotes || ''}" placeholder="Labor estimation assumptions notes">
                </div>
            </div>

            <!-- Method B Inputs -->
            <div id="method-b-panel" class="${labor.mode === 'project' ? 'hidden' : ''}" style="background:rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding:1rem; margin-top:0.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                    <h4 style="margin:0;">Method B: Detailed Task Labor Lines</h4>
                    <button id="btn-add-labor-line" class="btn-action-primary"><i data-lucide="plus"></i> Add Labor Line</button>
                </div>
                <div class="table-responsive">
                    <table class="cost-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th>Description / Room</th>
                                <th>Workers</th>
                                <th>Hours</th>
                                <th>Total Hrs</th>
                                <th>Hourly Rate</th>
                                <th>Line Cost</th>
                                <th style="width:50px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${detailedRows || '<tr><td colspan="8" class="empty-state">No detailed labor lines added.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
}

function renderOverheadSection(report) {
    const s = report.subtotals;
    const settings = state.costing.settings;

    return `
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
            <div class="rentals-grid-inputs" style="grid-template-columns: 1fr 1fr 1fr;">
                <div class="input-group">
                    <label>Overhead (%)</label>
                    <input type="number" id="input-overhead-pct" value="${settings.overhead}" min="0" step="0.5">
                </div>
                <div class="input-group">
                    <label>Pricing Calculation Mode</label>
                    <select id="select-pricing-mode" style="padding:0.5rem;">
                        <option value="markup" ${settings.pricingMode === 'markup' ? 'selected' : ''}>Markup Cost Basis</option>
                        <option value="target-margin" ${settings.pricingMode === 'target-margin' ? 'selected' : ''}>Target Gross Margin</option>
                    </select>
                </div>
                <div class="input-group" id="pricing-rate-container">
                    ${settings.pricingMode === 'markup' 
                        ? `<label>Markup Percentage (%)</label>
                           <input type="number" id="input-pricing-rate" value="${settings.markup}" min="0" step="0.5">`
                        : `<label>Target Gross Margin (%)</label>
                           <input type="number" id="input-pricing-rate" value="${settings.targetGrossMargin}" min="0" max="99.9" step="0.5">`}
                </div>
            </div>

            <div class="pricing-explanation">
                <strong><i data-lucide="info"></i> Calculation Distinction Note:</strong> Markup and Gross Margin percentages are NOT the same.
                <ul>
                    <li><strong>Markup Mode:</strong> Adds a direct percentage to your cost basis. For example, a 30% markup on a $10,000 cost basis yields a selling price of $13,000. Your gross profit is $3,000, which is actually a <strong>23.1% gross margin</strong>.</li>
                    <li><strong>Target Gross Margin Mode:</strong> Calculates the selling price to yield a specific margin percentage on the contract price. A 30% gross margin target on a $10,000 cost basis calculates the selling price as <code>Cost Basis / (1 - 0.30) = $14,285.71</code>, which yields a gross profit of $4,285.71 (exactly <strong>30% gross margin</strong>).</li>
                </ul>
            </div>
        </div>
    `;
}

function renderCustomCostSection(report) {
    let rows = '';
    const customItems = state.costing.customItems || [];

    const categories = ["Material", "Equipment", "Supply", "Rental", "Subcontractor", "Permit", "Disposal", "Delivery", "Travel", "Other"];

    customItems.forEach((item, idx) => {
        rows += `
            <tr>
                <td>
                    <input type="text" value="${item.name}" class="custom-item-name" data-idx="${idx}" style="width:100%; padding:0.25rem;">
                </td>
                <td>
                    <select class="custom-item-cat" data-idx="${idx}" style="padding:0.25rem;">
                        ${categories.map(c => `<option value="${c.toLowerCase()}" ${item.category === c.toLowerCase() ? 'selected' : ''}>${c}</option>`).join('')}
                    </select>
                </td>
                <td>
                    <input type="number" value="${item.qty}" class="custom-item-qty" data-idx="${idx}" style="width:60px; padding:0.25rem;" min="0">
                </td>
                <td>
                    <input type="text" value="${item.unit || ''}" class="custom-item-unit" data-idx="${idx}" style="width:50px; padding:0.25rem;" placeholder="ea">
                </td>
                <td>
                    <input type="number" value="${item.unitCost}" class="custom-item-price" data-idx="${idx}" style="width:70px; padding:0.25rem;" min="0">
                </td>
                <td>
                    <input type="number" value="${item.waste || 0}" class="custom-item-waste" data-idx="${idx}" style="width:50px; padding:0.25rem;" min="0">
                </td>
                <td>
                    <input type="number" value="${item.laborHours || 0}" class="custom-item-lhours" data-idx="${idx}" style="width:50px; padding:0.25rem;" min="0">
                </td>
                <td>
                    <input type="number" value="${item.laborRate || 0}" class="custom-item-lrate" data-idx="${idx}" style="width:60px; padding:0.25rem;" min="0">
                </td>
                <td>
                    <label class="checkbox-container" style="font-size:0.85rem;">
                        <input type="checkbox" class="custom-item-taxable" data-idx="${idx}" ${item.taxable ? 'checked' : ''}>
                        Tax
                    </label>
                </td>
                <td>
                    <label class="checkbox-container" style="font-size:0.85rem;">
                        <input type="checkbox" class="custom-item-inc-oh" data-idx="${idx}" ${item.includeInOverhead ? 'checked' : ''}>
                        O/H
                    </label>
                </td>
                <td>
                    <label class="checkbox-container" style="font-size:0.85rem;">
                        <input type="checkbox" class="custom-item-inc-mu" data-idx="${idx}" ${item.includeInMarkup ? 'checked' : ''}>
                        M/U
                    </label>
                </td>
                <td>
                    <button onclick="removeCustomItem(${idx})" class="btn-table-action btn-table-delete" title="Delete Item"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                </td>
            </tr>
        `;
    });

    return `
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <p class="section-hint" style="margin:0;">Add custom direct project cost lines. These remain strictly internal and do not export to customers.</p>
                <button id="btn-add-custom-item" class="btn-action-primary"><i data-lucide="plus"></i> Add Line</button>
            </div>
            <div class="table-responsive">
                <table class="cost-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Category</th>
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Unit Cost ($)</th>
                            <th>Waste (%)</th>
                            <th>Labor Hrs</th>
                            <th>Labor Rate</th>
                            <th>Taxable</th>
                            <th title="Include in Overhead calculation">O/H</th>
                            <th title="Include in Markup pricing calculation">M/U</th>
                            <th style="width:50px;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows || '<tr><td colspan="12" class="empty-state">No custom cost items added.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderSettingsSection(report) {
    const s = state.costing.settings;
    return `
        <div style="display:flex; flex-direction:column; gap:1.25rem;">
            <div style="display:flex; align-items:center; gap:0.5rem; background:rgba(59,130,246,0.05); border:1px solid rgba(59,130,246,0.15); padding:0.75rem 1rem; border-radius:8px; margin-bottom: 0.25rem;">
                <input type="checkbox" id="settings-use-vapor-barrier" ${s.useVaporBarrier !== false ? 'checked' : ''} style="width:auto; margin:0; cursor:pointer;">
                <label for="settings-use-vapor-barrier" style="margin:0; font-weight:600; font-size:0.9rem; cursor:pointer; color:#f1f5f9;">Use Vapor Barrier System in calculations</label>
            </div>
            <div class="rentals-grid-inputs" style="grid-template-columns: repeat(3, 1fr); gap:1rem;">
                <div class="input-group">
                    <label>Michigan Sales Tax (%)</label>
                    <input type="number" id="settings-tax-rate" value="${s.taxRate}" min="0" step="0.1">
                </div>
                <div class="input-group">
                    <label>Material Waste (%)</label>
                    <input type="number" id="settings-waste-rate" value="${s.generalWaste}" min="0" step="0.5">
                </div>
                <div class="input-group">
                    <label>Workday Duration (Hours)</label>
                    <input type="number" id="settings-workday-hours" value="${s.hoursPerWorkday}" min="1">
                </div>
            </div>

            <div class="rentals-grid-inputs" style="grid-template-columns: repeat(3, 1fr); gap:1rem;">
                <div class="input-group">
                    <label>Vapor Barrier Tape Roll Coverage (ft)</label>
                    <input type="number" id="settings-tape-cov" value="${s.tapeCoveragePerRoll}" min="0" step="1">
                </div>
                <div class="input-group">
                    <label>Benefect Coverage (sq ft/gallon)</label>
                    <input type="number" id="settings-benefect-cov" value="${s.benefectSqFtPerGallon}" min="0" step="5">
                </div>
                <div class="input-group">
                    <label>RMR Coverage (sq ft/gallon)</label>
                    <input type="number" id="settings-rmr-cov" value="${s.rmrSqFtPerGallon}" min="0" step="5">
                </div>
            </div>

            <div class="rentals-grid-inputs" style="grid-template-columns: repeat(3, 1fr); gap:1rem;">
                <div class="input-group">
                    <label>NB-1 Coating Bag Coverage (sq ft)</label>
                    <input type="number" id="settings-nb1-cov" value="${s.nb1SqFtPerBag}" min="0.1" step="0.5">
                </div>
                <div class="input-group">
                    <label>Internal Labor Wage/Cost ($/hr)</label>
                    <input type="number" id="settings-labor-cost-rate" value="${s.loadedLaborRate}" min="0" step="0.5">
                </div>
                <div class="input-group">
                    <label>N95 Masks Per Pack</label>
                    <input type="number" id="settings-masks-pack" value="${s.masksPerPack}" min="0" step="1">
                </div>
            </div>

            <div class="rentals-grid-inputs" style="grid-template-columns: repeat(3, 1fr); gap:1rem;">
                <div class="input-group">
                    <label>Masks Calculation Mode</label>
                    <select id="settings-masks-mode" style="padding:0.5rem;">
                        <option value="manual" ${s.masksMode === 'manual' ? 'selected' : ''}>Manual Mode</option>
                        <option value="crew" ${s.masksMode === 'crew' ? 'selected' : ''}>Crew Requirement Mode</option>
                    </select>
                </div>
            </div>

            <div id="settings-masks-crew-panel" class="${s.masksMode === 'manual' ? 'hidden' : ''}" style="background:rgba(255,255,255,0.02); padding:1rem; border:1px solid var(--border-color); border-radius:8px;">
                <h4 style="margin-top:0;">Crew Mode Mask Settings</h4>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem;">
                    <div class="input-group">
                        <label>Masks per Worker per Day</label>
                        <input type="number" id="settings-masks-worker-day" value="${s.masksPerWorkerPerDay}" min="0.1" step="0.5">
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderCatalogSection(catalog) {
    let rows = '';
    catalog.forEach(item => {
        rows += `
            <tr>
                <td>
                    <input type="text" value="${item.name}" class="cat-item-name" data-id="${item.id}" style="width:100%; padding:0.25rem;">
                </td>
                <td>
                    <input type="number" value="${item.packagePrice}" class="cat-item-price" data-id="${item.id}" style="width:80px; padding:0.25rem;" min="0">
                </td>
                <td>
                    <input type="number" value="${item.packageQuantity}" class="cat-item-qty" data-id="${item.id}" style="width:80px; padding:0.25rem;" min="0.001" step="any">
                </td>
                <td>
                    <input type="text" value="${item.purchaseUnit}" class="cat-item-punit" data-id="${item.id}" style="width:50px; padding:0.25rem;">
                </td>
                <td>
                    <input type="text" value="${item.usageUnit}" class="cat-item-uunit" data-id="${item.id}" style="width:70px; padding:0.25rem;">
                </td>
                <td>
                    <label class="checkbox-container">
                        <input type="checkbox" class="cat-item-taxable" data-id="${item.id}" ${item.taxable ? 'checked' : ''}>
                        Tax
                    </label>
                </td>
                <td>
                    <label class="checkbox-container">
                        <input type="checkbox" class="cat-item-active" data-id="${item.id}" ${item.active ? 'checked' : ''}>
                        Active
                    </label>
                </td>
                <td>
                    <input type="text" value="${item.notes || ''}" class="cat-item-notes" data-id="${item.id}" style="width:100%; padding:0.25rem;">
                </td>
                <td>
                    <button onclick="resetCatalogItem('${item.id}')" class="btn-table-action btn-table-reset" title="Reset this item to default price/specs"><i data-lucide="refresh-cw" style="width:12px; height:12px;"></i> Reset</button>
                </td>
            </tr>
        `;
    });

    return `
        <div style="display:flex; flex-direction:column; gap:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                <p class="section-hint" style="margin:0;">Modify prices, packaging configurations, and default waste multipliers. Changes are saved locally.</p>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                    <button id="btn-export-catalog" class="btn-action-primary"><i data-lucide="share"></i> Export Catalog JSON</button>
                    <button id="btn-import-catalog" class="btn-action-primary"><i data-lucide="upload-cloud"></i> Import Catalog JSON</button>
                    <button id="btn-reset-catalog-all" class="btn-action-danger"><i data-lucide="alert-octagon"></i> Reset All to Defaults</button>
                </div>
            </div>
            <div class="table-responsive">
                <table class="cost-table">
                    <thead>
                        <tr>
                            <th>Product Name</th>
                            <th>Pkg Price ($)</th>
                            <th>Pkg Qty</th>
                            <th>Pkg Unit</th>
                            <th>Usage Unit</th>
                            <th>Tax</th>
                            <th>Active</th>
                            <th>Notes</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderStickySummaryCard(report) {
    const s = report.subtotals;
    const isMarkup = state.costing.settings.pricingMode === 'markup';
    const rateText = isMarkup ? `${state.costing.settings.markup}% Markup` : `${state.costing.settings.targetGrossMargin}% Target Margin`;

    return `
        <div class="sticky-cost-card">
            <h3>Contract Estimating Summary</h3>
            <div class="sticky-metric-row">
                <span class="label">Total Cost Basis</span>
                <span class="value">${formatCurrency(s.costBasis)}</span>
            </div>
            <div class="sticky-metric-row">
                <span class="label">Profit Pricing Mode</span>
                <span class="value highlight-mode">${rateText}</span>
            </div>
            <div class="sticky-metric-row">
                <span class="label">Added Markup Amount</span>
                <span class="value">${formatCurrency(s.markup)}</span>
            </div>
            <div class="sticky-metric-row main-price-row">
                <span class="label">Estimated Selling Price</span>
                <span class="value">${formatCurrency(s.sellingPrice)}</span>
            </div>
            <div class="sticky-metric-row profit-row">
                <span class="label">Expected Gross Profit</span>
                <span class="value">${formatCurrency(s.expectedGrossProfit)}</span>
            </div>
            <div class="sticky-metric-row margin-row">
                <span class="label">Gross-Margin Percentage</span>
                <span class="value">${s.actualMarginPercent.toFixed(1)}%</span>
            </div>
            <div class="sticky-metric-row" style="border-top:1px dashed rgba(255,255,255,0.08); padding-top:0.5rem; margin-top:0.5rem;">
                <span class="label" style="color: #94a3b8; font-size: 0.8rem;">Billed Labor (to Customer)</span>
                <span class="value" style="font-size: 0.8rem;">${formatCurrency(report.subtotals.labor)}</span>
            </div>
            <div class="sticky-metric-row">
                <span class="label" style="color: #94a3b8; font-size: 0.8rem;">Paid Crew Cost (Internal)</span>
                <span class="value" style="font-size: 0.8rem; color:#ef4444;">-${formatCurrency(report.subtotals.internalLabor)}</span>
            </div>
            <div class="sticky-metric-row" style="background: rgba(16,185,129,0.08); border-radius: 4px; padding: 4px 6px;">
                <span class="label" style="color: #10b981; font-weight: 600; font-size: 0.85rem;">True Net Cash Profit</span>
                <span class="value" style="color: #10b981; font-weight: 700; font-size: 0.95rem;">${formatCurrency(report.subtotals.trueNetProfit)}</span>
            </div>
            <div style="margin-top:1.5rem; text-align:center;">
                <small class="text-muted" style="font-size:0.75rem; display:block;">Calculations run instantly when canvas or cost inputs are modified.</small>
            </div>
        </div>
    `;
}

// --- EVENTS BINDING & EVENT HANDLERS ---

function bindCostUIEvents() {
    // Override Quantity Inputs
    document.querySelectorAll('.override-qty-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            const val = Math.max(0, parseFloat(e.target.value) || 0);
            
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.manualQuantityOverrides[id] = {
                overrideQuantity: val,
                overrideEnabled: true
            };
            updateCostDataAndUI();
        });
    });

    // Taxable Toggles
    document.querySelectorAll('.taxable-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            
            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].taxable = e.target.checked;
            updateCostDataAndUI();
        });
    });

    // Inclusion Checkbox Toggles
    document.querySelectorAll('.item-include-toggle').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            const checked = e.target.checked;
            
            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (!state.costing.excludedItems) {
                state.costing.excludedItems = {};
            }
            if (checked) {
                delete state.costing.excludedItems[id];
            } else {
                state.costing.excludedItems[id] = true;
            }
            updateCostDataAndUI();
        });
    });

    // Room Mold Area Inputs
    document.querySelectorAll('.room-mold-area-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const roomId = e.target.getAttribute('data-room-id');
            const val = Math.max(0, parseFloat(e.target.value) || 0);

            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (!state.costing.treatmentSelections[roomId]) {
                state.costing.treatmentSelections[roomId] = {};
            }
            state.costing.treatmentSelections[roomId].moldArea = val;
            updateCostDataAndUI();
        });
    });

    // Sump Pumps inputs
    document.querySelectorAll('.sump-pumps-count-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const sumpId = e.target.getAttribute('data-sump-id');
            const val = Math.max(0, parseInt(e.target.value) || 0);

            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (!state.costing.projectOverrides[sumpId]) state.costing.projectOverrides[sumpId] = {};
            state.costing.projectOverrides[sumpId].pumps = val;
            updateCostDataAndUI();
        });
    });

    // Sump Floats inputs
    document.querySelectorAll('.sump-floats-count-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const sumpId = e.target.getAttribute('data-sump-id');
            const val = Math.max(0, parseInt(e.target.value) || 0);

            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (!state.costing.projectOverrides[sumpId]) state.costing.projectOverrides[sumpId] = {};
            state.costing.projectOverrides[sumpId].wifiFloats = val;
            updateCostDataAndUI();
        });
    });

    // Sump Stone packs
    document.querySelectorAll('.sump-stone-count-input').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const sumpId = e.target.getAttribute('data-sump-id');
            const val = Math.max(0, parseInt(e.target.value) || 0);

            if (typeof saveHistoryState === 'function') saveHistoryState();
            if (!state.costing.projectOverrides[sumpId]) state.costing.projectOverrides[sumpId] = {};
            state.costing.projectOverrides[sumpId].stonePack = val;
            updateCostDataAndUI();
        });
    });

    // Permanent Dehum quantity
    const dehumQtyInput = document.getElementById('input-perm-dehum-qty');
    if (dehumQtyInput) {
        dehumQtyInput.addEventListener('change', (e) => {
            const val = Math.max(0, parseInt(e.target.value) || 0);
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.projectOverrides.permanentDehumQty = val;
            updateCostDataAndUI();
        });
    }

    // Stands disabled quantity
    const standsDisabledInput = document.getElementById('input-stands-disabled');
    if (standsDisabledInput) {
        standsDisabledInput.addEventListener('change', (e) => {
            const val = Math.max(0, parseInt(e.target.value) || 0);
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.projectOverrides.standsDisabledCount = val;
            updateCostDataAndUI();
        });
    }

    // Rentals Dehum inputs
    const rDehumUnits = document.getElementById('input-rental-dehum-units');
    if (rDehumUnits) {
        rDehumUnits.addEventListener('change', (e) => {
            state.costing.rentals.dehumidifierUnits = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const rDehumDays = document.getElementById('input-rental-dehum-days');
    if (rDehumDays) {
        rDehumDays.addEventListener('change', (e) => {
            state.costing.rentals.dehumidifierDays = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const rDehumTax = document.getElementById('input-rental-dehum-taxable');
    if (rDehumTax) {
        rDehumTax.addEventListener('change', (e) => {
            state.costing.rentals.dehumidifierTaxable = e.target.checked;
            updateCostDataAndUI();
        });
    }
    const rDehumNotes = document.getElementById('input-rental-dehum-notes');
    if (rDehumNotes) {
        rDehumNotes.addEventListener('change', (e) => {
            state.costing.rentals.dehumidifierNotes = e.target.value;
        });
    }

    // Rentals Air Mover inputs
    const rMoverUnits = document.getElementById('input-rental-mover-units');
    if (rMoverUnits) {
        rMoverUnits.addEventListener('change', (e) => {
            state.costing.rentals.airMoverUnits = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const rMoverDays = document.getElementById('input-rental-mover-days');
    if (rMoverDays) {
        rMoverDays.addEventListener('change', (e) => {
            state.costing.rentals.airMoverDays = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const rMoverTax = document.getElementById('input-rental-mover-taxable');
    if (rMoverTax) {
        rMoverTax.addEventListener('change', (e) => {
            state.costing.rentals.airMoverTaxable = e.target.checked;
            updateCostDataAndUI();
        });
    }
    const rMoverNotes = document.getElementById('input-rental-mover-notes');
    if (rMoverNotes) {
        rMoverNotes.addEventListener('change', (e) => {
            state.costing.rentals.airMoverNotes = e.target.value;
        });
    }

    // Rentals Air Scrubber inputs
    const rScrubberUnits = document.getElementById('input-rental-scrubber-units');
    if (rScrubberUnits) {
        rScrubberUnits.addEventListener('change', (e) => {
            state.costing.rentals.airScrubberUnits = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const rScrubberDays = document.getElementById('input-rental-scrubber-days');
    if (rScrubberDays) {
        rScrubberDays.addEventListener('change', (e) => {
            state.costing.rentals.airScrubberDays = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const rScrubberTax = document.getElementById('input-rental-scrubber-taxable');
    if (rScrubberTax) {
        rScrubberTax.addEventListener('change', (e) => {
            state.costing.rentals.airScrubberTaxable = e.target.checked;
            updateCostDataAndUI();
        });
    }
    const rScrubberNotes = document.getElementById('input-rental-scrubber-notes');
    if (rScrubberNotes) {
        rScrubberNotes.addEventListener('change', (e) => {
            state.costing.rentals.airScrubberNotes = e.target.value;
        });
    }

    // Add optional rental charge
    const btnAddOptRental = document.getElementById('btn-add-optional-rental');
    if (btnAddOptRental) {
        btnAddOptRental.addEventListener('click', () => {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.optionalCharges.push({
                description: "Delivery fee",
                qty: 1,
                rate: 50,
                taxable: false,
                notes: ""
            });
            updateCostDataAndUI();
        });
    }

    // Edit optional rental rows
    document.querySelectorAll('.rental-opt-desc').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.rentals.optionalCharges[idx].description = e.target.value;
        });
    });
    document.querySelectorAll('.rental-opt-qty').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.rentals.optionalCharges[idx].qty = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.rental-opt-rate').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.rentals.optionalCharges[idx].rate = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.rental-opt-taxable').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = parseInt(chk.getAttribute('data-idx'));
            state.costing.rentals.optionalCharges[idx].taxable = chk.checked;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.rental-opt-notes').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.rentals.optionalCharges[idx].notes = e.target.value;
        });
    });

    // Labor Mode Select
    const selectLaborMode = document.getElementById('select-labor-mode');
    if (selectLaborMode) {
        selectLaborMode.addEventListener('change', (e) => {
            state.costing.labor.mode = e.target.value;
            updateCostDataAndUI();
        });
    }

    // Labor Method A inputs
    const inputLCrew = document.getElementById('input-labor-crew');
    if (inputLCrew) {
        inputLCrew.addEventListener('change', (e) => {
            state.costing.labor.projectCrewSize = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const inputLWorkdays = document.getElementById('input-labor-workdays');
    if (inputLWorkdays) {
        inputLWorkdays.addEventListener('change', (e) => {
            state.costing.labor.projectWorkdays = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const inputLHours = document.getElementById('input-labor-hours');
    if (inputLHours) {
        inputLHours.addEventListener('change', (e) => {
            state.costing.labor.projectHoursPerDay = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const inputLRate = document.getElementById('input-labor-rate');
    if (inputLRate) {
        inputLRate.addEventListener('change', (e) => {
            state.costing.labor.projectLaborRate = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const inputLNotes = document.getElementById('input-labor-notes');
    if (inputLNotes) {
        inputLNotes.addEventListener('change', (e) => {
            state.costing.labor.projectNotes = e.target.value;
        });
    }

    // Add Detailed Labor Line
    const btnAddLaborLine = document.getElementById('btn-add-labor-line');
    if (btnAddLaborLine) {
        btnAddLaborLine.addEventListener('click', () => {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.labor.detailedLines.push({
                category: "Vapor-barrier installation",
                description: "",
                workers: 1,
                hours: 8,
                rate: state.costing.settings.loadedLaborRate || 65
            });
            updateCostDataAndUI();
        });
    }

    // Edit Detailed Labor rows
    document.querySelectorAll('.labor-line-category').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            const cat = e.target.value;
            state.costing.labor.detailedLines[idx].category = cat;
            
            // Suggest default hours based on the category
            let defaultHours = 8;
            if (cat === "Vapor-barrier tape installation") {
                defaultHours = 2; // less labor
            } else if (cat === "NB-1 primer application") {
                defaultHours = 2; // less labor
            } else if (cat === "NB-1 application") {
                defaultHours = 12; // more labor
            } else if (cat === "Vapor-barrier installation") {
                defaultHours = 8; // more labor
            }
            state.costing.labor.detailedLines[idx].hours = defaultHours;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.labor-line-desc').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.labor.detailedLines[idx].description = e.target.value;
        });
    });
    document.querySelectorAll('.labor-line-workers').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.labor.detailedLines[idx].workers = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.labor-line-hours').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.labor.detailedLines[idx].hours = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.labor-line-rate').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.labor.detailedLines[idx].rate = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });

    // Overhead and Pricing
    const inputOverheadPct = document.getElementById('input-overhead-pct');
    if (inputOverheadPct) {
        inputOverheadPct.addEventListener('change', (e) => {
            state.costing.settings.overhead = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const selectPricingMode = document.getElementById('select-pricing-mode');
    if (selectPricingMode) {
        selectPricingMode.addEventListener('change', (e) => {
            state.costing.settings.pricingMode = e.target.value;
            updateCostDataAndUI();
        });
    }
    const inputPricingRate = document.getElementById('input-pricing-rate');
    if (inputPricingRate) {
        inputPricingRate.addEventListener('change', (e) => {
            const mode = state.costing.settings.pricingMode;
            const val = parseFloat(e.target.value) || 0;
            if (mode === 'markup') {
                state.costing.settings.markup = Math.max(0, val);
            } else {
                state.costing.settings.targetGrossMargin = Math.min(99.9, Math.max(0, val));
            }
            updateCostDataAndUI();
        });
    }

    // Custom Cost Items Actions
    const btnAddCustomItem = document.getElementById('btn-add-custom-item');
    if (btnAddCustomItem) {
        btnAddCustomItem.addEventListener('click', () => {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.customItems.push({
                name: "Permit cost",
                category: "permit",
                qty: 1,
                unit: "ea",
                unitCost: 100,
                waste: 0,
                laborHours: 0,
                laborRate: 65,
                taxable: false,
                includeInOverhead: true,
                includeInMarkup: true
            });
            updateCostDataAndUI();
        });
    }

    // Edit custom rows
    document.querySelectorAll('.custom-item-name').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].name = e.target.value;
        });
    });
    document.querySelectorAll('.custom-item-cat').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].category = e.target.value;
        });
    });
    document.querySelectorAll('.custom-item-qty').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].qty = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-unit').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].unit = e.target.value;
        });
    });
    document.querySelectorAll('.custom-item-price').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].unitCost = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-waste').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].waste = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-lhours').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].laborHours = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-lrate').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].laborRate = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-taxable').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].taxable = e.target.checked;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-inc-oh').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].includeInOverhead = e.target.checked;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.custom-item-inc-mu').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-idx'));
            state.costing.customItems[idx].includeInMarkup = e.target.checked;
            updateCostDataAndUI();
        });
    });

    // Settings adjustments
    const setUseVB = document.getElementById('settings-use-vapor-barrier');
    if (setUseVB) {
        setUseVB.addEventListener('change', (e) => {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.settings.useVaporBarrier = e.target.checked;
            updateCostDataAndUI();
        });
    }

    const setTax = document.getElementById('settings-tax-rate');
    if (setTax) {
        setTax.addEventListener('change', (e) => {
            state.costing.settings.taxRate = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setWaste = document.getElementById('settings-waste-rate');
    if (setWaste) {
        setWaste.addEventListener('change', (e) => {
            state.costing.settings.generalWaste = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setWorkday = document.getElementById('settings-workday-hours');
    if (setWorkday) {
        setWorkday.addEventListener('change', (e) => {
            state.costing.settings.hoursPerWorkday = Math.max(1, parseInt(e.target.value) || 8);
            updateCostDataAndUI();
        });
    }
    const setTapeCov = document.getElementById('settings-tape-cov');
    if (setTapeCov) {
        setTapeCov.addEventListener('change', (e) => {
            state.costing.settings.tapeCoveragePerRoll = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setBenCov = document.getElementById('settings-benefect-cov');
    if (setBenCov) {
        setBenCov.addEventListener('change', (e) => {
            state.costing.settings.benefectSqFtPerGallon = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setRmrCov = document.getElementById('settings-rmr-cov');
    if (setRmrCov) {
        setRmrCov.addEventListener('change', (e) => {
            state.costing.settings.rmrSqFtPerGallon = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setNb1Cov = document.getElementById('settings-nb1-cov');
    if (setNb1Cov) {
        setNb1Cov.addEventListener('change', (e) => {
            state.costing.settings.nb1SqFtPerBag = Math.max(0.1, parseFloat(e.target.value) || 8);
            updateCostDataAndUI();
        });
    }
    const setLaborCostRate = document.getElementById('settings-labor-cost-rate');
    if (setLaborCostRate) {
        setLaborCostRate.addEventListener('change', (e) => {
            state.costing.settings.loadedLaborRate = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setMasksPack = document.getElementById('settings-masks-pack');
    if (setMasksPack) {
        setMasksPack.addEventListener('change', (e) => {
            state.costing.settings.masksPerPack = Math.max(0, parseInt(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }
    const setMasksMode = document.getElementById('settings-masks-mode');
    if (setMasksMode) {
        setMasksMode.addEventListener('change', (e) => {
            state.costing.settings.masksMode = e.target.value;
            updateCostDataAndUI();
        });
    }
    const setMasksWorker = document.getElementById('settings-masks-worker-day');
    if (setMasksWorker) {
        setMasksWorker.addEventListener('change', (e) => {
            state.costing.settings.masksPerWorkerPerDay = Math.max(0, parseFloat(e.target.value) || 0);
            updateCostDataAndUI();
        });
    }

    // Catalog inline editing
    document.querySelectorAll('.cat-item-name').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].name = e.target.value;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-price').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            const val = Math.max(0, parseFloat(e.target.value) || 0);
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].packagePrice = val;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-qty').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            const val = Math.max(0.001, parseFloat(e.target.value) || 1);
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].packageQuantity = val;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-punit').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].purchaseUnit = e.target.value;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-uunit').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].usageUnit = e.target.value;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-taxable').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].taxable = e.target.checked;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-active').forEach(chk => {
        chk.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].active = e.target.checked;
            updateCostDataAndUI();
        });
    });
    document.querySelectorAll('.cat-item-notes').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            if (!state.costing.catalogOverrides[id]) state.costing.catalogOverrides[id] = {};
            state.costing.catalogOverrides[id].notes = e.target.value;
        });
    });

    // Catalog Actions
    const btnResetAllCatalog = document.getElementById('btn-reset-catalog-all');
    if (btnResetAllCatalog) {
        btnResetAllCatalog.addEventListener('click', () => {
            if (confirm("Are you sure you want to reset all catalog items to default specifications and prices?")) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                state.costing.catalogOverrides = {};
                RoomFlowCatalog.resetToDefaults();
                updateCostDataAndUI();
                alert("Master catalog reset to defaults.");
            }
        });
    }

    const btnExportCat = document.getElementById('btn-export-catalog');
    if (btnExportCat) {
        btnExportCat.addEventListener('click', () => {
            const catalog = RoomFlowCatalog.loadCatalog();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(RoomFlowCatalog.exportJSON(catalog));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", "roomflow_catalog_export.json");
            dlAnchorElem.click();
        });
    }

    const btnImportCat = document.getElementById('btn-import-catalog');
    if (btnImportCat) {
        btnImportCat.addEventListener('click', () => {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = '.json';
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(evt) {
                    try {
                        const imported = RoomFlowCatalog.importJSON(evt.target.result);
                        // Save imported catalog overrides to project settings & global storage
                        if (typeof saveHistoryState === 'function') saveHistoryState();
                        RoomFlowCatalog.saveCatalog(imported);
                        
                        // Parse back into catalog overrides
                        const defaultMap = new Map(DEFAULT_CATALOG.map(i => [i.id, i]));
                        state.costing.catalogOverrides = {};
                        imported.forEach(item => {
                            const def = defaultMap.get(item.id);
                            if (def) {
                                state.costing.catalogOverrides[item.id] = {
                                    name: item.name,
                                    packagePrice: item.packagePrice,
                                    packageQuantity: item.packageQuantity,
                                    purchaseUnit: item.purchaseUnit,
                                    usageUnit: item.usageUnit,
                                    taxable: item.taxable,
                                    defaultWaste: item.defaultWaste,
                                    active: item.active,
                                    notes: item.notes
                                };
                            }
                        });
                        
                        updateCostDataAndUI();
                        alert("Catalog imported successfully!");
                    } catch (err) {
                        alert("Import failed: " + err.message);
                    }
                };
                reader.readAsText(file);
            });
            fileInput.click();
        });
    }

    // Run tests button
    const btnRunTests = document.getElementById('btn-run-cost-tests');
    if (btnRunTests) {
        btnRunTests.addEventListener('click', () => {
            if (window.runCostingTests) {
                window.runCostingTests();
            } else {
                alert("Cost tests script not loaded yet.");
            }
        });
    }

    // Costing actions: print internal costing, export customer friendly proposal
    const btnPrintInternal = document.getElementById('btn-print-internal-cost');
    if (btnPrintInternal) {
        btnPrintInternal.addEventListener('click', () => {
            if (typeof window.printInternalCostSheet === 'function') {
                window.printInternalCostSheet();
            }
        });
    }

    const btnCostProposal = document.getElementById('btn-cost-export-proposal');
    if (btnCostProposal) {
        btnCostProposal.addEventListener('click', () => {
            if (typeof window.printCustomerProposal === 'function') {
                window.printCustomerProposal();
            }
        });
    }
}

// Global triggers
window.updateCostDataAndUI = function() {
    // 1. Rerender costing UI
    renderCostUI();
    // 2. Rerender checklist UI
    renderChecklistUI();
    // 3. Refresh top-level stats
    if (typeof updateGlobalStats === 'function') {
        updateGlobalStats();
    }
};

window.resetOverride = function(id) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    delete state.costing.manualQuantityOverrides[id];
    updateCostDataAndUI();
};

window.resetCatalogItem = function(id) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    delete state.costing.catalogOverrides[id];
    // Write changes back to localStorage
    const defaults = RoomFlowCatalog.getDefaults();
    const catalog = RoomFlowCatalog.loadCatalog();
    const defItem = defaults.find(item => item.id === id);
    const catIdx = catalog.findIndex(item => item.id === id);
    if (defItem && catIdx !== -1) {
        catalog[catIdx] = defItem;
        RoomFlowCatalog.saveCatalog(catalog);
    }
    updateCostDataAndUI();
};

window.removeOptionalRental = function(idx) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.costing.rentals.optionalCharges.splice(idx, 1);
    updateCostDataAndUI();
};

window.removeDetailedLaborLine = function(idx) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.costing.labor.detailedLines.splice(idx, 1);
    updateCostDataAndUI();
};

window.removeCustomItem = function(idx) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.costing.customItems.splice(idx, 1);
    updateCostDataAndUI();
};

// Expose render function to global namespace
window.renderCostUI = renderCostUI;

// --- ESTIMATING CHECKLIST SYSTEM ---

window.addRoomFromChecklist = function(type) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const presetNames = {
        crawlspace: "Crawl Space",
        basement: "Basement Room",
        main: "Main Room",
        second: "2nd Floor Room",
        attic: "Attic Area"
    };
    const newRoom = {
        id: generateId(),
        levelId: type || 'basement',
        name: (presetNames[type] || 'Room') + ' ' + (state.rooms.length + 1),
        w: 12,
        l: 12,
        h: type === 'crawlspace' ? 4 : 8,
        color: '#1e293b',
        x: 0,
        y: 0,
        openings: [],
        foamBoard: false,
        foamBondPockets: false,
        carbonStraps: 0,
        carbonFiberScope: 'full',
        carbonFiberWalls: [],
        customCarbonStraps: [],
        floorPerimeterStrap: false,
        nb1Height: 'none',
        drywallHeight: 'none'
    };
    state.rooms.push(newRoom);
    updateCostDataAndUI();
    if (window.sync3D) window.sync3D();
};

window.removeRoomFromChecklist = function(roomId) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.rooms = state.rooms.filter(r => r.id !== roomId);
    updateCostDataAndUI();
    if (window.sync3D) window.sync3D();
};

window.removeSumpPumpFromChecklist = function(sumpId) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.sumpPumps = state.sumpPumps.filter(sp => sp.id !== sumpId);
    updateCostDataAndUI();
    if (window.sync3D) window.sync3D();
};

window.removeDehumidifierFromChecklist = function(dhId) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    state.dehumidifiers = state.dehumidifiers.filter(dh => dh.id !== dhId);
    updateCostDataAndUI();
    if (window.sync3D) window.sync3D();
};

window.setRoomJoists = function(roomId, dir) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const room = state.rooms.find(r => r.id === roomId);
    if (room) {
        room.joists = dir;
        updateCostDataAndUI();
    }
};

window.setRoomNb1Height = function(roomId, height) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const room = state.rooms.find(r => r.id === roomId);
    if (room) {
        room.nb1Height = height;
        updateCostDataAndUI();
    }
};

window.setRoomDrywallHeight = function(roomId, height) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const room = state.rooms.find(r => r.id === roomId);
    if (room) {
        room.drywallHeight = height;
        updateCostDataAndUI();
    }
};

window.setRoomWaterstop = function(roomId, ws) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
    if (!state.costing.treatmentSelections[roomId]) {
        state.costing.treatmentSelections[roomId] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
    }
    state.costing.treatmentSelections[roomId].waterstop = ws;
    updateCostDataAndUI();
};

window.setRoomEpoxy = function(roomId, ep) {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
    if (!state.costing.treatmentSelections[roomId]) {
        state.costing.treatmentSelections[roomId] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
    }
    state.costing.treatmentSelections[roomId].epoxy = ep;
    updateCostDataAndUI();
};

window.addSumpPumpFromChecklist = function() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const newPump = {
        id: generateId(),
        levelId: 'basement',
        name: `Sump Pump ${state.sumpPumps.length + 1}`,
        x: 0,
        y: 0
    };
    state.sumpPumps.push(newPump);
    updateCostDataAndUI();
    if (window.sync3D) window.sync3D();
};

window.addDehumidifierFromChecklist = function() {
    if (typeof saveHistoryState === 'function') saveHistoryState();
    const newDehum = {
        id: generateId(),
        levelId: 'basement',
        name: `Dehumidifier ${state.dehumidifiers.length + 1}`,
        x: 0,
        y: 0
    };
    state.dehumidifiers.push(newDehum);
    updateCostDataAndUI();
    if (window.sync3D) window.sync3D();
};

function bindChecklistEvents() {
    const container = document.getElementById('checklist-container');
    if (!container || container.dataset.listenersBound === 'true') return;
    
    container.addEventListener('change', (e) => {
        const target = e.target;
        
        // 1. Room Name Change
        if (target.classList.contains('room-checklist-name-input')) {
            const roomId = target.getAttribute('data-room-id');
            const room = state.rooms.find(r => r.id === roomId);
            if (room) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                room.name = target.value;
                updateCostDataAndUI();
            }
        }
        
        // 2. Room Level Change
        if (target.classList.contains('room-checklist-level-select')) {
            const roomId = target.getAttribute('data-room-id');
            const room = state.rooms.find(r => r.id === roomId);
            if (room) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                room.levelId = target.value;
                updateCostDataAndUI();
                if (window.sync3D) window.sync3D();
            }
        }
        
        // 3. Room Dimensions Change
        if (target.classList.contains('room-checklist-dim-input')) {
            const dim = target.getAttribute('data-dim');
            const roomId = target.getAttribute('data-room-id');
            const room = state.rooms.find(r => r.id === roomId);
            if (room) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                room[dim] = Math.max(1, parseFloat(target.value) || 1);
                updateCostDataAndUI();
                if (window.sync3D) window.sync3D();
            }
        }

        // 4. Room Carbon Fiber Straps Count
        if (target.classList.contains('room-checklist-carbon-count')) {
            const roomId = target.getAttribute('data-room-id');
            const room = state.rooms.find(r => r.id === roomId);
            if (room) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                room.carbonStraps = Math.max(0, parseInt(target.value) || 0);
                updateCostDataAndUI();
            }
        }

        // 5. Room Carbon Fiber Scope
        if (target.classList.contains('room-checklist-carbon-scope')) {
            const roomId = target.getAttribute('data-room-id');
            const room = state.rooms.find(r => r.id === roomId);
            if (room) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                room.carbonFiberScope = target.value;
                updateCostDataAndUI();
            }
        }

        // 6. Mold Area
        if (target.classList.contains('room-checklist-mold-area')) {
            const roomId = target.getAttribute('data-room-id');
            if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
            if (!state.costing.treatmentSelections[roomId]) {
                state.costing.treatmentSelections[roomId] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
            }
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.treatmentSelections[roomId].moldArea = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }

        // 7. Waterstop Custom Area
        if (target.classList.contains('room-checklist-waterstop-custom')) {
            const roomId = target.getAttribute('data-room-id');
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.treatmentSelections[roomId].waterstopCustomArea = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }

        // 8. Epoxy Custom Area
        if (target.classList.contains('room-checklist-epoxy-custom')) {
            const roomId = target.getAttribute('data-room-id');
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.treatmentSelections[roomId].epoxyCustomArea = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }

        // 9. Sump Pumps Count Override
        if (target.classList.contains('sump-checklist-pumps-count')) {
            const sumpId = target.getAttribute('data-sump-id');
            if (!state.costing.projectOverrides) state.costing.projectOverrides = {};
            if (!state.costing.projectOverrides[sumpId]) state.costing.projectOverrides[sumpId] = {};
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.projectOverrides[sumpId].pumps = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        
        // 10. Rentals Air Mover units/days
        if (target.id === 'rental-checklist-mover-units') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.airMoverUnits = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'rental-checklist-mover-days') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.airMoverDays = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        
        // 11. Rentals Air Scrubber units/days
        if (target.id === 'rental-checklist-scrubber-units') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.airScrubberUnits = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'rental-checklist-scrubber-days') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.airScrubberDays = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        
        // 12. Rentals Dehumidifier units/days
        if (target.id === 'rental-checklist-dehum-units') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.dehumidifierUnits = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'rental-checklist-dehum-days') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.rentals.dehumidifierDays = Math.max(0, parseInt(target.value) || 0);
            updateCostDataAndUI();
        }
        
        // 13. Settings margin/tax
        if (target.id === 'checklist-settings-margin') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.settings.targetGrossMargin = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'checklist-settings-tax') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.settings.salesTaxRate = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }
        
        // 14. Labor crew/days/hours/rate
        if (target.id === 'labor-checklist-crew') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.labor.projectCrewSize = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'labor-checklist-workdays') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.labor.projectWorkdays = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'labor-checklist-hours') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.labor.projectHoursPerDay = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }
        if (target.id === 'labor-checklist-rate') {
            if (typeof saveHistoryState === 'function') saveHistoryState();
            state.costing.labor.projectLaborRate = Math.max(0, parseFloat(target.value) || 0);
            updateCostDataAndUI();
        }
    });

    // Checkbox click delegation
    container.addEventListener('click', (e) => {
        const target = e.target;
        if (target.type === 'checkbox') {
            const roomId = target.getAttribute('data-room-id');
            const prop = target.getAttribute('data-prop');
            
            if (roomId && prop) {
                if (typeof saveHistoryState === 'function') saveHistoryState();
                const room = state.rooms.find(r => r.id === roomId);
                
                if (prop === 'spray_foam') {
                    room.joists = target.checked ? 'ns' : 'none';
                } else if (prop === 'carbon_fiber') {
                    room.carbonStraps = target.checked ? 4 : 0;
                } else if (prop === 'nb1') {
                    room.nb1Height = target.checked ? 'full' : 'none';
                } else if (prop === 'drywall') {
                    room.drywallHeight = target.checked ? '2ft' : 'none';
                } else if (prop === 'mold') {
                    if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
                    if (!state.costing.treatmentSelections[roomId]) {
                        state.costing.treatmentSelections[roomId] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
                    }
                    state.costing.treatmentSelections[roomId].moldArea = target.checked ? 100 : 0;
                } else if (prop === 'waterstop') {
                    if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
                    if (!state.costing.treatmentSelections[roomId]) {
                        state.costing.treatmentSelections[roomId] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
                    }
                    state.costing.treatmentSelections[roomId].waterstop = target.checked ? 'floor' : 'none';
                } else if (prop === 'epoxy') {
                    if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
                    if (!state.costing.treatmentSelections[roomId]) {
                        state.costing.treatmentSelections[roomId] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
                    }
                    state.costing.treatmentSelections[roomId].epoxy = target.checked ? 'entire' : 'none';
                } else {
                    room[prop] = target.checked;
                }
                updateCostDataAndUI();
                if (window.sync3D) window.sync3D();
            }
        }
    });

    container.dataset.listenersBound = 'true';
}

function renderChecklistUI() {
    const checklistContainer = document.getElementById('checklist-container');
    if (!checklistContainer) return;

    initDefaultCosting(state);
    const catalog = RoomFlowCatalog.loadCatalog();
    const report = calculateProjectCosts(state, catalog);

    // Build the grid
    let html = `
        <div class="cost-header-row" style="margin-bottom: 1.5rem;">
            <div class="cost-title-block">
                <h2><i data-lucide="check-square"></i> Estimating Checklist (Room-by-Room Setup)</h2>
                <div class="cost-disclaimer" style="margin-top: 0.25rem;">
                    <i data-lucide="info"></i> Configure dimensions, insulation, wall coatings, sumps, and treatments room-by-room. Everything updates instantly.
                </div>
            </div>
        </div>
        
        <div class="checklist-body-grid">
            <!-- Left Column: Checklist Forms -->
            <div class="checklist-main-column">
    `;

    // Rooms list
    if (state.rooms.length === 0) {
        html += `
            <div class="checklist-room-card" style="text-align: center; padding: 3rem 1.5rem; background: rgba(30, 41, 59, 0.2);">
                <i data-lucide="layout" style="width: 48px; height: 48px; color: #64748b; margin-bottom: 1rem; display:block; margin-left:auto; margin-right:auto;"></i>
                <h3 style="color: #cbd5e1; margin-bottom: 0.5rem;">No rooms added to the blueprint yet</h3>
                <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 1.5rem;">Add predefined rooms below to configure their dimensions and options directly.</p>
                <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
                    <button onclick="window.addRoomFromChecklist('basement')" class="btn-primary" style="padding:0.5rem 1rem;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem;"></i> + Basement Room</button>
                    <button onclick="window.addRoomFromChecklist('crawlspace')" class="btn-primary" style="padding:0.5rem 1rem;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem;"></i> + Crawl Space</button>
                    <button onclick="window.addRoomFromChecklist('attic')" class="btn-primary" style="padding:0.5rem 1rem;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem;"></i> + Attic Area</button>
                </div>
            </div>
        `;
    } else {
        // Loop over rooms
        state.rooms.forEach((room) => {
            if (!state.costing.treatmentSelections) state.costing.treatmentSelections = {};
            if (!state.costing.treatmentSelections[room.id]) {
                state.costing.treatmentSelections[room.id] = { waterstop: 'none', waterstopCustomArea: 0, epoxy: 'none', epoxyCustomArea: 0, moldArea: 0 };
            }
            const ts = state.costing.treatmentSelections[room.id];
            
            const hasSprayFoam = room.joists && room.joists !== 'none';
            const hasCarbonFiber = room.carbonStraps > 0;
            const hasNb1 = room.nb1Height && room.nb1Height !== 'none';
            const hasDrywall = room.drywallHeight && room.drywallHeight !== 'none';
            const hasMold = ts.moldArea > 0;
            const hasWaterstop = ts.waterstop && ts.waterstop !== 'none';
            const hasEpoxy = ts.epoxy && ts.epoxy !== 'none';

            html += `
                <div class="checklist-room-card" data-room-id="${room.id}">
                    <div class="checklist-room-header">
                        <div class="checklist-room-title">
                            <input type="text" class="room-checklist-name-input" data-room-id="${room.id}" value="${room.name}" style="background:transparent; border:none; border-bottom:1px dashed rgba(255,255,255,0.3); color:white; font-size:1.1rem; font-weight:bold; width:220px; padding:0 0 2px 0;">
                            <select class="room-checklist-level-select" data-room-id="${room.id}" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#cbd5e1; font-size:0.75rem; padding:0.2rem 0.5rem; cursor:pointer;">
                                ${state.levels.map(l => `<option value="${l.id}" ${room.levelId === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
                            </select>
                        </div>
                        <button onclick="window.removeRoomFromChecklist('${room.id}')" class="btn-table-action btn-table-delete" title="Delete Room" style="background:rgba(239, 68, 68, 0.1); border:none; border-radius:6px; padding:0.4rem; cursor:pointer; color:#ef4444; display:flex; align-items:center; justify-content:center;"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                    </div>
                    
                    <div class="checklist-grid-3col">
                        <div class="input-group">
                            <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.25rem; display:block;">Width (ft)</label>
                            <input type="number" class="room-checklist-dim-input" data-dim="w" data-room-id="${room.id}" value="${room.w}" min="1" step="0.5" style="width:100%; padding:0.4rem; border-radius:6px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white;">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.25rem; display:block;">Length (ft)</label>
                            <input type="number" class="room-checklist-dim-input" data-dim="l" data-room-id="${room.id}" value="${room.l}" min="1" step="0.5" style="width:100%; padding:0.4rem; border-radius:6px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white;">
                        </div>
                        <div class="input-group">
                            <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.25rem; display:block;">Height (ft)</label>
                            <input type="number" class="room-checklist-dim-input" data-dim="h" data-room-id="${room.id}" value="${room.h}" min="1" step="0.5" style="width:100%; padding:0.4rem; border-radius:6px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white;">
                        </div>
                    </div>

                    <div class="checklist-group">
                        <h5 style="margin:0 0 0.5rem 0; font-size:0.8rem; text-transform:uppercase; color:#3b82f6; letter-spacing:0.05em;">Basement & Crawlspace Scope</h5>
                        
                        <!-- Spray Foam -->
                        <div class="checklist-item-wrapper" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="spray_foam" data-room-id="${room.id}" ${hasSprayFoam ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Rim Joist Spray Foam</span>
                                    <span class="checklist-item-desc">Insulate the perimeter rim joist cavities.</span>
                                </div>
                            </label>
                            ${hasSprayFoam ? `
                                <div class="checklist-sub-options">
                                    <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.25rem;">Joist Direction:</div>
                                    <div class="checklist-pill-group">
                                        <span class="checklist-pill ${room.joists === 'ns' ? 'active' : ''}" onclick="window.setRoomJoists('${room.id}', 'ns')">North-South</span>
                                        <span class="checklist-pill ${room.joists === 'ew' ? 'active' : ''}" onclick="window.setRoomJoists('${room.id}', 'ew')">East-West</span>
                                    </div>
                                    <label class="checklist-item" style="padding:0.25rem 0; margin-top:0.4rem;">
                                        <input type="checkbox" class="room-checklist-sub-toggle" data-prop="foamBondPockets" data-room-id="${room.id}" ${room.foamBondPockets ? 'checked' : ''}>
                                        <div class="checklist-item-content">
                                            <span class="checklist-item-title" style="font-size:0.8rem; font-weight:normal;">Include Foam Bond Pockets</span>
                                        </div>
                                    </label>
                                </div>
                            ` : ''}
                        </div>

                        <!-- XPS Foam Board -->
                        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-sub-toggle" data-prop="foamBoard" data-room-id="${room.id}" ${room.foamBoard ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Wall Vapor Barrier (XPS Foam Board)</span>
                                    <span class="checklist-item-desc">Rigid foam board insulation sheets on foundation walls.</span>
                                </div>
                            </label>
                        </div>

                        <!-- Carbon Fiber Straps -->
                        <div class="checklist-item-wrapper" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="carbon_fiber" data-room-id="${room.id}" ${hasCarbonFiber ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Carbon Fiber Wall Straps</span>
                                    <span class="checklist-item-desc">Structural reinforcement straps for bowing foundation walls.</span>
                                </div>
                            </label>
                            ${hasCarbonFiber ? `
                                <div class="checklist-sub-options">
                                    <div style="display:flex; align-items:center; gap:0.75rem; font-size:0.8rem;">
                                        <span>Strap Count:</span>
                                        <input type="number" class="room-checklist-carbon-count" data-room-id="${room.id}" value="${room.carbonStraps}" min="1" step="1" style="width:60px; padding:0.25rem; border-radius:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                                    </div>
                                    <div style="margin-top:0.4rem; display:flex; align-items:center; gap:0.5rem; font-size:0.8rem;">
                                        <span>Scope:</span>
                                        <select class="room-checklist-carbon-scope" data-room-id="${room.id}" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); border-radius:4px; color:white; padding:0.25rem; font-size:0.75rem;">
                                            <option value="full" ${room.carbonFiberScope === 'full' ? 'selected' : ''}>Full Room Perimeter</option>
                                            <option value="crack" ${room.carbonFiberScope === 'crack' ? 'selected' : ''}>Specific Crack Area</option>
                                        </select>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Floor Perimeter Carbon Strap -->
                        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-sub-toggle" data-prop="floorPerimeterStrap" data-room-id="${room.id}" ${room.floorPerimeterStrap ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Floor Perimeter Carbon Fiber Strap</span>
                                    <span class="checklist-item-desc">Secure base of foundation walls.</span>
                                </div>
                            </label>
                        </div>

                        <!-- NB-1 Wall Coating -->
                        <div class="checklist-item-wrapper" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="nb1" data-room-id="${room.id}" ${hasNb1 ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">NB-1 Structural Wall Coating</span>
                                    <span class="checklist-item-desc">Apply NB-1 waterproof coating on walls.</span>
                                </div>
                            </label>
                            ${hasNb1 ? `
                                <div class="checklist-sub-options">
                                    <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.25rem;">Coating Height:</div>
                                    <div class="checklist-pill-group">
                                        <span class="checklist-pill ${room.nb1Height === '2ft' ? 'active' : ''}" onclick="window.setRoomNb1Height('${room.id}', '2ft')">2 Feet</span>
                                        <span class="checklist-pill ${room.nb1Height === '4ft' ? 'active' : ''}" onclick="window.setRoomNb1Height('${room.id}', '4ft')">4 Feet</span>
                                        <span class="checklist-pill ${room.nb1Height === 'full' ? 'active' : ''}" onclick="window.setRoomNb1Height('${room.id}', 'full')">Full Wall</span>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Drywall Cutting -->
                        <div class="checklist-item-wrapper">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="drywall" data-room-id="${room.id}" ${hasDrywall ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Drywall Cutting / Flood Cut</span>
                                    <span class="checklist-item-desc">Cut and remove damaged drywall at a set height.</span>
                                </div>
                            </label>
                            ${hasDrywall ? `
                                <div class="checklist-sub-options">
                                    <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.25rem;">Cut Height:</div>
                                    <div class="checklist-pill-group">
                                        <span class="checklist-pill ${room.drywallHeight === '1ft' ? 'active' : ''}" onclick="window.setRoomDrywallHeight('${room.id}', '1ft')">1 Foot</span>
                                        <span class="checklist-pill ${room.drywallHeight === '2ft' ? 'active' : ''}" onclick="window.setRoomDrywallHeight('${room.id}', '2ft')">2 Feet</span>
                                        <span class="checklist-pill ${room.drywallHeight === '4ft' ? 'active' : ''}" onclick="window.setRoomDrywallHeight('${room.id}', '4ft')">4 Feet</span>
                                        <span class="checklist-pill ${room.drywallHeight === '6ft' ? 'active' : ''}" onclick="window.setRoomDrywallHeight('${room.id}', '6ft')">6 Feet</span>
                                        <span class="checklist-pill ${room.drywallHeight === 'full' ? 'active' : ''}" onclick="window.setRoomDrywallHeight('${room.id}', 'full')">Full Wall</span>
                                    </div>
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="checklist-group">
                        <h5 style="margin:0 0 0.5rem 0; font-size:0.8rem; text-transform:uppercase; color:#10b981; letter-spacing:0.05em;">Attic Scope</h5>
                        
                        <!-- Remove Attic Insulation -->
                        <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-sub-toggle" data-prop="removeInsulation" data-room-id="${room.id}" ${room.removeInsulation ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Remove Attic Insulation</span>
                                    <span class="checklist-item-desc">Suck out and dispose of existing insulation material.</span>
                                </div>
                            </label>
                        </div>

                        <!-- Blow-in Attic Insulation -->
                        <label class="checklist-item">
                            <input type="checkbox" class="room-checklist-sub-toggle" data-prop="blowInInsulation" data-room-id="${room.id}" ${room.blowInInsulation ? 'checked' : ''}>
                            <div class="checklist-item-content">
                                <span class="checklist-item-title">Blow-in Attic Insulation</span>
                                <span class="checklist-item-desc">Blow new insulation back in.</span>
                            </div>
                        </label>
                    </div>

                    <div class="checklist-group">
                        <h5 style="margin:0 0 0.5rem 0; font-size:0.8rem; text-transform:uppercase; color:#8b5cf6; letter-spacing:0.05em;">Treatments & Chemical Scope</h5>

                        <!-- Mold Chemical Treatment -->
                        <div class="checklist-item-wrapper" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="mold" data-room-id="${room.id}" ${hasMold ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Mold Sanitization & Treatment</span>
                                    <span class="checklist-item-desc">Benefect and RMR mold stain remover spray treatment.</span>
                                </div>
                            </label>
                            ${hasMold ? `
                                <div class="checklist-sub-options">
                                    <div style="display:flex; align-items:center; gap:0.75rem; font-size:0.8rem;">
                                        <span>Treatment Area:</span>
                                        <input type="number" class="room-checklist-mold-area" data-room-id="${room.id}" value="${ts.moldArea}" min="1" step="1" style="width:80px; padding:0.25rem; border-radius:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                                        <span>sq ft</span>
                                    </div>
                                </div>
                            ` : ''}
                        </div>

                        <!-- Waterstop Treatment -->
                        <div class="checklist-item-wrapper" style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="waterstop" data-room-id="${room.id}" ${hasWaterstop ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Waterstop Sealant Application</span>
                                    <span class="checklist-item-desc">Apply waterstop vapor block sealant to floor or walls.</span>
                                </div>
                            </label>
                            ${hasWaterstop ? `
                                <div class="checklist-sub-options">
                                    <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.25rem;">Application Area:</div>
                                    <div class="checklist-pill-group">
                                        <span class="checklist-pill ${ts.waterstop === 'floor' ? 'active' : ''}" onclick="window.setRoomWaterstop('${room.id}', 'floor')">Floor Area</span>
                                        <span class="checklist-pill ${ts.waterstop === 'walls' ? 'active' : ''}" onclick="window.setRoomWaterstop('${room.id}', 'walls')">Wall Area</span>
                                        <span class="checklist-pill ${ts.waterstop === 'both' ? 'active' : ''}" onclick="window.setRoomWaterstop('${room.id}', 'both')">Both Floor & Walls</span>
                                        <span class="checklist-pill ${ts.waterstop === 'custom' ? 'active' : ''}" onclick="window.setRoomWaterstop('${room.id}', 'custom')">Custom Sq Ft</span>
                                    </div>
                                    ${ts.waterstop === 'custom' ? `
                                        <div style="display:flex; align-items:center; gap:0.75rem; font-size:0.8rem; margin-top:0.4rem;">
                                            <span>Custom Area:</span>
                                            <input type="number" class="room-checklist-waterstop-custom" data-room-id="${room.id}" value="${ts.waterstopCustomArea || 0}" min="0" step="1" style="width:80px; padding:0.25rem; border-radius:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                                            <span>sq ft</span>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>

                        <!-- Epoxy Floor Coating -->
                        <div class="checklist-item-wrapper">
                            <label class="checklist-item">
                                <input type="checkbox" class="room-checklist-toggle" data-prop="epoxy" data-room-id="${room.id}" ${hasEpoxy ? 'checked' : ''}>
                                <div class="checklist-item-content">
                                    <span class="checklist-item-title">Epoxy Floor Coating</span>
                                    <span class="checklist-item-desc">Apply epoxy coating to concrete floor.</span>
                                </div>
                            </label>
                            ${hasEpoxy ? `
                                <div class="checklist-sub-options">
                                    <div style="font-size:0.75rem; color:#cbd5e1; margin-bottom:0.25rem;">Application Area:</div>
                                    <div class="checklist-pill-group">
                                        <span class="checklist-pill ${ts.epoxy === 'entire' ? 'active' : ''}" onclick="window.setRoomEpoxy('${room.id}', 'entire')">Entire Floor</span>
                                        <span class="checklist-pill ${ts.epoxy === 'custom' ? 'active' : ''}" onclick="window.setRoomEpoxy('${room.id}', 'custom')">Custom Sq Ft</span>
                                    </div>
                                    ${ts.epoxy === 'custom' ? `
                                        <div style="display:flex; align-items:center; gap:0.75rem; font-size:0.8rem; margin-top:0.4rem;">
                                            <span>Custom Area:</span>
                                            <input type="number" class="room-checklist-epoxy-custom" data-room-id="${room.id}" value="${ts.epoxyCustomArea || 0}" min="0" step="1" style="width:80px; padding:0.25rem; border-radius:4px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                                            <span>sq ft</span>
                                        </div>
                                    ` : ''}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        });
    }

    // Hardware Card
    if (state.sumpPumps.length > 0 || state.dehumidifiers.length > 0) {
        html += `
            <div class="checklist-room-card" style="border-color: rgba(59, 130, 246, 0.3);">
                <div class="checklist-room-header" style="margin-bottom:0.5rem; border:none; padding:0;">
                    <h4 style="margin:0; font-size:1.1rem; color:#60a5fa;"><i data-lucide="shield" style="display:inline-block; vertical-align:middle; margin-right:0.5rem; width:18px; height:18px;"></i> Installed Hardware Details</h4>
                </div>
                <div style="display:flex; flex-direction:column; gap:0.75rem; margin-top:0.75rem;">
        `;
        
        state.sumpPumps.forEach(sp => {
            let pumpsCount = state.costing.settings.sumpPumpsPerBasin || 2;
            if (state.costing.projectOverrides && state.costing.projectOverrides[sp.id] && state.costing.projectOverrides[sp.id].pumps !== undefined) {
                pumpsCount = state.costing.projectOverrides[sp.id].pumps;
            }
            
            html += `
                <div class="checklist-group" style="border-left: 3px solid #3b82f6; margin:0; background:rgba(0,0,0,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                        <strong style="font-size:0.9rem; color:white;">Sump Basin: ${sp.name}</strong>
                        <button onclick="window.removeSumpPumpFromChecklist('${sp.id}')" class="btn-table-action btn-table-delete" style="background:none; border:none; color:#ef4444; padding:0.2rem 0.4rem; cursor:pointer;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.8rem;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span>Pumps installed in basin:</span>
                            <input type="number" class="sump-checklist-pumps-count" data-sump-id="${sp.id}" value="${pumpsCount}" min="0" max="4" style="width:50px; padding:0.15rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        </div>
                    </div>
                </div>
            `;
        });

        state.dehumidifiers.forEach(dh => {
            html += `
                <div class="checklist-group" style="border-left: 3px solid #10b981; margin:0; background:rgba(0,0,0,0.15);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                        <strong style="font-size:0.9rem; color:white;">Dehumidifier: ${dh.name}</strong>
                        <button onclick="window.removeDehumidifierFromChecklist('${dh.id}')" class="btn-table-action btn-table-delete" style="background:none; border:none; color:#ef4444; padding:0.2rem 0.4rem; cursor:pointer;"><i data-lucide="trash-2" style="width:14px; height:14px;"></i></button>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    // Rentals Card
    html += `
        <div class="checklist-room-card" style="border-color: rgba(167, 139, 250, 0.3);">
            <div class="checklist-room-header" style="margin-bottom:0.5rem; border:none; padding:0;">
                <h4 style="margin:0; font-size:1.1rem; color:#a78bfa;"><i data-lucide="clock" style="display:inline-block; vertical-align:middle; margin-right:0.5rem; width:18px; height:18px;"></i> Water Damage Equipment Rentals</h4>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.75rem; margin-top:0.75rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:0.5rem; font-size:0.85rem;">
                    <div>
                        <strong style="font-size:0.9rem; color:white;">Air Movers Rental</strong>
                        <div style="font-size:0.75rem; color:#94a3b8;">$38.00 per unit per day</div>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <input type="number" id="rental-checklist-mover-units" value="${state.costing.rentals.airMoverUnits || 0}" placeholder="Qty" min="0" style="width:55px; padding:0.25rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        <span style="font-size:0.75rem; color:#94a3b8;">x</span>
                        <input type="number" id="rental-checklist-mover-days" value="${state.costing.rentals.airMoverDays || 0}" placeholder="Days" min="0" style="width:55px; padding:0.25rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        <span style="font-size:0.75rem; color:#94a3b8;">days</span>
                    </div>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:0.5rem; font-size:0.85rem;">
                    <div>
                        <strong style="font-size:0.9rem; color:white;">Air Scrubbers Rental</strong>
                        <div style="font-size:0.75rem; color:#94a3b8;">$105.00 per unit per day</div>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <input type="number" id="rental-checklist-scrubber-units" value="${state.costing.rentals.airScrubberUnits || 0}" placeholder="Qty" min="0" style="width:55px; padding:0.25rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        <span style="font-size:0.75rem; color:#94a3b8;">x</span>
                        <input type="number" id="rental-checklist-scrubber-days" value="${state.costing.rentals.airScrubberDays || 0}" placeholder="Days" min="0" style="width:55px; padding:0.25rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        <span style="font-size:0.75rem; color:#94a3b8;">days</span>
                    </div>
                </div>
                
                <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                    <div>
                        <strong style="font-size:0.9rem; color:white;">LGR Dehumidifiers Rental</strong>
                        <div style="font-size:0.75rem; color:#94a3b8;">$76.00 per unit per day</div>
                    </div>
                    <div style="display:flex; gap:0.5rem; align-items:center;">
                        <input type="number" id="rental-checklist-dehum-units" value="${state.costing.rentals.dehumidifierUnits || 0}" placeholder="Qty" min="0" style="width:55px; padding:0.25rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        <span style="font-size:0.75rem; color:#94a3b8;">x</span>
                        <input type="number" id="rental-checklist-dehum-days" value="${state.costing.rentals.dehumidifierDays || 0}" placeholder="Days" min="0" style="width:55px; padding:0.25rem; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white; border-radius:4px; text-align:center;">
                        <span style="font-size:0.75rem; color:#94a3b8;">days</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Labor Card
    html += `
        <div class="checklist-room-card" style="border-color: rgba(245, 158, 11, 0.3);">
            <div class="checklist-room-header" style="margin-bottom:0.5rem; border:none; padding:0;">
                <h4 style="margin:0; font-size:1.1rem; color:#f59e0b;"><i data-lucide="users" style="display:inline-block; vertical-align:middle; margin-right:0.5rem; width:18px; height:18px;"></i> Project Labor Settings</h4>
            </div>
            <div style="display:flex; flex-direction:column; gap:0.75rem; margin-top:0.75rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                    <div class="input-group">
                        <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.15rem; display:block;">Crew Size</label>
                        <input type="number" id="labor-checklist-crew" value="${state.costing.labor.projectCrewSize}" min="0" style="width:100%; padding:0.35rem; border-radius:6px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                    </div>
                    <div class="input-group">
                        <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.15rem; display:block;">Workdays</label>
                        <input type="number" id="labor-checklist-workdays" value="${state.costing.labor.projectWorkdays}" min="0" style="width:100%; padding:0.35rem; border-radius:6px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.5rem;">
                    <div class="input-group">
                        <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.15rem; display:block;">Hours Per Day</label>
                        <input type="number" id="labor-checklist-hours" value="${state.costing.labor.projectHoursPerDay}" min="0" style="width:100%; padding:0.35rem; border-radius:6px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                    </div>
                    <div class="input-group">
                        <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.15rem; display:block;">Hourly Labor Rate ($)</label>
                        <input type="number" id="labor-checklist-rate" value="${state.costing.labor.projectLaborRate}" min="0" style="width:100%; padding:0.35rem; border-radius:6px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.1); color:white;">
                    </div>
                </div>
            </div>
        </div>
    `;

    // Sticky summary html builder
    const actualMargin = report.subtotals.actualMarginPercent;
    const isBelowTarget = actualMargin < state.costing.settings.targetGrossMargin;
    const marginBadgeColor = isBelowTarget ? '#ef4444' : '#10b981';

    let summaryHtml = `
        <div class="cost-sticky-column" style="position: sticky; top: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
            <!-- Bid Price Card -->
            <div class="checklist-room-card" style="border-color: rgba(59, 130, 246, 0.4); background: rgba(15, 23, 42, 0.65); padding: 1.25rem;">
                <h4 style="margin:0 0 0.5rem 0; font-size:0.75rem; text-transform:uppercase; color:#3b82f6; letter-spacing:0.05em;">Project Estimator Summary</h4>
                <div style="font-size: 2rem; font-weight: 800; color: white; line-height: 1.2;">
                    ${formatCurrency(report.subtotals.sellingPrice)}
                </div>
                <div style="font-size: 0.8rem; color: #94a3b8; margin-top: 0.25rem;">
                    COGS: ${formatCurrency(report.subtotals.direct)} 
                    <span style="color: ${marginBadgeColor}; font-weight: bold; margin-left: 0.5rem;">
                        ${actualMargin.toFixed(1)}% Margin
                    </span>
                </div>
                ${isBelowTarget ? `
                    <div style="margin-top: 0.5rem; font-size: 0.7rem; color: #f87171; display: flex; align-items: center; gap: 0.25rem;">
                        <i data-lucide="alert-triangle" style="width:12px; height:12px;"></i> Below target margin of ${state.costing.settings.targetGrossMargin}%
                    </div>
                ` : ''}
                
                <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;">
                    <button onclick="window.printCustomerProposal()" class="btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.6rem; cursor:pointer;">
                        <i data-lucide="printer" style="width:16px; height:16px;"></i> Customer Proposal
                    </button>
                    <button onclick="window.printInternalCostSheet()" class="btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.6rem; cursor:pointer;">
                        <i data-lucide="file-text" style="width:16px; height:16px;"></i> Print Cost Sheet
                    </button>
                </div>
            </div>

            <!-- Quick Add Room Card -->
            <div class="checklist-room-card" style="padding: 1rem;">
                <h4 style="margin:0 0 0.75rem 0; font-size:0.8rem; text-transform:uppercase; color:#a78bfa; letter-spacing:0.05em;">+ Add Room / Area</h4>
                <div style="display: grid; grid-template-columns: 1fr; gap: 0.5rem;">
                    <button onclick="window.addRoomFromChecklist('basement')" class="btn-secondary" style="padding:0.5rem; font-size:0.8rem; text-align:left; justify-content:flex-start; cursor:pointer;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem; display:inline-block; vertical-align:middle;"></i> Basement Room</button>
                    <button onclick="window.addRoomFromChecklist('crawlspace')" class="btn-secondary" style="padding:0.5rem; font-size:0.8rem; text-align:left; justify-content:flex-start; cursor:pointer;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem; display:inline-block; vertical-align:middle;"></i> Crawl Space</button>
                    <button onclick="window.addRoomFromChecklist('attic')" class="btn-secondary" style="padding:0.5rem; font-size:0.8rem; text-align:left; justify-content:flex-start; cursor:pointer;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem; display:inline-block; vertical-align:middle;"></i> Attic Area</button>
                    <button onclick="window.addRoomFromChecklist('main')" class="btn-secondary" style="padding:0.5rem; font-size:0.8rem; text-align:left; justify-content:flex-start; cursor:pointer;"><i data-lucide="plus" style="width:14px; height:14px; margin-right:0.25rem; display:inline-block; vertical-align:middle;"></i> Main Floor Room</button>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-top:0.75rem; border-top:1px solid rgba(255,255,255,0.08); padding-top:0.75rem;">
                    <button onclick="window.addSumpPumpFromChecklist()" class="btn-secondary" style="padding:0.4rem; font-size:0.75rem; justify-content:center; cursor:pointer;"><i data-lucide="shield" style="width:12px; height:12px; margin-right:0.25rem; display:inline-block; vertical-align:middle;"></i> + Sump</button>
                    <button onclick="window.addDehumidifierFromChecklist()" class="btn-secondary" style="padding:0.4rem; font-size:0.75rem; justify-content:center; cursor:pointer;"><i data-lucide="droplet" style="width:12px; height:12px; margin-right:0.25rem; display:inline-block; vertical-align:middle;"></i> + Dehum</button>
                </div>
            </div>
            
            <!-- Quick Settings Card -->
            <div class="checklist-room-card" style="padding: 1rem;">
                <h4 style="margin:0 0 0.75rem 0; font-size:0.8rem; text-transform:uppercase; color:#94a3b8; letter-spacing:0.05em;">Estimating Controls</h4>
                <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <div class="input-group">
                        <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.15rem; display:block;">Target Gross Margin (%)</label>
                        <input type="number" id="checklist-settings-margin" value="${state.costing.settings.targetGrossMargin}" min="0" max="90" style="width:100%; padding:0.35rem; border-radius:6px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                    </div>
                    <div class="input-group">
                        <label style="font-size:0.75rem; color:#94a3b8; margin-bottom:0.15rem; display:block;">Sales Tax Rate (%)</label>
                        <input type="number" id="checklist-settings-tax" value="${state.costing.settings.salesTaxRate}" min="0" max="15" style="width:100%; padding:0.35rem; border-radius:6px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:white;">
                    </div>
                </div>
            </div>
        </div>
    `;

    html += `
            </div>
            <!-- Right Sticky Column: Summary & Pricing -->
            ${summaryHtml}
        </div>
    `;

    checklistContainer.innerHTML = html;
    
    // Bind listeners
    bindChecklistEvents();

    // Rerender icons
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

// Expose render function to global namespace
window.renderChecklistUI = renderChecklistUI;

// Auto-render if this is the active startup view
if (typeof state !== 'undefined' && state.activeView === 'checklist') {
    renderChecklistUI();
} else if (typeof state !== 'undefined' && state.activeView === 'cost') {
    renderCostUI();
}

