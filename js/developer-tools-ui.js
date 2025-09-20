// Developer Tools UI Interactions
// Handles UI events and modal interactions for developer tools

// Initialize dropdown menu
document.addEventListener('DOMContentLoaded', () => {
    const developerBtn = document.getElementById('developerBtn');
    const developerMenu = document.getElementById('developerMenu');

    if (developerBtn && developerMenu) {
        developerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            developerMenu.style.display = developerMenu.style.display === 'none' ? 'block' : 'none';
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!developerBtn.contains(e.target) && !developerMenu.contains(e.target)) {
                developerMenu.style.display = 'none';
            }
        });
    }

    // Initialize toggle switches
    const encryptionToggle = document.getElementById('bucketEncryptionToggle');
    const versioningToggle = document.getElementById('bucketVersioningToggle');

    if (encryptionToggle) {
        encryptionToggle.addEventListener('change', async (e) => {
            if (window.currentBucket) {
                const enabled = e.target.checked;
                try {
                    const success = await developerTools.setBucketEncryption(window.currentBucket, enabled);
                    if (success) {
                        showNotification(`Encryption ${enabled ? 'enabled' : 'disabled'} for bucket`, 'success');
                    } else {
                        showNotification('Failed to update encryption settings', 'error');
                        e.target.checked = !enabled; // Revert on failure
                    }
                } catch (error) {
                    showNotification('Error updating encryption settings', 'error');
                    e.target.checked = !enabled; // Revert on failure
                }
            }
        });
    }

    if (versioningToggle) {
        versioningToggle.addEventListener('change', async (e) => {
            if (window.currentBucket) {
                const enabled = e.target.checked;
                try {
                    const success = await developerTools.setBucketVersioning(window.currentBucket, enabled);
                    if (success) {
                        showNotification(`Versioning ${enabled ? 'enabled' : 'disabled'} for bucket`, 'success');
                    } else {
                        showNotification('Failed to update versioning settings', 'error');
                        e.target.checked = !enabled; // Revert on failure
                    }
                } catch (error) {
                    showNotification('Error updating versioning settings', 'error');
                    e.target.checked = !enabled; // Revert on failure
                }
            }
        });
    }
});

// Tab switching for settings modal
function switchSettingsTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.style.display = 'none';
    });

    // Remove active class from all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab content
    const selectedTab = document.getElementById(tabName + 'Tab');
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }

    // Add active class to clicked tab button
    const clickedButton = event.target;
    if (clickedButton) {
        clickedButton.classList.add('active');
    }

    // Initialize editors when switching to their tabs
    if (tabName === 'cors' && window.enhancedDeveloperTools) {
        setTimeout(() => {
            if (!window.enhancedDeveloperTools.corsEditor) {
                window.enhancedDeveloperTools.initializeCorsEditor();
            }
        }, 100);
    }

    if (tabName === 'policy' && window.enhancedDeveloperTools) {
        setTimeout(() => {
            if (!window.enhancedDeveloperTools.policyEditor) {
                window.enhancedDeveloperTools.initializePolicyEditor();
            }
        }, 100);
    }

    if (tabName === 'lifecycle' && window.enhancedDeveloperTools) {
        window.enhancedDeveloperTools.loadLifecycleRules();
    }
}

// Save bucket settings
async function saveBucketSettings() {
    if (!window.currentBucket) {
        showNotification('No bucket selected', 'error');
        return;
    }

    // Get current settings
    const encryptionToggle = document.getElementById('bucketEncryptionToggle');
    const versioningToggle = document.getElementById('bucketVersioningToggle');

    // Settings are already saved in real-time via the toggle change events
    showNotification('Settings saved successfully', 'success');
    closeModal('bucketSettingsModal');
}

// Show bucket policy editor
function showBucketPolicyEditor() {
    if (!window.currentBucket) {
        showNotification('No bucket selected', 'error');
        return;
    }

    switchSettingsTab('policy');
    developerTools.showBucketSettingsModal();

    // Load current policy
    loadBucketPolicy();
}

async function loadBucketPolicy() {
    if (!window.currentBucket) return;

    try {
        const policy = await developerTools.getBucketPolicy(window.currentBucket);
        const policyText = document.getElementById('bucketPolicyText');

        if (policyText) {
            if (policy) {
                policyText.value = JSON.stringify(policy, null, 2);
            } else {
                policyText.value = '';
                policyText.placeholder = 'No policy configured. Enter JSON policy here.';
            }
        }
    } catch (error) {
        console.error('Error loading bucket policy:', error);
        showNotification('Failed to load bucket policy', 'error');
    }
}

// Save bucket policy
async function saveBucketPolicy() {
    if (!window.currentBucket) {
        showNotification('No bucket selected', 'error');
        return;
    }

    const policyText = document.getElementById('bucketPolicyText');
    if (!policyText) return;

    const policyString = policyText.value.trim();

    if (!policyString) {
        // Delete policy if empty
        try {
            const success = await developerTools.deleteBucketPolicy(window.currentBucket);
            if (success) {
                showNotification('Bucket policy removed', 'success');
            } else {
                showNotification('Failed to remove bucket policy', 'error');
            }
        } catch (error) {
            showNotification('Error removing bucket policy', 'error');
        }
        return;
    }

    try {
        // Validate JSON
        const policy = JSON.parse(policyString);

        // Save policy
        const success = await developerTools.setBucketPolicy(window.currentBucket, policy);
        if (success) {
            showNotification('Bucket policy saved successfully', 'success');
        } else {
            showNotification('Failed to save bucket policy', 'error');
        }
    } catch (error) {
        if (error instanceof SyntaxError) {
            showNotification('Invalid JSON format', 'error');
        } else {
            showNotification('Error saving bucket policy', 'error');
        }
    }
}

// Show CORS configuration
function showCorsConfiguration() {
    if (!window.currentBucket) {
        showNotification('No bucket selected', 'error');
        return;
    }

    switchSettingsTab('cors');
    developerTools.showBucketSettingsModal();
}

// Show lifecycle policies
function showLifecyclePolicies() {
    if (!window.currentBucket) {
        showNotification('No bucket selected', 'error');
        return;
    }

    switchSettingsTab('lifecycle');
    developerTools.showBucketSettingsModal();
}

// Add CORS rule modal
function showAddCorsRuleModal() {
    // This would open a modal to add a new CORS rule
    // For now, we'll show a placeholder
    showNotification('CORS rule editor coming soon', 'info');
}

// Helper function to close modals
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Helper function to show modals
function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
    }
}

// Export functions for global access
window.switchSettingsTab = switchSettingsTab;
window.saveBucketSettings = saveBucketSettings;
window.showBucketPolicyEditor = showBucketPolicyEditor;
window.saveBucketPolicy = saveBucketPolicy;
window.showCorsConfiguration = showCorsConfiguration;
window.showLifecyclePolicies = showLifecyclePolicies;
window.showAddCorsRuleModal = showAddCorsRuleModal;