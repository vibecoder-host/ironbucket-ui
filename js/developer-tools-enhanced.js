// Enhanced Developer Tools with CodeMirror editors and Lifecycle CRUD
// Provides advanced bucket management features

class EnhancedDeveloperTools {
    constructor() {
        this.corsEditor = null;
        this.policyEditor = null;
        this.lifecycleRules = [];
        this.currentEditingRule = null;
        this.currentEditingRuleIndex = -1;
    }

    // ============ LIFECYCLE RULES MANAGEMENT ============

    async loadLifecycleRules() {
        if (!window.currentBucket) return;

        try {
            const lifecycle = await developerTools.getBucketLifecycle(window.currentBucket);
            this.lifecycleRules = lifecycle.rules || [];
            this.displayLifecycleRules();
        } catch (error) {
            console.error('Error loading lifecycle rules:', error);
            this.lifecycleRules = [];
            this.displayLifecycleRules();
        }
    }

    displayLifecycleRules() {
        const container = document.getElementById('lifecycleRules');
        if (!container) return;

        if (this.lifecycleRules.length === 0) {
            container.innerHTML = '<p class="text-muted">No lifecycle rules configured. Click "Add Rule" to create one.</p>';
            return;
        }

        let html = '<div class="lifecycle-rules-list">';
        this.lifecycleRules.forEach((rule, index) => {
            const statusClass = rule.status === 'Enabled' ? 'badge-success' : 'badge-secondary';

            html += `
                <div class="lifecycle-rule-item">
                    <div class="lifecycle-rule-header">
                        <div class="lifecycle-rule-title">
                            ${rule.id || 'Rule ' + (index + 1)}
                            <span class="badge ${statusClass}">${rule.status || 'Enabled'}</span>
                        </div>
                        <div class="lifecycle-rule-actions">
                            <button class="btn-icon btn-sm" onclick="enhancedDeveloperTools.editLifecycleRule(${index})" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon btn-sm" onclick="enhancedDeveloperTools.deleteLifecycleRule(${index})" title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <div class="lifecycle-rule-details">
                        ${rule.prefix ? `<div class="lifecycle-rule-detail"><strong>Prefix:</strong> ${rule.prefix}</div>` : ''}
                        ${rule.expirationDays ? `<div class="lifecycle-rule-detail"><strong>Expiration:</strong> Delete after ${rule.expirationDays} days</div>` : ''}
                        ${rule.transitionDays ? `<div class="lifecycle-rule-detail"><strong>Transition:</strong> Move to ${rule.storageClass} after ${rule.transitionDays} days</div>` : ''}
                        ${rule.noncurrentExpirationDays ? `<div class="lifecycle-rule-detail"><strong>Noncurrent:</strong> Delete after ${rule.noncurrentExpirationDays} days</div>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    showAddLifecycleRule() {
        this.currentEditingRule = null;
        this.currentEditingRuleIndex = -1;

        // Reset form
        document.getElementById('lifecycleRuleTitle').textContent = 'Add Lifecycle Rule';
        document.getElementById('ruleId').value = '';
        document.getElementById('rulePrefix').value = '';
        document.getElementById('ruleStatus').value = 'Enabled';

        // Reset checkboxes and configs
        document.getElementById('enableExpiration').checked = false;
        document.getElementById('enableTransition').checked = false;
        document.getElementById('enableNoncurrentExpiration').checked = false;

        document.getElementById('expirationConfig').style.display = 'none';
        document.getElementById('transitionConfig').style.display = 'none';
        document.getElementById('noncurrentExpirationConfig').style.display = 'none';

        document.getElementById('expirationDays').value = '';
        document.getElementById('transitionDays').value = '';
        document.getElementById('storageClass').value = 'STANDARD_IA';
        document.getElementById('noncurrentDays').value = '';

        // Show modal
        const modal = document.getElementById('lifecycleRuleModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
        }
    }

    editLifecycleRule(index) {
        if (index < 0 || index >= this.lifecycleRules.length) return;

        this.currentEditingRule = this.lifecycleRules[index];
        this.currentEditingRuleIndex = index;

        // Set form values
        document.getElementById('lifecycleRuleTitle').textContent = 'Edit Lifecycle Rule';
        document.getElementById('ruleId').value = this.currentEditingRule.id || '';
        document.getElementById('rulePrefix').value = this.currentEditingRule.prefix || '';
        document.getElementById('ruleStatus').value = this.currentEditingRule.status || 'Enabled';

        // Set expiration
        if (this.currentEditingRule.expirationDays) {
            document.getElementById('enableExpiration').checked = true;
            document.getElementById('expirationDays').value = this.currentEditingRule.expirationDays;
            document.getElementById('expirationConfig').style.display = 'flex';
        } else {
            document.getElementById('enableExpiration').checked = false;
            document.getElementById('expirationConfig').style.display = 'none';
        }

        // Set transition
        if (this.currentEditingRule.transitionDays) {
            document.getElementById('enableTransition').checked = true;
            document.getElementById('transitionDays').value = this.currentEditingRule.transitionDays;
            document.getElementById('storageClass').value = this.currentEditingRule.storageClass || 'STANDARD_IA';
            document.getElementById('transitionConfig').style.display = 'flex';
        } else {
            document.getElementById('enableTransition').checked = false;
            document.getElementById('transitionConfig').style.display = 'none';
        }

        // Set noncurrent expiration
        if (this.currentEditingRule.noncurrentExpirationDays) {
            document.getElementById('enableNoncurrentExpiration').checked = true;
            document.getElementById('noncurrentDays').value = this.currentEditingRule.noncurrentExpirationDays;
            document.getElementById('noncurrentExpirationConfig').style.display = 'flex';
        } else {
            document.getElementById('enableNoncurrentExpiration').checked = false;
            document.getElementById('noncurrentExpirationConfig').style.display = 'none';
        }

        // Show modal
        const modal = document.getElementById('lifecycleRuleModal');
        if (modal) {
            modal.style.display = 'flex';
            modal.style.alignItems = 'center';
            modal.style.justifyContent = 'center';
        }
    }

    async deleteLifecycleRule(index) {
        if (index < 0 || index >= this.lifecycleRules.length) return;

        const rule = this.lifecycleRules[index];
        if (!confirm(`Are you sure you want to delete the lifecycle rule "${rule.id || 'Rule ' + (index + 1)}"?`)) {
            return;
        }

        this.lifecycleRules.splice(index, 1);
        await this.saveLifecycleRules();
    }

    async saveLifecycleRule() {
        const ruleId = document.getElementById('ruleId').value.trim();

        if (!ruleId) {
            showNotification('Rule ID is required', 'error');
            return;
        }

        const rule = {
            id: ruleId,
            status: document.getElementById('ruleStatus').value,
            prefix: document.getElementById('rulePrefix').value.trim() || undefined
        };

        // Add expiration
        if (document.getElementById('enableExpiration').checked) {
            const days = parseInt(document.getElementById('expirationDays').value);
            if (days > 0) {
                rule.expirationDays = days;
            }
        }

        // Add transition
        if (document.getElementById('enableTransition').checked) {
            const days = parseInt(document.getElementById('transitionDays').value);
            if (days > 0) {
                rule.transitionDays = days;
                rule.storageClass = document.getElementById('storageClass').value;
            }
        }

        // Add noncurrent expiration
        if (document.getElementById('enableNoncurrentExpiration').checked) {
            const days = parseInt(document.getElementById('noncurrentDays').value);
            if (days > 0) {
                rule.noncurrentExpirationDays = days;
            }
        }

        // Validate that at least one action is configured
        if (!rule.expirationDays && !rule.transitionDays && !rule.noncurrentExpirationDays) {
            showNotification('At least one action must be configured', 'error');
            return;
        }

        // Update or add rule
        if (this.currentEditingRuleIndex >= 0) {
            this.lifecycleRules[this.currentEditingRuleIndex] = rule;
        } else {
            this.lifecycleRules.push(rule);
        }

        await this.saveLifecycleRules();
        closeModal('lifecycleRuleModal');
    }

    async saveLifecycleRules() {
        if (!window.currentBucket) {
            showNotification('No bucket selected', 'error');
            return;
        }

        try {
            const success = await developerTools.setLifecycleRules(window.currentBucket, this.lifecycleRules);
            if (success) {
                showNotification('Lifecycle rules saved successfully', 'success');
                this.displayLifecycleRules();
            } else {
                showNotification('Failed to save lifecycle rules', 'error');
            }
        } catch (error) {
            console.error('Error saving lifecycle rules:', error);
            showNotification('Error saving lifecycle rules', 'error');
        }
    }

    // ============ CORS CONFIGURATION WITH CODEMIRROR ============

    initializeCorsEditor() {
        const container = document.getElementById('corsEditorContainer');
        if (!container || this.corsEditor) return;

        // Create textarea
        const textarea = document.createElement('textarea');
        textarea.id = 'corsEditorTextarea';
        container.innerHTML = '';
        container.appendChild(textarea);

        // Initialize CodeMirror
        this.corsEditor = CodeMirror.fromTextArea(textarea, {
            mode: 'application/json',
            theme: localStorage.getItem('theme') === 'dark' ? 'monokai' : 'default',
            lineNumbers: true,
            lineWrapping: false,
            autoCloseBrackets: true,
            matchBrackets: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Ctrl-F": "findPersistent",
                "Ctrl-H": "replace"
            }
        });

        // Load current CORS configuration
        this.loadCorsConfiguration();
    }

    async loadCorsConfiguration() {
        if (!window.currentBucket || !this.corsEditor) return;

        try {
            const cors = await developerTools.getBucketCors(window.currentBucket);

            // Convert to JSON format
            const corsJson = {
                CORSRules: cors.rules || []
            };

            this.corsEditor.setValue(JSON.stringify(corsJson, null, 2));
        } catch (error) {
            console.error('Error loading CORS configuration:', error);
            // Set default template
            const defaultCors = {
                CORSRules: [
                    {
                        AllowedOrigins: ["*"],
                        AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
                        AllowedHeaders: ["*"],
                        ExposeHeaders: [],
                        MaxAgeSeconds: 3000
                    }
                ]
            };
            this.corsEditor.setValue(JSON.stringify(defaultCors, null, 2));
        }
    }

    formatCorsJson() {
        if (!this.corsEditor) return;

        try {
            const value = this.corsEditor.getValue();
            const json = JSON.parse(value);
            this.corsEditor.setValue(JSON.stringify(json, null, 2));
            showNotification('JSON formatted successfully', 'success');
        } catch (error) {
            showNotification('Invalid JSON format', 'error');
        }
    }

    validateCorsJson() {
        if (!this.corsEditor) return;

        try {
            const value = this.corsEditor.getValue();
            const json = JSON.parse(value);

            // Validate structure
            if (!json.CORSRules || !Array.isArray(json.CORSRules)) {
                showNotification('CORSRules array is required', 'error');
                return;
            }

            // Validate each rule
            for (const rule of json.CORSRules) {
                if (!rule.AllowedOrigins || !Array.isArray(rule.AllowedOrigins)) {
                    showNotification('AllowedOrigins is required for each rule', 'error');
                    return;
                }
                if (!rule.AllowedMethods || !Array.isArray(rule.AllowedMethods)) {
                    showNotification('AllowedMethods is required for each rule', 'error');
                    return;
                }
            }

            showNotification('CORS configuration is valid', 'success');
        } catch (error) {
            showNotification('Invalid JSON: ' + error.message, 'error');
        }
    }

    async saveCorsConfiguration() {
        if (!window.currentBucket || !this.corsEditor) {
            showNotification('No bucket selected', 'error');
            return;
        }

        try {
            const value = this.corsEditor.getValue();
            const json = JSON.parse(value);

            // Convert to the format expected by the API
            const corsRules = json.CORSRules.map(rule => ({
                allowedOrigins: rule.AllowedOrigins || [],
                allowedMethods: rule.AllowedMethods || [],
                allowedHeaders: rule.AllowedHeaders || [],
                exposeHeaders: rule.ExposeHeaders || [],
                maxAgeSeconds: rule.MaxAgeSeconds || null
            }));

            const success = await developerTools.setBucketCors(window.currentBucket, corsRules);
            if (success) {
                showNotification('CORS configuration saved successfully', 'success');
            } else {
                showNotification('Failed to save CORS configuration', 'error');
            }
        } catch (error) {
            showNotification('Error saving CORS: ' + error.message, 'error');
        }
    }

    // ============ BUCKET POLICY WITH CODEMIRROR ============

    initializePolicyEditor() {
        const container = document.getElementById('policyEditorContainer');
        if (!container || this.policyEditor) return;

        // Create textarea
        const textarea = document.createElement('textarea');
        textarea.id = 'policyEditorTextarea';
        container.innerHTML = '';
        container.appendChild(textarea);

        // Initialize CodeMirror
        this.policyEditor = CodeMirror.fromTextArea(textarea, {
            mode: 'application/json',
            theme: localStorage.getItem('theme') === 'dark' ? 'monokai' : 'default',
            lineNumbers: true,
            lineWrapping: false,
            autoCloseBrackets: true,
            matchBrackets: true,
            foldGutter: true,
            gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Ctrl-F": "findPersistent",
                "Ctrl-H": "replace"
            }
        });

        // Load current policy
        this.loadBucketPolicy();
    }

    async loadBucketPolicy() {
        if (!window.currentBucket || !this.policyEditor) return;

        try {
            const policy = await developerTools.getBucketPolicy(window.currentBucket);

            if (policy) {
                this.policyEditor.setValue(JSON.stringify(policy, null, 2));
            } else {
                // Set empty policy template
                this.policyEditor.setValue('');
                this.policyEditor.setOption('placeholder', 'No policy configured. Use the Template button to generate one.');
            }
        } catch (error) {
            console.error('Error loading bucket policy:', error);
            this.policyEditor.setValue('');
        }
    }

    formatPolicyJson() {
        if (!this.policyEditor) return;

        try {
            const value = this.policyEditor.getValue();
            if (!value.trim()) {
                showNotification('No policy to format', 'info');
                return;
            }
            const json = JSON.parse(value);
            this.policyEditor.setValue(JSON.stringify(json, null, 2));
            showNotification('JSON formatted successfully', 'success');
        } catch (error) {
            showNotification('Invalid JSON format', 'error');
        }
    }

    validatePolicyJson() {
        if (!this.policyEditor) return;

        try {
            const value = this.policyEditor.getValue();
            if (!value.trim()) {
                showNotification('No policy to validate', 'info');
                return;
            }

            const json = JSON.parse(value);

            // Validate structure
            if (!json.Version) {
                showNotification('Policy must have a Version field', 'error');
                return;
            }
            if (!json.Statement || !Array.isArray(json.Statement)) {
                showNotification('Policy must have a Statement array', 'error');
                return;
            }

            // Validate each statement
            for (let i = 0; i < json.Statement.length; i++) {
                const stmt = json.Statement[i];
                if (!stmt.Effect || !['Allow', 'Deny'].includes(stmt.Effect)) {
                    showNotification(`Statement ${i + 1}: Effect must be Allow or Deny`, 'error');
                    return;
                }
                if (!stmt.Action) {
                    showNotification(`Statement ${i + 1}: Action is required`, 'error');
                    return;
                }
                if (!stmt.Resource) {
                    showNotification(`Statement ${i + 1}: Resource is required`, 'error');
                    return;
                }
            }

            showNotification('Bucket policy is valid', 'success');
        } catch (error) {
            showNotification('Invalid JSON: ' + error.message, 'error');
        }
    }

    generatePolicyTemplate() {
        if (!this.policyEditor || !window.currentBucket) return;

        const template = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": [
                        "s3:GetObject"
                    ],
                    "Resource": `arn:aws:s3:::${window.currentBucket}/*`
                },
                {
                    "Sid": "AllowUserManagement",
                    "Effect": "Allow",
                    "Principal": {
                        "AWS": "arn:aws:iam::123456789012:user/username"
                    },
                    "Action": [
                        "s3:ListBucket",
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject"
                    ],
                    "Resource": [
                        `arn:aws:s3:::${window.currentBucket}`,
                        `arn:aws:s3:::${window.currentBucket}/*`
                    ]
                }
            ]
        };

        this.policyEditor.setValue(JSON.stringify(template, null, 2));
        showNotification('Policy template generated. Customize as needed.', 'info');
    }

    async saveBucketPolicy() {
        if (!window.currentBucket || !this.policyEditor) {
            showNotification('No bucket selected', 'error');
            return;
        }

        try {
            const value = this.policyEditor.getValue().trim();

            if (!value) {
                // Delete policy if empty
                const success = await developerTools.deleteBucketPolicy(window.currentBucket);
                if (success) {
                    showNotification('Bucket policy removed', 'success');
                } else {
                    showNotification('Failed to remove bucket policy', 'error');
                }
                return;
            }

            const policy = JSON.parse(value);
            const success = await developerTools.setBucketPolicy(window.currentBucket, policy);

            if (success) {
                showNotification('Bucket policy saved successfully', 'success');
            } else {
                showNotification('Failed to save bucket policy', 'error');
            }
        } catch (error) {
            showNotification('Error saving policy: ' + error.message, 'error');
        }
    }

    // ============ INITIALIZATION ============

    initializeEditors() {
        // Initialize editors when tabs are switched
        const corsTab = document.getElementById('corsTab');
        const policyTab = document.getElementById('policyTab');

        if (corsTab && corsTab.style.display !== 'none' && !this.corsEditor) {
            this.initializeCorsEditor();
        }

        if (policyTab && policyTab.style.display !== 'none' && !this.policyEditor) {
            this.initializePolicyEditor();
        }
    }
}

