const app = {
    componentsMap: {},
    componentsList: [],
    operatorsList: [],
    boardsList: [],
    html5QrCode: null,
    scanTargetSelectId: null,
    authToken: localStorage.getItem('machinecraft_auth_token') || '',
    authUser: JSON.parse(localStorage.getItem('machinecraft_auth_user') || 'null'),

    async init() {
        this.registerServiceWorker();
        const isAuth = await this.checkAuth();
        if (isAuth || this.authToken) {
            await Promise.all([
                this.fetchComponents(),
                this.fetchOperators(),
                this.fetchBoards()
            ]);
        }
    },

    async authFetch(url, options = {}) {
        options.headers = options.headers || {};
        if (this.authToken) {
            options.headers['Authorization'] = `Bearer ${this.authToken}`;
        }
        const res = await fetch(url, options);
        if (res.status === 401 && !url.includes('/api/auth/login')) {
            this.authToken = '';
            this.authUser = null;
            localStorage.removeItem('machinecraft_auth_token');
            localStorage.removeItem('machinecraft_auth_user');
            this.showLoginModal();
        }
        return res;
    },

    async checkAuth() {
        if (!this.authToken) {
            this.showLoginModal();
            return false;
        }
        try {
            const res = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            if (res.ok) {
                this.authUser = await res.json();
                localStorage.setItem('machinecraft_auth_user', JSON.stringify(this.authUser));
                this.setupUserDisplay();
                this.closeLoginModal();
                return true;
            } else if (res.status === 401) {
                this.authToken = '';
                this.authUser = null;
                localStorage.removeItem('machinecraft_auth_token');
                localStorage.removeItem('machinecraft_auth_user');
                this.showLoginModal();
                return false;
            }
            return true;
        } catch (e) {
            console.warn('Operator PWA auth check warning:', e);
            return true;
        }
    },

    showLoginModal() {
        const modal = document.getElementById('auth-login-modal');
        if (modal) modal.style.display = 'flex';
    },

    closeLoginModal() {
        const modal = document.getElementById('auth-login-modal');
        if (modal) modal.style.display = 'none';
    },

    async handleLogin(event) {
        event.preventDefault();
        const username = document.getElementById('login_username').value.trim();
        const password = document.getElementById('login_password').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            if (res.ok) {
                const data = await res.json();
                this.authToken = data.access_token;
                this.authUser = data.user;
                localStorage.setItem('machinecraft_auth_token', this.authToken);
                localStorage.setItem('machinecraft_auth_user', JSON.stringify(this.authUser));
                this.setupUserDisplay();
                this.showToast(`Logged in as ${this.authUser.username}`, 'success');
                this.closeLoginModal();
                await Promise.all([
                    this.fetchComponents(),
                    this.fetchOperators(),
                    this.fetchBoards()
                ]);
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Invalid credentials', 'danger');
            }
        } catch (e) {
            this.showToast('Login error: ' + e.message, 'danger');
        }
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/static/operator/sw.js')
                .then(() => console.log('Operator PWA Service Worker Registered'))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    },

    async fetchComponents() {
        try {
            const res = await this.authFetch('/api/components');
            if (res.ok) {
                this.componentsList = await res.json();
                this.componentsMap = {};
                this.componentsList.forEach(c => {
                    this.componentsMap[c.part_number] = c;
                });
                this.populateStockTypeSelect();
            }
        } catch (e) {
            this.showToast('Network error: ' + e.message, 'danger');
        }
    },


    async fetchOperators() {
        try {
            const res = await this.authFetch('/api/operators?active_only=true');
            if (res.ok) {
                this.operatorsList = await res.json();
                this.setupUserDisplay();
            }
        } catch (e) {
            console.error('Error fetching operators:', e);
        }
    },

    setupUserDisplay() {
        const displayEl = document.getElementById('display_operator_user');
        const hiddenEl = document.getElementById('assm_operator_id');
        if (this.authUser) {
            if (displayEl) displayEl.textContent = this.authUser.username;
            if (hiddenEl) {
                let opId = this.authUser.operator_id;
                if (!opId && this.operatorsList) {
                    const found = this.operatorsList.find(o => o.name.toLowerCase() === this.authUser.username.toLowerCase());
                    if (found) opId = found.id;
                }
                hiddenEl.value = opId || this.authUser.id || 1;
            }
        }
    },

    async fetchBoards() {
        try {
            const res = await this.authFetch('/api/boards');
            if (res.ok) {
                this.boardsList = await res.json();
                this.populateProductionLines();
            }
        } catch (e) {
            console.error('Error fetching boards:', e);
        }
    },

    populateProductionLines() {
        const lines = Array.from(new Set(this.boardsList.map(b => b.production_line_category || 'MACHINECRAFT JACQUARD')));
        const lineSelect = document.getElementById('assm_line');
        lineSelect.innerHTML = lines.map(l => `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)}</option>`).join('');
        this.onProductionLineChange();
    },

    onProductionLineChange() {
        const lineSelect = document.getElementById('assm_line');
        if (!lineSelect) return;
        const selectedLine = lineSelect.value;
        const filteredBoards = this.boardsList.filter(b => (b.production_line_category || 'MACHINECRAFT JACQUARD') === selectedLine);
        const boardSelect = document.getElementById('assm_board_id');

        if (filteredBoards.length > 0) {
            boardSelect.innerHTML = filteredBoards.map(b => 
                `<option value="${b.id}">${this.escapeHtml(b.name)}</option>`
            ).join('');
        } else {
            boardSelect.innerHTML = '<option value="" disabled selected>No boards under this line</option>';
        }
    },




    populateStockTypeSelect() {
        const typeSelect = document.getElementById('stock_type_select');
        if (!typeSelect) return;

        const currentType = typeSelect.value;
        const types = Array.from(new Set(this.componentsList.map(c => (c.type && c.type.trim()) ? c.type.trim() : 'Uncategorized'))).sort();

        let html = '<option value="">-- All Component Types --</option>';
        types.forEach(t => {
            html += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
        });
        typeSelect.innerHTML = html;

        if (currentType && types.includes(currentType)) {
            typeSelect.value = currentType;
        }

        this.onStockTypeChange();
    },

    onStockTypeChange() {
        const typeSelect = document.getElementById('stock_type_select');
        const selectedType = typeSelect ? typeSelect.value : '';

        let filtered = this.componentsList;
        if (selectedType) {
            if (selectedType === 'Uncategorized') {
                filtered = this.componentsList.filter(c => !c.type || !c.type.trim());
            } else {
                filtered = this.componentsList.filter(c => c.type && c.type.trim() === selectedType);
            }
        }

        this.populateStockSelect(filtered);
    },

    populateStockSelect(filteredList) {
        const select = document.getElementById('stock_part_select');
        if (!select) return;

        const listToUse = filteredList || this.componentsList;
        let html = '<option value="" disabled selected>-- Select Part Number or Scan Barcode --</option>';
        listToUse.forEach(c => {
            html += `<option value="${this.escapeHtml(c.part_number)}">${this.escapeHtml(c.part_number)} (Stock: ${c.current_stock})</option>`;
        });
        select.innerHTML = html;
        this.onStockComponentChange();
    },


    switchTab(tabName) {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        document.getElementById(`tab-btn-${tabName}`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');
    },

    adjustValue(inputId, delta) {
        const input = document.getElementById(inputId);
        let val = parseInt(input.value || '1', 10) + delta;
        const min = parseInt(input.getAttribute('min') || '1', 10);
        if (val < min) val = min;
        input.value = val;
    },

    onStockComponentChange() {
        const partNumber = document.getElementById('stock_part_select').value;
        const infoBox = document.getElementById('stock-current-info');
        const displayVal = document.getElementById('stock-display-val');

        if (partNumber && this.componentsMap[partNumber]) {
            infoBox.style.display = 'block';
            displayVal.innerText = `${this.componentsMap[partNumber].current_stock} units`;
        } else {
            infoBox.style.display = 'none';
        }
    },

    async submitAssembly(event) {
        event.preventDefault();
        const operator_id = parseInt(document.getElementById('assm_operator_id').value, 10);
        const board_type_id = parseInt(document.getElementById('assm_board_id').value, 10);
        const production_line = document.getElementById('assm_line').value.trim() || 'ALL CL Card';
        const previous_stage = document.getElementById('assm_prev_stage').value;
        const current_stage = document.getElementById('assm_curr_stage').value;
        const quantity = parseInt(document.getElementById('assm_qty').value, 10);

        if (!operator_id || !board_type_id) {
            this.showToast('Please select Operator and Board', 'danger');
            return;
        }

        const payload = {
            operator_id,
            board_type_id,
            production_line,
            previous_stage,
            current_stage,
            quantity
        };

        try {
            const res = await this.authFetch('/api/production/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                this.showToast(data.message, 'success');
                document.getElementById('assm_qty').value = 100;
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to log production stage', 'danger');
            }
        } catch (e) {
            this.showToast('Submission error: ' + e.message, 'danger');
        }
    },

    async processStockChange(actionType) {

        const partSelect = document.getElementById('stock_part_select');
        const partNumber = partSelect.value;
        const qtyInput = document.getElementById('stock_qty');
        const deltaQty = parseInt(qtyInput.value, 10);
        const comments = document.getElementById('stock_comments').value.trim();

        if (!partNumber || !this.componentsMap[partNumber]) {
            this.showToast('Please select a component first', 'danger');
            return;
        }

        const comp = this.componentsMap[partNumber];
        let newStock = actionType === 'add' ? comp.current_stock + deltaQty : comp.current_stock - deltaQty;
        if (newStock < 0) {
            this.showToast(`Cannot deduct: Stock is only ${comp.current_stock}`, 'danger');
            return;
        }

        const payload = {
            current_stock: newStock,
            comments: comments ? `${comp.comments || ''} | ${comments}`.trim() : comp.comments
        };

        try {
            const res = await this.authFetch(`/api/components/${encodeURIComponent(partNumber)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                this.showToast(`Stock updated: ${partNumber} is now ${newStock}`, 'success');
                document.getElementById('stock_comments').value = '';
                const savedType = document.getElementById('stock_type_select') ? document.getElementById('stock_type_select').value : '';
                await this.fetchComponents();
                if (savedType) {
                    document.getElementById('stock_type_select').value = savedType;
                    this.onStockTypeChange();
                }
                partSelect.value = partNumber;
                this.onStockComponentChange();
            } else {
                this.showToast('Stock update failed', 'danger');
            }
        } catch (e) {
            this.showToast('Network error: ' + e.message, 'danger');
        }
    },

    openScanner(targetSelectId = null) {
        this.scanTargetSelectId = targetSelectId;
        const modal = document.getElementById('scanner-modal');
        modal.classList.add('active');

        if (window.Html5Qrcode) {
            this.html5QrCode = new Html5Qrcode("reader");
            this.html5QrCode.start(
                { facingMode: "environment" },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => this.onBarcodeScanned(decodedText),
                () => {}
            ).catch(err => {
                console.error("Camera access error:", err);
                this.showToast("Camera access error or unsupported device.", "danger");
                this.closeScanner();
            });
        } else {
            this.showToast("Barcode scanner library loading error.", "danger");
            this.closeScanner();
        }
    },

    closeScanner() {
        if (this.html5QrCode) {
            this.html5QrCode.stop().then(() => {
                this.html5QrCode.clear();
                this.html5QrCode = null;
            }).catch(() => {});
        }
        document.getElementById('scanner-modal').classList.remove('active');
    },

    onBarcodeScanned(scannedCode) {
        this.closeScanner();
        this.showToast(`Scanned Code: ${scannedCode}`, 'success');

        const matchedPart = this.componentsList.find(c => 
            c.part_number.toLowerCase() === scannedCode.trim().toLowerCase()
        );

        if (matchedPart) {
            this.switchTab('stock');

            const compType = (matchedPart.type && matchedPart.type.trim()) ? matchedPart.type.trim() : 'Uncategorized';
            const typeSelect = document.getElementById('stock_type_select');
            if (typeSelect) {
                const optionExists = Array.from(typeSelect.options).some(opt => opt.value === compType);
                typeSelect.value = optionExists ? compType : '';
                this.onStockTypeChange();
            }

            const partSelect = document.getElementById('stock_part_select');
            if (partSelect) {
                partSelect.value = matchedPart.part_number;
            }
            this.onStockComponentChange();
        } else {
            this.showToast(`No component found for part number: ${scannedCode}`, 'danger');
        }
    },


    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `alert-toast toast-${type}`;
        toast.innerHTML = `
            <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation'}" style="color: var(--${type});"></i>
            <span>${this.escapeHtml(message)}</span>
        `;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
