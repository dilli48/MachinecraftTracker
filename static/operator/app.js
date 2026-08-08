const app = {
    componentsMap: {},
    componentsList: [],
    operatorsList: [],
    boardsList: [],
    html5QrCode: null,
    scanTargetSelectId: null,

    async init() {
        this.registerServiceWorker();
        await Promise.all([
            this.fetchComponents(),
            this.fetchOperators(),
            this.fetchBoards()
        ]);
        this.loadTestTemplate();
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
            const res = await fetch('/api/components');
            if (res.ok) {
                this.componentsList = await res.json();
                this.componentsMap = {};
                this.componentsList.forEach(c => {
                    this.componentsMap[c.part_number] = c;
                });
                this.populateStockSelect();
            }
        } catch (e) {
            this.showToast('Network error: ' + e.message, 'danger');
        }
    },

    async fetchOperators() {
        try {
            const res = await fetch('/api/operators?active_only=true');
            if (res.ok) {
                this.operatorsList = await res.json();
                const assmSelect = document.getElementById('assm_operator_id');
                const testSelect = document.getElementById('test_operator_id');
                
                let optionsHtml = '<option value="" disabled selected>-- Select Your Name --</option>';
                this.operatorsList.forEach(op => {
                    optionsHtml += `<option value="${op.id}">${this.escapeHtml(op.name)}</option>`;
                });

                if (assmSelect) assmSelect.innerHTML = optionsHtml;
                if (testSelect) testSelect.innerHTML = optionsHtml;
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

    populateProductionLines() {
        const lines = Array.from(new Set(this.boardsList.map(b => b.production_line_category || 'MACHINECRAFT JACQUARD')));
        const assmLineSelect = document.getElementById('assm_line');
        const testLineSelect = document.getElementById('test_line');

        const optionsHtml = lines.map(l => `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)}</option>`).join('');

        if (assmLineSelect) assmLineSelect.innerHTML = optionsHtml;
        if (testLineSelect) testLineSelect.innerHTML = optionsHtml;

        this.onProductionLineChange();
        this.onTestingLineChange();
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



    populateStockSelect() {
        const select = document.getElementById('stock_part_select');
        select.innerHTML = '<option value="" disabled selected>-- Select or Scan Barcode --</option>';
        this.componentsList.forEach(c => {
            select.innerHTML += `<option value="${this.escapeHtml(c.part_number)}">${this.escapeHtml(c.part_number)} (Stock: ${c.current_stock})</option>`;
        });
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
            const res = await fetch('/api/production/log', {
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

    onTestTypeChange() {
        this.loadTestTemplate();
    },

    loadTestTemplate() {
        const typeSelect = document.getElementById('test_type');
        const textarea = document.getElementById('test_data_json');
        if (!typeSelect || !textarea) return;

        const type = typeSelect.value;
        let template = {};

        if (type === '8_HOURS_ON_OFF') {
            template = {
                voltage_v: 230,
                temperature_celsius: 42.5,
                burn_in_hours: 8,
                cycles_completed: 480,
                power_draw_watts: 18.4,
                fan_speed_rpm: 2400
            };
        } else if (type === 'SECO_BOARD_QA') {
            template = {
                firmware_version: "v2.1.4",
                can_bus_communication: "OK",
                spi_flash_test: "PASS",
                voltage_3v3: 3.31,
                voltage_5v: 5.02,
                sensor_channels: [1, 2, 3, 4]
            };
        } else if (type === 'DISPLAY_UNIT_QA') {
            template = {
                display_resolution: "1024x600",
                touch_screen_calibration: "PASSED",
                backlight_brightness_nits: 450,
                pixel_defect_count: 0,
                hmi_boot_time_sec: 4.2
            };
        } else {
            template = {
                custom_metric_1: "OK",
                custom_value_2: 100
            };
        }

        textarea.value = JSON.stringify(template, null, 4);
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
        const jsonText = document.getElementById('test_data_json').value;
        const remarks = document.getElementById('test_remarks').value.trim() || null;

        if (!operator_id || !product_id || !board_serial_number) {
            this.showToast('Please select Operator, Board Model, and enter Serial Number', 'danger');
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
                const data = await res.json();
                this.showToast(`Test Report logged for ${board_serial_number}!`, 'success');
                document.getElementById('test_serial_number').value = '';
                document.getElementById('test_remarks').value = '';
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to log test report', 'danger');
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
            const res = await fetch(`/api/components/${encodeURIComponent(partNumber)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                this.showToast(`Stock updated: ${partNumber} is now ${newStock}`, 'success');
                document.getElementById('stock_comments').value = '';
                await this.fetchComponents();
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
            document.getElementById('stock_part_select').value = matchedPart.part_number;
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
