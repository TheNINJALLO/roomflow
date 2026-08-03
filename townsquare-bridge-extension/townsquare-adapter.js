(function (root) {
  'use strict';
  if (root.RoomFlowTownsquarePageAdapter) return;
  const Core = root.RoomFlowBridgeCore;

  const FIELD_DEFINITIONS = Object.freeze({
    customerSearch: ['customer search', 'search customers', 'search clients', 'find customer'],
    customerSearchSubmit: ['search', 'find customer', 'find client'],
    customerResult: ['customer result', 'client result'],
    createCustomerButton: ['create customer', 'new customer', 'add customer', 'create client', 'new client'],
    customerFirstName: ['first name'], customerLastName: ['last name'], customerCompanyName: ['company name', 'business name'],
    customerEmail: ['email', 'email address'], customerPhone: ['phone', 'phone number', 'mobile phone'],
    customerBillingAddress: ['billing address', 'customer address', 'address'], customerSaveButton: ['save customer', 'save client', 'create customer', 'create client'],
    propertySearch: ['property search', 'search properties', 'service location search'], propertySearchSubmit: ['find property', 'search properties'],
    propertyResult: ['property result', 'service location result'], createPropertyButton: ['create property', 'new property', 'add property', 'new service location'],
    propertyName: ['property name', 'service location name'], propertyStreetAddress: ['service address', 'street address', 'property address'],
    propertyCity: ['city'], propertyState: ['state', 'province'], propertyPostalCode: ['postal code', 'zip code', 'zip'],
    propertyAccessNotes: ['access notes', 'property notes'], propertySaveButton: ['save property', 'create property', 'save service location'],
    estimateSearch: ['estimate search', 'search estimates'], estimateResult: ['estimate result'], createEstimateButton: ['create estimate', 'new estimate', 'add estimate'],
    estimateTitle: ['estimate title', 'title'], estimateNumber: ['estimate number', 'reference'], estimateJobNumber: ['job number', 'purchase order'],
    estimateDescription: ['scope of work', 'estimate description', 'description'], lineItemRows: ['line items', 'estimate items'],
    addLineItemButton: ['add line item', 'add item', 'new item'], deleteLineItemButton: ['delete line item', 'remove item'],
    lineItemDescription: ['line item description', 'item description'], lineItemName: ['line item name', 'item name'],
    lineItemQuantity: ['quantity', 'qty'], lineItemUnit: ['unit'], lineItemUnitPrice: ['unit price', 'price', 'rate'], lineItemTaxable: ['taxable'],
    taxSetting: ['tax', 'tax rate'], discount: ['discount'], customerNotes: ['customer notes', 'note'], internalNotes: ['internal notes'],
    terms: ['terms and conditions', 'terms'], deposit: ['deposit', 'deposit request'], expirationDate: ['expiration date', 'due date'],
    attachmentUpload: ['attachment', 'upload document', 'upload file'], grandTotal: ['grand total', 'estimate total', 'total'],
    estimateStatus: ['estimate status', 'status'], validationError: ['validation error', 'error message'],
    saveDraftButton: ['save draft', 'save as draft'], estimateDetail: ['estimate detail', 'estimate review'], successIndicator: ['draft saved', 'estimate saved']
  });

  const REQUIRED_MAPPING_KEYS = Object.freeze([
    'customerSearch', 'customerResult', 'createCustomerButton', 'customerFirstName', 'customerLastName', 'customerEmail', 'customerPhone', 'customerBillingAddress', 'customerSaveButton',
    'propertySearch', 'propertyResult', 'createPropertyButton', 'propertyName', 'propertyStreetAddress', 'propertyCity', 'propertyState', 'propertyPostalCode', 'propertySaveButton',
    'createEstimateButton', 'estimateTitle', 'estimateNumber', 'estimateDescription', 'lineItemRows', 'deleteLineItemButton', 'addLineItemButton', 'lineItemName', 'lineItemDescription', 'lineItemQuantity', 'lineItemUnitPrice',
    'taxSetting', 'discount', 'customerNotes', 'internalNotes', 'terms', 'deposit', 'expirationDate', 'grandTotal', 'estimateStatus', 'saveDraftButton', 'estimateDetail'
  ]);
  const REPEATED_LINE_KEYS = new Set(['lineItemRows', 'deleteLineItemButton', 'lineItemName', 'lineItemDescription', 'lineItemQuantity', 'lineItemUnit', 'lineItemUnitPrice', 'lineItemTaxable']);

  function normalized(value) {
    return Core.cleanText(value, 1000).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function visible(element) {
    if (!element || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
    const style = element.ownerDocument?.defaultView?.getComputedStyle(element) || getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function candidateText(element) {
    return [element.textContent, element.getAttribute('aria-label'), element.getAttribute('placeholder'), element.getAttribute('name'), element.getAttribute('title'), element.id]
      .filter(Boolean).join(' ');
  }

  function cssEscape(value) {
    if (root.CSS?.escape) return root.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`);
  }

  class ControlLocator {
    constructor(documentRef = document, mappings = {}) {
      this.document = documentRef;
      this.mappings = mappings || {};
    }

    queryMapped(key, all = false) {
      const selector = this.mappings[key];
      if (!selector) return all ? [] : null;
      try {
        const matches = [...this.document.querySelectorAll(selector)].filter(visible);
        return all ? matches : matches[0] || null;
      } catch { return all ? [] : null; }
    }

    automaticCandidates(key) {
      const terms = FIELD_DEFINITIONS[key] || [key];
      const controls = [...this.document.querySelectorAll('input,textarea,select,button,a,[role="button"],[role="row"],[role="option"],[data-testid],[data-test]')].filter(visible);
      const results = [];
      for (const control of controls) {
        const text = normalized(candidateText(control));
        const label = control.id ? this.document.querySelector(`label[for="${cssEscape(control.id)}"]`) : null;
        const combined = `${normalized(label?.textContent)} ${text}`.trim();
        const score = terms.reduce((best, term) => {
          const expected = normalized(term);
          if (!expected) return best;
          if (combined === expected) return Math.max(best, 100);
          if (combined.includes(expected)) return Math.max(best, 70 + expected.length);
          return best;
        }, 0);
        if (score) results.push({ control, score });
      }
      return results.sort((a, b) => b.score - a.score).map(item => item.control);
    }

    find(key, { required = true } = {}) {
      const element = this.queryMapped(key) || this.automaticCandidates(key)[0] || null;
      if (!element && required) {
        const error = new Error(`Required Townsquare control not found: ${key}. Open guided mapping and identify this control.`);
        error.code = 'CONTROL_NOT_FOUND';
        error.control = key;
        throw error;
      }
      return element;
    }

    all(key) {
      const mapped = this.queryMapped(key, true);
      return mapped.length ? mapped : this.automaticCandidates(key);
    }
  }

  function dispatchValue(element, value) {
    if (!element) return;
    const text = value === null || value === undefined ? '' : String(value);
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function moneyFromMinor(value) {
    return (Number(value) / 100).toFixed(2);
  }

  function parseMoney(value) {
    return Core.toMinor(Core.cleanText(value, 100).replace(/[^0-9.,-]/g, ''));
  }

  function extractEntityId(element = null) {
    const direct = Core.cleanText(element?.getAttribute?.('data-id') || element?.getAttribute?.('data-uid'), 300);
    if (/^[a-zA-Z0-9_-]{6,}$/.test(direct)) return direct;
    const sources = [element?.getAttribute?.('href'), root.location?.href].filter(Boolean);
    for (const source of sources) {
      try {
        const url = new URL(source, root.location?.href);
        for (const key of ['id', 'uid', 'client_id', 'property_id', 'estimate_id']) {
          const value = Core.cleanText(url.searchParams.get(key), 300);
          if (/^[a-zA-Z0-9_-]{6,}$/.test(value)) return value;
        }
        const segment = url.pathname.split('/').filter(Boolean).reverse().find(value => /^[a-zA-Z0-9_-]{8,}$/.test(value) && /\d/.test(value));
        if (segment) return segment;
      } catch { /* ignore non-URL sources */ }
    }
    return '';
  }

  function buildStableSelector(element, key = '') {
    if (!element) return '';
    const attributes = REPEATED_LINE_KEYS.has(key)
      ? ['data-testid', 'data-test', 'name', 'aria-label', 'placeholder']
      : ['id', 'data-testid', 'data-test', 'name', 'aria-label', 'placeholder'];
    for (const attribute of attributes) {
      if (attribute === 'id' && element.id) return `#${cssEscape(element.id)}`;
      const value = element.getAttribute(attribute);
      if (value) return `${element.tagName.toLowerCase()}[${attribute}="${String(value).replaceAll('"', '\\"')}"]`;
    }
    const stableClasses = [...element.classList].filter(name => /^[a-z_-][a-z0-9_-]*$/i.test(name) && !/^(css|sc|jsx)-|\d{3,}/i.test(name)).slice(0, 2);
    if (stableClasses.length) return `${element.tagName.toLowerCase()}.${stableClasses.map(cssEscape).join('.')}`;
    return element.tagName.toLowerCase();
  }

  class TownsquarePageAdapter {
    constructor(documentRef = document, mappings = {}, workflowSettings = {}) {
      this.document = documentRef;
      this.locator = new ControlLocator(documentRef, mappings);
      this.settings = workflowSettings || {};
    }

    async wait(ms = 500) { await new Promise(resolve => setTimeout(resolve, ms)); }

    ensureLoggedIn() {
      const password = [...this.document.querySelectorAll('input[type="password"]')].find(visible);
      const loginText = normalized(this.document.body?.textContent).includes('sign in') || normalized(this.document.body?.textContent).includes('log in');
      if (password && loginText) throw Object.assign(new Error('Townsquare is logged out. Sign in, then retry the RoomFlow sync.'), { code: 'TOWNSQUARE_LOGGED_OUT' });
    }

    validationError() {
      const element = this.locator.find('validationError', { required: false });
      return element && visible(element) ? Core.cleanText(element.textContent, 500) : '';
    }

    async safeClick(key, required = true) {
      const element = this.locator.find(key, { required });
      if (!element) return null;
      Core.assertDraftSafeElement(element);
      element.click();
      await this.wait(Number(this.settings.actionDelayMs || 450));
      const error = this.validationError();
      if (error) throw Object.assign(new Error(`Townsquare validation error: ${error}`), { code: 'TOWNSQUARE_VALIDATION_ERROR' });
      return element;
    }

    fill(key, value, required = true) {
      const element = this.locator.find(key, { required });
      if (element) dispatchValue(element, value);
      return element;
    }

    fillLineItem(key, value, rowIndex, required = true) {
      const controls = this.locator.all(key);
      const element = controls[rowIndex] || controls.at(-1) || null;
      if (!element && required) {
        throw Object.assign(new Error(`Required Townsquare line-item control not found: ${key}.`), { code: 'CONTROL_NOT_FOUND', control: key });
      }
      if (element) dispatchValue(element, value);
      return element;
    }

    candidateMatches(element, values) {
      const text = normalized(candidateText(element));
      return values.filter(Boolean).some(value => text.includes(normalized(value)));
    }

    matchCustomerRows(rows, customer, externalId = '') {
      const candidates = Array.isArray(rows) ? rows : [];
      if (externalId) return { method: 'external_id', matches: candidates.filter(element => this.candidateMatches(element, [externalId])) };
      const email = normalized(customer.email);
      const phone = String(customer.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
      const address = normalized(customer.billingAddress);
      const name = normalized(`${customer.firstName || ''} ${customer.lastName || ''}`);
      const strategies = [
        ['email', element => email && normalized(candidateText(element)).includes(email)],
        ['phone', element => phone && candidateText(element).replace(/\D/g, '').includes(phone)],
        ['service_address', element => address && normalized(candidateText(element)).includes(address)],
        ['name_and_address', element => {
          const text = normalized(candidateText(element));
          return name && address && text.includes(name) && text.includes(address);
        }]
      ];
      for (const [method, matches] of strategies.map(([method, predicate]) => [method, candidates.filter(predicate)])) {
        if (matches.length) return { method, matches };
      }
      return { method: 'none', matches: [] };
    }

    matchPropertyRows(rows, property, externalId = '') {
      const candidates = Array.isArray(rows) ? rows : [];
      if (externalId) return { method: 'external_id', matches: candidates.filter(element => this.candidateMatches(element, [externalId])) };
      const strategies = [property.fullAddress, property.streetAddress, property.name].filter(Boolean);
      for (const value of strategies) {
        const matches = candidates.filter(element => this.candidateMatches(element, [value]));
        if (matches.length) return { method: value === property.name ? 'property_name' : 'service_address', matches };
      }
      return { method: 'none', matches: [] };
    }

    async chooseCandidate(kind, matches) {
      if (matches.length === 1) return matches[0];
      if (!matches.length) return null;
      return new Promise((resolve, reject) => {
        const overlay = this.document.createElement('div');
        overlay.id = 'roomflow-townsquare-choice';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(2,6,23,.86);z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:20px;font:14px system-ui;color:#fff;';
        const panel = this.document.createElement('div');
        panel.style.cssText = 'width:min(560px,100%);max-height:80vh;overflow:auto;background:#111827;border:1px solid #334155;border-radius:14px;padding:20px;';
        panel.innerHTML = `<h2 style="margin-top:0">Choose the correct ${kind}</h2><p>RoomFlow found multiple exact matches. Select one; records will not be merged.</p>`;
        matches.forEach((match, index) => {
          const button = this.document.createElement('button');
          button.type = 'button';
          button.textContent = Core.cleanText(match.textContent, 240) || `${kind} ${index + 1}`;
          button.style.cssText = 'display:block;width:100%;text-align:left;margin:8px 0;padding:12px;background:#1e293b;color:#fff;border:1px solid #475569;border-radius:8px;';
          button.addEventListener('click', () => { overlay.remove(); resolve(match); });
          panel.appendChild(button);
        });
        const cancel = this.document.createElement('button');
        cancel.textContent = 'Cancel synchronization';
        cancel.style.cssText = 'margin-top:10px;padding:10px;background:#7f1d1d;color:#fff;border:0;border-radius:8px;';
        cancel.addEventListener('click', () => { overlay.remove(); reject(Object.assign(new Error('The user cancelled customer/property selection.'), { code: 'USER_CANCELLED' })); });
        panel.appendChild(cancel);
        overlay.appendChild(panel);
        this.document.body.appendChild(overlay);
      });
    }

    async findOrCreateCustomer(customer, externalMappings, progress) {
      progress('finding_customer', 'Matching the Townsquare customer');
      const search = this.locator.find('customerSearch');
      dispatchValue(search, externalMappings?.customerId || customer.email || customer.phone || `${customer.firstName} ${customer.lastName}`);
      await this.safeClick('customerSearchSubmit', false);
      await this.wait();
      const match = this.matchCustomerRows(this.locator.all('customerResult'), customer, externalMappings?.customerId);
      if (externalMappings?.customerId && !match.matches.length) {
        throw Object.assign(new Error('The mapped Townsquare customer could not be found. Sync stopped to prevent a duplicate.'), { code: 'MAPPED_CUSTOMER_NOT_FOUND' });
      }
      const selected = await this.chooseCandidate('customer', match.matches);
      if (selected) {
        selected.click();
        await this.wait();
        const id = extractEntityId(selected) || extractEntityId();
        if (!id) throw Object.assign(new Error('The matched Townsquare customer ID could not be confirmed. Sync stopped before creating a property or estimate.'), { code: 'CUSTOMER_ID_NOT_CONFIRMED' });
        progress('customer_matched', 'Existing Townsquare customer selected');
        return { id, action: 'matched', matchMethod: match.method, url: location.href };
      }
      await this.safeClick('createCustomerButton');
      this.fill('customerFirstName', customer.firstName);
      this.fill('customerLastName', customer.lastName, false);
      this.fill('customerCompanyName', customer.companyName, false);
      this.fill('customerEmail', customer.email, false);
      this.fill('customerPhone', customer.phone, false);
      this.fill('customerBillingAddress', customer.billingAddress, false);
      const save = await this.safeClick('customerSaveButton');
      const id = extractEntityId(save) || extractEntityId();
      if (!id) throw Object.assign(new Error('Townsquare did not expose the saved customer ID. Map the customer result/detail control and retry.'), { code: 'CUSTOMER_ID_NOT_CONFIRMED' });
      progress('customer_created', 'Townsquare customer created');
      return { id, action: 'created', url: location.href };
    }

    async findOrCreateProperty(property, externalMappings, progress) {
      progress('finding_property', 'Matching the Townsquare service property');
      const search = this.locator.find('propertySearch');
      dispatchValue(search, externalMappings?.propertyId || property.fullAddress);
      await this.safeClick('propertySearchSubmit', false);
      await this.wait();
      const match = this.matchPropertyRows(this.locator.all('propertyResult'), property, externalMappings?.propertyId);
      if (externalMappings?.propertyId && !match.matches.length) {
        throw Object.assign(new Error('The mapped Townsquare property could not be found. Sync stopped to prevent a duplicate.'), { code: 'MAPPED_PROPERTY_NOT_FOUND' });
      }
      const selected = await this.chooseCandidate('property', match.matches);
      if (selected) {
        selected.click();
        await this.wait();
        const id = extractEntityId(selected) || extractEntityId();
        if (!id) throw Object.assign(new Error('The matched Townsquare property ID could not be confirmed. Sync stopped before creating an estimate.'), { code: 'PROPERTY_ID_NOT_CONFIRMED' });
        progress('property_matched', 'Existing Townsquare property selected');
        return { id, action: 'matched', matchMethod: match.method, url: location.href };
      }
      await this.safeClick('createPropertyButton');
      this.fill('propertyName', property.name);
      this.fill('propertyStreetAddress', property.streetAddress);
      this.fill('propertyCity', property.city);
      this.fill('propertyState', property.state);
      this.fill('propertyPostalCode', property.postalCode);
      this.fill('propertyAccessNotes', property.accessNotes, false);
      const save = await this.safeClick('propertySaveButton');
      const id = extractEntityId(save) || extractEntityId();
      if (!id) throw Object.assign(new Error('Townsquare did not expose the saved property ID. Map the property detail control and retry.'), { code: 'PROPERTY_ID_NOT_CONFIRMED' });
      progress('property_created', 'Townsquare property created');
      return { id, action: 'created', url: location.href };
    }

    async openOrCreateDraft(estimate, externalMappings, progress) {
      let action = 'created';
      if (externalMappings?.estimateId) {
        const search = this.locator.find('estimateSearch', { required: false });
        if (!search) throw Object.assign(new Error('An existing Townsquare draft is mapped, but the estimate search control is not mapped. Sync stopped to prevent a duplicate.'), { code: 'ESTIMATE_SEARCH_REQUIRED' });
        dispatchValue(search, externalMappings.estimateId || estimate.estimateNumber);
        await this.wait();
        const result = this.locator.all('estimateResult').find(element => this.candidateMatches(element, [externalMappings.estimateId]));
        if (!result) throw Object.assign(new Error('The mapped Townsquare draft could not be found. Sync stopped to prevent a duplicate.'), { code: 'MAPPED_ESTIMATE_NOT_FOUND' });
        result.click();
        await this.wait();
        const status = normalized(this.locator.find('estimateStatus')?.textContent);
        if (status !== 'draft' && !status.includes('draft')) throw Object.assign(new Error(`The mapped estimate is ${status || 'not confirmed as draft'} and will not be overwritten.`), { code: 'FINALIZED_ESTIMATE_BLOCKED' });
        const rows = this.locator.all('lineItemRows');
        if (!rows.length) throw Object.assign(new Error('Existing Townsquare line rows are not mapped. Sync stopped to prevent duplicate items.'), { code: 'LINE_ITEM_ROWS_REQUIRED' });
        const deleteButtons = this.locator.all('deleteLineItemButton');
        if (deleteButtons.length < rows.length) throw Object.assign(new Error('Existing line items cannot be safely cleared. Map the remove-line control before updating this draft.'), { code: 'LINE_RESET_REQUIRED' });
        for (const button of deleteButtons) { Core.assertDraftSafeElement(button); button.click(); await this.wait(100); }
        action = 'updated';
        progress('updating_estimate', 'Updating the mapped Townsquare draft');
      } else {
        await this.safeClick('createEstimateButton');
        progress('creating_estimate', 'Creating the Townsquare draft');
      }

      this.fill('estimateTitle', estimate.title);
      this.fill('estimateNumber', estimate.estimateNumber, false);
      this.fill('estimateJobNumber', estimate.jobNumber, false);
      this.fill('estimateDescription', estimate.scopeOfWork, false);
      this.fill('taxSetting', estimate.taxRate, estimate.taxRate > 0);
      this.fill('discount', moneyFromMinor(estimate.discountMinor), false);
      this.fill('customerNotes', estimate.customerNotes, false);
      this.fill('internalNotes', estimate.internalNotes, false);
      this.fill('terms', estimate.terms, false);
      this.fill('deposit', moneyFromMinor(estimate.depositRequestMinor), false);
      this.fill('expirationDate', estimate.expirationDate, false);

      let priorLineControlCount = this.locator.all('lineItemName').length;
      for (const [lineIndex, line] of estimate.lines.entries()) {
        await this.safeClick('addLineItemButton');
        const currentLineControlCount = this.locator.all('lineItemName').length;
        if (lineIndex > 0 && currentLineControlCount <= priorLineControlCount) {
          throw Object.assign(new Error('Townsquare did not create another line-item row. Sync stopped before saving an incomplete draft.'), { code: 'LINE_ITEM_ROW_NOT_CREATED' });
        }
        const rowIndex = Math.max(0, currentLineControlCount - 1);
        this.fillLineItem('lineItemName', line.name, rowIndex);
        this.fillLineItem('lineItemDescription', line.description, rowIndex, false);
        this.fillLineItem('lineItemQuantity', line.quantity, rowIndex);
        this.fillLineItem('lineItemUnit', line.unit, rowIndex, false);
        this.fillLineItem('lineItemUnitPrice', moneyFromMinor(line.unitPriceMinor), rowIndex);
        this.fillLineItem('lineItemTaxable', line.taxable, rowIndex, false);
        priorLineControlCount = currentLineControlCount;
      }
      await this.wait();
      const totalElement = this.locator.find('grandTotal');
      const providerTotalMinor = parseMoney(totalElement.value || totalElement.textContent);
      if (providerTotalMinor !== estimate.grandTotalMinor) {
        throw Object.assign(new Error(`Totals do not match. RoomFlow: ${moneyFromMinor(estimate.grandTotalMinor)}; Townsquare: ${moneyFromMinor(providerTotalMinor)}.`), { code: 'TOTAL_MISMATCH', providerTotalMinor });
      }
      const save = this.locator.find('saveDraftButton');
      Core.assertDraftSafeElement(save);
      if (!normalized(Core.elementActionText(save)).includes('draft')) throw Object.assign(new Error('The mapped save control is not explicitly a draft action.'), { code: 'SAVE_DRAFT_NOT_CONFIRMED' });
      save.click();
      await this.wait(Number(this.settings.saveDelayMs || 900));
      const validation = this.validationError();
      if (validation) throw Object.assign(new Error(`Townsquare validation error: ${validation}`), { code: 'TOWNSQUARE_VALIDATION_ERROR' });
      const statusElement = this.locator.find('estimateStatus');
      const status = normalized(statusElement.textContent || statusElement.value).toUpperCase();
      const detail = this.locator.find('estimateDetail', { required: false }) || this.locator.find('successIndicator', { required: false });
      if (!status.includes('DRAFT') || !detail) throw Object.assign(new Error('Townsquare did not confirm that a draft exists. No success was recorded.'), { code: 'DRAFT_NOT_CONFIRMED' });
      const id = extractEntityId(detail) || extractEntityId(save) || extractEntityId();
      if (!id) throw Object.assign(new Error('The Townsquare draft exists, but its ID could not be confirmed. Map the estimate detail control.'), { code: 'ESTIMATE_ID_NOT_CONFIRMED' });
      progress('draft_created', 'Townsquare confirmed the draft');
      return { id, status: 'DRAFT', action, totalMinor: providerTotalMinor, url: location.href };
    }

    async attachDocuments(attachments, progress) {
      const summary = { completed: 0, skipped: 0, failed: 0 };
      if (!attachments?.length) return summary;
      const input = this.locator.find('attachmentUpload', { required: false });
      if (!input || input.type !== 'file') {
        summary.skipped = attachments.length;
        return summary;
      }
      progress('attaching_documents', 'Attaching selected RoomFlow documents');
      for (const attachment of attachments) {
        try {
          const response = await fetch(attachment.url, { credentials: 'omit' });
          if (!response.ok) throw new Error(`Attachment returned ${response.status}.`);
          const blob = await response.blob();
          const file = new File([blob], attachment.name, { type: attachment.mimeType || blob.type });
          const transfer = new DataTransfer();
          transfer.items.add(file);
          input.files = transfer.files;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          await this.wait();
          summary.completed += 1;
        } catch { summary.failed += 1; }
      }
      return summary;
    }

    async run(operation, progress = () => {}) {
      this.ensureLoggedIn();
      const payload = operation.payload;
      const customer = await this.findOrCreateCustomer(payload.customer, payload.externalMappings || {}, progress);
      const property = await this.findOrCreateProperty(payload.property, payload.externalMappings || {}, progress);
      const estimate = await this.openOrCreateDraft(payload.estimate, payload.externalMappings || {}, progress);
      const attachments = await this.attachDocuments(payload.attachments || [], progress);
      return {
        status: 'completed',
        confirmedDraft: true,
        roomflow: { customerId: payload.customer.roomflowId, propertyId: payload.property.roomflowId, estimateId: payload.estimate.roomflowId },
        customer, property, estimate, attachments,
        message: 'Draft created. Review and send manually in Townsquare.'
      };
    }
  }

  class GuidedMapper {
    constructor(documentRef = document) { this.document = documentRef; this.overlay = null; this.index = 0; this.mappings = {}; }

    async start(reset = false) {
      const stored = await chrome.storage.local.get({ selectorMappings: {} });
      this.mappings = reset ? {} : stored.selectorMappings;
      this.index = 0;
      this.render();
    }

    render() {
      this.overlay?.remove();
      const key = REQUIRED_MAPPING_KEYS[this.index];
      if (!key) { this.finish(); return; }
      const overlay = this.document.createElement('div');
      overlay.id = 'roomflow-townsquare-mapper';
      overlay.style.cssText = 'position:fixed;right:16px;top:16px;z-index:2147483647;width:min(420px,calc(100vw - 32px));background:#0f172a;color:#fff;border:2px solid #38bdf8;border-radius:14px;padding:16px;box-shadow:0 20px 60px rgba(0,0,0,.5);font:14px system-ui;';
      overlay.innerHTML = `<strong>RoomFlow guided mapping</strong><p style="margin:.5rem 0">${this.index + 1}/${REQUIRED_MAPPING_KEYS.length}: click the Townsquare control for <code>${key}</code>.</p><div style="display:flex;gap:8px"><button data-action="skip">Skip</button><button data-action="cancel">Cancel</button></div>`;
      overlay.addEventListener('click', event => {
        event.stopPropagation();
        const action = event.target?.dataset?.action;
        if (action === 'skip') { this.index += 1; this.render(); }
        if (action === 'cancel') this.stop();
      });
      this.document.body.appendChild(overlay);
      this.overlay = overlay;
      this.capture = event => {
        if (overlay.contains(event.target)) return;
        event.preventDefault(); event.stopPropagation();
        const selector = buildStableSelector(event.target, key);
        if (selector) this.mappings[key] = selector;
        this.index += 1;
        this.document.removeEventListener('click', this.capture, true);
        this.render();
      };
      this.document.addEventListener('click', this.capture, true);
    }

    async finish() {
      await chrome.storage.local.set({ selectorMappings: this.mappings, selectorMappingsUpdatedAt: new Date().toISOString() });
      this.stop();
      alert('RoomFlow Townsquare selector mapping saved. Use the extension popup to run a connection test.');
    }

    stop() {
      if (this.capture) this.document.removeEventListener('click', this.capture, true);
      this.overlay?.remove();
      this.overlay = null;
    }
  }

  root.RoomFlowTownsquarePageAdapter = { FIELD_DEFINITIONS, REQUIRED_MAPPING_KEYS, ControlLocator, TownsquarePageAdapter, GuidedMapper, buildStableSelector, parseMoney };
})(globalThis);