// Initialize enhanced developer tools
window.enhancedDeveloperTools = new EnhancedDeveloperTools();

// Override the setLifecycleRules method in the original developerTools
if (window.developerTools) {
    window.developerTools.setLifecycleRules = async function(bucketName, rules) {
        try {
            const lifecycleXml = buildLifecycleXml(rules);

            const response = await s3Fetch(`/${bucketName}?lifecycle`, {
                method: 'PUT',
                body: lifecycleXml,
                headers: {
                    'Content-Type': 'application/xml'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('Error setting lifecycle rules:', error);
            throw error;
        }
    };
}

// Helper function to build lifecycle XML
function buildLifecycleXml(rules) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<LifecycleConfiguration>\n';

    rules.forEach(rule => {
        xml += '  <Rule>\n';
        xml += `    <ID>${rule.id}</ID>\n`;
        xml += `    <Status>${rule.status || 'Enabled'}</Status>\n`;

        if (rule.prefix) {
            xml += `    <Prefix>${rule.prefix}</Prefix>\n`;
        }

        if (rule.expirationDays) {
            xml += '    <Expiration>\n';
            xml += `      <Days>${rule.expirationDays}</Days>\n`;
            xml += '    </Expiration>\n';
        }

        if (rule.transitionDays && rule.storageClass) {
            xml += '    <Transition>\n';
            xml += `      <Days>${rule.transitionDays}</Days>\n`;
            xml += `      <StorageClass>${rule.storageClass}</StorageClass>\n`;
            xml += '    </Transition>\n';
        }

        if (rule.noncurrentExpirationDays) {
            xml += '    <NoncurrentVersionExpiration>\n';
            xml += `      <NoncurrentDays>${rule.noncurrentExpirationDays}</NoncurrentDays>\n`;
            xml += '    </NoncurrentVersionExpiration>\n';
        }

        xml += '  </Rule>\n';
    });

    xml += '</LifecycleConfiguration>';
    return xml;
}

// Setup event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Setup checkbox listeners for lifecycle rule modal
    const expirationCheckbox = document.getElementById('enableExpiration');
    const transitionCheckbox = document.getElementById('enableTransition');
    const noncurrentCheckbox = document.getElementById('enableNoncurrentExpiration');

    if (expirationCheckbox) {
        expirationCheckbox.addEventListener('change', (e) => {
            document.getElementById('expirationConfig').style.display = e.target.checked ? 'flex' : 'none';
        });
    }

    if (transitionCheckbox) {
        transitionCheckbox.addEventListener('change', (e) => {
            document.getElementById('transitionConfig').style.display = e.target.checked ? 'flex' : 'none';
        });
    }

    if (noncurrentCheckbox) {
        noncurrentCheckbox.addEventListener('change', (e) => {
            document.getElementById('noncurrentExpirationConfig').style.display = e.target.checked ? 'flex' : 'none';
        });
    }
});

// Export functions for global access
window.showAddLifecycleRule = () => enhancedDeveloperTools.showAddLifecycleRule();
window.saveLifecycleRule = () => enhancedDeveloperTools.saveLifecycleRule();
window.formatCorsJson = () => enhancedDeveloperTools.formatCorsJson();
window.validateCorsJson = () => enhancedDeveloperTools.validateCorsJson();
window.saveCorsConfiguration = () => enhancedDeveloperTools.saveCorsConfiguration();
window.formatPolicyJson = () => enhancedDeveloperTools.formatPolicyJson();
window.validatePolicyJson = () => enhancedDeveloperTools.validatePolicyJson();
window.generatePolicyTemplate = () => enhancedDeveloperTools.generatePolicyTemplate();
window.saveBucketPolicy = () => enhancedDeveloperTools.saveBucketPolicy();