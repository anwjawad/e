const API_URL = "https://script.google.com/macros/s/AKfycbxqWiRA85iGHzYJsRokVATL-zUOc2sLBMlNL7b6ZAUiQtzu-I5Qd-93BAOz87BoH9Cz/exec";

// State
let previousReading = 0;
let defaultTariff = 0.67; // Fallback if API fails

// DOM Elements
const elPrevReading = document.getElementById('valPreviousReading');
const elPrevDate = document.getElementById('valPreviousDate');
const elTariff = document.getElementById('valDefaultTariff');

const inCurrentReading = document.getElementById('currentReading');
const inTariff = document.getElementById('tariffInput');
const inPayment = document.getElementById('paymentAmount');

const outConsumption = document.getElementById('calcConsumption');
const outCost = document.getElementById('calcCost');

const form = document.getElementById('trackerForm');
const submitBtn = document.getElementById('submitBtn');
const loader = document.querySelector('.loader');
const btnText = document.querySelector('.btn-text');
const btnIcon = document.querySelector('.fa-cloud-arrow-up');

const themeToggle = document.getElementById('themeToggle');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchData();
    setupEventListeners();
});

// Theme Management
function initTheme() {
    const isDark = localStorage.getItem('eTrackerTheme') !== 'light';
    if (!isDark) {
        document.body.classList.remove('theme-dark');
        themeToggle.innerHTML = '<i class="fa-solid fa-sun"></i>';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('theme-dark');
        const isNowDark = document.body.classList.contains('theme-dark');
        localStorage.setItem('eTrackerTheme', isNowDark ? 'dark' : 'light');
        themeToggle.innerHTML = isNowDark ? '<i class="fa-solid fa-moon"></i>' : '<i class="fa-solid fa-sun"></i>';
    });
}

// Data Fetching
async function fetchData() {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.ok) {
            // Find latest reading (max valueKwh or sort by date)
            if (data.readings && data.readings.length > 0) {
                // Sort by date descending
                const sortedReadings = data.readings.sort((a, b) => new Date(b.dateISO) - new Date(a.dateISO));
                const latest = sortedReadings[0];
                previousReading = latest.valueKwh;

                elPrevReading.textContent = previousReading.toLocaleString();

                const dateObj = new Date(latest.dateISO);
                elPrevDate.textContent = `As of ${dateObj.toLocaleDateString()}`;

                // Pre-fill input with previous reading + 1 to prevent errors
                inCurrentReading.value = previousReading;
            }

            // Could fetch tariff from settings if it was in the API payload, 
            // but the `GET` endpoint provided only returns readings and payments.
            // Using default 0.67 as requested.

            calculateLive();
            renderHistoryAndStats(data.readings || [], data.payments || []);
        } else {
            showToast("Failed to load previous data", "error");
            document.getElementById('historyList').innerHTML = '<div class="text-center text-muted">Error loading history.</div>';
        }
    } catch (error) {
        console.error("Fetch error:", error);
        showToast("Network error loading data", "error");
        elPrevReading.textContent = "Error";
        document.getElementById('historyList').innerHTML = '<div class="text-center text-muted">Network error.</div>';
    }
}

