const app = {
    components: [],
    operators: [],
    boards: [],
    stageLogs: [],
    searchQuery: '',
    editingPartNumber: null,

    init() {
        this.refreshData();
    },

    async refreshData() {
        await Promise.all([
            this.fetchComponents(),
            this.fetchOperators(),
            this.fetchBoards(),
            this.fetchStageLogs()
        ]);
        this.renderStats();
        this.populateMatrixLineDropdown();
        await this.loadStageMatrix();
        this.renderStageLogs();
        this.renderInventory();
        this.renderOperatorsList();
        this.renderBoardsList();
    },

    populateMatrixLineDropdown() {
        const select = document.getElementById('filter_matrix_line');
        if (!select) return;

        const currentVal = select.value;
        const lines = Array.from(new Set(this.boards.map(b => b.production_line_category || 'MACHINECRAFT JACQUARD')));

        if (lines.length === 0) {
            select.innerHTML = '<option value="" disabled selected>No production lines registered</option>';
            return;
        }

        select.innerHTML = lines.map(l => 
            `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)}</option>`
        ).join('');

        if (currentVal && lines.includes(currentVal)) {
            select.value = currentVal;
        }
    },

    async loadStageMatrix() {
        const select = document.getElementById('filter_matrix_line');
        const tbody = document.getElementById('stage-matrix-tbody');
        if (!select || !tbody) return;

        const selectedLine = select.value;
        if (!selectedLine) {
            tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; padding: 1.5rem; color: var(--text-muted);">Please select a Production Line above.</td></tr>';
            return;
        }

        try {
            const res = await fetch(`/api/production/stage-matrix?production_line=${encodeURIComponent(selectedLine)}`);
            if (!res.ok) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 1.5rem;">Failed to load stage inventory matrix.</td></tr>';
                return;
            }

            const data = await res.json();
            const stages = data.stages || [];
            const matrix = data.matrix || [];

            if (matrix.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="${stages.length + 2}" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                            No registered product boards under production line "${this.escapeHtml(selectedLine)}".
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = '';
            matrix.forEach(row => {
                const tr = document.createElement('tr');
                let stageCellsHtml = '';
                stages.forEach(s => {
                    const qty = row.stage_quantities[s] || 0;
                    if (qty > 0) {
                        stageCellsHtml += `<td><span class="badge badge-success" style="font-size: 0.88rem; font-weight: 700; padding: 0.35rem 0.6rem;">${qty.toLocaleString()}</span></td>`;
                    } else {
                        stageCellsHtml += `<td style="color: var(--text-dim); font-size: 0.9rem;">0</td>`;
                    }
                });

                tr.innerHTML = `
                    <td style="font-weight: 700; color: #ffffff;">${this.escapeHtml(row.board_name)}</td>
                    ${stageCellsHtml}
                    <td style="text-align: right; font-family: 'Outfit', sans-serif; font-size: 1.05rem; font-weight: 700; color: var(--primary);">
                        ${row.total_wip.toLocaleString()} units
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--danger); padding: 1.5rem;">Error loading stage inventory: ${this.escapeHtml(e.message)}</td></tr>`;
        }
    },


    async fetchComponents() {
        try {
            const res = await fetch('/api/components');
            if (res.ok) this.components = await res.json();
        } catch (e) {
            this.showToast('Error fetching components: ' + e.message, 'error');
        }
    },

    async fetchOperators() {
        try {
            const res = await fetch('/api/operators?active_only=false');
            if (res.ok) this.operators = await res.json();
        } catch (e) {
            this.showToast('Error fetching operators: ' + e.message, 'error');
        }
    },

    async fetchBoards() {
        try {
            const res = await fetch('/api/boards');
            if (res.ok) this.boards = await res.json();
        } catch (e) {
            this.showToast('Error fetching boards: ' + e.message, 'error');
        }
    },

    async fetchStageLogs(dateStr = null) {
        try {
            const dateVal = dateStr || (document.getElementById('filter_log_date') ? document.getElementById('filter_log_date').value : '');
            const url = dateVal ? `/api/production/logs?date=${encodeURIComponent(dateVal)}` : '/api/production/logs';
            const res = await fetch(url);
            if (res.ok) this.stageLogs = await res.json();
        } catch (e) {
            this.showToast('Error fetching stage logs: ' + e.message, 'error');
        }
    },

    async handleDateFilterChange() {
        await this.fetchStageLogs();
        this.renderStageLogs();
    },

    async clearDateFilter() {
        const dateInput = document.getElementById('filter_log_date');
        if (dateInput) dateInput.value = '';
        await this.fetchStageLogs();
        this.renderStageLogs();
    },

    async deleteProductionLog(logId) {
        if (!confirm(`Are you sure you want to delete production stage log #${logId}?`)) return;

        try {
            const res = await fetch(`/api/production/logs/${logId}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                this.showToast(`Production log #${logId} deleted!`, 'success');
                await this.refreshData();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to delete log', 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    renderStats() {
        const totalLogs = this.stageLogs.length;
        const activeStaff = this.operators.filter(o => o.is_active).length;
        const totalBoards = this.boards.length;
        const lowStockCount = this.components.filter(c => c.current_stock <= c.minimum_threshold).length;

        document.getElementById('stat-total-logs').innerText = totalLogs;
        document.getElementById('stat-active-staff').innerText = activeStaff;
        document.getElementById('stat-total-boards').innerText = totalBoards;
        document.getElementById('stat-low-stock').innerText = lowStockCount;
    },

    renderStageLogs() {
        const tbody = document.getElementById('stage-logs-tbody');
        tbody.innerHTML = '';

        let filtered = this.stageLogs.filter(log => {
            if (!this.searchQuery) return true;
            const q = this.searchQuery.toLowerCase();
            return (log.operator_name && log.operator_name.toLowerCase().includes(q)) ||
                   (log.board_name && log.board_name.toLowerCase().includes(q)) ||
                   (log.production_line && log.production_line.toLowerCase().includes(q)) ||
                   (log.current_stage && log.current_stage.toLowerCase().includes(q));
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        No production stage logs found. Select another date or click "Log Stage Movement" to add an entry.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(log => {
            const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : '-';
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 700; color: var(--text-dim);">#${log.id}</td>
                <td style="font-size: 0.85rem; color: var(--text-muted);"><i class="fa-regular fa-clock"></i> ${dateStr}</td>
                <td><span class="badge badge-info"><i class="fa-solid fa-user"></i> ${this.escapeHtml(log.operator_name)}</span></td>
                <td>${this.escapeHtml(log.production_line)}</td>
                <td style="font-weight: 700; color: #ffffff;">${this.escapeHtml(log.board_name)}</td>
                <td><span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #cbd5e1;">${this.escapeHtml(log.previous_stage)}</span></td>
                <td><span class="badge badge-success">${this.escapeHtml(log.current_stage)}</span></td>
                <td style="font-family: 'Outfit', sans-serif; font-size: 1.1rem; font-weight: 700; color: var(--primary);">${log.quantity.toLocaleString()} units</td>
                <td style="text-align: right;">
                    <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);" onclick="app.deleteProductionLog(${log.id})">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },


    renderInventory() {
        const tbody = document.getElementById('inventory-tbody');
        tbody.innerHTML = '';

        let filtered = this.components.filter(c => {
            if (!this.searchQuery) return true;
            const q = this.searchQuery.toLowerCase();
            return c.part_number.toLowerCase().includes(q) || (c.type && c.type.toLowerCase().includes(q));
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 3rem;">
                        No components match your search.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(comp => {
            const isLow = comp.current_stock <= comp.minimum_threshold;
            const statusBadge = isLow
                ? `<span class="badge badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Low Stock</span>`
                : `<span class="badge badge-success"><i class="fa-solid fa-check"></i> In Stock</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="part-number-cell">${this.escapeHtml(comp.part_number)}</td>
                <td><span class="badge badge-info">${this.escapeHtml(comp.type || 'N/A')}</span></td>
                <td>${this.escapeHtml(comp.footprint || '-')}</td>
                <td style="font-weight: 700; color: ${isLow ? 'var(--danger)' : 'var(--text-main)'}; font-size: 1rem;">
                    ${comp.current_stock}
                </td>
                <td style="color: var(--text-muted);">${comp.minimum_threshold}</td>
                <td>${statusBadge}</td>
                <td style="color: var(--text-dim); max-width: 220px; font-size: 0.85rem;">${this.escapeHtml(comp.comments || '-')}</td>
                <td style="text-align: right; display: flex; gap: 0.4rem; justify-content: flex-end;">
                    <button class="btn btn-secondary" style="padding: 0.35rem 0.65rem; font-size: 0.8rem;" onclick="app.openEditModal('${this.escapeHtml(comp.part_number)}')">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button class="btn" style="padding: 0.35rem 0.65rem; font-size: 0.8rem; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);" onclick="app.deleteComponent('${this.escapeHtml(comp.part_number)}')">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderOperatorsList() {
        const tbody = document.getElementById('operators-list-tbody');
        tbody.innerHTML = '';
        this.operators.forEach(op => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${this.escapeHtml(op.name)}</strong></td>
                <td>${this.escapeHtml(op.email || '-')}</td>
                <td>
                    <span class="badge ${op.is_active ? 'badge-success' : 'badge-danger'}">
                        ${op.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderBoardsList() {
        const tbody = document.getElementById('boards-list-tbody');
        tbody.innerHTML = '';
        this.boards.forEach(b => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${this.escapeHtml(b.name)}</strong></td>
                <td><span class="badge badge-info">Cat ${this.escapeHtml(b.production_line_category || '-')}</span></td>
            `;
            tbody.appendChild(tr);
        });
    },

    switchTab(tabName) {
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));

        document.getElementById(`tab-${tabName}`).classList.add('active');
        document.getElementById(`${tabName}-view`).classList.add('active');

        if (tabName === 'stage-logs') {
            document.getElementById('stage-actions').style.display = 'flex';
            document.getElementById('inventory-actions').style.display = 'none';
        } else if (tabName === 'inventory') {
            document.getElementById('stage-actions').style.display = 'none';
            document.getElementById('inventory-actions').style.display = 'flex';
        }
    },

    openAddComponentModal() {
        this.editingPartNumber = null;
        document.getElementById('modal-component-title').innerText = 'Add New Component';
        document.getElementById('component-form').reset();
        document.getElementById('part_number').readOnly = false;
        this.openModal('add-component-modal');
    },


    handleSearch() {
        this.searchQuery = document.getElementById('search-input').value;
        this.renderStageLogs();
        this.renderInventory();
    },

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    },

    openStageLogModal() {
        const opSelect = document.getElementById('log_operator_id');
        opSelect.innerHTML = this.operators.filter(o => o.is_active).map(o => 
            `<option value="${o.id}">${this.escapeHtml(o.name)}</option>`
        ).join('');

        const lines = Array.from(new Set(this.boards.map(b => b.production_line_category || 'ALL CL Card')));
        const lineSelect = document.getElementById('log_production_line');
        lineSelect.innerHTML = lines.map(l => `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)}</option>`).join('');

        this.onProductionLineChange();
        this.openModal('stage-log-modal');
    },

    onProductionLineChange() {
        const selectedLine = document.getElementById('log_production_line').value;
        const filteredBoards = this.boards.filter(b => (b.production_line_category || 'ALL CL Card') === selectedLine);
        const boardSelect = document.getElementById('log_board_type_id');

        if (filteredBoards.length > 0) {
            boardSelect.innerHTML = filteredBoards.map(b => 
                `<option value="${b.id}">${this.escapeHtml(b.name)}</option>`
            ).join('');
        } else {
            boardSelect.innerHTML = '<option value="" disabled selected>No boards registered under this line</option>';
        }
    },


    async submitStageLog(event) {
        event.preventDefault();
        const payload = {
            operator_id: parseInt(document.getElementById('log_operator_id').value, 10),
            board_type_id: parseInt(document.getElementById('log_board_type_id').value, 10),
            production_line: document.getElementById('log_production_line').value.trim() || 'ALL CL Card',
            previous_stage: document.getElementById('log_previous_stage').value,
            current_stage: document.getElementById('log_current_stage').value,
            quantity: parseInt(document.getElementById('log_quantity').value, 10)
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
                this.closeModal('stage-log-modal');
                this.refreshData();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Error logging stage movement', 'error');
            }
        } catch (e) {
            this.showToast('Network error: ' + e.message, 'error');
        }
    },

    async addOperator(event) {
        event.preventDefault();
        const name = document.getElementById('new_operator_name').value.trim();
        if (!name) return;

        try {
            const res = await fetch('/api/operators', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });

            if (res.ok) {
                this.showToast(`Operator '${name}' added!`, 'success');
                document.getElementById('new_operator_name').value = '';
                await this.fetchOperators();
                this.renderOperatorsList();
                this.renderStats();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to add operator', 'error');
            }
        } catch (e) {
            this.showToast('Network error: ' + e.message, 'error');
        }
    },

    async addBoard(event) {
        event.preventDefault();
        const name = document.getElementById('new_board_name').value.trim();
        const production_line_category = document.getElementById('new_board_category').value.trim() || null;
        if (!name) return;

        try {
            const res = await fetch('/api/boards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, production_line_category })
            });

            if (res.ok) {
                this.showToast(`Board '${name}' added!`, 'success');
                document.getElementById('new_board_name').value = '';
                document.getElementById('new_board_category').value = '';
                await this.fetchBoards();
                this.renderBoardsList();
                this.renderStats();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to add board', 'error');
            }
        } catch (e) {
            this.showToast('Network error: ' + e.message, 'error');
        }
    },

    openEditModal(partNumber) {
        const comp = this.components.find(c => c.part_number === partNumber);
        if (!comp) return;

        this.editingPartNumber = partNumber;
        document.getElementById('modal-component-title').innerText = `Edit Component (${partNumber})`;
        document.getElementById('part_number').value = comp.part_number;
        document.getElementById('part_number').readOnly = true;
        document.getElementById('type').value = comp.type || '';
        document.getElementById('footprint').value = comp.footprint || '';
        document.getElementById('current_stock').value = comp.current_stock;
        document.getElementById('minimum_threshold').value = comp.minimum_threshold;
        document.getElementById('comments').value = comp.comments || '';

        this.openModal('add-component-modal');
    },

    async deleteComponent(partNumber) {
        if (!confirm(`Are you sure you want to permanently delete component '${partNumber}'?`)) return;

        try {
            const res = await fetch(`/api/components/${encodeURIComponent(partNumber)}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                this.showToast(`Component '${partNumber}' deleted!`, 'success');
                this.refreshData();
            } else {
                const data = await res.json();
                this.showToast(data.detail || 'Failed to delete component', 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    async saveComponent(event) {
        event.preventDefault();
        const payload = {
            part_number: document.getElementById('part_number').value.trim(),
            type: document.getElementById('type').value.trim() || null,
            footprint: document.getElementById('footprint').value.trim() || null,
            current_stock: parseInt(document.getElementById('current_stock').value, 10),
            minimum_threshold: parseInt(document.getElementById('minimum_threshold').value, 10),
            comments: document.getElementById('comments').value.trim() || null
        };

        try {
            let res;
            if (this.editingPartNumber) {
                res = await fetch(`/api/components/${encodeURIComponent(this.editingPartNumber)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/components', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                this.showToast(this.editingPartNumber ? 'Component updated!' : 'Component added!', 'success');
                this.closeModal('add-component-modal');
                this.refreshData();
            } else {
                const data = await res.json();
                this.showToast(data.detail || 'Error saving component', 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}" style="color: var(--${type === 'success' ? 'success' : 'danger'});"></i>
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
