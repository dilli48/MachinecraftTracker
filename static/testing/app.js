const app = {
    operatorsList: [],
    boardsList: [],
    reportsList: [],
    underTestList: [],

    async init() {
        this.registerServiceWorker();
        await Promise.all([
            this.fetchOperators(),
            this.fetchBoards(),
            this.fetchReports(),
            this.fetchUnderTestBoards()
        ]);
        this.loadTestTemplate();
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
        this.loadModalTestTemplate();
    },

    loadModalTestTemplate() {
        const typeSelect = document.getElementById('modal_test_type');
        const textarea = document.getElementById('modal_test_data_json');
        if (!typeSelect || !textarea) return;

        textarea.value = JSON.stringify(this.getTemplateData(typeSelect.value), null, 4);
    },

    getTemplateData(type) {
        if (type === '8_HOURS_ON_OFF') {
            return {
                voltage_v: 230,
                temperature_celsius: 42.5,
                burn_in_hours: 8,
                cycles_completed: 480,
                power_draw_watts: 18.4,
                fan_speed_rpm: 2400
            };
        } else if (type === 'SECO_BOARD_QA') {
            return {
                firmware_version: "v2.1.4",
                can_bus_communication: "OK",
                spi_flash_test: "PASS",
                voltage_3v3: 3.31,
                voltage_5v: 5.02,
                sensor_channels: [1, 2, 3, 4]
            };
        } else if (type === 'DISPLAY_UNIT_QA') {
            return {
                display_resolution: "1024x600",
                touch_screen_calibration: "PASSED",
                backlight_brightness_nits: 450,
                pixel_defect_count: 0,
                hmi_boot_time_sec: 4.2
            };
        }
        return {
            custom_metric_1: "OK",
            custom_value_2: 100
        };
    },

    async submitTestingReport(event) {
        event.preventDefault();
        const operatorSelect = document.getElementById('test_operator_id');
        const boardSelect = document.getElementById('test_board_id');
        const serialInput = document.getElementById('test_serial_number');

        const operator_id = parseInt(operatorSelect.value, 10);
        const product_id = parseInt(boardSelect.value, 10);
        const board_serial_number = serialInput.value.trim();
        const test_type = document.getElementById('test_type').value;
        const overall_status = document.getElementById('test_overall_status').value;
        const remarks = document.getElementById('test_remarks').value.trim() || null;


        if (!operator_id || !product_id || !board_serial_number) {
            this.showToast('Please select Operator, Board Model, and enter Serial Number', 'danger');
            return;
        }

        let test_data = {};
        const jsonEl = document.getElementById('test_data_json');
        if (jsonEl && jsonEl.value.trim()) {
            try {
                test_data = JSON.parse(jsonEl.value);
            } catch (err) {
                this.showToast('Invalid JSON format in Test Data Metrics field!', 'danger');
                return;
            }
        } else {
            test_data = this.getTemplateData(test_type);
        }


        const payload = {
            board_serial_number,
            product_id,
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
                    this.showToast(`Serial ${board_serial_number} placed IN-TESTING queue!`, 'success');
                    this.switchTab('undertest');
                } else {
                    this.showToast(`Test Report logged for ${board_serial_number}!`, 'success');
                }
                document.getElementById('test_serial_number').value = '';
                document.getElementById('test_remarks').value = '';
                await Promise.all([
                    this.fetchUnderTestBoards(),
                    this.fetchReports()
                ]);
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to log test report', 'danger');
            }
        } catch (e) {
            this.showToast('Submission error: ' + e.message, 'danger');
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
                        <div><strong>Model:</strong> ${this.escapeHtml(b.product_name)}</div>
                        <div><strong>Started:</strong> ${dateStr}</div>
                    </div>
                    <button class="btn-update-outcome" onclick="app.openUpdateOutcomeModal('${this.escapeHtml(b.serial_number)}', '${this.escapeHtml(b.product_name)}')">
                        <i class="fa-solid fa-square-check"></i> UPDATE OUTCOME (PASS / REJECT)
                    </button>
                </div>
            `;
        }).join('');
    },

    openUpdateOutcomeModal(serialNumber, productName) {
        document.getElementById('modal_serial_display').value = serialNumber;
        this.loadModalTestTemplate();
        document.getElementById('update-outcome-modal').classList.add('active');
    },

    async submitFinalOutcome(event) {
        event.preventDefault();
        const board_serial_number = document.getElementById('modal_serial_display').value;
        const operator_id = parseInt(document.getElementById('modal_operator_id').value, 10);
        const test_type = document.getElementById('modal_test_type').value;
        const overall_status = document.getElementById('modal_final_status').value;
        const jsonText = document.getElementById('modal_test_data_json').value;
        const remarks = document.getElementById('modal_remarks').value.trim() || null;

        if (!operator_id) {
            this.showToast('Please select Operator Staff', 'danger');
            return;
        }

        let test_data = {};
        try {
            test_data = JSON.parse(jsonText);
        } catch (err) {
            this.showToast('Invalid JSON format in Test Data Metrics field!', 'danger');
            return;
        }

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
                this.showToast(`Board ${board_serial_number} updated to ${overall_status}!`, 'success');
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