function renderHistoryAndStats(readings, payments) {
    let historyMap = new Map();
    let totalConsumable = 0;
    let totalPaid = 0;
    let totalCost = 0;

    // Process readings
    if (readings.length > 0) {
        // Sort ascending to calculate differences
        const ascReadings = [...readings].sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));

        // Total consumption is last reading minus first reading
        if (ascReadings.length > 1) {
            totalConsumable = ascReadings[ascReadings.length - 1].valueKwh - ascReadings[0].valueKwh;
        }

        ascReadings.forEach((r, i) => {
            let consumptionMsg = "Initial Base";
            let diff = 0;
            if (i > 0) {
                diff = r.valueKwh - ascReadings[i - 1].valueKwh;
                consumptionMsg = `+${diff} kW`;
                totalCost += (diff * defaultTariff);
            }

            const dateStr = r.dateISO.split('T')[0]; // Group by day
            if (!historyMap.has(dateStr)) historyMap.set(dateStr, { reading: null, payment: null, createdAt: new Date(r.createdAt || r.dateISO), rawDate: r.dateISO });

            historyMap.get(dateStr).reading = {
                val: r.valueKwh,
                diffMsg: consumptionMsg,
                isPositive: diff > 0
            };
        });
    }

    // Process payments
    payments.forEach(p => {
        totalPaid += p.amount;

        const dateStr = p.dateISO.split('T')[0];
        if (!historyMap.has(dateStr)) historyMap.set(dateStr, { reading: null, payment: null, createdAt: new Date(p.createdAt || p.dateISO), rawDate: p.dateISO });

        // If multiple payments on same day, combine them
        if (historyMap.get(dateStr).payment) {
            historyMap.get(dateStr).payment += p.amount;
        } else {
            historyMap.get(dateStr).payment = p.amount;
        }
    });

    // Update Overall Stats
    document.getElementById('valTotalConsumption').textContent = totalConsumable.toLocaleString();
    document.getElementById('valTotalPaid').textContent = totalPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Calculate Net Balance (Total Paid - Total Calculated Cost)
    const netBalance = totalPaid - totalCost;
    const elNetBalance = document.getElementById('valNetBalance');
    const elNetBalanceContainer = document.getElementById('valNetBalanceContainer');

    elNetBalance.textContent = Math.abs(netBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    if (netBalance >= -0.5) { // Small buffer for rounding errors
        elNetBalanceContainer.className = "stat-mini-val text-success";
        elNetBalanceContainer.innerHTML = `+<span id="valNetBalance" style="font-weight: 800;">${Math.abs(netBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ILS (Paid)`;
    } else {
        elNetBalanceContainer.className = "stat-mini-val text-red-500 highlight";
        elNetBalanceContainer.innerHTML = `-<span id="valNetBalance" style="font-weight: 800;">${Math.abs(netBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ILS (Owed)`;
    }

    // Convert Map to Array and sort descending
    let history = Array.from(historyMap.values());
    history.sort((a, b) => b.createdAt - a.createdAt);

    const historyList = document.getElementById('historyList');
    if (history.length === 0) {
        historyList.innerHTML = '<div class="text-center text-muted" style="padding: 20px;">No history found.</div>';
        return;
    }

    // Render HTML (Combined View)
    historyList.innerHTML = history.map(item => {
        const displayDate = new Date(item.rawDate).toLocaleDateString();
        let readingHtml = '';
        let paymentHtml = '';
        let tagsHtml = '';

        if (item.reading) {
            tagsHtml += `<span class="history-tag" style="background:var(--primary); color:white; border-radius:12px; font-weight:bold; font-size:0.6rem;"><i class="fa-solid fa-gauge-high"></i> R</span>`;
            readingHtml = `
                <div class="reading-block" style="margin-bottom: 4px; display:flex; justify-content:flex-end; gap:6px; align-items:center;">
                    <span class="history-date text-muted" style="font-size:0.7rem;">${item.reading.diffMsg}</span>
                    <span class="history-kwh ${item.reading.isPositive ? 'text-primary' : 'text-muted'}">${item.reading.val} kWh</span>
                </div>
            `;
        }

        if (item.payment) {
            tagsHtml += `<span class="history-tag" style="margin-left:5px; background:var(--success); color:white; border-radius:12px; font-weight:bold; font-size:0.6rem;"><i class="fa-solid fa-sack-dollar"></i> P</span>`;
            paymentHtml = `
                <div class="payment-block" style="display:flex; justify-content:flex-end; gap:6px; align-items:center;">
                    <span class="history-date text-muted" style="font-size:0.7rem;">Payment</span>
                    <span class="history-payment text-success" style="font-size:1.05rem;">${item.payment.toFixed(2)} ILS</span>
                </div>
            `;
        }

        return `
            <div class="history-item" style="align-items: center; justify-content: space-between;">
                <div class="history-item-left" style="flex:0 0 auto;">
                    <div style="font-weight:700; font-size: 0.95rem;">${displayDate}</div>
                    <div style="margin-top: 4px; display:flex;">${tagsHtml}</div>
                </div>
                <div class="history-item-right" style="text-align: right; flex:1 1 auto;">
                    ${readingHtml}
                    ${paymentHtml}
                </div>
            </div>
        `;
    }).join('');
}

