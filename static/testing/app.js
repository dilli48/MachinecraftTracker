const app = {
    operatorsList: [],
    boardsList: [],
    reportsList: [],
    underTestList: [],
    authToken: localStorage.getItem('machinecraft_auth_token') || '',
    authUser: JSON.parse(localStorage.getItem('machinecraft_auth_user') || 'null'),

    async init() {
        this.registerServiceWorker();
        const isAuth = await this.checkAuth();
        if (isAuth || this.authToken) {
            await Promise.all([
                this.fetchOperators(),
                this.fetchBoards(),
                this.fetchReports(),
                this.fetchUnderTestBoards()
            ]);
            this.loadTestTemplate();
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
            console.warn('Testing PWA auth check warning:', e);
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
                this.showToast(`Logged in as ${this.authUser.username}`, 'success');
                this.closeLoginModal();
                await Promise.all([
                    this.fetchOperators(),
                    this.fetchBoards(),
                    this.fetchReports(),
                    this.fetchUnderTestBoards()
                ]);
                this.loadTestTemplate();
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
            navigator.serviceWorker.register('/static/testing/sw.js')
                .then(() => console.log('Testing PWA Service Worker Registered'))
                .catch(err => console.log('Service Worker registration failed:', err));
        }
    },

    async fetchOperators() {
        try {
            const res = await fetch('/api/operators?active_only=true');
            if (res.ok) {
                this.operatorsList = await res.json();
                let optionsHtml = '<option value="" disabled selected>-- Select Your Name --</option>';
                this.operatorsList.forEach(op => {
                    optionsHtml += `<option value="${op.id}">${this.escapeHtml(op.name)}</option>`;
                });
                
                const select1 = document.getElementById('test_operator_id');
                const select2 = document.getElementById('modal_operator_id');
                if (select1) select1.innerHTML = optionsHtml;
                if (select2) select2.innerHTML = optionsHtml;
            }
        } catch (e) {
            console.error('Error fetching operators:', e);
        }
    },

    async fetchBoards() {
        try {
            const res = await fetch('/api/boards');
            if (res.ok) {
                this.boardsList = await res.json();
                this.populateProductionLines();
            }
        } catch (e) {
            console.error('Error fetching boards:', e);
        }
    },

    async fetchReports() {
        try {
            const res = await fetch('/api/testing/reports');
            if (res.ok) {
                this.reportsList = await res.json();
                this.renderReportsList();
            }
        } catch (e) {
            console.error('Error fetching test reports:', e);
        }
    },

    async fetchUnderTestBoards() {
        try {
            const res = await fetch('/api/physical-boards?current_status=IN_TESTING');
            if (res.ok) {
                this.underTestList = await res.json();
                this.renderUnderTestList();
            }
        } catch (e) {
            console.error('Error fetching under test boards:', e);
        }
    },

    renderUnderTestList() {
        const container = document.getElementById('undertest-list-container');
        const badge = document.getElementById('undertest-badge');
        const pill = document.getElementById('undertest-count-pill');
        
        const countStr = `${this.underTestList.length}`;
        if (badge) badge.innerText = `${countStr} Active`;
        if (pill) pill.innerText = countStr;

        if (!container) return;

        if (this.underTestList.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No boards currently under test.</div>`;
            return;
        }

        container.innerHTML = this.underTestList.map(b => {
            const dateStr = new Date(b.manufactured_date).toLocaleString('en-IN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            return `
                <div class="report-item">
                    <div class="report-header">
                        <div class="serial-badge"><i class="fa-solid fa-microchip" style="color: var(--warning); margin-right: 4px;"></i> ${this.escapeHtml(b.serial_number)}</div>
                        <span class="status-tag status-testing">IN-TESTING 🟡</span>
                    </div>
                    <div class="report-meta">
                        <div><strong>Board Model:</strong> ${this.escapeHtml(b.product_name)}</div>
                        <div><strong>Start / Log Date:</strong> ${dateStr}</div>
                    </div>
                    <button class="btn-update-outcome" onclick="app.openUpdateOutcomeModal('${this.escapeHtml(b.serial_number)}', '${this.escapeHtml(b.product_name)}')">
                        <i class="fa-solid fa-pen-to-square"></i> UPDATE OUTCOME (PASS / REJECT)
                    </button>
                </div>
            `;
        }).join('');
    },


    async refreshData() {
        await Promise.all([
            this.fetchOperators(),
            this.fetchBoards(),
            this.fetchReports(),
            this.fetchUnderTestBoards()
        ]);
        this.showToast('Data refreshed successfully', 'success');
    },

    populateProductionLines() {
        const lines = Array.from(new Set(this.boardsList.map(b => b.production_line_category || 'MACHINECRAFT JACQUARD')));
        const lineSelect = document.getElementById('test_line');
        if (!lineSelect) return;

        lineSelect.innerHTML = lines.map(l => `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)}</option>`).join('');
        this.onTestingLineChange();
    },

    onTestingLineChange() {
        const lineSelect = document.getElementById('test_line');
        if (!lineSelect) return;
        const selectedLine = lineSelect.value;
        const filteredBoards = this.boardsList.filter(b => (b.production_line_category || 'MACHINECRAFT JACQUARD') === selectedLine);
        const boardSelect = document.getElementById('test_board_id');

        if (filteredBoards.length > 0) {
            boardSelect.innerHTML = filteredBoards.map(b => 
                `<option value="${b.id}">${this.escapeHtml(b.name)}</option>`
            ).join('');
        } else {
            boardSelect.innerHTML = '<option value="" disabled selected>No boards under this line</option>';
        }
    },

    switchTab(tabName) {
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        document.getElementById(`tab-btn-${tabName}`).classList.add('active');
        document.getElementById(`tab-${tabName}`).classList.add('active');

        if (tabName === 'undertest') {
            this.fetchUnderTestBoards();
        } else if (tabName === 'history') {
            this.fetchReports();
        }
    },

    onTestTypeChange() {
        this.loadTestTemplate();
    },

    loadTestTemplate() {
        const typeSelect = document.getElementById('test_type');
        const textarea = document.getElementById('test_data_json');
        if (!typeSelect || !textarea) return;

        textarea.value = JSON.stringify(this.getTemplateData(typeSelect.value), null, 4);
    },

    onModalTestTypeChange() {
        this.renderModalTestFields();
    },

    renderModalTestFields(existingData = {}) {
        const container = document.getElementById('dynamic-test-fields');
        if (!container) return;

        const testType = document.getElementById('modal_test_type').value;
        let html = '';

        const getChk = (val) => (String(val) === '1' || val === true);

        if (testType === '8_HOURS_ON_OFF') {
            const onTime = existingData.on_time || "09:00:00";
            const offTime = existingData.off_time || "17:00:00";
            const cycleCount = existingData.cycle_count !== undefined ? existingData.cycle_count : 120;

            html = `
                <div class="row-2col">
                    <div class="form-group">
                        <label for="param_on_time">ON Time (HH:MM:SS) *</label>
                        <input type="text" id="param_on_time" class="input-mobile" value="${this.escapeHtml(onTime)}" placeholder="09:00:00" required>
                    </div>
                    <div class="form-group">
                        <label for="param_off_time">OFF Time (HH:MM:SS)</label>
                        <input type="text" id="param_off_time" class="input-mobile" value="${this.escapeHtml(offTime)}" placeholder="17:00:00">
                    </div>
                </div>
                <div class="form-group">
                    <label for="param_cycle_count">Cycle Count *</label>
                    <input type="number" id="param_cycle_count" class="input-mobile" value="${cycleCount}" min="0" required>
                </div>
            `;
        } else if (testType === 'DISPLAY_UNIT_QA') {
            const pcb = existingData["PCB Short Test"] || {};
            const pcbVolt = pcb["Voltage"] || "12.5V";
            const pcbCurr = pcb["Current"] || "0.100A";

            const swVer = existingData["SW Ver"] || "2M.6";
            const pwSet = existingData["P/WSet"] !== undefined ? existingData["P/WSet"] : "";
            const noCards = existingData["No.OfCards"] || "12";
            const hooksPos = existingData["HooksPosition"] || "MS4";

            const pendrive = getChk(existingData["Pendrive"] !== undefined ? existingData["Pendrive"] : "0");
            const cpy11 = getChk(existingData["Cpy1/1"] !== undefined ? existingData["Cpy1/1"] : "0");
            const memCard = getChk(existingData["MemCard"] !== undefined ? existingData["MemCard"] : "0");
            const designView = getChk(existingData["Design View"] !== undefined ? existingData["Design View"] : "0");
            const del11 = getChk(existingData["Delete1/1"] !== undefined ? existingData["Delete1/1"] : "0");
            const delAll = getChk(existingData["DeleteAll"] !== undefined ? existingData["DeleteAll"] : "0");

            const tp = existingData["TestPattern"] || {};
            const tpAllDown = getChk(tp["AllDown"] !== undefined ? tp["AllDown"] : "0");
            const tpAllUp = getChk(tp["ALLUp"] !== undefined ? tp["ALLUp"] : "0");
            const tp1By1 = getChk(tp["1By1"] !== undefined ? tp["1By1"] : "0");
            const tp2By2 = getChk(tp["2By2"] !== undefined ? tp["2By2"] : "0");
            const tpRbyR = getChk(tp["RbyR"] !== undefined ? tp["RbyR"] : "0");

            const body = existingData["BodyFile"] || {};
            const bodyInc = getChk(body["Pick Inc"] !== undefined ? body["Pick Inc"] : "0");
            const bodyDec = getChk(body["Pick Dec"] !== undefined ? body["Pick Dec"] : "0");

            const border = existingData["BorderFile"] || {};
            const borderInc = getChk(border["Pick Inc"] !== undefined ? border["Pick Inc"] : "0");
            const borderDec = getChk(border["Pick Dec"] !== undefined ? border["Pick Dec"] : "0");

            const fingerSel = existingData["FingerSelection"] || "16";
            const fingerWork = getChk(existingData["FingerWorking"] !== undefined ? existingData["FingerWorking"] : "0");
            const connSwap = getChk(existingData["ConnectorSwap"] !== undefined ? existingData["ConnectorSwap"] : "0");

            const sensor = existingData["SensorType"] || {};
            const sensorSingle = getChk(sensor["Single"] !== undefined ? sensor["Single"] : "0");
            const sensorDouble = getChk(sensor["Double"] !== undefined ? sensor["Double"] : "0");

            const rawMF = existingData["MultiFile"] !== undefined ? existingData["MultiFile"] : existingData["MultiFileSelectOption"];
            const multiFile = getChk(rawMF !== undefined ? rawMF : "0");
            const remarks = existingData["Remarks"] !== undefined ? existingData["Remarks"] : "Any comments by testing engineer";

            html = `
                <!-- PCB Short Test Section -->
                <div class="form-section">
                    <div class="form-section-title"><i class="fa-solid fa-bolt"></i> PCB Short Test</div>
                    <div class="row-2col">
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="param_pcb_voltage">Voltage</label>
                            <input type="text" id="param_pcb_voltage" class="input-mobile" value="${this.escapeHtml(pcbVolt)}">
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="param_pcb_current">Current</label>
                            <input type="text" id="param_pcb_current" class="input-mobile" value="${this.escapeHtml(pcbCurr)}">
                        </div>
                    </div>
                </div>

                <!-- General Display Info -->
                <div class="row-2col">
                    <div class="form-group">
                        <label for="param_sw_ver">SW Ver</label>
                        <input type="text" id="param_sw_ver" class="input-mobile" value="${this.escapeHtml(swVer)}">
                    </div>
                    <div class="form-group">
                        <label for="param_pw_set">P/WSet</label>
                        <input type="text" id="param_pw_set" class="input-mobile" value="${this.escapeHtml(pwSet)}">
                    </div>
                </div>

                <div class="row-2col">
                    <div class="form-group">
                        <label for="param_no_cards">No.OfCards</label>
                        <input type="text" id="param_no_cards" class="input-mobile" value="${this.escapeHtml(noCards)}">
                    </div>
                    <div class="form-group">
                        <label for="param_hooks_pos">HooksPosition</label>
                        <input type="text" id="param_hooks_pos" class="input-mobile" value="${this.escapeHtml(hooksPos)}">
                    </div>
                </div>

                <!-- Features & Functions Checkboxes -->
                <div class="form-section">
                    <div class="form-section-title"><i class="fa-solid fa-sliders"></i> Features & Functions</div>
                    <div class="checkbox-grid">
                        <label class="checkbox-card"><input type="checkbox" id="param_pendrive" ${pendrive ? 'checked' : ''}> Pendrive</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_cpy11" ${cpy11 ? 'checked' : ''}> Cpy1/1</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_mem_card" ${memCard ? 'checked' : ''}> MemCard</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_design_view" ${designView ? 'checked' : ''}> Design View</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_del11" ${del11 ? 'checked' : ''}> Delete1/1</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_del_all" ${delAll ? 'checked' : ''}> DeleteAll</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_finger_working" ${fingerWork ? 'checked' : ''}> FingerWorking</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_conn_swap" ${connSwap ? 'checked' : ''}> ConnectorSwap</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_multifile_opt" ${multiFile ? 'checked' : ''}> MultiFile</label>
                    </div>
                </div>

                <!-- Test Pattern Checkboxes -->
                <div class="form-section">
                    <div class="form-section-title"><i class="fa-solid fa-border-all"></i> Test Pattern</div>
                    <div class="checkbox-grid">
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_alldown" ${tpAllDown ? 'checked' : ''}> AllDown</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_allup" ${tpAllUp ? 'checked' : ''}> ALLUp</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_1by1" ${tp1By1 ? 'checked' : ''}> 1By1</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_2by2" ${tp2By2 ? 'checked' : ''}> 2By2</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_rbyr" ${tpRbyR ? 'checked' : ''}> RbyR</label>
                    </div>
                </div>

                <!-- File Adjustments -->
                <div class="row-2col">
                    <div class="form-section" style="margin-bottom:0;">
                        <div class="form-section-title">BodyFile</div>
                        <div class="checkbox-grid" style="grid-template-columns: 1fr;">
                            <label class="checkbox-card"><input type="checkbox" id="param_body_inc" ${bodyInc ? 'checked' : ''}> Pick Inc</label>
                            <label class="checkbox-card"><input type="checkbox" id="param_body_dec" ${bodyDec ? 'checked' : ''}> Pick Dec</label>
                        </div>
                    </div>
                    <div class="form-section" style="margin-bottom:0;">
                        <div class="form-section-title">BorderFile</div>
                        <div class="checkbox-grid" style="grid-template-columns: 1fr;">
                            <label class="checkbox-card"><input type="checkbox" id="param_border_inc" ${borderInc ? 'checked' : ''}> Pick Inc</label>
                            <label class="checkbox-card"><input type="checkbox" id="param_border_dec" ${borderDec ? 'checked' : ''}> Pick Dec</label>
                        </div>
                    </div>
                </div>

                <div class="form-section" style="margin-top: 1rem;">
                    <div class="form-section-title">Finger & Sensors</div>
                    <div class="form-group">
                        <label for="param_finger_sel">FingerSelection</label>
                        <input type="text" id="param_finger_sel" class="input-mobile" value="${this.escapeHtml(fingerSel)}">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>SensorType</label>
                        <div class="checkbox-grid">
                            <label class="checkbox-card"><input type="checkbox" id="param_sensor_single" ${sensorSingle ? 'checked' : ''}> Single</label>
                            <label class="checkbox-card"><input type="checkbox" id="param_sensor_double" ${sensorDouble ? 'checked' : ''}> Double</label>
                        </div>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 1rem;">
                    <label for="param_qa_remarks">Remarks</label>
                    <input type="text" id="param_qa_remarks" class="input-mobile" value="${this.escapeHtml(remarks)}">
                </div>
            `;
        } else if (testType === 'SECO_BOARD_QA') {
            const pcb = existingData["PCB Short Test"] || {};
            const pcbVolt = pcb["Voltage"] || "12.5V";
            const pcbCurr = pcb["Current"] || "0.100A";

            const hwVer = existingData["HW Ver"] || "2M.6";

            const pf = existingData["ProgramFlash"] || {};
            const flashTest = getChk(pf["TestCode"] !== undefined ? pf["TestCode"] : "0");
            const flashMain = getChk(pf["MainCode"] !== undefined ? pf["MainCode"] : "0");

            const tp = existingData["TestPattern"] || {};
            const tpAllDown = getChk(tp["AllDown"] !== undefined ? tp["AllDown"] : "0");
            const tpAllUp = getChk(tp["ALLUp"] !== undefined ? tp["ALLUp"] : "0");
            const tp1By1 = getChk(tp["1By1"] !== undefined ? tp["1By1"] : "0");
            const tp2By2 = getChk(tp["2By2"] !== undefined ? tp["2By2"] : "0");
            const tpRbyR = getChk(tp["RbyR"] !== undefined ? tp["RbyR"] : "0");

            const body = existingData["BodyFile"] || {};
            const bodyInc = getChk(body["Pick Inc"] !== undefined ? body["Pick Inc"] : "0");
            const bodyDec = getChk(body["Pick Dec"] !== undefined ? body["Pick Dec"] : "0");

            const border = existingData["BorderFile"] || {};
            const borderInc = getChk(border["Pick Inc"] !== undefined ? border["Pick Inc"] : "0");
            const borderDec = getChk(border["Pick Dec"] !== undefined ? border["Pick Dec"] : "0");

            const fingerSel = existingData["FingerSelection"] || "16";
            const fingerWork = getChk(existingData["FingerWorking"] !== undefined ? existingData["FingerWorking"] : "0");
            const connSwap = getChk(existingData["ConnectorSwap"] !== undefined ? existingData["ConnectorSwap"] : "0");

            const sensor = existingData["SensorType"] || {};
            const sensorSingle = getChk(sensor["Single"] !== undefined ? sensor["Single"] : "0");
            const sensorDouble = getChk(sensor["Double"] !== undefined ? sensor["Double"] : "0");

            const rawMF = existingData["MultiFile"] !== undefined ? existingData["MultiFile"] : existingData["MultiFileSelectOption"];
            const multiFile = getChk(rawMF !== undefined ? rawMF : "0");
            const remarks = existingData["Remarks"] !== undefined ? existingData["Remarks"] : "Any comments by testing engineer";

            html = `
                <!-- PCB Short Test Section -->
                <div class="form-section">
                    <div class="form-section-title"><i class="fa-solid fa-bolt"></i> PCB Short Test</div>
                    <div class="row-2col">
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="param_pcb_voltage">Voltage</label>
                            <input type="text" id="param_pcb_voltage" class="input-mobile" value="${this.escapeHtml(pcbVolt)}">
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label for="param_pcb_current">Current</label>
                            <input type="text" id="param_pcb_current" class="input-mobile" value="${this.escapeHtml(pcbCurr)}">
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label for="param_hw_ver">HW Ver</label>
                    <input type="text" id="param_hw_ver" class="input-mobile" value="${this.escapeHtml(hwVer)}">
                </div>

                <!-- ProgramFlash Section -->
                <div class="form-section">
                    <div class="form-section-title"><i class="fa-solid fa-microchip"></i> ProgramFlash</div>
                    <div class="checkbox-grid">
                        <label class="checkbox-card"><input type="checkbox" id="param_flash_testcode" ${flashTest ? 'checked' : ''}> TestCode</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_flash_maincode" ${flashMain ? 'checked' : ''}> MainCode</label>
                    </div>
                </div>

                <!-- Test Pattern Checkboxes -->
                <div class="form-section">
                    <div class="form-section-title"><i class="fa-solid fa-border-all"></i> Test Pattern</div>
                    <div class="checkbox-grid">
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_alldown" ${tpAllDown ? 'checked' : ''}> AllDown</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_allup" ${tpAllUp ? 'checked' : ''}> ALLUp</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_1by1" ${tp1By1 ? 'checked' : ''}> 1By1</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_2by2" ${tp2By2 ? 'checked' : ''}> 2By2</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_tp_rbyr" ${tpRbyR ? 'checked' : ''}> RbyR</label>
                    </div>
                </div>

                <!-- File Adjustments -->
                <div class="row-2col">
                    <div class="form-section" style="margin-bottom:0;">
                        <div class="form-section-title">BodyFile</div>
                        <div class="checkbox-grid" style="grid-template-columns: 1fr;">
                            <label class="checkbox-card"><input type="checkbox" id="param_body_inc" ${bodyInc ? 'checked' : ''}> Pick Inc</label>
                            <label class="checkbox-card"><input type="checkbox" id="param_body_dec" ${bodyDec ? 'checked' : ''}> Pick Dec</label>
                        </div>
                    </div>
                    <div class="form-section" style="margin-bottom:0;">
                        <div class="form-section-title">BorderFile</div>
                        <div class="checkbox-grid" style="grid-template-columns: 1fr;">
                            <label class="checkbox-card"><input type="checkbox" id="param_border_inc" ${borderInc ? 'checked' : ''}> Pick Inc</label>
                            <label class="checkbox-card"><input type="checkbox" id="param_border_dec" ${borderDec ? 'checked' : ''}> Pick Dec</label>
                        </div>
                    </div>
                </div>

                <div class="form-section" style="margin-top: 1rem;">
                    <div class="form-section-title">Finger & Sensors</div>
                    <div class="form-group">
                        <label for="param_finger_sel">FingerSelection</label>
                        <input type="text" id="param_finger_sel" class="input-mobile" value="${this.escapeHtml(fingerSel)}">
                    </div>
                    <div class="checkbox-grid" style="margin-bottom: 0.75rem;">
                        <label class="checkbox-card"><input type="checkbox" id="param_finger_working" ${fingerWork ? 'checked' : ''}> FingerWorking</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_conn_swap" ${connSwap ? 'checked' : ''}> ConnectorSwap</label>
                        <label class="checkbox-card"><input type="checkbox" id="param_multifile_opt" ${multiFile ? 'checked' : ''}> MultiFile</label>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>SensorType</label>
                        <div class="checkbox-grid">
                            <label class="checkbox-card"><input type="checkbox" id="param_sensor_single" ${sensorSingle ? 'checked' : ''}> Single</label>
                            <label class="checkbox-card"><input type="checkbox" id="param_sensor_double" ${sensorDouble ? 'checked' : ''}> Double</label>
                        </div>
                    </div>
                </div>

                <div class="form-group" style="margin-top: 1rem;">
                    <label for="param_qa_remarks">Remarks</label>
                    <input type="text" id="param_qa_remarks" class="input-mobile" value="${this.escapeHtml(remarks)}">
                </div>
            `;
        } else {
            const val1 = existingData.custom_metric_1 || "OK";
            const val2 = existingData.custom_value_2 !== undefined ? existingData.custom_value_2 : 100;
            html = `
                <div class="form-group">
                    <label for="param_custom_1">Custom Metric 1</label>
                    <input type="text" id="param_custom_1" class="input-mobile" value="${this.escapeHtml(val1)}">
                </div>
                <div class="form-group">
                    <label for="param_custom_2">Custom Metric 2</label>
                    <input type="number" id="param_custom_2" class="input-mobile" value="${val2}">
                </div>
            `;
        }

        container.innerHTML = html;
    },

    collectModalTestData() {
        const testType = document.getElementById('modal_test_type').value;

        const getVal = (id, defaultVal = "0") => {
            const el = document.getElementById(id);
            return el ? (el.checked ? "1" : "0") : defaultVal;
        };

        if (testType === '8_HOURS_ON_OFF') {
            return {
                on_time: document.getElementById('param_on_time')?.value.trim() || "09:00:00",
                off_time: document.getElementById('param_off_time')?.value.trim() || "17:00:00",
                cycle_count: parseInt(document.getElementById('param_cycle_count')?.value, 10) || 0
            };
        } else if (testType === 'DISPLAY_UNIT_QA') {
            return {
                "PCB Short Test": { 
                    "Voltage": document.getElementById('param_pcb_voltage')?.value.trim() || "12.5V",
                    "Current": document.getElementById('param_pcb_current')?.value.trim() || "0.100A"
                },
                "SW Ver": document.getElementById('param_sw_ver')?.value.trim() || "2M.6",
                "P/WSet": document.getElementById('param_pw_set')?.value.trim() || "",
                "No.OfCards": document.getElementById('param_no_cards')?.value.trim() || "12",
                "HooksPosition": document.getElementById('param_hooks_pos')?.value.trim() || "MS4",
                "Pendrive": getVal('param_pendrive'),
                "Cpy1/1": getVal('param_cpy11'),
                "MemCard": getVal('param_mem_card'),
                "Design View": getVal('param_design_view'),
                "Delete1/1": getVal('param_del11'),
                "DeleteAll": getVal('param_del_all'),
                "TestPattern": {
                    "AllDown": getVal('param_tp_alldown'),
                    "ALLUp": getVal('param_tp_allup'),
                    "1By1": getVal('param_tp_1by1'),
                    "2By2": getVal('param_tp_2by2'),
                    "RbyR": getVal('param_tp_rbyr')
                },
                "BodyFile": {
                    "Pick Inc": getVal('param_body_inc'),
                    "Pick Dec": getVal('param_body_dec')
                },
                "BorderFile": {
                    "Pick Inc": getVal('param_border_inc'),
                    "Pick Dec": getVal('param_border_dec')
                },
                "FingerSelection": document.getElementById('param_finger_sel')?.value.trim() || "16",
                "FingerWorking": getVal('param_finger_working'),
                "ConnectorSwap": getVal('param_conn_swap'),
                "SensorType": {
                    "Single": getVal('param_sensor_single'),
                    "Double": getVal('param_sensor_double')
                },
                "MultiFile": getVal('param_multifile_opt'),
                "Remarks": document.getElementById('param_qa_remarks')?.value.trim() || "Any comments by testing engineer"
            };
        } else if (testType === 'SECO_BOARD_QA') {
            return {
                "PCB Short Test": { 
                    "Voltage": document.getElementById('param_pcb_voltage')?.value.trim() || "12.5V",
                    "Current": document.getElementById('param_pcb_current')?.value.trim() || "0.100A"
                },
                "HW Ver": document.getElementById('param_hw_ver')?.value.trim() || "2M.6",
                "ProgramFlash": {
                    "TestCode": getVal('param_flash_testcode'),
                    "MainCode": getVal('param_flash_maincode')
                },
                "TestPattern": {
                    "AllDown": getVal('param_tp_alldown'),
                    "ALLUp": getVal('param_tp_allup'),
                    "1By1": getVal('param_tp_1by1'),
                    "2By2": getVal('param_tp_2by2'),
                    "RbyR": getVal('param_tp_rbyr')
                },
                "BodyFile": {
                    "Pick Inc": getVal('param_body_inc'),
                    "Pick Dec": getVal('param_body_dec')
                },
                "BorderFile": {
                    "Pick Inc": getVal('param_border_inc'),
                    "Pick Dec": getVal('param_border_dec')
                },
                "FingerSelection": document.getElementById('param_finger_sel')?.value.trim() || "16",
                "FingerWorking": getVal('param_finger_working'),
                "ConnectorSwap": getVal('param_conn_swap'),
                "SensorType": {
                    "Single": getVal('param_sensor_single'),
                    "Double": getVal('param_sensor_double')
                },
                "MultiFile": getVal('param_multifile_opt'),
                "Remarks": document.getElementById('param_qa_remarks')?.value.trim() || "Any comments by testing engineer"
            };
        }
        return {
            custom_metric_1: document.getElementById('param_custom_1')?.value.trim() || "OK",
            custom_value_2: parseInt(document.getElementById('param_custom_2')?.value, 10) || 100
        };
    },

    getTemplateData(type) {
        if (type === '8_HOURS_ON_OFF') {
            return {
                on_time: "09:00:00",
                off_time: "17:00:00",
                cycle_count: 120
            };
        } else if (type === 'DISPLAY_UNIT_QA') {
            return {
                "PCB Short Test": { 
                    "Voltage": "12.5V",
                    "Current": "0.100A"
                },
                "SW Ver": "2M.6",
                "P/WSet": "",
                "No.OfCards": "12",
                "HooksPosition": "MS4",
                "Pendrive": "0",
                "Cpy1/1": "0",
                "MemCard": "0",
                "Design View": "0",
                "Delete1/1": "0",
                "DeleteAll": "0",
                "TestPattern": {
                    "AllDown": "0",
                    "ALLUp": "0",
                    "1By1": "0",
                    "2By2": "0",
                    "RbyR": "0"
                },
                "BodyFile": {
                    "Pick Inc": "0",
                    "Pick Dec": "0"
                },
                "BorderFile": {
                    "Pick Inc": "0",
                    "Pick Dec": "0"
                },
                "FingerSelection": "16",
                "FingerWorking": "0",
                "ConnectorSwap": "0",
                "SensorType": {
                    "Single": "0",
                    "Double": "0"
                },
                "MultiFile": "0",
                "Remarks": "Any comments by testing engineer"
            };
        } else if (type === 'SECO_BOARD_QA') {
            return {
                "PCB Short Test": { 
                    "Voltage": "12.5V",
                    "Current": "0.100A"
                },
                "HW Ver": "2M.6",
                "ProgramFlash": {
                    "TestCode": "0",
                    "MainCode": "0"
                },
                "TestPattern": {
                    "AllDown": "0",
                    "ALLUp": "0",
                    "1By1": "0",
                    "2By2": "0",
                    "RbyR": "0"
                },
                "BodyFile": {
                    "Pick Inc": "0",
                    "Pick Dec": "0"
                },
                "BorderFile": {
                    "Pick Inc": "0",
                    "Pick Dec": "0"
                },
                "FingerSelection": "16",
                "FingerWorking": "0",
                "ConnectorSwap": "0",
                "SensorType": {
                    "Single": "0",
                    "Double": "0"
                },
                "MultiFile": "0",
                "Remarks": "Any comments by testing engineer"
            };
        }
        return {
            custom_metric_1: "OK",
            custom_value_2: 100
        };
    },



    async openUpdateOutcomeModal(serialNumber, productName) {
        document.getElementById('modal_serial_display').value = serialNumber;

        let existingData = {};
        try {
            const res = await fetch(`/api/testing/reports?serial_number=${encodeURIComponent(serialNumber)}`);
            if (res.ok) {
                const reports = await res.json();
                if (reports.length > 0) {
                    const latest = reports[0];
                    existingData = latest.test_data || {};
                    if (latest.test_type) {
                        document.getElementById('modal_test_type').value = latest.test_type;
                    }
                    if (latest.operator_id) {
                        document.getElementById('modal_operator_id').value = latest.operator_id;
                    }
                    if (latest.remarks) {
                        document.getElementById('modal_remarks').value = latest.remarks;
                    }
                }
            }
        } catch (e) {
            console.error('Error fetching existing report for modal:', e);
        }

        this.renderModalTestFields(existingData);
        document.getElementById('update-outcome-modal').classList.add('active');
    },

    async submitFinalOutcome(event) {
        event.preventDefault();
        const board_serial_number = document.getElementById('modal_serial_display').value;
        const operator_id = parseInt(document.getElementById('modal_operator_id').value, 10);
        const test_type = document.getElementById('modal_test_type').value;
        const overall_status = document.getElementById('modal_final_status').value;
        const remarks = document.getElementById('modal_remarks').value.trim() || null;

        if (!operator_id) {
            this.showToast('Please select Operator Staff', 'danger');
            return;
        }

        const test_data = this.collectModalTestData();

        const payload = {
            board_serial_number,
            operator_id,
            test_type,
            overall_status,
            test_data,
            remarks
        };

        try {
            const res = await fetch('/api/testing/log-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (overall_status === 'IN_TESTING') {
                    this.showToast(`Saved progress for ${board_serial_number}!`, 'success');
                } else {
                    this.showToast(`Board ${board_serial_number} marked ${overall_status}!`, 'success');
                }
                this.closeModal('update-outcome-modal');
                await Promise.all([
                    this.fetchUnderTestBoards(),
                    this.fetchReports()
                ]);
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to update test outcome', 'danger');
            }
        } catch (e) {
            this.showToast('Submission error: ' + e.message, 'danger');
        }
    },


    renderReportsList() {
        const container = document.getElementById('reports-list-container');
        const badge = document.getElementById('logs-count-badge');
        if (badge) badge.innerText = `${this.reportsList.length} logs`;

        if (!container) return;

        if (this.reportsList.length === 0) {
            container.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">No completed test logs recorded yet.</div>`;
            return;
        }

        container.innerHTML = this.reportsList.map(r => {
            const dateStr = new Date(r.test_timestamp).toLocaleString('en-IN', {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const statusClass = r.overall_status === 'PASS' ? 'status-pass' : (r.overall_status === 'FAIL' ? 'status-fail' : 'status-testing');
            
            return `
                <div class="report-item">
                    <div class="report-header">
                        <div class="serial-badge"><i class="fa-solid fa-microchip" style="color: var(--primary); margin-right: 4px;"></i> ${this.escapeHtml(r.board_serial_number)}</div>
                        <span class="status-tag ${statusClass}">${this.escapeHtml(r.overall_status)}</span>
                    </div>
                    <div class="report-meta">
                        <div><strong>Product:</strong> ${this.escapeHtml(r.product_name)} | <strong>Type:</strong> ${this.escapeHtml(r.test_type)}</div>
                        <div><strong>Tester:</strong> ${this.escapeHtml(r.operator_name)} | <strong>Time:</strong> ${dateStr}</div>
                        ${r.remarks ? `<div style="color: #cbd5e1; margin-top: 4px;"><em>"${this.escapeHtml(r.remarks)}"</em></div>` : ''}
                    </div>
                    <button class="btn-small-action" style="width: 100%; margin-top: 4px;" onclick="app.viewJsonMetrics(${r.id})">
                        <i class="fa-solid fa-code"></i> View Raw Telemetry JSON
                    </button>
                </div>
            `;
        }).join('');
    },

    viewJsonMetrics(reportId) {
        const report = this.reportsList.find(r => r.id === reportId);
        if (!report) return;

        document.getElementById('modal-json-title').innerText = `Telemetry Metrics: ${report.board_serial_number}`;
        document.getElementById('modal-json-content').innerText = JSON.stringify(report.test_data, null, 4);
        document.getElementById('json-view-modal').classList.add('active');
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
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
