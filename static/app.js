const app = {
    components: [],
    operators: [],
    boards: [],
    stageLogs: [],
    physicalBoards: [],
    testReports: [],
    users: [],
    searchQuery: '',
    editingPartNumber: null,
    authToken: localStorage.getItem('machinecraft_auth_token') || '',
    authUser: JSON.parse(localStorage.getItem('machinecraft_auth_user') || 'null'),

    async init() {
        const isAuth = await this.checkAuth();
        if (isAuth || this.authToken) {
            this.refreshData();
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
                this.renderUserProfile();
                this.closeModal('auth-login-modal');
                return true;
            } else if (res.status === 401) {
                this.logout();
                return false;
            }
            return true;
        } catch (e) {
            console.warn('Auth check network warning:', e);
            return true;
        }
    },

    showLoginModal() {
        const modal = document.getElementById('auth-login-modal');
        if (modal) modal.classList.add('active');
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
                this.showToast(`Welcome, ${this.authUser.username}!`, 'success');
                this.closeModal('auth-login-modal');
                this.renderUserProfile();
                this.refreshData();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Invalid username or password', 'error');
            }
        } catch (e) {
            this.showToast('Login error: ' + e.message, 'error');
        }
    },

    renderUserProfile() {
        const badge = document.getElementById('user-profile-badge');
        const nameSpan = document.getElementById('user-display-name');
        const manageUsersBtn = document.getElementById('btn-manage-users');
        if (badge && nameSpan && this.authUser) {
            nameSpan.innerText = `${this.authUser.username} (${this.authUser.role.toUpperCase()})`;
            badge.style.display = 'flex';
        }
        if (manageUsersBtn) {
            manageUsersBtn.style.display = (this.authUser && this.authUser.role === 'admin') ? 'inline-flex' : 'none';
        }
    },

    logout() {
        this.authToken = '';
        this.authUser = null;
        localStorage.removeItem('machinecraft_auth_token');
        localStorage.removeItem('machinecraft_auth_user');
        const badge = document.getElementById('user-profile-badge');
        if (badge) badge.style.display = 'none';
        this.showLoginModal();
        this.showToast('Logged out.', 'success');
    },

    async refreshData() {
        await Promise.all([
            this.fetchComponents(),
            this.fetchOperators(),
            this.fetchBoards(),
            this.fetchStageLogs(),
            this.fetchPhysicalBoards(),
            this.fetchTestReports(),
            this.fetchUsers()
        ]);
        this.renderStats();
        this.populateMatrixLineDropdown();
        await this.loadStageMatrix();
        this.renderStageLogs();
        this.renderInventory();
        this.renderOperatorsList();
        this.renderBoardsList();
        this.renderPhysicalBoards();
        this.renderTestReports();
        this.renderUsersList();
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
            const res = await this.authFetch(`/api/production/stage-matrix?production_line=${encodeURIComponent(selectedLine)}`);
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
            const res = await this.authFetch('/api/components');
            if (res.ok) this.components = await res.json();
        } catch (e) {
            this.showToast('Error fetching components: ' + e.message, 'error');
        }
    },

    async fetchOperators() {
        try {
            const res = await this.authFetch('/api/operators?active_only=false');
            if (res.ok) this.operators = await res.json();
        } catch (e) {
            this.showToast('Error fetching operators: ' + e.message, 'error');
        }
    },

    async fetchBoards() {
        try {
            const res = await this.authFetch('/api/boards');
            if (res.ok) this.boards = await res.json();
        } catch (e) {
            this.showToast('Error fetching boards: ' + e.message, 'error');
        }
    },

    async fetchUsers() {
        if (!this.authUser || this.authUser.role !== 'admin') return;
        try {
            const res = await this.authFetch('/api/auth/users');
            if (res.ok) this.users = await res.json();
        } catch (e) {
            console.error('Error fetching users:', e);
        }
    },

    async fetchStageLogs(dateStr = null) {
        try {
            const dateVal = dateStr || (document.getElementById('filter_log_date') ? document.getElementById('filter_log_date').value : '');
            const url = dateVal ? `/api/production/logs?date=${encodeURIComponent(dateVal)}` : '/api/production/logs';
            const res = await this.authFetch(url);
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
            const res = await this.authFetch(`/api/production/logs/${logId}`, { method: 'DELETE' });
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
            if (document.getElementById('testing-actions')) document.getElementById('testing-actions').style.display = 'none';
        } else if (tabName === 'inventory') {
            document.getElementById('stage-actions').style.display = 'none';
            document.getElementById('inventory-actions').style.display = 'flex';
            if (document.getElementById('testing-actions')) document.getElementById('testing-actions').style.display = 'none';
        } else if (tabName === 'testing') {
            document.getElementById('stage-actions').style.display = 'none';
            document.getElementById('inventory-actions').style.display = 'none';
            if (document.getElementById('testing-actions')) document.getElementById('testing-actions').style.display = 'flex';
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
        this.renderPhysicalBoards();
        this.renderTestReports();
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
            const res = await this.authFetch('/api/production/log', {
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
            const res = await this.authFetch('/api/operators', {
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
            const res = await this.authFetch('/api/boards', {
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

    async addUser(event) {
        event.preventDefault();
        const username = document.getElementById('new_user_username').value.trim();
        const password = document.getElementById('new_user_password').value;
        const role = document.getElementById('new_user_role').value;
        const email = document.getElementById('new_user_email').value.trim() || null;

        if (!username || !password) {
            this.showToast('Username and password required', 'error');
            return;
        }

        try {
            const res = await this.authFetch('/api/auth/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role, email })
            });

            if (res.ok) {
                const newUser = await res.json();
                this.showToast(`User account '${newUser.username}' created!`, 'success');
                document.getElementById('new_user_username').value = '';
                document.getElementById('new_user_password').value = '';
                document.getElementById('new_user_email').value = '';
                await this.fetchUsers();
                this.renderUsersList();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to create user account', 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    renderUsersList() {
        const tbody = document.getElementById('users-list-tbody');
        if (!tbody) return;

        if (!this.users || this.users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1rem;">No user accounts found.</td></tr>`;
            return;
        }

        tbody.innerHTML = this.users.map(u => `
            <tr>
                <td style="font-weight: 700; color: #ffffff;">${this.escapeHtml(u.username)}</td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-danger' : (u.role === 'tester' ? 'badge-info' : 'badge-success')}">${this.escapeHtml(u.role.toUpperCase())}</span></td>
                <td style="font-size: 0.85rem; color: var(--text-muted);">${this.escapeHtml(u.email || '-')}</td>
                <td style="font-size: 0.8rem; color: var(--text-dim);">${new Date(u.created_at).toLocaleDateString()}</td>
            </tr>
        `).join('');
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
            const res = await this.authFetch(`/api/components/${encodeURIComponent(partNumber)}`, { method: 'DELETE' });
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
                res = await this.authFetch(`/api/components/${encodeURIComponent(this.editingPartNumber)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await this.authFetch('/api/components', {
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

    async fetchPhysicalBoards() {
        try {
            const res = await this.authFetch('/api/physical-boards');
            if (res.ok) this.physicalBoards = await res.json();
        } catch (e) {
            this.showToast('Error fetching physical boards: ' + e.message, 'error');
        }
    },

    renderPhysicalBoards() {
        const tbody = document.getElementById('physical-boards-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        const statusFilter = document.getElementById('filter_board_status') ? document.getElementById('filter_board_status').value : '';

        let filtered = this.physicalBoards.filter(b => {
            if (statusFilter && b.current_status !== statusFilter) return false;
            if (this.searchQuery) {
                const q = this.searchQuery.toLowerCase();
                return b.serial_number.toLowerCase().includes(q) || (b.product_name && b.product_name.toLowerCase().includes(q));
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">No registered physical boards match status/search filter.</td></tr>`;
            return;
        }

        filtered.forEach(b => {
            const dateStr = b.manufactured_date ? new Date(b.manufactured_date).toLocaleString() : '-';
            let badgeClass = 'badge-info';
            if (b.current_status === 'PASSED') badgeClass = 'badge-success';
            if (b.current_status === 'REJECTED') badgeClass = 'badge-danger';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-family: monospace; font-weight: 700; color: #38bdf8;">${this.escapeHtml(b.serial_number)}</td>
                <td style="font-weight: 600; color: #ffffff;">${this.escapeHtml(b.product_name)}</td>
                <td style="font-size: 0.85rem; color: var(--text-muted);">${dateStr}</td>
                <td><span class="badge ${badgeClass}">${this.escapeHtml(b.current_status)}</span></td>
            `;
            tbody.appendChild(tr);
        });
    },

    async fetchTestReports(dateStr = null) {
        try {
            const testType = document.getElementById('filter_test_type') ? document.getElementById('filter_test_type').value : '';
            const status = document.getElementById('filter_test_status') ? document.getElementById('filter_test_status').value : '';
            const dateVal = dateStr || (document.getElementById('filter_test_date') ? document.getElementById('filter_test_date').value : '');

            const params = new URLSearchParams();
            if (testType) params.append('test_type', testType);
            if (status) params.append('overall_status', status);
            if (dateVal) params.append('date', dateVal);

            const url = params.toString() ? `/api/testing/reports?${params.toString()}` : '/api/testing/reports';
            const res = await this.authFetch(url);
            if (res.ok) this.testReports = await res.json();
        } catch (e) {
            this.showToast('Error fetching test reports: ' + e.message, 'error');
        }
    },

    async handleTestReportFilterChange() {
        await this.fetchTestReports();
        this.renderTestReports();
    },

    async clearTestReportFilters() {
        if (document.getElementById('filter_test_type')) document.getElementById('filter_test_type').value = '';
        if (document.getElementById('filter_test_status')) document.getElementById('filter_test_status').value = '';
        if (document.getElementById('filter_test_date')) document.getElementById('filter_test_date').value = '';
        await this.fetchTestReports();
        this.renderTestReports();
    },

    renderTestReports() {
        const tbody = document.getElementById('test-reports-tbody');
        if (!tbody) return;
        tbody.innerHTML = '';

        let filtered = this.testReports.filter(r => {
            if (this.searchQuery) {
                const q = this.searchQuery.toLowerCase();
                return r.board_serial_number.toLowerCase().includes(q) ||
                       (r.product_name && r.product_name.toLowerCase().includes(q)) ||
                       (r.test_type && r.test_type.toLowerCase().includes(q)) ||
                       (r.operator_name && r.operator_name.toLowerCase().includes(q));
            }
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 2.5rem;">No test reports recorded. Click "Log Test Report" to add QA test metrics.</td></tr>`;
            return;
        }

        filtered.forEach(r => {
            const dateStr = r.test_timestamp ? new Date(r.test_timestamp).toLocaleString() : '-';
            const isPass = r.overall_status === 'PASS';
            const statusBadge = isPass
                ? `<span class="badge badge-success" style="font-weight: 700;">PASS 🟢</span>`
                : `<span class="badge badge-danger" style="font-weight: 700;">FAIL 🔴</span>`;

            const jsonSnippet = JSON.stringify(r.test_data || {});
            const shortSnippet = jsonSnippet.length > 35 ? jsonSnippet.substring(0, 35) + '...' : jsonSnippet;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 700; color: var(--text-dim);">#${r.id}</td>
                <td style="font-family: monospace; font-weight: 700; color: #38bdf8;">${this.escapeHtml(r.board_serial_number)}</td>
                <td style="font-weight: 600; color: #ffffff;">${this.escapeHtml(r.product_name)}</td>
                <td><span class="badge badge-info">${this.escapeHtml(r.test_type)}</span></td>
                <td><i class="fa-solid fa-user" style="font-size: 0.78rem; color: var(--text-dim); margin-right: 0.3rem;"></i> ${this.escapeHtml(r.operator_name)}</td>
                <td style="font-size: 0.82rem; color: var(--text-muted);">${dateStr}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-secondary" style="padding: 0.25rem 0.55rem; font-size: 0.78rem; font-family: monospace;" onclick="app.viewTestDataDetails(${r.id})">
                        <i class="fa-solid fa-code"></i> ${this.escapeHtml(shortSnippet)}
                    </button>
                </td>
                <td style="font-size: 0.83rem; color: var(--text-muted); max-width: 150px;">${this.escapeHtml(r.remarks || '-')}</td>
                <td style="text-align: right;">
                    <button class="btn" style="padding: 0.3rem 0.6rem; font-size: 0.78rem; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3);" onclick="app.deleteTestReport(${r.id})">
                        <i class="fa-solid fa-trash"></i> Delete
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    },

    openPhysicalBoardModal() {
        const select = document.getElementById('phys_product_id');
        select.innerHTML = this.boards.map(b => `<option value="${b.id}">${this.escapeHtml(b.name)} (${b.production_line_category || 'JACQUARD'})</option>`).join('');
        document.getElementById('physical-board-form').reset();
        this.openModal('physical-board-modal');
    },

    async submitPhysicalBoard(e) {
        e.preventDefault();
        const payload = {
            serial_number: document.getElementById('phys_serial_number').value.trim(),
            product_id: parseInt(document.getElementById('phys_product_id').value),
            current_status: document.getElementById('phys_current_status').value
        };

        try {
            const res = await this.authFetch('/api/physical-boards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                this.showToast(`Board serial '${payload.serial_number}' registered!`, 'success');
                this.closeModal('physical-board-modal');
                await this.refreshData();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to register board serial', 'error');
            }
        } catch (err) {
            this.showToast('Error: ' + err.message, 'error');
        }
    },

    openTestReportModal() {
        const lineSelect = document.getElementById('report_production_line');
        const lines = Array.from(new Set(this.boards.map(b => b.production_line_category || 'MACHINECRAFT JACQUARD')));

        lineSelect.innerHTML = lines.map(l => `<option value="${this.escapeHtml(l)}">${this.escapeHtml(l)}</option>`).join('');

        this.onReportProductionLineChange();

        const opSelect = document.getElementById('report_operator_id');
        const activeOps = this.operators.filter(o => o.is_active);
        opSelect.innerHTML = activeOps.map(o => `<option value="${o.id}">${this.escapeHtml(o.name)}</option>`).join('');

        document.getElementById('report_board_serial').value = '';
        if (document.getElementById('report_remarks')) document.getElementById('report_remarks').value = '';
        this.onTestTypeTemplateChange();
        this.openModal('test-report-modal');
    },

    onReportProductionLineChange() {
        const selectedLine = document.getElementById('report_production_line').value;
        const boardSelect = document.getElementById('report_product_id');

        const filteredBoards = this.boards.filter(b => (b.production_line_category || 'MACHINECRAFT JACQUARD') === selectedLine);

        if (filteredBoards.length === 0) {
            boardSelect.innerHTML = '<option value="" disabled selected>No boards in this production line</option>';
        } else {
            boardSelect.innerHTML = filteredBoards.map(b => `<option value="${b.id}">${this.escapeHtml(b.name)}</option>`).join('');
        }
    },

    onTestTypeTemplateChange() {
        this.loadTestTemplate();
    },

    loadTestTemplate() {
        const type = document.getElementById('report_test_type').value;
        const textarea = document.getElementById('report_test_data');
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

    async submitTestReport(e) {
        e.preventDefault();
        const jsonText = document.getElementById('report_test_data').value;
        let testDataObj = {};
        try {
            testDataObj = JSON.parse(jsonText);
        } catch (err) {
            this.showToast('Invalid JSON format in Test Data Metrics field!', 'error');
            return;
        }

        const serialInput = document.getElementById('report_board_serial').value.trim();
        if (!serialInput) {
            this.showToast('Please enter a Board Serial Number!', 'error');
            return;
        }

        const payload = {
            board_serial_number: serialInput,
            product_id: parseInt(document.getElementById('report_product_id').value),
            operator_id: parseInt(document.getElementById('report_operator_id').value),
            test_type: document.getElementById('report_test_type').value,
            overall_status: document.getElementById('report_overall_status').value,
            test_data: testDataObj,
            remarks: document.getElementById('report_remarks').value || null
        };

        try {
            const res = await this.authFetch('/api/testing/log-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                this.showToast(`Test report for ${payload.board_serial_number} saved successfully!`, 'success');
                this.closeModal('test-report-modal');
                await this.refreshData();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to save test report', 'error');
            }
        } catch (err) {
            this.showToast('Error: ' + err.message, 'error');
        }
    },


    async deleteTestReport(reportId) {
        if (!confirm(`Are you sure you want to delete test report #${reportId}?`)) return;

        try {
            const res = await this.authFetch(`/api/testing/reports/${reportId}`, { method: 'DELETE' });
            if (res.ok || res.status === 204) {
                this.showToast(`Test report #${reportId} deleted!`, 'success');
                await this.refreshData();
            } else {
                const err = await res.json();
                this.showToast(err.detail || 'Failed to delete test report', 'error');
            }
        } catch (e) {
            this.showToast('Error: ' + e.message, 'error');
        }
    },

    viewTestDataDetails(reportId) {
        const report = this.testReports.find(r => r.id === reportId);
        if (!report) return;

        document.getElementById('json-modal-title').innerText = `Report #${report.id} - ${report.test_type} (${report.board_serial_number})`;
        document.getElementById('json-modal-content').innerText = JSON.stringify(report.test_data, null, 4);
        this.openModal('view-json-modal');
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