// Live Calculation Logic
function setupEventListeners() {
    inCurrentReading.addEventListener('input', calculateLive);
    inTariff.addEventListener('input', calculateLive);

    // Auto-calculate suggested payment when reading changes
    inCurrentReading.addEventListener('input', () => {
        const current = parseFloat(inCurrentReading.value) || 0;
        const tariff = parseFloat(inTariff.value) || defaultTariff;

        if (current > previousReading) {
            const consumption = current - previousReading;
            const cost = consumption * tariff;

            // Allow overriding, but if it's identical to the suggestion, keep updating it
            const currentAutoFill = inPayment.dataset.suggested ? parseFloat(inPayment.dataset.suggested) : null;
            const currentPayment = parseFloat(inPayment.value);

            if (!inPayment.value || currentPayment === currentAutoFill) {
                const newSuggestion = Math.round(cost);
                inPayment.value = newSuggestion; // Rounded for easier payment
                inPayment.dataset.suggested = newSuggestion;
            }
        }
    });

    form.addEventListener('submit', handleSubmit);
}

function calculateLive() {
    const current = parseFloat(inCurrentReading.value) || 0;
    const tariff = parseFloat(inTariff.value) || defaultTariff;

    let consumption = current - previousReading;
    if (consumption < 0) consumption = 0; // Prevent negative display

    const cost = consumption * tariff;

    outConsumption.textContent = consumption.toLocaleString();
    outCost.textContent = cost.toFixed(2);

    // Dynamic styling
    if (consumption > 500) {
        outConsumption.classList.replace('highlight', 'text-red-500');
    } else {
        outConsumption.className = "calc-value highlight";
    }
}

// Form Submission
async function handleSubmit(e) {
    e.preventDefault();

    const current = parseFloat(inCurrentReading.value);
    const payment = parseFloat(inPayment.value);

    if (current <= previousReading && previousReading > 0) {
        showToast("Current reading must be higher than previous!", "error");
        return;
    }

    setLoading(true);

    const payload = {
        valueKwh: current,
        paymentAmount: payment,
        dateISO: new Date().toISOString()
    };

    try {
        await fetch(API_URL, {
            method: 'POST',
            mode: 'no-cors', // Bypasses browser CORS blocking for the response
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload)
        });

        // With no-cors, the response is opaque and we can't read the body.
        // If fetch() did not throw a network error, the request reached Google.

        showToast("Data sent successfully to Google Sheets!");

        // Update local state temporarily, then refresh all data to confirm
        inPayment.value = '';
        inCurrentReading.value = '';

        // Let's refetch from the API to update the History board accurately
        await fetchData();

    } catch (error) {
        console.error("Submit error:", error);
        showToast("Network error. Could not reach Google Sheets.", "error");
    } finally {
        setLoading(false);

    }
}

// UI Utilities
function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    if (isLoading) {
        btnText.style.opacity = '0';
        btnIcon.style.opacity = '0';
        loader.classList.remove('hidden');
    } else {
        btnText.style.opacity = '1';
        btnIcon.style.opacity = '1';
        loader.classList.add('hidden');
    }
}

function showToast(message, type = "success") {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    const icon = toast.querySelector('i');

    msgEl.textContent = message;

    if (type === "error") {
        toast.style.borderColor = "#ef4444";
        icon.className = "fa-solid fa-circle-exclamation text-red-500";
        icon.style.color = "#ef4444";
    } else {
        toast.style.borderColor = "var(--glass-border)";
        icon.className = "fa-solid fa-circle-check";
        icon.style.color = "var(--success)";
    }

    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
